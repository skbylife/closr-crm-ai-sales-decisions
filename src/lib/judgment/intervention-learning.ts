import type { JudgmentEvidenceRef } from '@/lib/babel-engine/types';
import type { JudgmentInterventionItem } from '@/lib/judgment/intervention';

export type InterventionOutcome = 'effective' | 'ineffective' | 'delayed_effective' | 'inconclusive';
export type InterventionImpact = 'deal_progressed' | 'risk_reduced' | 'evidence_improved' | 'stakeholder_shifted' | 'no_change' | 'worsened';

export interface InterventionOutcomeItem {
  id: string;
  orgId?: string;
  accountId: string;
  opportunityId?: string;
  interventionId: string;
  sourceRecordId: string;
  role?: string;
  reason?: string;
  outcome: InterventionOutcome;
  impact: InterventionImpact;
  confidence: number;
  outcomeNote: string;
  learningSummary: string;
  evidenceRefs: JudgmentEvidenceRef[];
  createdBy?: string;
  createdAt: string;
}

export interface InterventionOutcomeDraftInput {
  id?: unknown;
  orgId?: unknown;
  accountId?: unknown;
  opportunityId?: unknown;
  interventionId?: unknown;
  sourceRecordId?: unknown;
  role?: unknown;
  reason?: unknown;
  outcome?: unknown;
  impact?: unknown;
  confidence?: unknown;
  outcomeNote?: unknown;
  learningSummary?: unknown;
  evidenceRefs?: unknown;
  createdBy?: unknown;
  createdAt?: unknown;
}

