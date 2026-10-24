import type { JudgmentEvidenceRef } from '@/lib/babel-engine/types';

export type WinLossOutcome = 'won' | 'lost' | 'stalled' | 'unknown';

export interface WinLossCalibrationItem {
  id: string;
  orgId?: string;
  accountId: string;
  opportunityId?: string;
  outcome: WinLossOutcome;
  outcomeAt: string;
  notes: string;
  previousJudgment?: string;
  previousRisk?: string;
  previousNextAction?: string;
  validatedSignals: string[];
  disprovenSignals: string[];
  overOptimistic?: boolean;
  overConservative?: boolean;
  lessons: string[];
  evidenceRefs: JudgmentEvidenceRef[];
  createdBy?: string;
  createdAt: string;
}

export interface WinLossCalibrationDraftInput {
  id?: unknown;
  orgId?: unknown;
  accountId?: unknown;
  opportunityId?: unknown;
  outcome?: unknown;
  outcomeAt?: unknown;
  notes?: unknown;
  previousJudgment?: unknown;
  previousRisk?: unknown;
  previousNextAction?: unknown;
  validatedSignals?: unknown;
  disprovenSignals?: unknown;
  overOptimistic?: unknown;
  overConservative?: unknown;
  lessons?: unknown;
  evidenceRefs?: unknown;
  createdBy?: unknown;
  createdAt?: unknown;
}

