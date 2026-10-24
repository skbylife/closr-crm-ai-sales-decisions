import type { SupabaseClient } from '@supabase/supabase-js';
import type { DecodeOutput, JudgmentEvidenceRef, SavedDecode, StrategicPlay } from '@/lib/babel-engine/types';
import { normalizeJudgmentFeedbackSourceRow } from '@/lib/judgment/feedback';
import { normalizeJudgmentMemorySourceRow, type JudgmentMemorySourceItem } from '@/lib/judgment/memory-sources';
import {
  buildJudgmentMemoryFromDecode,
  buildJudgmentMemoryFromStrategicPlay,
  type JudgmentMemoryInput,
} from '@/lib/judgment/memory';
import { buildJudgmentTimeline, type JudgmentTimelineItem } from '@/lib/judgment/timeline';
import { normalizeTaskOutcomeSourceRow } from '@/lib/judgment/task-outcome';
import { normalizeWinLossCalibrationSourceRow } from '@/lib/judgment/win-loss-calibration';

export interface AgentJudgmentContext {
  accountId: string;
  currentJudgment?: string;
  keyRisks: string[];
  keyEvidence: string[];
  recentChanges: string[];
  evidenceStatus: string;
  uncertainties: string[];
  nextActions: string[];
  sourceSummary: string;
  previousJudgment?: string;
}