export interface InterventionOutcomeSourceRecordLike {
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

export interface InterventionOutcomeSourceRecordRow {
  org_id: string;
  account_id: string;
  source_kind: 'intervention_outcome';
  source_table: 'source_records';
  source_row_id: string;
  title: string;
  summary: string;
  occurred_at: string;
  metadata: {
    interventionOutcome: InterventionOutcomeItem;
    schemaVersion: 1;
    scopeNote: string;
  };
}

export interface JudgmentLearningInsight {
  id: string;
  interventionId: string;
  accountId: string;
  label: string;
  summary: string;
  impact: InterventionImpact;
  confidence: number;
  occurredAt: string;
}

export interface JudgmentLearningSummary {
  effectivePatterns: JudgmentLearningInsight[];
  ineffectivePatterns: JudgmentLearningInsight[];
  evidenceGaps: JudgmentLearningInsight[];
  recentLearnings: JudgmentLearningInsight[];
  calibrationNote: string;
}

export const INTERVENTION_OUTCOMES: readonly InterventionOutcome[] = ['effective', 'ineffective', 'delayed_effective', 'inconclusive'];
export const INTERVENTION_IMPACTS: readonly InterventionImpact[] = ['deal_progressed', 'risk_reduced', 'evidence_improved', 'stakeholder_shifted', 'no_change', 'worsened'];

export const INTERVENTION_OUTCOME_LABEL: Record<InterventionOutcome, string> = {
  effective: '有效',
  ineffective: '无效',
  delayed_effective: '延迟有效',
  inconclusive: '证据不足',
};

export const INTERVENTION_IMPACT_LABEL: Record<InterventionImpact, string> = {
  deal_progressed: '交易推进',
  risk_reduced: '风险降低',
  evidence_improved: '证据改善',
  stakeholder_shifted: '关键人变化',
  no_change: '暂无变化',
  worsened: '情况恶化',
};

const OUTCOMES = new Set<InterventionOutcome>(INTERVENTION_OUTCOMES);
const IMPACTS = new Set<InterventionImpact>(INTERVENTION_IMPACTS);
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

function normalizeOutcome(value: unknown): InterventionOutcome | null {
  const text = cleanText(value, 60) as InterventionOutcome;
  return OUTCOMES.has(text) ? text : null;
}

function normalizeImpact(value: unknown): InterventionImpact | null {
  const text = cleanText(value, 80) as InterventionImpact;
  return IMPACTS.has(text) ? text : null;
}

function normalizeConfidence(value: unknown): number | null {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(1, raw > 1 ? raw / 100 : raw));
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

export function defaultInterventionLearningSummary(params: {
  outcome: InterventionOutcome;
  impact: InterventionImpact;
  outcomeNote: string;
}): string {
  const outcomeLabel = INTERVENTION_OUTCOME_LABEL[params.outcome];
  const impactLabel = INTERVENTION_IMPACT_LABEL[params.impact];
  const note = cleanText(params.outcomeNote, 700);
  return `这次介入被记录为${outcomeLabel}，主要影响是${impactLabel}。${note}`;
}

export function interventionOutcomeScopeNote(outcome: InterventionOutcome): string {
  if (outcome === 'inconclusive') return '介入结果证据不足，仅作为当前账户后续校准线索，不自动证明介入有效或无效。';
  return '介入结果已记录为当前账户判断校准证据，不自动升级为全局规则或自动真理。';
}

export function parseInterventionOutcome(input: InterventionOutcomeDraftInput, defaults: {
  id: string;
  accountId: string;
  orgId?: string;
  createdBy?: string;
  createdAt?: string;
}): { ok: true; interventionOutcome: InterventionOutcomeItem } | { ok: false; error: string } {
  const accountId = cleanText(input.accountId, 160) || defaults.accountId;
  if (accountId !== defaults.accountId) return { ok: false, error: '介入结果账户不匹配' };

  const interventionId = cleanText(input.interventionId, 160);
  if (!interventionId) return { ok: false, error: '缺少原介入 ID' };

  const sourceRecordId = cleanText(input.sourceRecordId, 160);
  if (!sourceRecordId) return { ok: false, error: '缺少原介入 source_record ID' };

  const outcome = normalizeOutcome(input.outcome);
  if (!outcome) return { ok: false, error: 'intervention outcome 无效' };

  const impact = normalizeImpact(input.impact);
  if (!impact) return { ok: false, error: 'intervention impact 无效' };

  const confidence = normalizeConfidence(input.confidence);
  if (confidence === null) return { ok: false, error: 'confidence 必须在 0..1 之间' };

  const outcomeNote = cleanText(input.outcomeNote);
  if (outcomeNote.length < 2) return { ok: false, error: '请填写介入结果说明' };

  const createdAt = defaults.createdAt ?? new Date().toISOString();
  const learningSummary = cleanText(input.learningSummary) || defaultInterventionLearningSummary({ outcome, impact, outcomeNote });

  return {
    ok: true,
    interventionOutcome: {
      id: defaults.id,
      orgId: defaults.orgId,
      accountId,
      opportunityId: cleanText(input.opportunityId, 160) || undefined,
      interventionId,
      sourceRecordId,
      role: cleanText(input.role, 80) || undefined,
      reason: cleanText(input.reason) || undefined,
      outcome,
      impact,
      confidence,
      outcomeNote,
      learningSummary,
      evidenceRefs: normalizeEvidenceRefs(input.evidenceRefs),
      createdBy: defaults.createdBy,
      createdAt,
    },
  };
}

export function buildInterventionOutcomeSourceRecord(params: {
  orgId: string;
  interventionOutcome: InterventionOutcomeItem;
}): InterventionOutcomeSourceRecordRow {
  const { orgId, interventionOutcome } = params;
  if (interventionOutcome.orgId && interventionOutcome.orgId !== orgId) throw new Error('介入结果组织不匹配');

  const outcomeLabel = INTERVENTION_OUTCOME_LABEL[interventionOutcome.outcome];
  const impactLabel = INTERVENTION_IMPACT_LABEL[interventionOutcome.impact];

  return {
    org_id: orgId,
    account_id: interventionOutcome.accountId,
    source_kind: 'intervention_outcome',
    source_table: 'source_records',
    source_row_id: interventionOutcome.id,
    title: `介入结果 · ${outcomeLabel}`,
    summary: `${outcomeLabel} · ${impactLabel}：${interventionOutcome.learningSummary}`,
    occurred_at: interventionOutcome.createdAt,
    metadata: {
      interventionOutcome,
      schemaVersion: 1,
      scopeNote: interventionOutcomeScopeNote(interventionOutcome.outcome),
    },
  };
}

export function normalizeInterventionOutcomeSourceRow(row: InterventionOutcomeSourceRecordLike): InterventionOutcomeItem | null {
  if (row.source_kind && row.source_kind !== 'intervention_outcome') return null;

  const metadata = asRecord(row.metadata);
  const raw = asRecord(metadata?.interventionOutcome);
  if (!raw) return null;

  const rowAccountId = cleanText(row.account_id, 160);
  const rowOrgId = cleanText(row.org_id, 160);
  const rawAccountId = cleanText(raw.accountId, 160);
  const rawOrgId = cleanText(raw.orgId, 160);
  if (rowAccountId && rawAccountId && rowAccountId !== rawAccountId) return null;
  if (rowOrgId && rawOrgId && rowOrgId !== rawOrgId) return null;

  const accountId = rawAccountId || rowAccountId;
  const interventionId = cleanText(raw.interventionId, 160);
  const sourceRecordId = cleanText(raw.sourceRecordId, 160);
  const outcome = normalizeOutcome(raw.outcome);
  const impact = normalizeImpact(raw.impact);
  const confidence = normalizeConfidence(raw.confidence);
  const outcomeNote = cleanText(raw.outcomeNote);
  const learningSummary = cleanText(raw.learningSummary) || (outcome && impact ? defaultInterventionLearningSummary({ outcome, impact, outcomeNote }) : '');
  const id = cleanText(raw.id, 160) || cleanText(row.id, 160) || cleanText(row.source_row_id, 160);

  if (!id || !accountId || !interventionId || !sourceRecordId || !outcome || !impact || confidence === null || !outcomeNote || !learningSummary) return null;

  return {
    id,
    orgId: rawOrgId || rowOrgId || undefined,
    accountId,
    opportunityId: cleanText(raw.opportunityId, 160) || undefined,
    interventionId,
    sourceRecordId,
    role: cleanText(raw.role, 80) || undefined,
    reason: cleanText(raw.reason) || undefined,
    outcome,
    impact,
    confidence,
    outcomeNote,
    learningSummary,
    evidenceRefs: normalizeEvidenceRefs(raw.evidenceRefs),
    createdBy: cleanText(raw.createdBy, 160) || undefined,
    createdAt: validIso(raw.createdAt) ?? row.occurred_at ?? row.created_at ?? new Date(0).toISOString(),
  };
}

function timeValue(value: string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function insightFromOutcome(item: InterventionOutcomeItem, label: string): JudgmentLearningInsight {
  return {
    id: item.id,
    interventionId: item.interventionId,
    accountId: item.accountId,
    label,
    summary: item.learningSummary,
    impact: item.impact,
    confidence: item.confidence,
    occurredAt: item.createdAt,
  };
}

export function buildJudgmentLearningSummary(params: {
  interventionOutcomes?: InterventionOutcomeItem[] | null;
  interventions?: JudgmentInterventionItem[] | null;
  limit?: number;
}): JudgmentLearningSummary {
  const limit = Math.max(1, Math.min(Math.floor(params.limit ?? 4), 8));
  const outcomes = [...(params.interventionOutcomes ?? [])]
    .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
  const interventionById = new Map((params.interventions ?? []).map((item) => [item.id, item]));

  const toInsight = (item: InterventionOutcomeItem) => {
    const intervention = interventionById.get(item.interventionId);
    const action = intervention?.recommendedAction || intervention?.reason || item.reason || '介入动作';
    return insightFromOutcome(item, action);
  };

  return {
    effectivePatterns: outcomes
      .filter((item) => item.outcome === 'effective' || item.outcome === 'delayed_effective')
      .map(toInsight)
      .slice(0, limit),
    ineffectivePatterns: outcomes
      .filter((item) => item.outcome === 'ineffective' || item.impact === 'worsened')
      .map(toInsight)
      .slice(0, limit),
    evidenceGaps: outcomes
      .filter((item) => item.outcome === 'inconclusive' || item.impact === 'evidence_improved')
      .map(toInsight)
      .slice(0, limit),
    recentLearnings: outcomes.map(toInsight).slice(0, limit),
    calibrationNote: outcomes.length === 0
      ? '暂无介入结果样本；系统不会把介入动作自动当成有效。'
      : `已记录 ${outcomes.length} 条介入结果样本；它们是账户级校准证据，不是自动真理。`,
  };
}
