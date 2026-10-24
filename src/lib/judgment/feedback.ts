import type { JudgmentEvidenceRef } from '@/lib/babel-engine/types';

export type JudgmentFeedbackType = 'accurate' | 'inaccurate' | 'over_optimistic' | 'missed_risk' | 'missing_evidence' | 'over_inferred' | 'stale';
export type JudgmentFeedbackKind = JudgmentFeedbackType;
export type JudgmentFeedbackTarget = 'account_momentum' | 'stakeholder' | 'open_question' | 'judgment' | 'rfp' | 'decode' | 'strategic_play' | 'unknown';
export type JudgmentFeedbackScope = 'account_only' | 'session_only' | 'candidate_global_rule';
export type JudgmentFeedbackStatus = 'active' | 'applied' | 'dismissed';
export type JudgmentRevisionStatus = 'pending' | 'ready' | 'failed';
export type JudgmentFeedbackUsefulness = 'useful' | 'not_useful' | 'unsure';
export type JudgmentFeedbackActionIntent = 'will_act' | 'will_not_act' | 'needs_more_evidence' | 'not_applicable';

export interface JudgmentFeedbackItem {
  id: string;
  orgId?: string;
  accountId: string;
  targetType: JudgmentFeedbackTarget;
  targetId: string;
  /** @deprecated Use feedbackType. Kept for existing persisted metadata and UI contract. */
  kind: JudgmentFeedbackKind;
  feedbackType: JudgmentFeedbackType;
  content: string;
  usefulness?: JudgmentFeedbackUsefulness;
  actionIntent?: JudgmentFeedbackActionIntent;
  scope: JudgmentFeedbackScope;
  status: JudgmentFeedbackStatus;
  evidenceRefs: JudgmentEvidenceRef[];
  createdBy?: string;
  createdAt: string;
}

export interface RevisedJudgmentPreview {
  previousSummary: string;
  userCorrection: string;
  revisedSummary: string;
  whyChanged: string;
  confidenceDelta: number;
  preservedClaims: string[];
  replacedClaims: string[];
  provisional: boolean;
}

export interface JudgmentFeedbackRevisionRecord {
  feedback: JudgmentFeedbackItem;
  revisedPreview?: RevisedJudgmentPreview;
  revisionStatus: JudgmentRevisionStatus;
  revisionError?: string;
}

export interface JudgmentFeedbackDraftInput {
  id?: unknown;
  orgId?: unknown;
  accountId?: unknown;
  targetType?: unknown;
  targetId?: unknown;
  kind?: unknown;
  feedbackType?: unknown;
  content?: unknown;
  usefulness?: unknown;
  actionIntent?: unknown;
  scope?: unknown;
  status?: unknown;
  evidenceRefs?: unknown;
  createdBy?: unknown;
  createdAt?: unknown;
  previousSummary?: unknown;
}