type SourceRecordRow = {
  id?: string | null;
  org_id?: string | null;
  account_id?: string | null;
  source_kind?: string | null;
  source_table?: string | null;
  source_row_id?: string | null;
  title?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type DecodeMemoryRow = {
  id?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  client_name?: string | null;
  date?: string | null;
  decode?: unknown;
};

type StrategicPlayMemoryRow = {
  id?: string | null;
  account_id?: string | null;
  goal_description?: string | null;
  steps?: unknown;
  confidence?: unknown;
  assumptions?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
};

const INTERNAL_WORDS = [
  'provisional',
  'invalidated',
  'source_records',
  'source_record',
  'confidence',
  'engine',
  'BABEL',
  'stagnation_score',
  'deal_health',
];

const EMPTY_JUDGMENT_FALLBACK = '当前判断仍需补齐，请先补充客户最新状态、关键人态度和决策时间线。';

function cleanText(value: unknown, max = 240): string {
  if (typeof value !== 'string') return '';
  let text = value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
  for (const word of INTERNAL_WORDS) {
    text = text.replace(new RegExp(word, 'gi'), '');
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

function uniquePush(target: string[], value: unknown, maxItems: number, maxLength = 240) {
  const text = cleanText(value, maxLength);
  if (!text || target.includes(text) || target.length >= maxItems) return;
  target.push(text);
}

function cleanList(values: unknown[] | undefined, maxItems: number, fallback: string[]): string[] {
  const result: string[] = [];
  for (const value of values ?? []) {
    uniquePush(result, value, maxItems, 220);
  }
  if (result.length > 0) return result;
  return fallback.map((item) => cleanText(item, 220)).filter(Boolean).slice(0, maxItems);
}

function formatBulletSection(title: string, items: string[]): string {
  return [title, ...items.map((item) => `- ${item}`)].join('\n');
}

function sourceLabel(sourceKind?: string): string {
  switch (sourceKind) {
    case 'decode': return '邮件解读';
    case 'strategic_play': return '谋局记录';
    case 'rfp_analysis': return 'RFP 分析';
    case 'feedback':
    case 'human_feedback': return '人工修正';
    case 'win_loss_calibration': return '成交/丢单复盘';
    case 'task_outcome': return '任务执行反馈';
    default: return '客户记录';
  }
}

function hasDecodeOutput(value: unknown): value is DecodeOutput {
  return Boolean(
    value
      && typeof value === 'object'
      && Array.isArray((value as DecodeOutput).messages)
      && (value as DecodeOutput).threadAnalysis,
  );
}

function normalizeStrategicPlayForJudgment(row: StrategicPlayMemoryRow): Pick<StrategicPlay, 'id' | 'accountId' | 'goalDescription' | 'steps' | 'confidence' | 'assumptions' | 'updatedAt' | 'createdAt'> | null {
  const id = typeof row.id === 'string' ? row.id : '';
  const accountId = typeof row.account_id === 'string' ? row.account_id : '';
  const goalDescription = typeof row.goal_description === 'string' ? row.goal_description.trim() : '';
  if (!id || !accountId || !goalDescription) return null;

  const now = new Date().toISOString();
  return {
    id,
    accountId,
    goalDescription,
    steps: Array.isArray(row.steps) ? row.steps as StrategicPlay['steps'] : [],
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : 0.5,
    assumptions: Array.isArray(row.assumptions) ? row.assumptions as StrategicPlay['assumptions'] : [],
    createdAt: row.created_at ?? row.updated_at ?? now,
    updatedAt: row.updated_at ?? row.created_at ?? now,
  };
}

function memoryInputToSourceItem(input: JudgmentMemoryInput, params: {
  sourceTable?: string;
  sourceRowId?: string;
  traceStatus?: JudgmentMemorySourceItem['traceStatus'];
  traceNote?: string;
} = {}): JudgmentMemorySourceItem {
  return {
    id: `${input.sourceKind}:${input.sourceId}`,
    sourceRecordId: `derived:${input.sourceKind}:${input.sourceId}`,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceTable: params.sourceTable,
    sourceRowId: params.sourceRowId ?? input.sourceId,
    title: input.title ?? '判断记忆',
    currentJudgment: input.currentJudgment,
    risk: input.risk,
    nextAction: input.nextAction,
    confidence: Number.isFinite(input.confidence) ? Math.max(0, Math.min(1, input.confidence > 1 ? input.confidence / 100 : input.confidence)) : null,
    uncertainty: input.uncertainty || undefined,
    provisional: input.provisional,
    evidenceRefs: input.evidenceRefs ?? [],
    updatedAt: input.createdAt || new Date(0).toISOString(),
    traceStatus: params.traceStatus,
    traceNote: params.traceNote,
  };
}

async function loadDerivedJudgmentMemorySources(admin: SupabaseClient, params: {
  accountId: string;
  orgId: string;
}): Promise<JudgmentMemorySourceItem[]> {
  const { accountId, orgId } = params;
  const traceNote = '历史数据尚未补种 source_records，当前回答由原始 Decode / 谋局记录即时推导。';

  const [decodesResult, playsResult] = await Promise.all([
    admin
      .from('email_decodes')
      .select('id, account_id, account_name, client_name, date, decode')
      .eq('org_id', orgId)
      .eq('account_id', accountId)
      .order('date', { ascending: false })
      .limit(5),
    admin
      .from('strategic_plays')
      .select('id, account_id, goal_description, steps, confidence, assumptions, created_at, updated_at')
      .eq('org_id', orgId)
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
      .limit(5),
  ]);

  for (const result of [decodesResult, playsResult]) {
    if (result.error) {
      const message = result.error.message ?? '';
      if (message.includes('schema cache') || message.includes('does not exist') || message.includes('Could not find')) return [];
      throw new Error(message);
    }
  }

  const derived: JudgmentMemorySourceItem[] = [];

  for (const row of (decodesResult.data ?? []) as DecodeMemoryRow[]) {
    if (!row.id || !row.account_id || !hasDecodeOutput(row.decode)) continue;
    const savedDecode: Pick<SavedDecode, 'id' | 'accountId' | 'decode' | 'date' | 'clientName' | 'accountName'> = {
      id: row.id,
      accountId: row.account_id,
      accountName: row.account_name ?? undefined,
      clientName: row.client_name ?? undefined,
      date: row.date ?? new Date().toISOString(),
      decode: row.decode,
    };
    const memory = buildJudgmentMemoryFromDecode({ savedDecode });
    if (!memory) continue;
    derived.push(memoryInputToSourceItem(memory, {
      sourceTable: 'email_decodes',
      sourceRowId: row.id,
      traceStatus: 'derived',
      traceNote,
    }));
  }

  for (const row of (playsResult.data ?? []) as StrategicPlayMemoryRow[]) {
    const play = normalizeStrategicPlayForJudgment(row);
    if (!play) continue;
    derived.push(memoryInputToSourceItem(buildJudgmentMemoryFromStrategicPlay(play), {
      sourceTable: 'strategic_plays',
      sourceRowId: play.id,
      traceStatus: 'derived',
      traceNote,
    }));
  }

  return derived;
}

function mergeJudgmentMemorySources(params: {
  persisted: JudgmentMemorySourceItem[];
  derived: JudgmentMemorySourceItem[];
  limit?: number;
}): JudgmentMemorySourceItem[] {
  const byId = new Map<string, JudgmentMemorySourceItem>();
  for (const item of [...params.derived, ...params.persisted]) byId.set(item.id, item);
  return [...byId.values()]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, params.limit ?? 12);
}

function evidenceLabel(ref: JudgmentEvidenceRef): string {
  const title = cleanText(ref.title, 80);
  if (title) return title;
  switch (ref.sourceKind) {
    case 'email_decode': return '邮件解读证据';
    case 'strategic_play': return '谋局记录证据';
    default: return '客户记录证据';
  }
}

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function summarizeJudgmentContext(params: {
  accountId: string;
  judgmentMemories?: JudgmentMemorySourceItem[];
  judgmentTimeline?: JudgmentTimelineItem[];
}): AgentJudgmentContext | null {
  const memories = [...(params.judgmentMemories ?? [])]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const timeline = [...(params.judgmentTimeline ?? [])]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  if (memories.length === 0 && timeline.length === 0) return null;

  const latestMemory = memories[0];
  const latestJudgmentTimeline = timeline.find((item) => item.kind === 'judgment_memory');
  const currentJudgment = cleanText(latestMemory?.currentJudgment || latestJudgmentTimeline?.summary, 320) || undefined;

  const keyRisks: string[] = [];
  const keyEvidence: string[] = [];
  const recentChanges: string[] = [];
  const uncertainties: string[] = [];
  const nextActions: string[] = [];

  for (const memory of memories.slice(0, 5)) {
    uniquePush(keyRisks, memory.risk, 4);
    uniquePush(uncertainties, memory.uncertainty, 4);
    uniquePush(nextActions, memory.nextAction, 4);
    for (const ref of memory.evidenceRefs.slice(0, 3)) {
      uniquePush(keyEvidence, evidenceLabel(ref), 6, 120);
    }
    if (memory.evidenceRefs.length === 0) {
      uniquePush(keyEvidence, `${sourceLabel(memory.sourceKind)}：${memory.title}`, 6, 120);
    }
  }

  for (const item of timeline.slice(0, 8)) {
    const date = formatDate(item.occurredAt);
    if (item.kind === 'feedback') {
      uniquePush(recentChanges, `${date ? `${date} ` : ''}用户修正：${item.summary}`, 5, 220);
      if (item.signal) uniquePush(keyEvidence, `人工反馈：${item.signal}`, 6, 140);
    } else if (item.kind === 'win_loss_calibration') {
      uniquePush(recentChanges, `${date ? `${date} ` : ''}成交/丢单复盘：${item.summary}`, 5, 220);
      if (item.signal) uniquePush(keyEvidence, `复盘信号：${item.signal}`, 6, 140);
    } else if (item.kind === 'task_outcome') {
      uniquePush(recentChanges, `${date ? `${date} ` : ''}任务反馈：${item.summary}`, 5, 220);
      uniquePush(keyEvidence, `任务执行反馈：${item.signal || item.summary}`, 6, 160);
      if (item.risk) uniquePush(uncertainties, item.risk, 4);
    } else {
      uniquePush(recentChanges, `${date ? `${date} ` : ''}${sourceLabel(item.sourceKind)}：${item.summary}`, 5, 220);
    }
    uniquePush(keyRisks, item.risk, 4);
    uniquePush(nextActions, item.nextAction, 4);
  }

  const evidenceRefs = memories.flatMap((memory) => memory.evidenceRefs ?? []);
  const persistedCount = memories.filter((memory) => memory.traceStatus === 'persisted').length;
  const derivedCount = memories.filter((memory) => memory.traceStatus === 'derived' || !memory.traceStatus).length;
  const feedbackCount = timeline.filter((item) => item.kind === 'feedback').length;
  const calibrationCount = timeline.filter((item) => item.kind === 'win_loss_calibration').length;
  const taskOutcomeCount = timeline.filter((item) => item.kind === 'task_outcome').length;

  const evidenceStatusParts = [
    evidenceRefs.length > 0 ? `${evidenceRefs.length} 条可追溯证据` : '证据仍需补齐',
    persistedCount > 0 ? `${persistedCount} 条已沉淀判断` : null,
    derivedCount > 0 ? `${derivedCount} 条来自近期记录` : null,
    feedbackCount > 0 ? `${feedbackCount} 条人工修正` : null,
    calibrationCount > 0 ? `${calibrationCount} 条成交/丢单复盘` : null,
    taskOutcomeCount > 0 ? `${taskOutcomeCount} 条任务执行反馈` : null,
  ].filter(Boolean) as string[];

  const sourceKinds = [...new Set(memories.map((memory) => sourceLabel(memory.sourceKind)))].slice(0, 4);

  return {
    accountId: params.accountId,
    currentJudgment,
    keyRisks,
    keyEvidence: keyEvidence.length > 0 ? keyEvidence : recentChanges.slice(0, 3),
    recentChanges,
    evidenceStatus: evidenceStatusParts.join('；'),
    uncertainties: uncertainties.length > 0 ? uncertainties : ['仍需补充客户最新确认、关键人态度和决策时间线。'],
    nextActions,
    sourceSummary: sourceKinds.length > 0 ? `主要参考：${sourceKinds.join('、')}` : '主要参考当前客户记录。',
    previousJudgment: recentChanges[1],
  };
}

export async function loadAgentJudgmentContext(admin: SupabaseClient, params: {
  accountId: string;
  orgId: string;
}): Promise<AgentJudgmentContext | null> {
  const { data, error } = await admin
    .from('source_records')
    .select('id, org_id, account_id, source_kind, source_table, source_row_id, title, occurred_at, created_at, metadata')
    .eq('org_id', params.orgId)
    .eq('account_id', params.accountId)
    .order('occurred_at', { ascending: false })
    .limit(80);

  if (error) {
    const message = error.message ?? '';
    if (message.includes('source_records') || message.includes('schema cache') || message.includes('does not exist')) return null;
    throw new Error(message);
  }

  const rows = (data ?? []) as SourceRecordRow[];
  const persistedJudgmentMemories = rows
    .map((row) => normalizeJudgmentMemorySourceRow({
      id: row.id ?? '',
      source_table: row.source_table,
      source_row_id: row.source_row_id,
      title: row.title,
      occurred_at: row.occurred_at,
      created_at: row.created_at,
      metadata: row.metadata,
    }))
    .filter((item): item is JudgmentMemorySourceItem => Boolean(item))
    .map((item) => ({ ...item, traceStatus: 'persisted' as const }));

  let derivedJudgmentMemories: JudgmentMemorySourceItem[] = [];
  try {
    derivedJudgmentMemories = await loadDerivedJudgmentMemorySources(admin, params);
  } catch (err) {
    console.warn('[judgment-context] Derived judgment memories unavailable:', err);
  }

  const judgmentMemories = mergeJudgmentMemorySources({
    persisted: persistedJudgmentMemories,
    derived: derivedJudgmentMemories,
    limit: 12,
  });

  const feedbackRevisionRecords = rows
    .filter((row) => row.source_kind === 'human_feedback')
    .map((row) => normalizeJudgmentFeedbackSourceRow(row))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const winLossCalibrations = rows
    .filter((row) => row.source_kind === 'win_loss_calibration')
    .map((row) => normalizeWinLossCalibrationSourceRow(row))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const taskOutcomes = rows
    .filter((row) => row.source_kind === 'task_outcome')
    .map((row) => normalizeTaskOutcomeSourceRow(row))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const judgmentTimeline = buildJudgmentTimeline({
    accountId: params.accountId,
    judgmentMemories,
    feedbackRevisionRecords,
    winLossCalibrations,
    taskOutcomes,
    limit: 20,
  });

  return summarizeJudgmentContext({
    accountId: params.accountId,
    judgmentMemories,
    judgmentTimeline,
  });
}

export function isJudgmentContextAsk(message: string): boolean {
  const compact = message.replace(/\s+/g, '');
  const patterns = [
    '这个客户现在怎么推进',
    '客户现在怎么推进',
    '现在怎么推进',
    '怎么推进这个客户',
    '为什么系统这么判断',
    '为什么这么判断',
    '为什么是这个判断',
    '判断依据是什么',
    '最近判断有什么变化',
    '判断有什么变化',
    '最近有什么变化',
  ];
  return patterns.some((pattern) => compact.includes(pattern));
}

export function detectJudgmentFeedbackIntent(message: string): boolean {
  const compact = message.replace(/\s+/g, '');
  return [
    '这个判断不对',
    '判断不对',
    '系统判断错了',
    '实际情况是',
    '真实情况是',
    '应该修正',
    '纠正一下',
  ].some((pattern) => compact.includes(pattern));
}

export function detectWinLossCalibrationIntent(message: string): 'won' | 'lost' | 'stalled' | null {
  const compact = message.replace(/\s+/g, '');
  if (['这个单赢了', '这单赢了', '已经赢单', '成交了', '拿下了'].some((pattern) => compact.includes(pattern))) return 'won';
  if (['这个单丢了', '这单丢了', '已经丢单', '输了', '没拿下', '输单'].some((pattern) => compact.includes(pattern))) return 'lost';
  if (['这个单停滞', '这单停滞', '客户暂停', '暂时搁置', '推进停了'].some((pattern) => compact.includes(pattern))) return 'stalled';
  return null;
}

export function formatJudgmentContextForPrompt(context: AgentJudgmentContext): string {
  return [
    context.currentJudgment ? `当前判断：${context.currentJudgment}` : null,
    context.keyRisks.length ? `关键风险：\n${context.keyRisks.map((item) => `- ${item}`).join('\n')}` : null,
    context.keyEvidence.length ? `关键证据：\n${context.keyEvidence.map((item) => `- ${item}`).join('\n')}` : null,
    context.recentChanges.length ? `最近判断变化：\n${context.recentChanges.map((item) => `- ${item}`).join('\n')}` : null,
    `证据状态：${context.evidenceStatus}`,
    context.uncertainties.length ? `不确定点：\n${context.uncertainties.map((item) => `- ${item}`).join('\n')}` : null,
    context.nextActions.length ? `下一步动作：\n${context.nextActions.map((item) => `- ${item}`).join('\n')}` : null,
    `来源摘要：${context.sourceSummary}`,
  ].filter(Boolean).join('\n');
}

export function formatJudgmentContextAnswer(context: AgentJudgmentContext): string {
  const currentJudgment = cleanText(context.currentJudgment, 320) || EMPTY_JUDGMENT_FALLBACK;

  const evidence = cleanList(
    [
      ...context.keyEvidence,
      ...context.recentChanges.slice(0, 2),
      context.evidenceStatus,
      context.sourceSummary,
    ],
    5,
    ['现有证据不足，仍需补充最近客户互动、关键人反馈和明确业务事件。'],
  );

  const uncertainties = cleanList(
    context.uncertainties,
    4,
    ['仍需确认客户最新优先级、预算窗口、决策人态度和采购时间线。'],
  );

  const nextActions = cleanList(
    context.nextActions,
    4,
    ['先约关键业务负责人确认预算窗口、决策流程和下一次明确推进节点。'],
  );

  return [
    formatBulletSection('当前判断', [currentJudgment]),
    formatBulletSection('关键证据', evidence),
    formatBulletSection('不确定点', uncertainties),
    formatBulletSection('下一步动作', nextActions),
  ].join('\n\n');
}
