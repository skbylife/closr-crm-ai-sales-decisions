import type { Judgment, JudgmentEvidenceRef } from '@/lib/babel-engine/types';
import type { AccountMomentumSnapshot } from '@/lib/judgment/momentum';
import { JUDGMENT_MEMORY_SOURCE_LABELS, type JudgmentMemorySourceItem } from '@/lib/judgment/memory-sources';
import type { JudgmentFeedbackRevisionRecord } from '@/lib/judgment/feedback';
import type { JudgmentTimelineItem } from '@/lib/judgment/timeline';
import type { WinLossCalibrationItem } from '@/lib/judgment/win-loss-calibration';

export type JudgmentActionPanelEvidenceTone = 'strong' | 'partial' | 'thin';
export type JudgmentActionPanelChangeTone = 'neutral' | 'accent' | 'warning' | 'positive';

export interface JudgmentActionPanelChange {
  id: string;
  label: string;
  summary: string;
  occurredAt: string;
  tone: JudgmentActionPanelChangeTone;
}

export interface JudgmentActionPanelModel {
  empty: boolean;
  currentJudgment: string;
  keyRisk: string;
  nextAction: string;
  evidence: {
    label: string;
    description: string;
    tone: JudgmentActionPanelEvidenceTone;
    sourceCount: number;
    sourceLabels: string[];
    updatedAt?: string;
  };
  recentChanges: JudgmentActionPanelChange[];
  calibration: {
    feedbackCount: number;
    winLossCount: number;
    latestFeedback?: string;
    latestWinLoss?: string;
    feedbackCategoryLabels: string[];
    latestValidatedSignals: string[];
    latestDisprovenSignals: string[];
    loopSummary: string;
  };
  feedbackEvidenceRefs: JudgmentEvidenceRef[];
}

export interface BuildJudgmentActionPanelModelParams {
  judgments?: Judgment[] | null;
  accountMomentum?: AccountMomentumSnapshot | null;
  judgmentMemories?: JudgmentMemorySourceItem[] | null;
  feedbackRevisionRecords?: JudgmentFeedbackRevisionRecord[] | null;
  winLossCalibrations?: WinLossCalibrationItem[] | null;
  judgmentTimeline?: JudgmentTimelineItem[] | null;
}

const FALLBACK_CURRENT = '还没有形成稳定判断。先补一条客户沟通、会议纪要或关键人事实，系统会把它转成可行动的判断。';
const FALLBACK_RISK = '暂无明确高优先级风险；当前更重要的是补足证据，而不是过早下结论。';
const FALLBACK_ACTION = '记录最近一次客户互动，或用 Decode 解析一封关键邮件。';

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return '';
}

function timeValue(value?: string): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

const SOURCE_KIND_TABLE_HINTS: Partial<Record<JudgmentEvidenceRef['sourceKind'], string>> = {
  email_decode: 'email_decodes',
  strategic_play: 'strategic_plays',
  activity_log: 'activity_logs',
  intel_item: 'intel_items',
  integration_email: 'integration_emails',
  meeting_prep: 'meeting_preps',
  source_record: 'source_records',
};

function evidenceIdentity(ref: JudgmentEvidenceRef): string {
  const table = cleanText(ref.sourceTable) || SOURCE_KIND_TABLE_HINTS[ref.sourceKind] || cleanText(ref.sourceKind);
  const rowId = cleanText(ref.sourceRowId) || cleanText(ref.sourceId);
  if (table && rowId) return `${table}:${rowId}`;
  return `${ref.sourceKind}:${ref.sourceId}`;
}