export interface WinLossCalibrationSourceRecordLike {
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

export interface WinLossCalibrationSourceRecordRow {
  org_id: string;
  account_id: string;
  source_kind: 'win_loss_calibration';
  source_table: 'opportunities' | 'win_loss_calibration';
  source_row_id: string;
  title: string;
  summary: string;
  occurred_at: string;
  metadata: {
    calibration: WinLossCalibrationItem;
    schemaVersion: 1;
    scopeNote: string;
  };
}

export const WIN_LOSS_OUTCOMES: readonly WinLossOutcome[] = ['won', 'lost', 'stalled', 'unknown'];

const OUTCOMES = new Set<WinLossOutcome>(WIN_LOSS_OUTCOMES);
const MAX_TEXT_LENGTH = 4000;
const MAX_SIGNAL_LENGTH = 400;
const MAX_EVIDENCE_REFS = 12;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function cleanText(value: unknown, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

function cleanTextArray(value: unknown, maxItems = 12): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: string[] = [];
  for (const entry of value) {
    const text = cleanText(entry, MAX_SIGNAL_LENGTH);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    items.push(text);
    if (items.length >= maxItems) break;
  }
  return items;
}

function validIso(value: unknown): string | null {
  const text = cleanText(value, 100);
  if (!text) return null;
  const time = new Date(text).getTime();
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString();
}

function normalizeOutcome(value: unknown): WinLossOutcome | null {
  const text = cleanText(value, 40) as WinLossOutcome;
  return OUTCOMES.has(text) ? text : null;
}

function normalizeEvidenceRefs(value: unknown): JudgmentEvidenceRef[] {
  if (!Array.isArray(value)) return [];
  const refs: JudgmentEvidenceRef[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    const record = asRecord(entry);
    const sourceId = cleanText(record?.sourceId, 200);
    const sourceKind = cleanText(record?.sourceKind, 80) as JudgmentEvidenceRef['sourceKind'];
    if (!sourceId || !sourceKind) continue;
    const sourceTable = cleanText(record?.sourceTable, 120) || undefined;
    const sourceRowId = cleanText(record?.sourceRowId, 200) || undefined;
    const key = `${sourceKind}:${sourceTable ?? ''}:${sourceRowId ?? sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({
      sourceId,
      sourceKind,
      title: cleanText(record?.title, 200) || undefined,
      sourceTable,
      sourceRowId,
    });
    if (refs.length >= MAX_EVIDENCE_REFS) break;
  }

  return refs;
}

function lessonsFromNotes(notes: string): string[] {
  return notes
    .split(/[\n；;。.!?！？]/)
    .map((part) => cleanText(part, 240))
    .filter(Boolean)
    .slice(0, 6);
}

function outcomeLabel(outcome: WinLossOutcome): string {
  switch (outcome) {
    case 'won': return '赢单';
    case 'lost': return '丢单';
    case 'stalled': return '停滞';
    default: return '未知结果';
  }
}

export function parseWinLossCalibration(input: WinLossCalibrationDraftInput, defaults: {
  id: string;
  accountId: string;
  orgId?: string;
  createdBy?: string;
  createdAt?: string;
}): { ok: true; calibration: WinLossCalibrationItem } | { ok: false; error: string } {
  const outcome = normalizeOutcome(input.outcome);
  if (!outcome) return { ok: false, error: 'outcome 无效' };

  const notes = cleanText(input.notes);
  if (notes.length < 2) return { ok: false, error: '请填写成交/丢单后的校准记录' };

  const accountId = cleanText(input.accountId, 160) || defaults.accountId;
  if (accountId !== defaults.accountId) return { ok: false, error: '校准账户不匹配' };

  const lessons = cleanTextArray(input.lessons, 8);
  const createdAt = defaults.createdAt ?? new Date().toISOString();

  return {
    ok: true,
    calibration: {
      id: defaults.id,
      orgId: defaults.orgId,
      accountId,
      opportunityId: cleanText(input.opportunityId, 160) || undefined,
      outcome,
      outcomeAt: validIso(input.outcomeAt) ?? createdAt,
      notes,
      previousJudgment: cleanText(input.previousJudgment, 1000) || undefined,
      previousRisk: cleanText(input.previousRisk, 1000) || undefined,
      previousNextAction: cleanText(input.previousNextAction, 1000) || undefined,
      validatedSignals: cleanTextArray(input.validatedSignals),
      disprovenSignals: cleanTextArray(input.disprovenSignals),
      overOptimistic: typeof input.overOptimistic === 'boolean' ? input.overOptimistic : undefined,
      overConservative: typeof input.overConservative === 'boolean' ? input.overConservative : undefined,
      lessons: lessons.length > 0 ? lessons : lessonsFromNotes(notes),
      evidenceRefs: normalizeEvidenceRefs(input.evidenceRefs),
      createdBy: defaults.createdBy,
      createdAt,
    },
  };
}

export function buildWinLossCalibrationSourceRecord(params: {
  orgId: string;
  calibration: WinLossCalibrationItem;
}): WinLossCalibrationSourceRecordRow {
  const { orgId, calibration } = params;
  if (calibration.orgId && calibration.orgId !== orgId) {
    throw new Error('校准组织不匹配');
  }
  const firstLesson = calibration.lessons[0] ?? calibration.notes;
  return {
    org_id: orgId,
    account_id: calibration.accountId,
    source_kind: 'win_loss_calibration',
    source_table: calibration.opportunityId ? 'opportunities' : 'win_loss_calibration',
    source_row_id: calibration.opportunityId ?? calibration.id,
    title: `Win/Loss calibration · ${outcomeLabel(calibration.outcome)}`,
    summary: `${outcomeLabel(calibration.outcome)}校准：${firstLesson}`,
    occurred_at: calibration.outcomeAt,
    metadata: {
      calibration,
      schemaVersion: 1,
      scopeNote: '成交/丢单结果已记录为当前账户的判断校准样本，不自动升级为全局规则。',
    },
  };
}

export function normalizeWinLossCalibrationSourceRow(row: WinLossCalibrationSourceRecordLike): WinLossCalibrationItem | null {
  if (row.source_kind && row.source_kind !== 'win_loss_calibration') return null;
  const metadata = asRecord(row.metadata);
  const raw = asRecord(metadata?.calibration);
  if (!raw) return null;

  const rowAccountId = cleanText(row.account_id, 160);
  const rowOrgId = cleanText(row.org_id, 160);
  const rawAccountId = cleanText(raw.accountId, 160);
  const rawOrgId = cleanText(raw.orgId, 160);
  if (rowAccountId && rawAccountId && rowAccountId !== rawAccountId) return null;
  if (rowOrgId && rawOrgId && rowOrgId !== rawOrgId) return null;

  const accountId = rawAccountId || rowAccountId;
  const outcome = normalizeOutcome(raw.outcome);
  const notes = cleanText(raw.notes);
  const id = cleanText(raw.id, 160) || cleanText(row.id, 160) || cleanText(row.source_row_id, 160);
  if (!id || !accountId || !outcome || !notes) return null;

  return {
    id,
    orgId: rawOrgId || rowOrgId || undefined,
    accountId,
    opportunityId: cleanText(raw.opportunityId, 160) || (row.source_table === 'opportunities' ? cleanText(row.source_row_id, 160) : undefined),
    outcome,
    outcomeAt: validIso(raw.outcomeAt) ?? row.occurred_at ?? row.created_at ?? new Date(0).toISOString(),
    notes,
    previousJudgment: cleanText(raw.previousJudgment, 1000) || undefined,
    previousRisk: cleanText(raw.previousRisk, 1000) || undefined,
    previousNextAction: cleanText(raw.previousNextAction, 1000) || undefined,
    validatedSignals: cleanTextArray(raw.validatedSignals),
    disprovenSignals: cleanTextArray(raw.disprovenSignals),
    overOptimistic: typeof raw.overOptimistic === 'boolean' ? raw.overOptimistic : undefined,
    overConservative: typeof raw.overConservative === 'boolean' ? raw.overConservative : undefined,
    lessons: cleanTextArray(raw.lessons, 8),
    evidenceRefs: normalizeEvidenceRefs(raw.evidenceRefs),
    createdBy: cleanText(raw.createdBy, 160) || undefined,
    createdAt: validIso(raw.createdAt) ?? row.created_at ?? row.occurred_at ?? new Date(0).toISOString(),
  };
}
