import type { Judgment, JudgmentEvidenceRef } from '@/lib/babel-engine/types';
import { buildAccountJudgmentBrief, compactBriefSentence, normalizeBriefConfidence, type JudgmentBriefData } from './brief';
import type { JudgmentMemoryInput } from './memory';
import type { JudgmentMemorySourceItem } from './memory-sources';

export type JudgmentBriefSubjectType = 'account' | 'rfp' | 'strategic_play' | 'decode' | 'contact';

export type JudgmentBriefMomentum = 'warming' | 'stalled' | 'cooling' | 'unknown';
export type JudgmentBriefEvidenceStrength = 'strong' | 'medium' | 'weak';
export type JudgmentBriefChampionStrength = 'strong' | 'weak' | 'unconfirmed' | 'decaying' | 'unknown';
export type JudgmentBriefBlockerPressure = 'high' | 'medium' | 'low' | 'unknown';

export type JudgmentBriefEvidenceSourceKind =
  | 'email_decode'
  | 'rfp_analysis'
  | 'strategic_play'
  | 'meeting_note'
  | 'manual_note'
  | 'account_memory'
  | 'source_record'
  | 'integration_email'
  | 'activity_log'
  | 'intel_item';

export type JudgmentBriefSourceRefKind =
  | JudgmentBriefEvidenceSourceKind
  | 'source_record'
  | 'account_judgment'
  | 'judgment_memory';

export interface EvidenceRef {
  sourceKind: JudgmentBriefEvidenceSourceKind;
  sourceId: string;
  accountId: string;
  excerpt?: string;
  reason: string;
  strength?: JudgmentBriefEvidenceStrength;
  createdAt: string;
}

export interface SourceRecordRef {
  sourceKind: JudgmentBriefSourceRefKind;
  sourceId: string;
  orgId?: string;
  accountId?: string;
  sourceRecordId?: string;
  sourceTable?: string;
  sourceRowId?: string;
  title?: string;
  traceStatus?: 'persisted' | 'derived' | 'missing';
  createdAt?: string;
}

export interface JudgmentContradiction {
  id?: string;
  summary: string;
  severity?: 'high' | 'medium' | 'low';
  sourceIds?: string[];
}

export interface JudgmentChange {
  previousJudgment?: string;
  currentJudgment?: string;
  whyChanged?: string;
  changedAt?: string;
  evidenceRefs?: EvidenceRef[];
}

export interface JudgmentBrief {
  subjectType: JudgmentBriefSubjectType;
  subjectId: string;
  orgId?: string;
  accountId?: string;
  title?: string;
  currentJudgment: string;
  risk: string;
  nextAction: string;
  momentum?: JudgmentBriefMomentum;
  tension?: string;
  championStrength?: JudgmentBriefChampionStrength;
  blockerPressure?: JudgmentBriefBlockerPressure;
  confidence?: number;
  provisional?: boolean;
  openQuestions?: string[];
  contradictions?: JudgmentContradiction[];
  evidenceRefs: EvidenceRef[];
  sourceRefs: SourceRecordRef[];
  changedFrom?: JudgmentChange;
  createdAt: string;
  updatedAt: string;
}

export interface JudgmentBriefValidationIssue {
  field: string;
  message: string;
}

export interface JudgmentBriefNormalizeResult {
  brief: JudgmentBrief | null;
  issues: JudgmentBriefValidationIssue[];
}

export interface JudgmentBriefAdapterContext {
  orgId?: string;
  accountId?: string;
  now?: string | number | Date | null;
}