function uniqueEvidenceRefs(refs: JudgmentEvidenceRef[]): JudgmentEvidenceRef[] {
  const seen = new Set<string>();
  const result: JudgmentEvidenceRef[] = [];
  for (const ref of refs) {
    const key = evidenceIdentity(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function buildSourceLabels(memories: JudgmentMemorySourceItem[], timeline: JudgmentTimelineItem[]): string[] {
  const labels = new Set<string>();
  for (const memory of memories.slice(0, 3)) {
    labels.add(JUDGMENT_MEMORY_SOURCE_LABELS[memory.sourceKind] ?? '客户记录');
  }
  for (const item of timeline.slice(0, 3)) {
    if (item.kind === 'feedback') labels.add('人工反馈');
    if (item.kind === 'win_loss_calibration') labels.add('成交复盘');
    if (item.kind === 'task_outcome') labels.add('任务反馈');
    if (item.kind === 'intervention') labels.add('介入回写');
    if (item.kind === 'intervention_outcome') labels.add('介入学习');
    if (item.kind === 'judgment_memory') labels.add('判断更新');
  }
  return [...labels].slice(0, 4);
}

function describeEvidence(params: {
  judgments: Judgment[];
  memories: JudgmentMemorySourceItem[];
  timeline: JudgmentTimelineItem[];
}): JudgmentActionPanelModel['evidence'] {
  const judgmentRefs = params.judgments.flatMap((item) => item.evidenceRefs ?? []);
  const memoryRefs = params.memories.flatMap((item) => [
    {
      sourceId: item.sourceRecordId,
      sourceKind: 'source_record' as const,
      title: item.title,
      sourceTable: item.sourceTable,
      sourceRowId: item.sourceRowId ?? item.sourceRecordId,
    },
    ...(item.evidenceRefs ?? []),
  ]);
  const sourceCount = uniqueEvidenceRefs([...judgmentRefs, ...memoryRefs]).length;
  const hasTraceGap = params.memories.some((item) => item.traceStatus === 'derived')
    || params.timeline.some((item) => item.traceStatus === 'missing' || item.traceStatus === 'invalid');
  const sourceLabels = buildSourceLabels(params.memories, params.timeline);
  const updatedAt = firstNonEmpty(
    params.memories[0]?.updatedAt,
    params.timeline[0]?.occurredAt,
    params.judgments[0]?.updatedAt,
  ) || undefined;

  if (sourceCount >= 3 && !hasTraceGap) {
    return {
      label: '证据较充分',
      description: `已关联 ${sourceCount} 条可追踪来源，可以直接围绕下一步动作推进。`,
      tone: 'strong',
      sourceCount,
      sourceLabels,
      updatedAt,
    };
  }

  if (sourceCount > 0) {
    return {
      label: hasTraceGap ? '证据可追踪，仍需验证' : '证据正在积累',
      description: `已关联 ${sourceCount} 条来源；关键结论建议再用客户回复或会议记录确认一次。`,
      tone: 'partial',
      sourceCount,
      sourceLabels,
      updatedAt,
    };
  }

  return {
    label: '证据不足',
    description: '还没有可追踪来源。先补客户互动记录，再让系统生成判断。',
    tone: 'thin',
    sourceCount,
    sourceLabels,
    updatedAt,
  };
}

function changeLabel(item: JudgmentTimelineItem): { label: string; tone: JudgmentActionPanelChangeTone } {
  if (item.kind === 'feedback') return { label: '人工修正', tone: 'warning' };
  if (item.kind === 'win_loss_calibration') return { label: '成交复盘', tone: 'positive' };
  if (item.kind === 'task_outcome') return { label: '任务反馈', tone: 'accent' };
  if (item.kind === 'intervention') return { label: '介入回写', tone: 'accent' };
  if (item.kind === 'intervention_outcome') return { label: '介入学习', tone: 'positive' };
  return { label: '判断更新', tone: 'accent' };
}

const FEEDBACK_CATEGORY_LABEL: Record<string, string> = {
  accurate: '判断准确',
  inaccurate: '判断不准',
  over_optimistic: '过度乐观',
  missed_risk: '漏看风险',
  missing_evidence: '缺证据',
  over_inferred: '过度推断',
  stale: '已过期',
};

function buildCalibrationLoopSummary(params: {
  feedbackCount: number;
  winLossCount: number;
  latestValidatedSignals: string[];
  latestDisprovenSignals: string[];
}): string {
  if (params.feedbackCount === 0 && params.winLossCount === 0) {
    return '还没有校准样本；记录人工反馈或成交复盘后，后续判断会把这些经验作为当前客户的校准证据。';
  }
  const parts = [`已接入 ${params.feedbackCount} 条人工反馈、${params.winLossCount} 条成交复盘`];
  if (params.latestValidatedSignals.length > 0) parts.push(`被验证信号：${params.latestValidatedSignals.slice(0, 2).join('、')}`);
  if (params.latestDisprovenSignals.length > 0) parts.push(`噪音/误判：${params.latestDisprovenSignals.slice(0, 2).join('、')}`);
  parts.push('这些记录会回写到账户判断记忆，影响后续判断、模式识别和组合信号。');
  return parts.join('；');
}

function buildRecentChanges(timeline: JudgmentTimelineItem[], memories: JudgmentMemorySourceItem[]): JudgmentActionPanelChange[] {
  const fromTimeline = timeline.slice(0, 3).map((item) => {
    const mapped = changeLabel(item);
    return {
      id: item.id,
      label: mapped.label,
      summary: firstNonEmpty(item.summary, item.signal, item.nextAction) || '有一条判断相关记录更新。',
      occurredAt: item.occurredAt,
      tone: mapped.tone,
    } satisfies JudgmentActionPanelChange;
  });

  if (fromTimeline.length > 0) return fromTimeline;

  return memories.slice(0, 3).map((item) => ({
    id: item.id,
    label: JUDGMENT_MEMORY_SOURCE_LABELS[item.sourceKind] ?? '判断更新',
    summary: item.currentJudgment,
    occurredAt: item.updatedAt,
    tone: 'accent' as const,
  }));
}

export function buildJudgmentActionPanelModel(params: BuildJudgmentActionPanelModelParams): JudgmentActionPanelModel {
  const judgments = [...(params.judgments ?? [])]
    .sort((a, b) => timeValue(b.updatedAt) - timeValue(a.updatedAt));
  const judgmentMemories = [...(params.judgmentMemories ?? [])]
    .sort((a, b) => timeValue(b.updatedAt) - timeValue(a.updatedAt));
  const judgmentTimeline = [...(params.judgmentTimeline ?? [])]
    .sort((a, b) => timeValue(b.occurredAt) - timeValue(a.occurredAt));
  const feedbackRevisionRecords = [...(params.feedbackRevisionRecords ?? [])]
    .sort((a, b) => timeValue(b.feedback.createdAt) - timeValue(a.feedback.createdAt));
  const winLossCalibrations = [...(params.winLossCalibrations ?? [])]
    .sort((a, b) => timeValue(b.outcomeAt) - timeValue(a.outcomeAt));

  const leadJudgment = judgments[0];
  const riskJudgment = judgments.find((item) => item.kind === 'deal_risk');
  const leadMemory = judgmentMemories[0];
  const timelineWithNextAction = judgmentTimeline.find((item) => cleanText(item.nextAction));

  const currentJudgment = firstNonEmpty(
    params.accountMomentum?.currentJudgment,
    leadMemory?.currentJudgment,
    leadJudgment?.summary,
  ) || FALLBACK_CURRENT;
  const keyRisk = firstNonEmpty(
    riskJudgment?.summary,
    leadMemory?.risk,
    params.accountMomentum?.biggestTension,
  ) || FALLBACK_RISK;
  const nextAction = firstNonEmpty(
    params.accountMomentum?.nextAction,
    leadMemory?.nextAction,
    timelineWithNextAction?.nextAction,
  ) || FALLBACK_ACTION;

  const recentChanges = buildRecentChanges(judgmentTimeline, judgmentMemories);
  const feedbackEvidenceRefs = uniqueEvidenceRefs([
    ...(leadMemory?.evidenceRefs ?? []),
    ...(leadJudgment?.evidenceRefs ?? []),
  ]).slice(0, 12);

  const feedbackCategoryLabels = [...new Set(feedbackRevisionRecords.map((record) => FEEDBACK_CATEGORY_LABEL[record.feedback.feedbackType] ?? record.feedback.feedbackType))].slice(0, 4);
  const latestValidatedSignals = winLossCalibrations.flatMap((item) => item.validatedSignals).filter(Boolean).slice(0, 4);
  const latestDisprovenSignals = winLossCalibrations.flatMap((item) => item.disprovenSignals).filter(Boolean).slice(0, 4);

  return {
    empty: currentJudgment === FALLBACK_CURRENT && recentChanges.length === 0,
    currentJudgment,
    keyRisk,
    nextAction,
    evidence: describeEvidence({ judgments, memories: judgmentMemories, timeline: judgmentTimeline }),
    recentChanges,
    calibration: {
      feedbackCount: feedbackRevisionRecords.length,
      winLossCount: winLossCalibrations.length,
      latestFeedback: firstNonEmpty(
        feedbackRevisionRecords[0]?.revisedPreview?.revisedSummary,
        feedbackRevisionRecords[0]?.feedback.content,
      ) || undefined,
      latestWinLoss: firstNonEmpty(
        winLossCalibrations[0]?.lessons[0],
        winLossCalibrations[0]?.notes,
      ) || undefined,
      feedbackCategoryLabels,
      latestValidatedSignals,
      latestDisprovenSignals,
      loopSummary: buildCalibrationLoopSummary({
        feedbackCount: feedbackRevisionRecords.length,
        winLossCount: winLossCalibrations.length,
        latestValidatedSignals,
        latestDisprovenSignals,
      }),
    },
    feedbackEvidenceRefs,
  };
}