export interface JudgmentFeedbackSourceRecordLike {
  id?: string | null;
  org_id?: string | null;
  account_id?: string | null;
  source_row_id?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface JudgmentFeedbackSourceRecordRow {
  org_id: string;
  account_id: string;
  source_kind: 'human_feedback';
  source_table: 'judgment_feedback';
  source_row_id: string;
  title: string;
  summary: string;
  occurred_at: string;
  metadata: {
    feedback: JudgmentFeedbackItem;
    revisedPreview?: RevisedJudgmentPreview;
    revisionStatus: JudgmentRevisionStatus;
    revisionError?: string;
    previousSummary: string;
    scopeNote: string;
  };
}

export const JUDGMENT_FEEDBACK_TYPES: readonly JudgmentFeedbackType[] = ['accurate', 'inaccurate', 'over_optimistic', 'missed_risk', 'missing_evidence', 'over_inferred', 'stale'];
const FEEDBACK_TYPES = new Set<JudgmentFeedbackType>(JUDGMENT_FEEDBACK_TYPES);
const FEEDBACK_TARGETS = new Set<JudgmentFeedbackTarget>(['account_momentum', 'stakeholder', 'open_question', 'judgment', 'rfp', 'decode', 'strategic_play', 'unknown']);
const FEEDBACK_SCOPES = new Set<JudgmentFeedbackScope>(['account_only', 'session_only', 'candidate_global_rule']);
const FEEDBACK_STATUSES = new Set<JudgmentFeedbackStatus>(['active', 'applied', 'dismissed']);
const FEEDBACK_USEFULNESS = new Set<JudgmentFeedbackUsefulness>(['useful', 'not_useful', 'unsure']);
const FEEDBACK_ACTION_INTENTS = new Set<JudgmentFeedbackActionIntent>(['will_act', 'will_not_act', 'needs_more_evidence', 'not_applicable']);
const MAX_CONTENT_LENGTH = 3000;
const MAX_SUMMARY_LENGTH = 1000;
const MAX_EVIDENCE_REFS = 12;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function cleanText(value: unknown, maxLength = MAX_CONTENT_LENGTH): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

function validIso(value: unknown): string | null {
  const text = cleanText(value, 100);
  if (!text) return null;
  const time = new Date(text).getTime();
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString();
}

function normalizeFeedbackType(value: unknown): JudgmentFeedbackType | null {
  const text = cleanText(value, 40) as JudgmentFeedbackType;
  return FEEDBACK_TYPES.has(text) ? text : null;
}

function normalizeTarget(value: unknown): JudgmentFeedbackTarget {
  const text = cleanText(value, 60) as JudgmentFeedbackTarget;
  return FEEDBACK_TARGETS.has(text) ? text : 'unknown';
}

function normalizeScope(value: unknown): JudgmentFeedbackScope {
  const text = cleanText(value, 60) as JudgmentFeedbackScope;
  return FEEDBACK_SCOPES.has(text) ? text : 'account_only';
}

function normalizeStatus(value: unknown): JudgmentFeedbackStatus {
  const text = cleanText(value, 60) as JudgmentFeedbackStatus;
  return FEEDBACK_STATUSES.has(text) ? text : 'active';
}

function normalizeUsefulness(value: unknown): JudgmentFeedbackUsefulness | undefined {
  const text = cleanText(value, 60) as JudgmentFeedbackUsefulness;
  return FEEDBACK_USEFULNESS.has(text) ? text : undefined;
}

function normalizeActionIntent(value: unknown): JudgmentFeedbackActionIntent | undefined {
  const text = cleanText(value, 80) as JudgmentFeedbackActionIntent;
  return FEEDBACK_ACTION_INTENTS.has(text) ? text : undefined;
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
    const key = `${sourceKind}:${sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({
      sourceId,
      sourceKind,
      title: cleanText(record?.title, 200) || undefined,
      sourceTable: cleanText(record?.sourceTable, 120) || undefined,
      sourceRowId: cleanText(record?.sourceRowId, 200) || undefined,
    });
    if (refs.length >= MAX_EVIDENCE_REFS) break;
  }

  return refs;
}

function splitClaims(summary: string): string[] {
  return summary
    .split(/[。.!?！？；;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function targetLabel(targetType: JudgmentFeedbackTarget): string {
  switch (targetType) {
    case 'account_momentum': return '账户动量判断';
    case 'stakeholder': return '干系人判断';
    case 'open_question': return '待验证问题';
    case 'judgment': return '账户综合判断';
    case 'rfp': return 'RFP 判断';
    case 'decode': return 'Decode 判断';
    case 'strategic_play': return 'Strategic Play 判断';
    default: return '当前判断';
  }
}

export function scopeNote(scope: JudgmentFeedbackScope): string {
  if (scope === 'candidate_global_rule') {
    return '已标记为候选团队规则，但不会自动影响其他客户或团队规则；需要人工审核后才可能升级。';
  }
  if (scope === 'session_only') {
    return '仅作为本次会话的判断修正证据，不自动改写账户长期判断。';
  }
  return '已记录为账户修正；将影响当前客户判断，不会影响其他客户或团队规则。';
}

export function buildRevisedJudgmentPreview(params: {
  kind: JudgmentFeedbackType;
  targetType?: JudgmentFeedbackTarget;
  previousSummary?: unknown;
  content: unknown;
  scope?: JudgmentFeedbackScope;
}): RevisedJudgmentPreview {
  const previousSummary = cleanText(params.previousSummary, MAX_SUMMARY_LENGTH) || '上一版判断未提供；这条反馈将作为下一次判断的人工证据。';
  const userCorrection = cleanText(params.content) || '用户要求重新校准该判断。';
  const target = targetLabel(params.targetType ?? 'unknown');
  const preservedClaims = splitClaims(previousSummary).filter((claim) => !userCorrection.includes(claim)).slice(0, 3);
  const replacedClaims = params.kind === 'inaccurate' || params.kind === 'over_inferred' || params.kind === 'over_optimistic' || params.kind === 'missed_risk' || params.kind === 'stale'
    ? splitClaims(previousSummary).slice(0, 2)
    : [];

  if (params.kind === 'accurate') {
    return {
      previousSummary,
      userCorrection,
      revisedSummary: `${target}已被用户标记为准确：${userCorrection}`,
      whyChanged: '用户确认该判断准确；这条反馈会作为正向校准信号，提高同类判断的可信度。',
      confidenceDelta: 0.05,
      preservedClaims: preservedClaims.length > 0 ? preservedClaims : splitClaims(previousSummary).slice(0, 3),
      replacedClaims: [],
      provisional: false,
    };
  }

  if (params.kind === 'inaccurate') {
    return {
      previousSummary,
      userCorrection,
      revisedSummary: `${target}需按人工纠正重写：${userCorrection}`,
      whyChanged: '用户明确指出原判断有误；该反馈作为当前账户的一等修正证据，而不是普通评论。',
      confidenceDelta: -0.15,
      preservedClaims,
      replacedClaims,
      provisional: true,
    };
  }

  if (params.kind === 'over_optimistic') {
    return {
      previousSummary,
      userCorrection,
      revisedSummary: `${target}被标记为过度乐观，需下调推进判断并重新验证风险：${userCorrection}`,
      whyChanged: '用户指出原判断过度乐观；后续判断必须降低赢面/动量强度，并把未验证风险显式放回判断层。',
      confidenceDelta: -0.14,
      preservedClaims,
      replacedClaims,
      provisional: true,
    };
  }

  if (params.kind === 'missed_risk') {
    return {
      previousSummary,
      userCorrection,
      revisedSummary: `${target}漏看了关键风险，需把风险写回下一版判断：${userCorrection}`,
      whyChanged: '用户指出系统漏看风险；这条反馈会作为风险校准信号，提醒后续判断先检查同类盲点。',
      confidenceDelta: -0.13,
      preservedClaims,
      replacedClaims,
      provisional: true,
    };
  }

  if (params.kind === 'missing_evidence') {
    return {
      previousSummary,
      userCorrection,
      revisedSummary: `${target}缺少关键证据，需补证后再确认：${userCorrection}`,
      whyChanged: '用户指出证据链不完整；系统应把这条反馈作为下一步验证项，避免把未证实假设当成结论。',
      confidenceDelta: -0.08,
      preservedClaims,
      replacedClaims: [],
      provisional: true,
    };
  }

  if (params.kind === 'over_inferred') {
    return {
      previousSummary,
      userCorrection,
      revisedSummary: `${target}存在过度推断，需降级为待验证假设：${userCorrection}`,
      whyChanged: '用户指出原判断超出了证据可支持范围；后续推理必须降低结论强度并补足来源。',
      confidenceDelta: -0.12,
      preservedClaims,
      replacedClaims,
      provisional: true,
    };
  }

  return {
    previousSummary,
    userCorrection,
    revisedSummary: `${target}已被用户标记为过期，需刷新证据后重判：${userCorrection}`,
    whyChanged: '用户指出原判断依赖的时间或事实已经过期；系统应重新拉取最新账户证据再判断。',
    confidenceDelta: -0.1,
    preservedClaims,
    replacedClaims,
    provisional: true,
  };
}

export function createJudgmentFeedbackItem(input: JudgmentFeedbackDraftInput & {
  id: string;
  accountId: string;
  targetId: string;
  kind: JudgmentFeedbackType;
  content: string;
}): JudgmentFeedbackItem {
  const kind = input.kind;
  return {
    id: cleanText(input.id, 160),
    orgId: cleanText(input.orgId, 160) || undefined,
    accountId: input.accountId,
    targetType: normalizeTarget(input.targetType),
    targetId: input.targetId,
    kind,
    feedbackType: kind,
    content: input.content,
    usefulness: normalizeUsefulness(input.usefulness),
    actionIntent: normalizeActionIntent(input.actionIntent),
    scope: normalizeScope(input.scope),
    status: normalizeStatus(input.status),
    evidenceRefs: normalizeEvidenceRefs(input.evidenceRefs),
    createdBy: cleanText(input.createdBy, 160) || undefined,
    createdAt: validIso(input.createdAt) ?? new Date().toISOString(),
  };
}

export function parseJudgmentFeedbackOnly(input: JudgmentFeedbackDraftInput, defaults: {
  id: string;
  accountId: string;
  orgId?: string;
  createdBy?: string;
  createdAt?: string;
}): { ok: true; feedback: JudgmentFeedbackItem } | { ok: false; error: string } {
  const content = cleanText(input.content);
  if (content.length < 2) return { ok: false, error: '请填写要修正或补充的内容' };

  const kind = normalizeFeedbackType(input.kind ?? input.feedbackType);
  if (!kind) return { ok: false, error: '反馈类型无效' };

  const targetId = cleanText(input.targetId, 200);
  if (!targetId) return { ok: false, error: '缺少反馈目标' };

  const accountId = cleanText(input.accountId, 160) || defaults.accountId;
  if (accountId !== defaults.accountId) return { ok: false, error: '反馈账户不匹配' };

  return {
    ok: true,
    feedback: createJudgmentFeedbackItem({
      ...input,
      id: defaults.id,
      orgId: defaults.orgId,
      accountId,
      targetId,
      kind,
      content,
      createdBy: defaults.createdBy,
      createdAt: defaults.createdAt,
    }),
  };
}

export function parseJudgmentFeedbackDraft(input: JudgmentFeedbackDraftInput, defaults: {
  id: string;
  accountId: string;
  orgId?: string;
  createdBy?: string;
  createdAt?: string;
}): { ok: true; feedback: JudgmentFeedbackItem; revisedPreview: RevisedJudgmentPreview } | { ok: false; error: string } {
  const parsed = parseJudgmentFeedbackOnly(input, defaults);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    feedback: parsed.feedback,
    revisedPreview: buildRevisedJudgmentPreview({
      kind: parsed.feedback.kind,
      targetType: parsed.feedback.targetType,
      previousSummary: input.previousSummary,
      content: parsed.feedback.content,
      scope: parsed.feedback.scope,
    }),
  };
}

export function buildJudgmentFeedbackSourceRecord(params: {
  orgId: string;
  feedback: JudgmentFeedbackItem;
  revisedPreview?: RevisedJudgmentPreview;
  revisionStatus?: JudgmentRevisionStatus;
  revisionError?: string;
  previousSummary?: unknown;
}): JudgmentFeedbackSourceRecordRow {
  const { orgId, feedback, revisedPreview } = params;
  if (feedback.orgId && feedback.orgId !== orgId) {
    throw new Error('反馈组织不匹配');
  }
  const revisionStatus = params.revisionStatus ?? (revisedPreview ? 'ready' : 'pending');
  const previousSummary = revisedPreview?.previousSummary ?? cleanText(params.previousSummary, MAX_SUMMARY_LENGTH) ?? '';
  return {
    org_id: orgId,
    account_id: feedback.accountId,
    source_kind: 'human_feedback',
    source_table: 'judgment_feedback',
    source_row_id: feedback.id,
    title: `Human feedback · ${targetLabel(feedback.targetType)}`,
    summary: revisedPreview?.revisedSummary ?? feedback.content,
    occurred_at: feedback.createdAt,
    metadata: {
      feedback,
      revisedPreview,
      revisionStatus,
      revisionError: cleanText(params.revisionError, 500) || undefined,
      previousSummary,
      scopeNote: scopeNote(feedback.scope),
    },
  };
}

export function normalizeJudgmentFeedbackSourceRow(row: JudgmentFeedbackSourceRecordLike): JudgmentFeedbackRevisionRecord | null {
  const metadata = asRecord(row.metadata);
  const rawFeedback = asRecord(metadata?.feedback);
  if (!rawFeedback) return null;
  const id = cleanText(rawFeedback.id, 160) || cleanText(row.source_row_id, 160) || cleanText(row.id, 160);
  const rowAccountId = cleanText(row.account_id, 160);
  const rowOrgId = cleanText(row.org_id, 160);
  const rawAccountId = cleanText(rawFeedback.accountId, 160);
  const rawOrgId = cleanText(rawFeedback.orgId, 160);
  if (rowAccountId && rawAccountId && rowAccountId !== rawAccountId) return null;
  if (rowOrgId && rawOrgId && rowOrgId !== rawOrgId) return null;
  const accountId = rawAccountId || rowAccountId;
  const targetId = cleanText(rawFeedback.targetId, 200);
  const kind = normalizeFeedbackType(rawFeedback.kind ?? rawFeedback.feedbackType);
  const content = cleanText(rawFeedback.content);
  if (!id || !accountId || !targetId || !kind || !content) return null;

  const feedback = createJudgmentFeedbackItem({
    id,
    orgId: cleanText(rawFeedback.orgId, 160) || cleanText(row.org_id, 160) || undefined,
    accountId,
    targetType: rawFeedback.targetType,
    targetId,
    kind,
    content,
    usefulness: rawFeedback.usefulness,
    actionIntent: rawFeedback.actionIntent,
    scope: rawFeedback.scope,
    status: rawFeedback.status,
    evidenceRefs: rawFeedback.evidenceRefs,
    createdBy: rawFeedback.createdBy,
    createdAt: rawFeedback.createdAt ?? row.occurred_at ?? row.created_at,
  });

  const rawPreview = asRecord(metadata?.revisedPreview);
  const revisedPreview = rawPreview
    ? {
        previousSummary: cleanText(rawPreview.previousSummary, MAX_SUMMARY_LENGTH) || '上一版判断未提供；这条反馈将作为下一次判断的人工证据。',
        userCorrection: cleanText(rawPreview.userCorrection) || feedback.content,
        revisedSummary: cleanText(rawPreview.revisedSummary) || buildRevisedJudgmentPreview({ kind, targetType: feedback.targetType, previousSummary: metadata?.previousSummary, content }).revisedSummary,
        whyChanged: cleanText(rawPreview.whyChanged) || '用户反馈改变了当前账户的判断证据。',
        confidenceDelta: typeof rawPreview.confidenceDelta === 'number' && Number.isFinite(rawPreview.confidenceDelta) ? Math.max(-1, Math.min(1, rawPreview.confidenceDelta)) : 0,
        preservedClaims: Array.isArray(rawPreview.preservedClaims) ? rawPreview.preservedClaims.map((item) => cleanText(item, 300)).filter(Boolean).slice(0, 6) : [],
        replacedClaims: Array.isArray(rawPreview.replacedClaims) ? rawPreview.replacedClaims.map((item) => cleanText(item, 300)).filter(Boolean).slice(0, 6) : [],
        provisional: rawPreview.provisional !== false,
      }
    : undefined;
  const rawStatus = cleanText(metadata?.revisionStatus, 40) as JudgmentRevisionStatus;
  const revisionStatus: JudgmentRevisionStatus = rawStatus === 'pending' || rawStatus === 'ready' || rawStatus === 'failed'
    ? rawStatus
    : revisedPreview ? 'ready' : 'pending';

  return {
    feedback,
    revisedPreview,
    revisionStatus,
    revisionError: cleanText(metadata?.revisionError, 500) || undefined,
  };
}