const SUBJECT_TYPES = new Set<JudgmentBriefSubjectType>(['account', 'rfp', 'strategic_play', 'decode', 'contact']);
const MOMENTUM_VALUES = new Set<JudgmentBriefMomentum>(['warming', 'stalled', 'cooling', 'unknown']);
const CHAMPION_VALUES = new Set<JudgmentBriefChampionStrength>(['strong', 'weak', 'unconfirmed', 'decaying', 'unknown']);
const BLOCKER_VALUES = new Set<JudgmentBriefBlockerPressure>(['high', 'medium', 'low', 'unknown']);
const EVIDENCE_SOURCE_KINDS = new Set<JudgmentBriefEvidenceSourceKind>([
  'email_decode',
  'rfp_analysis',
  'strategic_play',
  'meeting_note',
  'manual_note',
  'account_memory',
  'source_record',
  'integration_email',
  'activity_log',
  'intel_item',
]);
const SOURCE_REF_KINDS = new Set<JudgmentBriefSourceRefKind>([
  ...EVIDENCE_SOURCE_KINDS,
  'account_judgment',
  'judgment_memory',
]);
const EVIDENCE_STRENGTHS = new Set<JudgmentBriefEvidenceStrength>(['strong', 'medium', 'weak']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function cleanText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.replace(/\s+/g, ' ').trim() : undefined;
}

function normalizeIsoDate(value: unknown, fallback?: string): string | undefined {
  if (value == null || value === '') return fallback;
  const time = value instanceof Date ? value.getTime() : new Date(value as string | number).getTime();
  if (!Number.isFinite(time)) return fallback;
  return new Date(time).toISOString();
}

function nowIso(value?: unknown): string {
  return normalizeIsoDate(value) ?? new Date().toISOString();
}

function normalizeConfidence100(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const normalized01 = normalizeBriefConfidence(value);
  return normalized01 == null ? undefined : Math.round(normalized01 * 100);
}

function normalizeStringArray(value: unknown, limit = 8): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const text = cleanText(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result.length > 0 ? result : undefined;
}

function normalizeContradictions(value: unknown): JudgmentContradiction[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.flatMap((entry) => {
    if (typeof entry === 'string') {
      const summary = cleanText(entry);
      return summary ? [{ summary }] satisfies JudgmentContradiction[] : [];
    }

    const record = asRecord(entry);
    if (!record) return [];
    const summary = cleanText(record.summary) ?? cleanText(record.title);
    if (!summary) return [];
    const severity = record.severity === 'high' || record.severity === 'medium' || record.severity === 'low'
      ? record.severity
      : undefined;
    return [{
      id: cleanText(record.id),
      summary,
      severity,
      sourceIds: normalizeStringArray(record.sourceIds) ?? undefined,
    } satisfies JudgmentContradiction];
  });
  return result.length > 0 ? result : undefined;
}

function coerceEvidenceSourceKind(value: unknown): JudgmentBriefEvidenceSourceKind | undefined {
  const text = cleanText(value);
  if (!text) return undefined;
  if (text === 'decode') return 'email_decode';
  if (text === 'rfp') return 'rfp_analysis';
  return EVIDENCE_SOURCE_KINDS.has(text as JudgmentBriefEvidenceSourceKind)
    ? text as JudgmentBriefEvidenceSourceKind
    : undefined;
}

function coerceSourceRefKind(value: unknown): JudgmentBriefSourceRefKind | undefined {
  const evidenceKind = coerceEvidenceSourceKind(value);
  if (evidenceKind) return evidenceKind;
  const text = cleanText(value);
  return text && SOURCE_REF_KINDS.has(text as JudgmentBriefSourceRefKind) ? text as JudgmentBriefSourceRefKind : undefined;
}

function normalizeEvidenceStrength(value: unknown): JudgmentBriefEvidenceStrength | undefined {
  const text = cleanText(value);
  if (text === 'moderate') return 'medium';
  if (text === 'thin' || text === 'missing') return 'weak';
  return text && EVIDENCE_STRENGTHS.has(text as JudgmentBriefEvidenceStrength) ? text as JudgmentBriefEvidenceStrength : undefined;
}

