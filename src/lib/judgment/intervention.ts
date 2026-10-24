import type { JudgmentEvidenceRef } from '@/lib/babel-engine/types';

export type JudgmentInterventionType = 'manager_intervention' | 'executive_intervention';
export type JudgmentInterventionAction = 'verify_evidence' | 'coach_ae' | 'intervene' | 'assign_sponsor' | 'allocate_resource' | 'request_review';
export type JudgmentInterventionStatus = 'planned' | 'completed' | 'ineffective' | 'cancelled';

export interface JudgmentInterventionItem {
  id: string;
  sourceRecordId?: string;
  orgId?: string;
  accountId: string;
  opportunityId?: string;
  signalId?: string;
  type: JudgmentInterventionType;
  action: JudgmentInterventionAction;
  status: JudgmentInterventionStatus;
  role?: string;
  reason: string;
  recommendedAction: string;
  outcomeNote?: string;
  evidenceRefs: JudgmentEvidenceRef[];
  createdBy?: string;
  createdAt: string;
}

export interface JudgmentInterventionDraftInput {
  id?: unknown;
  orgId?: unknown;
  accountId?: unknown;
  opportunityId?: unknown;
  signalId?: unknown;
  type?: unknown;
  action?: unknown;
  status?: unknown;
  role?: unknown;
  reason?: unknown;
  recommendedAction?: unknown;
  outcomeNote?: unknown;
  evidenceRefs?: unknown;
  createdBy?: unknown;
  createdAt?: unknown;
}

export interface JudgmentInterventionSourceRecordLike {
  id?: string | null;
  org_id?: string | null;
  account_id?: string | null;
  source_kind?: string | null;
  source_table?: string | null;
  source_row_id?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface JudgmentInterventionSourceRecordRow {
  org_id: string;
  account_id: string;
  source_kind: JudgmentInterventionType;
  source_table: 'source_records' | 'opportunities';
  source_row_id: string;
  title: string;
  summary: string;
  occurred_at: string;
  metadata: {
    intervention: JudgmentInterventionItem;
    schemaVersion: 1;
    scopeNote: string;
  };
}

export const JUDGMENT_INTERVENTION_TYPES: readonly JudgmentInterventionType[] = ['manager_intervention', 'executive_intervention'];
export const JUDGMENT_INTERVENTION_ACTIONS: readonly JudgmentInterventionAction[] = ['verify_evidence', 'coach_ae', 'intervene', 'assign_sponsor', 'allocate_resource', 'request_review'];
export const JUDGMENT_INTERVENTION_STATUSES: readonly JudgmentInterventionStatus[] = ['planned', 'completed', 'ineffective', 'cancelled'];

export const INTERVENTION_TYPE_LABEL: Record<JudgmentInterventionType, string> = {
  manager_intervention: '经理介入',
  executive_intervention: '高层介入',
};

export const INTERVENTION_ACTION_LABEL: Record<JudgmentInterventionAction, string> = {
  verify_evidence: '核验证据',
  coach_ae: '辅导 AE',
  intervene: '高层介入',
  assign_sponsor: '指派 Sponsor',
  allocate_resource: '分配资源',
  request_review: '请求复盘',
};

export const INTERVENTION_STATUS_LABEL: Record<JudgmentInterventionStatus, string> = {
  planned: '计划中',
  completed: '已完成',
  ineffective: '未奏效',
  cancelled: '已取消',
};

const TYPES = new Set<JudgmentInterventionType>(JUDGMENT_INTERVENTION_TYPES);
const ACTIONS = new Set<JudgmentInterventionAction>(JUDGMENT_INTERVENTION_ACTIONS);
const STATUSES = new Set<JudgmentInterventionStatus>(JUDGMENT_INTERVENTION_STATUSES);
const MAX_TEXT_LENGTH = 3000;
const MAX_EVIDENCE_REFS = 12;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function cleanText(value: unknown, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength).trim();
}

function validIso(value: unknown): string | null {
  const text = cleanText(value, 100);
  if (!text) return null;
  const time = new Date(text).getTime();
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString();
}

function normalizeType(value: unknown): JudgmentInterventionType | null {
  const text = cleanText(value, 60) as JudgmentInterventionType;
  return TYPES.has(text) ? text : null;
}

function normalizeAction(value: unknown): JudgmentInterventionAction | null {
  const text = cleanText(value, 60) as JudgmentInterventionAction;
  return ACTIONS.has(text) ? text : null;
}

function normalizeStatus(value: unknown): JudgmentInterventionStatus {
  const text = cleanText(value, 60) as JudgmentInterventionStatus;
  return STATUSES.has(text) ? text : 'planned';
}

