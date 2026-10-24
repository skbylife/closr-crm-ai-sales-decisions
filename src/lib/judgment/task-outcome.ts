import type { JudgmentEvidenceRef } from '@/lib/babel-engine/types';

export type TaskOutcome = 'completed' | 'delayed' | 'blocked' | 'canceled' | 'unknown';

export interface TaskOutcomeItem {
  id: string;
  orgId?: string;
  accountId: string;
  opportunityId?: string;
  contactId?: string;
  taskId: string;
  outcome: TaskOutcome;
  outcomeNote: string;
  reason?: string;
  judgmentImpact?: string;
  previousTaskStatus?: string;
  newTaskStatus?: string;
  sourceQuote?: string;
  evidenceRefs: JudgmentEvidenceRef[];
  createdBy?: string;
  createdAt: string;
  outcomeAt: string;
}

export type TaskOutcomeSourceRecordRow = {
  org_id: string;
  account_id: string;
  source_kind: 'task_outcome';
  source_table: 'tasks';
  source_row_id: string;
  title: string;
  summary: string;
  occurred_at: string;
  metadata: Record<string, unknown>;
};

export type TaskOutcomeSourceRecordLike = {
  id?: string | null;
  org_id?: string | null;
  account_id?: string | null;
  source_kind?: string | null;
  source_table?: string | null;
  source_row_id?: string | null;
  title?: string | null;
  summary?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export const TASK_OUTCOME_LABEL: Record<TaskOutcome, string> = {
  completed: '完成',
  delayed: '延期',
  blocked: '受阻',
  canceled: '取消',
  unknown: '未知',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cleanText(value: unknown, max = 1200): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

function normalizeOutcome(value: unknown): TaskOutcome {
  const raw = cleanText(value, 40);
  if (raw === 'completed' || raw === 'delayed' || raw === 'blocked' || raw === 'canceled' || raw === 'unknown') return raw;
  return 'unknown';
}

function normalizeEvidenceRefs(value: unknown): JudgmentEvidenceRef[] {
  if (!Array.isArray(value)) return [];
  const refs: JudgmentEvidenceRef[] = [];
  for (const raw of value) {
    const item = asRecord(raw);
    if (!item) continue;
    const sourceId = cleanText(item.sourceId ?? item.source_id, 160);
    const sourceKind = cleanText(item.sourceKind ?? item.source_kind, 80) as JudgmentEvidenceRef['sourceKind'];
    if (!sourceId || !sourceKind) continue;
    refs.push({
      sourceId,
      sourceKind,
      title: cleanText(item.title, 160) || undefined,
      sourceTable: cleanText(item.sourceTable ?? item.source_table, 120) || undefined,
      sourceRowId: cleanText(item.sourceRowId ?? item.source_row_id, 180) || undefined,
    });
  }
  return refs;
}

function buildOutcomeId(taskId: string, createdAt: string): string {
  const safeTimestamp = cleanText(createdAt, 80).replace(/[^A-Za-z0-9._-]/g, '-');
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${taskId}:${safeTimestamp || Date.now().toString(36)}:${suffix}`;
}

export function defaultTaskOutcomeJudgmentImpact(outcome: TaskOutcome): string {
  switch (outcome) {
    case 'completed': return '验证了下一步动作有效';
    case 'delayed': return '暴露跟进节奏或客户响应阻力';
    case 'blocked': return '暴露推进阻力，需要重新判断推进路径';
    case 'canceled': return '说明原下一步动作不再适用';
    default: return '补充了任务执行反馈，需要结合后续信号判断';
  }
}

export function buildTaskOutcomeSourceRecord(params: {
  orgId: string;
  accountId: string;
  taskId: string;
  opportunityId?: string | null;
  contactId?: string | null;
  outcome: TaskOutcome;
  outcomeNote: string;
  reason?: string | null;
  judgmentImpact?: string | null;
  previousTaskStatus?: string | null;
  newTaskStatus?: string | null;
  sourceQuote?: string | null;
  createdBy: string;
  createdAt: string;
  outcomeId?: string;
}): TaskOutcomeSourceRecordRow {
  const label = TASK_OUTCOME_LABEL[params.outcome] ?? TASK_OUTCOME_LABEL.unknown;
  const outcomeNote = cleanText(params.outcomeNote) || cleanText(params.reason) || '用户确认了任务执行结果。';
  const reason = cleanText(params.reason) || outcomeNote;
  const judgmentImpact = cleanText(params.judgmentImpact) || defaultTaskOutcomeJudgmentImpact(params.outcome);
  const outcomeId = cleanText(params.outcomeId, 180) || buildOutcomeId(params.taskId, params.createdAt);
  const evidenceRefs: JudgmentEvidenceRef[] = [];

  return {
    org_id: params.orgId,
    account_id: params.accountId,
    source_kind: 'task_outcome',
    source_table: 'tasks',
    source_row_id: outcomeId,
    title: `任务执行反馈 · ${label}`,
    summary: `${label}：${outcomeNote}`,
    occurred_at: params.createdAt,
    metadata: {
      schemaVersion: 1,
      taskId: params.taskId,
      accountId: params.accountId,
      opportunityId: params.opportunityId ?? null,
      contactId: params.contactId ?? null,
      outcome: params.outcome,
      outcomeNote,
      reason,
      previousTaskStatus: cleanText(params.previousTaskStatus, 80) || null,
      newTaskStatus: cleanText(params.newTaskStatus, 80) || null,
      judgmentImpact,
      source_quote: cleanText(params.sourceQuote) || outcomeNote,
      evidenceRefs,
      createdBy: params.createdBy,
      createdAt: params.createdAt,
      outcomeId,
      scopeNote: '任务反馈已记录为当前账户判断参考，不自动改变最终判断结论。',
    },
  };
}

export function normalizeTaskOutcomeSourceRow(row: TaskOutcomeSourceRecordLike): TaskOutcomeItem | null {
  if (row.source_kind && row.source_kind !== 'task_outcome') return null;
  const metadata = asRecord(row.metadata);
  if (!metadata) return null;

  const rowAccountId = cleanText(row.account_id, 160);
  const metadataAccountId = cleanText(metadata.accountId, 160);
  if (rowAccountId && metadataAccountId && rowAccountId !== metadataAccountId) return null;

  const accountId = metadataAccountId || rowAccountId;
  const taskId = cleanText(metadata.taskId, 180) || cleanText(row.source_row_id, 180);
  const outcome = normalizeOutcome(metadata.outcome);
  const outcomeNote = cleanText(metadata.outcomeNote) || cleanText(metadata.reason) || cleanText(row.summary);
  const createdAt = cleanText(metadata.createdAt, 80) || row.created_at || row.occurred_at || new Date(0).toISOString();
  const outcomeAt = row.occurred_at || createdAt;
  const id = cleanText(row.id, 160) || cleanText(metadata.outcomeId, 160) || taskId;

  if (!id || !accountId || !taskId || !outcomeNote) return null;

  return {
    id,
    orgId: cleanText(row.org_id, 160) || cleanText(metadata.orgId, 160) || undefined,
    accountId,
    opportunityId: cleanText(metadata.opportunityId, 160) || undefined,
    contactId: cleanText(metadata.contactId, 160) || undefined,
    taskId,
    outcome,
    outcomeNote,
    reason: cleanText(metadata.reason) || undefined,
    judgmentImpact: cleanText(metadata.judgmentImpact) || defaultTaskOutcomeJudgmentImpact(outcome),
    previousTaskStatus: cleanText(metadata.previousTaskStatus, 80) || undefined,
    newTaskStatus: cleanText(metadata.newTaskStatus, 80) || undefined,
    sourceQuote: cleanText(metadata.source_quote) || undefined,
    evidenceRefs: normalizeEvidenceRefs(metadata.evidenceRefs),
    createdBy: cleanText(metadata.createdBy, 160) || undefined,
    createdAt,
    outcomeAt,
  };
}