function normalizeEvidenceRefs(value: unknown, params: { orgId?: string; accountId?: string; createdAt: string; issues: JudgmentBriefValidationIssue[] }): EvidenceRef[] {
  if (!Array.isArray(value)) return [];
  const refs: EvidenceRef[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;
    const sourceKind = coerceEvidenceSourceKind(record.sourceKind);
    const sourceId = cleanText(record.sourceId);
    const orgId = cleanText(record.orgId);
    const accountId = cleanText(record.accountId) ?? params.accountId;
    const reason = cleanText(record.reason) ?? cleanText(record.title) ?? cleanText(record.excerpt);
    if (!sourceKind || !sourceId || !accountId || !reason) {
      params.issues.push({ field: 'evidenceRefs', message: 'Dropped evidence ref missing sourceKind/sourceId/accountId/reason.' });
      continue;
    }
    if (params.orgId && orgId && orgId !== params.orgId) {
      params.issues.push({ field: 'evidenceRefs.orgId', message: `Dropped evidence ref for another org: ${orgId}.` });
      continue;
    }
    if (params.accountId && accountId !== params.accountId) {
      params.issues.push({ field: 'evidenceRefs.accountId', message: `Dropped evidence ref for another account: ${accountId}.` });
      continue;
    }
    const createdAt = normalizeIsoDate(record.createdAt, params.createdAt) ?? params.createdAt;
    const key = `${sourceKind}:${sourceId}:${accountId}:${reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({
      sourceKind,
      sourceId,
      accountId,
      excerpt: cleanText(record.excerpt),
      reason,
      strength: normalizeEvidenceStrength(record.strength),
      createdAt,
    });
  }
  return refs;
}

function normalizeSourceRefs(value: unknown, params: { orgId?: string; accountId?: string; createdAt: string; issues: JudgmentBriefValidationIssue[] }): SourceRecordRef[] {
  if (!Array.isArray(value)) return [];
  const refs: SourceRecordRef[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;
    const sourceKind = coerceSourceRefKind(record.sourceKind);
    const sourceId = cleanText(record.sourceId) ?? cleanText(record.sourceRecordId) ?? cleanText(record.sourceRowId);
    if (!sourceKind || !sourceId) {
      params.issues.push({ field: 'sourceRefs', message: 'Dropped source ref missing sourceKind/sourceId.' });
      continue;
    }
    const orgId = cleanText(record.orgId) ?? params.orgId;
    const accountId = cleanText(record.accountId) ?? params.accountId;
    if (params.orgId && orgId && orgId !== params.orgId) {
      params.issues.push({ field: 'sourceRefs.orgId', message: `Dropped source ref for another org: ${orgId}.` });
      continue;
    }
    if (params.accountId && accountId && accountId !== params.accountId) {
      params.issues.push({ field: 'sourceRefs.accountId', message: `Dropped source ref for another account: ${accountId}.` });
      continue;
    }
    const key = `${sourceKind}:${sourceId}:${orgId ?? ''}:${accountId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({
      sourceKind,
      sourceId,
      orgId,
      accountId,
      sourceRecordId: cleanText(record.sourceRecordId),
      sourceTable: cleanText(record.sourceTable),
      sourceRowId: cleanText(record.sourceRowId),
      title: cleanText(record.title),
      traceStatus: record.traceStatus === 'persisted' || record.traceStatus === 'derived' || record.traceStatus === 'missing' ? record.traceStatus : undefined,
      createdAt: normalizeIsoDate(record.createdAt, params.createdAt),
    });
  }
  return refs;
}

function mapJudgmentMomentum(judgment?: Judgment | null): JudgmentBriefMomentum | undefined {
  if (!judgment) return undefined;
  if (judgment.kind !== 'momentum') return undefined;
  if (judgment.value === 'very_high' || judgment.value === 'high') return 'warming';
  if (judgment.value === 'low' || judgment.value === 'very_low') return 'cooling';
  if (judgment.value === 'unknown' || judgment.value === 'mixed') return 'unknown';
  return 'stalled';
}

function judgmentRefMatchesScope(ref: JudgmentEvidenceRef, params: { orgId?: string; accountId: string }): boolean {
  const record = asRecord(ref);
  const refAccountId = cleanText(record?.accountId);
  if (refAccountId && refAccountId !== params.accountId) return false;
  const refOrgId = cleanText(record?.orgId);
  if (params.orgId && refOrgId && refOrgId !== params.orgId) return false;
  return true;
}

function evidenceRefsFromJudgmentRefs(refs: JudgmentEvidenceRef[] | undefined, params: { orgId?: string; accountId: string; reason: string; createdAt: string }): EvidenceRef[] {
  if (!Array.isArray(refs)) return [];
  return refs.flatMap((ref) => {
    const sourceKind = coerceEvidenceSourceKind(ref.sourceKind);
    if (!sourceKind || !ref.sourceId || !judgmentRefMatchesScope(ref, params)) return [];
    return [{
      sourceKind,
      sourceId: ref.sourceId,
      accountId: params.accountId,
      reason: compactBriefSentence(ref.title) || params.reason,
      createdAt: params.createdAt,
    } satisfies EvidenceRef];
  });
}

function sourceRefsFromJudgmentRefs(refs: JudgmentEvidenceRef[] | undefined, params: { orgId?: string; accountId: string; createdAt: string }): SourceRecordRef[] {
  if (!Array.isArray(refs)) return [];
  return refs.flatMap((ref) => {
    const sourceKind = coerceSourceRefKind(ref.sourceKind);
    if (!sourceKind || !ref.sourceId || !judgmentRefMatchesScope(ref, params)) return [];
    return [{
      sourceKind,
      sourceId: ref.sourceId,
      orgId: params.orgId,
      accountId: params.accountId,
      sourceTable: ref.sourceTable,
      sourceRowId: ref.sourceRowId,
      title: ref.title,
      traceStatus: 'derived',
      createdAt: params.createdAt,
    } satisfies SourceRecordRef];
  });
}

function briefDataEvidenceRefs(brief: JudgmentBriefData, params: { subjectType: JudgmentBriefSubjectType; subjectId: string; accountId?: string; createdAt: string }): EvidenceRef[] {
  if (!params.accountId) return [];
  const sourceKind: JudgmentBriefEvidenceSourceKind = params.subjectType === 'decode'
    ? 'email_decode'
    : params.subjectType === 'strategic_play'
      ? 'strategic_play'
      : params.subjectType === 'rfp'
        ? 'rfp_analysis'
        : 'account_memory';
  return (brief.evidenceChips ?? []).slice(0, 6).flatMap((chip) => {
    const reason = compactBriefSentence(chip.description) || compactBriefSentence(chip.label);
    if (!reason) return [];
    return [{
      sourceKind,
      sourceId: params.subjectId,
      accountId: params.accountId!,
      excerpt: compactBriefSentence(chip.label) || undefined,
      reason,
      strength: chip.tone === 'danger' ? 'strong' : chip.tone === 'warning' ? 'medium' : undefined,
      createdAt: params.createdAt,
    } satisfies EvidenceRef];
  });
}

export function normalizeJudgmentBrief(input: Partial<JudgmentBrief> | Record<string, unknown>): JudgmentBriefNormalizeResult {
  const issues: JudgmentBriefValidationIssue[] = [];
  const record = asRecord(input);
  if (!record) return { brief: null, issues: [{ field: 'root', message: 'JudgmentBrief must be an object.' }] };

  const subjectType = cleanText(record.subjectType) as JudgmentBriefSubjectType | undefined;
  if (!subjectType || !SUBJECT_TYPES.has(subjectType)) issues.push({ field: 'subjectType', message: 'Invalid subjectType.' });
  const subjectId = cleanText(record.subjectId);
  if (!subjectId) issues.push({ field: 'subjectId', message: 'Missing subjectId.' });

  const orgId = cleanText(record.orgId);
  const accountId = cleanText(record.accountId);
  const currentJudgment = compactBriefSentence(cleanText(record.currentJudgment)) || cleanText(record.currentJudgment);
  const risk = compactBriefSentence(cleanText(record.risk)) || cleanText(record.risk);
  const nextAction = compactBriefSentence(cleanText(record.nextAction)) || cleanText(record.nextAction);
  if (!currentJudgment) issues.push({ field: 'currentJudgment', message: 'Missing currentJudgment.' });
  if (!risk) issues.push({ field: 'risk', message: 'Missing risk.' });
  if (!nextAction) issues.push({ field: 'nextAction', message: 'Missing nextAction.' });

  const createdAt = nowIso(record.createdAt ?? record.updatedAt);
  const updatedAt = nowIso(record.updatedAt ?? record.createdAt);
  const evidenceRefs = normalizeEvidenceRefs(record.evidenceRefs, { orgId, accountId, createdAt, issues });
  const sourceRefs = normalizeSourceRefs(record.sourceRefs, { orgId, accountId, createdAt, issues });
  const confidence = normalizeConfidence100(record.confidence);

  if (issues.some((issue) => ['subjectType', 'subjectId', 'currentJudgment', 'risk', 'nextAction'].includes(issue.field))) {
    return { brief: null, issues };
  }

  const momentum = cleanText(record.momentum);
  const championStrength = cleanText(record.championStrength);
  const blockerPressure = cleanText(record.blockerPressure);

  return {
    brief: {
      subjectType: subjectType!,
      subjectId: subjectId!,
      orgId,
      accountId,
      title: cleanText(record.title),
      currentJudgment: currentJudgment!,
      risk: risk!,
      nextAction: nextAction!,
      momentum: momentum && MOMENTUM_VALUES.has(momentum as JudgmentBriefMomentum) ? momentum as JudgmentBriefMomentum : undefined,
      tension: cleanText(record.tension),
      championStrength: championStrength && CHAMPION_VALUES.has(championStrength as JudgmentBriefChampionStrength) ? championStrength as JudgmentBriefChampionStrength : undefined,
      blockerPressure: blockerPressure && BLOCKER_VALUES.has(blockerPressure as JudgmentBriefBlockerPressure) ? blockerPressure as JudgmentBriefBlockerPressure : undefined,
      confidence,
      provisional: typeof record.provisional === 'boolean' ? record.provisional : undefined,
      openQuestions: normalizeStringArray(record.openQuestions),
      contradictions: normalizeContradictions(record.contradictions),
      evidenceRefs,
      sourceRefs,
      changedFrom: asRecord(record.changedFrom) ? {
        previousJudgment: cleanText(asRecord(record.changedFrom)?.previousJudgment),
        currentJudgment: cleanText(asRecord(record.changedFrom)?.currentJudgment),
        whyChanged: cleanText(asRecord(record.changedFrom)?.whyChanged),
        changedAt: normalizeIsoDate(asRecord(record.changedFrom)?.changedAt),
        evidenceRefs: normalizeEvidenceRefs(asRecord(record.changedFrom)?.evidenceRefs, { orgId, accountId, createdAt, issues }),
      } : undefined,
      createdAt,
      updatedAt,
    },
    issues,
  };
}

export function adaptBriefDataToJudgmentBrief(params: {
  subjectType: JudgmentBriefSubjectType;
  subjectId: string;
  brief: JudgmentBriefData;
  accountId?: string;
  orgId?: string;
  sourceRefs?: SourceRecordRef[];
  evidenceRefs?: EvidenceRef[];
  createdAt?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
}): JudgmentBrief | null {
  const createdAt = nowIso(params.createdAt ?? params.brief.updatedAt);
  const updatedAt = nowIso(params.updatedAt ?? params.brief.updatedAt ?? createdAt);
  const fallbackEvidenceRefs = briefDataEvidenceRefs(params.brief, {
    subjectType: params.subjectType,
    subjectId: params.subjectId,
    accountId: params.accountId,
    createdAt,
  });
  const normalized = normalizeJudgmentBrief({
    subjectType: params.subjectType,
    subjectId: params.subjectId,
    orgId: params.orgId,
    accountId: params.accountId,
    title: params.brief.title,
    currentJudgment: params.brief.currentJudgment,
    risk: params.brief.biggestRisk,
    nextAction: params.brief.nextAction,
    confidence: params.brief.confidence ?? undefined,
    provisional: Boolean(params.brief.quality?.provisionalLabel) || params.brief.quality?.evidenceStrength === 'missing',
    openQuestions: params.brief.quality?.flags?.map((flag) => flag.label),
    evidenceRefs: params.evidenceRefs ?? fallbackEvidenceRefs,
    sourceRefs: params.sourceRefs ?? [],
    changedFrom: params.brief.evolution ? {
      previousJudgment: params.brief.evolution.previousJudgment,
      currentJudgment: params.brief.evolution.currentJudgment,
      whyChanged: params.brief.evolution.whyChanged,
      changedAt: normalizeIsoDate(params.brief.evolution.changedAt),
    } : undefined,
    createdAt,
    updatedAt,
  });
  return normalized.brief;
}

export function adaptAccountJudgmentsToJudgmentBrief(params: {
  accountId: string;
  orgId?: string;
  judgments: Judgment[];
  createdAt?: string | number | Date | null;
  updatedAt?: string | number | Date | null;
}): JudgmentBrief | null {
  const scopedJudgments = (Array.isArray(params.judgments) ? params.judgments : [])
    .filter((judgment): judgment is Judgment => Boolean(judgment) && judgment.accountId === params.accountId);
  const brief = buildAccountJudgmentBrief(scopedJudgments, params.accountId);
  if (!brief) return null;
  const createdAt = nowIso(params.createdAt ?? brief.updatedAt);
  const updatedAt = nowIso(params.updatedAt ?? brief.updatedAt ?? createdAt);
  const leadJudgment = scopedJudgments.find((judgment) => judgment.kind === 'momentum') ?? scopedJudgments[0];
  const riskJudgment = scopedJudgments.find((judgment) => judgment.kind === 'deal_risk');
  const evidenceRefs = scopedJudgments.flatMap((judgment) => evidenceRefsFromJudgmentRefs(judgment.evidenceRefs, {
    orgId: params.orgId,
    accountId: params.accountId,
    reason: compactBriefSentence(judgment.rationale) || compactBriefSentence(judgment.summary) || judgment.title,
    createdAt: normalizeIsoDate(judgment.updatedAt, updatedAt) ?? updatedAt,
  }));
  const sourceRefs = scopedJudgments.flatMap((judgment) => sourceRefsFromJudgmentRefs(judgment.evidenceRefs, {
    orgId: params.orgId,
    accountId: params.accountId,
    createdAt: normalizeIsoDate(judgment.updatedAt, updatedAt) ?? updatedAt,
  }));

  const normalized = normalizeJudgmentBrief({
    subjectType: 'account',
    subjectId: params.accountId,
    orgId: params.orgId,
    accountId: params.accountId,
    title: brief.title,
    currentJudgment: brief.currentJudgment,
    risk: brief.biggestRisk,
    nextAction: brief.nextAction,
    momentum: mapJudgmentMomentum(leadJudgment),
    tension: riskJudgment?.summary,
    confidence: brief.confidence ?? undefined,
    provisional: scopedJudgments.some((judgment) => judgment.status === 'provisional') || evidenceRefs.length === 0,
    openQuestions: brief.quality?.flags?.map((flag) => flag.label),
    contradictions: scopedJudgments.flatMap((judgment) => judgment.contradictionIds ?? []).map((id) => ({ id, summary: id })),
    evidenceRefs,
    sourceRefs,
    changedFrom: brief.evolution ? {
      previousJudgment: brief.evolution.previousJudgment,
      currentJudgment: brief.evolution.currentJudgment,
      whyChanged: brief.evolution.whyChanged,
      changedAt: normalizeIsoDate(brief.evolution.changedAt),
      evidenceRefs: evidenceRefsFromJudgmentRefs(leadJudgment?.changeEvidenceRefs, {
        orgId: params.orgId,
        accountId: params.accountId,
        reason: brief.evolution.whyChanged,
        createdAt: updatedAt,
      }),
    } : undefined,
    createdAt,
    updatedAt,
  });
  return normalized.brief;
}

function subjectTypeFromMemoryKind(sourceKind: JudgmentMemoryInput['sourceKind']): JudgmentBriefSubjectType {
  if (sourceKind === 'decode') return 'decode';
  if (sourceKind === 'strategic_play') return 'strategic_play';
  return 'rfp';
}

function evidenceKindFromMemoryKind(sourceKind: JudgmentMemoryInput['sourceKind']): JudgmentBriefEvidenceSourceKind {
  if (sourceKind === 'decode') return 'email_decode';
  if (sourceKind === 'strategic_play') return 'strategic_play';
  return 'rfp_analysis';
}

export function adaptJudgmentMemoryInputToJudgmentBrief(input: JudgmentMemoryInput, context: JudgmentBriefAdapterContext = {}): JudgmentBrief | null {
  const createdAt = nowIso(input.createdAt ?? context.now);
  const subjectType = subjectTypeFromMemoryKind(input.sourceKind);
  const evidenceRefs = input.evidenceRefs.length > 0
    ? evidenceRefsFromJudgmentRefs(input.evidenceRefs, { orgId: context.orgId, accountId: input.accountId, reason: input.rationale ?? input.currentJudgment, createdAt })
    : [{
      sourceKind: evidenceKindFromMemoryKind(input.sourceKind),
      sourceId: input.sourceId,
      accountId: input.accountId,
      reason: input.rationale ?? input.currentJudgment,
      createdAt,
    } satisfies EvidenceRef];
  const normalized = normalizeJudgmentBrief({
    subjectType,
    subjectId: input.sourceId,
    orgId: context.orgId,
    accountId: input.accountId,
    title: input.title,
    currentJudgment: input.currentJudgment,
    risk: input.risk,
    nextAction: input.nextAction,
    confidence: input.confidence,
    provisional: input.provisional,
    openQuestions: input.uncertainty ? [input.uncertainty] : undefined,
    evidenceRefs,
    sourceRefs: [{
      sourceKind: 'judgment_memory',
      sourceId: input.sourceId,
      orgId: context.orgId,
      accountId: input.accountId,
      title: input.title,
      traceStatus: 'derived',
      createdAt,
    }],
    createdAt,
    updatedAt: createdAt,
  });
  return normalized.brief;
}

export function adaptJudgmentMemorySourceItemToJudgmentBrief(item: JudgmentMemorySourceItem, context: JudgmentBriefAdapterContext = {}): JudgmentBrief | null {
  const createdAt = nowIso(item.updatedAt ?? context.now);
  const subjectType = subjectTypeFromMemoryKind(item.sourceKind);
  const evidenceRefs = item.evidenceRefs.length > 0
    ? evidenceRefsFromJudgmentRefs(item.evidenceRefs, { orgId: context.orgId, accountId: context.accountId ?? '', reason: item.currentJudgment, createdAt })
      .map((ref) => ({ ...ref, accountId: context.accountId ?? ref.accountId }))
      .filter((ref) => ref.accountId)
    : context.accountId
      ? [{
        sourceKind: evidenceKindFromMemoryKind(item.sourceKind),
        sourceId: item.sourceId,
        accountId: context.accountId,
        reason: item.currentJudgment,
        createdAt,
      } satisfies EvidenceRef]
      : [];
  const normalized = normalizeJudgmentBrief({
    subjectType,
    subjectId: item.sourceId,
    orgId: context.orgId,
    accountId: context.accountId,
    title: item.title,
    currentJudgment: item.currentJudgment,
    risk: item.risk,
    nextAction: item.nextAction,
    confidence: item.confidence ?? undefined,
    provisional: item.provisional,
    openQuestions: item.uncertainty ? [item.uncertainty] : undefined,
    evidenceRefs,
    sourceRefs: [{
      sourceKind: 'judgment_memory',
      sourceId: item.sourceId,
      orgId: context.orgId,
      accountId: context.accountId,
      sourceRecordId: item.sourceRecordId,
      sourceTable: item.sourceTable,
      sourceRowId: item.sourceRowId,
      title: item.title,
      traceStatus: item.traceStatus ?? 'persisted',
      createdAt,
    }],
    createdAt,
    updatedAt: createdAt,
  });
  return normalized.brief;
}