function normalizeEvidenceRefs(value: unknown): JudgmentEvidenceRef[] {
  if (!Array.isArray(value)) return [];
  const refs: JudgmentEvidenceRef[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;
    const sourceId = cleanText(record.sourceId ?? record.source_id, 200);
    const sourceKind = cleanText(record.sourceKind ?? record.source_kind, 80) as JudgmentEvidenceRef['sourceKind'];
    if (!sourceId || !sourceKind) continue;
    const sourceTable = cleanText(record.sourceTable ?? record.source_table, 120) || undefined;
    const sourceRowId = cleanText(record.sourceRowId ?? record.source_row_id, 200) || undefined;
    const key = `${sourceKind}:${sourceTable ?? ''}:${sourceRowId ?? sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({
      sourceId,
      sourceKind,
      title: cleanText(record.title, 200) || undefined,
      sourceTable,
      sourceRowId,
    });
    if (refs.length >= MAX_EVIDENCE_REFS) break;
  }

  return refs;
}

export function interventionScopeNote(type: JudgmentInterventionType): string {
  return type === 'executive_intervention'
    ? '高层介入已记录为当前账户判断闭环证据，不自动代表全局升级规则。'
    : '经理介入已记录为当前账户判断闭环证据，用于后续校准但不自动改写最终判断。';
}

export function parseJudgmentIntervention(input: JudgmentInterventionDraftInput, defaults: {
  id: string;
  accountId: string;
  orgId?: string;
  createdBy?: string;
  createdAt?: string;
}): { ok: true; intervention: JudgmentInterventionItem } | { ok: false; error: string } {
  const type = normalizeType(input.type);
  if (!type) return { ok: false, error: 'intervention type 无效' };

  const action = normalizeAction(input.action);
  if (!action) return { ok: false, error: 'intervention action 无效' };

  const accountId = cleanText(input.accountId, 160) || defaults.accountId;
  if (accountId !== defaults.accountId) return { ok: false, error: '介入账户不匹配' };

  const reason = cleanText(input.reason);
  if (reason.length < 2) return { ok: false, error: '请填写介入原因' };

  const recommendedAction = cleanText(input.recommendedAction);
  if (recommendedAction.length < 2) return { ok: false, error: '请填写建议动作' };

  const createdAt = defaults.createdAt ?? new Date().toISOString();
  return {
    ok: true,
    intervention: {
      id: defaults.id,
      orgId: defaults.orgId,
      accountId,
      opportunityId: cleanText(input.opportunityId, 160) || undefined,
      signalId: cleanText(input.signalId, 240) || undefined,
      type,
      action,
      status: normalizeStatus(input.status),
      role: cleanText(input.role, 80) || undefined,
      reason,
      recommendedAction,
      outcomeNote: cleanText(input.outcomeNote) || undefined,
      evidenceRefs: normalizeEvidenceRefs(input.evidenceRefs),
      createdBy: defaults.createdBy,
      createdAt,
    },
  };
}

export function buildInterventionSourceRecord(params: {
  orgId: string;
  intervention: JudgmentInterventionItem;
}): JudgmentInterventionSourceRecordRow {
  const { orgId, intervention } = params;
  if (intervention.orgId && intervention.orgId !== orgId) throw new Error('介入组织不匹配');

  const typeLabel = INTERVENTION_TYPE_LABEL[intervention.type];
  const actionLabel = INTERVENTION_ACTION_LABEL[intervention.action];
  const statusLabel = INTERVENTION_STATUS_LABEL[intervention.status];
  const summary = `${statusLabel}：${intervention.outcomeNote || intervention.reason}`;

  return {
    org_id: orgId,
    account_id: intervention.accountId,
    source_kind: intervention.type,
    source_table: intervention.opportunityId ? 'opportunities' : 'source_records',
    source_row_id: intervention.opportunityId ?? intervention.id,
    title: `${typeLabel} · ${actionLabel}`,
    summary,
    occurred_at: intervention.createdAt,
    metadata: {
      intervention,
      schemaVersion: 1,
      scopeNote: interventionScopeNote(intervention.type),
    },
  };
}

export function normalizeInterventionSourceRow(row: JudgmentInterventionSourceRecordLike): JudgmentInterventionItem | null {
  const sourceKind = normalizeType(row.source_kind);
  if (row.source_kind && !sourceKind) return null;

  const metadata = asRecord(row.metadata);
  const raw = asRecord(metadata?.intervention);
  if (!raw) return null;

  const rowAccountId = cleanText(row.account_id, 160);
  const rowOrgId = cleanText(row.org_id, 160);
  const rawAccountId = cleanText(raw.accountId, 160);
  const rawOrgId = cleanText(raw.orgId, 160);
  if (rowAccountId && rawAccountId && rowAccountId !== rawAccountId) return null;
  if (rowOrgId && rawOrgId && rowOrgId !== rawOrgId) return null;

  const accountId = rawAccountId || rowAccountId;
  const type = normalizeType(raw.type ?? row.source_kind);
  const action = normalizeAction(raw.action);
  const reason = cleanText(raw.reason);
  const recommendedAction = cleanText(raw.recommendedAction);
  const id = cleanText(raw.id, 160) || cleanText(row.id, 160) || cleanText(row.source_row_id, 160);
  if (!id || !accountId || !type || !action || !reason || !recommendedAction) return null;

  return {
    id,
    sourceRecordId: cleanText(row.id, 160) || undefined,
    orgId: rawOrgId || rowOrgId || undefined,
    accountId,
    opportunityId: cleanText(raw.opportunityId, 160) || (row.source_table === 'opportunities' ? cleanText(row.source_row_id, 160) : undefined),
    signalId: cleanText(raw.signalId, 240) || undefined,
    type,
    action,
    status: normalizeStatus(raw.status),
    role: cleanText(raw.role, 80) || undefined,
    reason,
    recommendedAction,
    outcomeNote: cleanText(raw.outcomeNote) || undefined,
    evidenceRefs: normalizeEvidenceRefs(raw.evidenceRefs),
    createdBy: cleanText(raw.createdBy, 160) || undefined,
    createdAt: validIso(raw.createdAt) ?? row.occurred_at ?? row.created_at ?? new Date(0).toISOString(),
  };
}
