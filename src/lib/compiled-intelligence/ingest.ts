/**
 * CIL Phase 2 — Ingest Pipeline (Localized Update)
 *
 * Accepts raw source material, extracts intelligence via AI,
 * and performs localized upserts to:
 *   - account_evidence
 *   - account_claims
 *   - account_knowledge_pages (only affected page types)
 *   - account_open_questions
 *   - knowledge_update_log
 *
 * Does NOT do full-page rebuilds. Only patches affected objects.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { CIL_TABLES } from '@/lib/compiled-intelligence/index';
import {
  extractIntelligence,
  type IngestInput,
  type ExtractionResult,
} from '@/lib/compiled-intelligence/ai-extract';
import type { CILPageType } from '@/lib/babel-engine/types';
import type { AIInvocationContext } from '@/lib/ai-invocation-log';

// ─── Public API ─────────────────────────────────────────────────────

export interface CILIngestParams {
  orgId: string;
  accountId: string;
  userId?: string;
  accountName: string;
  sourceId: string;
  sourceType: IngestInput['sourceType'];
  rawText: string;
  context?: string;
  occurredAt?: string;
  invocation?: AIInvocationContext;
}

export interface CILIngestResult {
  success: boolean;
  evidenceCount: number;
  claimCount: number;
  questionCount: number;
  updatedPages: CILPageType[];
  summary: string;
}

export interface CILClaimLintFinding {
  claimId: string;
  statement: string;
  claimType: string;
  severity: 'review' | 'stale_candidate';
  reason: string;
  daysSinceRevalidation: number;
}

export interface CILClaimLintResult {
  success: boolean;
  scannedClaims: number;
  flaggedClaims: number;
  staleCandidates: number;
  findings: CILClaimLintFinding[];
  summary: string;
}

/**
 * Main entry point. Fire-and-forget safe — catches all errors internally.
 */
export async function runCILIngest(params: CILIngestParams): Promise<CILIngestResult> {
  const tag = '[cil-ingest]';
  try {
    const admin = getSupabaseAdmin();
    if (!admin) {
      console.warn(tag, 'Supabase admin not available, skipping CIL ingest');
      return emptyResult('Supabase 不可用');
    }

    // Truncate very long inputs to stay within LLM context
    const truncatedText = params.rawText.length > 8000
      ? params.rawText.slice(0, 8000) + '\n...(已截断)'
      : params.rawText;

    // Step 1: AI extraction
    const extraction = await extractIntelligence({
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      accountName: params.accountName,
      rawText: truncatedText,
      context: params.context,
      invocation: {
        ...params.invocation,
        orgId: params.invocation?.orgId ?? params.orgId,
        userId: params.invocation?.userId ?? params.userId,
        accountId: params.invocation?.accountId ?? params.accountId,
        route: params.invocation?.route ?? '/api/cil-ingest',
        useCase: params.invocation?.useCase ?? 'compiled-intelligence.extract',
        metadata: {
          ...params.invocation?.metadata,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
        },
      },
    });

    if (!extraction) {
      console.warn(tag, 'AI extraction returned null for', params.sourceId);
      return emptyResult('AI 抽取失败');
    }

    // Step 1.5: Traceability source record (best-effort)
    await upsertSourceRecord(admin, params, extraction);

    // Step 2-5: Localized upserts
    const evidenceIds = await upsertEvidence(admin, params, extraction);
    const claimIds = await upsertClaims(admin, params, extraction, evidenceIds);
    await upsertOpenQuestions(admin, params, extraction);
    const updatedPages = await localizedPageUpdate(admin, params, extraction);

    // Step 6: Write update log
    await writeUpdateLog(admin, params, extraction, updatedPages, claimIds);

    // Invalidate cached memory snapshot so next page load gets fresh data
    try {
      await admin
        .from('account_knowledge_pages')
        .delete()
        .eq('org_id', params.orgId)
        .eq('account_id', params.accountId)
        .eq('page_type', 'memory_snapshot');
    } catch (e) {
      console.warn(tag, 'cache invalidation failed (non-critical):', e);
    }

    const result: CILIngestResult = {
      success: true,
      evidenceCount: evidenceIds.length,
      claimCount: claimIds.length,
      questionCount: extraction.openQuestions.length,
      updatedPages,
      summary: extraction.summary,
    };

    console.log(tag, `Done: ${result.evidenceCount}E / ${result.claimCount}C / ${result.questionCount}Q / ${result.updatedPages.length}P`, params.sourceId);
    return result;
  } catch (err) {
    console.error(tag, 'Unexpected error:', err);
    return emptyResult('内部错误');
  }
}

const SOURCE_RECORD_MAPPING: Record<IngestInput['sourceType'], { sourceKind: string; sourceTable: string; defaultTitle: string }> = {
  note: { sourceKind: 'intel_item', sourceTable: 'intel_items', defaultTitle: '情报笔记' },
  email: { sourceKind: 'intel_item', sourceTable: 'intel_items', defaultTitle: '邮件情报' },
  meeting_note: { sourceKind: 'meeting_prep', sourceTable: 'meeting_preps', defaultTitle: '会议纪要' },
  call_transcript: { sourceKind: 'meeting_prep', sourceTable: 'meeting_recordings', defaultTitle: '会议录音转写' },
};

async function upsertSourceRecord(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  params: CILIngestParams,
  extraction: ExtractionResult,
): Promise<void> {
  const mapped = SOURCE_RECORD_MAPPING[params.sourceType];
  const summarySource = extraction.summary
    || extraction.evidence[0]?.summary
    || extraction.evidence[0]?.quoteText
    || params.rawText
    || '';
  const summary = summarySource.length > 220 ? `${summarySource.slice(0, 220)}...` : summarySource;

  const { error } = await admin
    .from('source_records')
    .upsert(
      {
        org_id: params.orgId,
        account_id: params.accountId,
        source_kind: mapped.sourceKind,
        source_table: mapped.sourceTable,
        source_row_id: params.sourceId,
        title: `${mapped.defaultTitle} · ${params.accountName}`,
        summary,
        occurred_at: params.occurredAt || new Date().toISOString(),
        metadata: {
          source_type: params.sourceType,
          evidence_count: extraction.evidence.length,
          claim_count: extraction.claims.length,
          open_question_count: extraction.openQuestions.length,
        },
      },
      { onConflict: 'org_id,source_kind,source_row_id' },
    );

  if (error) {
    const message = error.message ?? '';
    if (
      message.includes(`relation "public.source_records" does not exist`)
      || message.includes(`Could not find the table 'public.source_records'`)
    ) {
      return;
    }
    console.warn('[cil-ingest] source record upsert error:', message);
  }
}

// ─── Step 2: Upsert evidence ────────────────────────────────────────

async function upsertEvidence(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  params: CILIngestParams,
  extraction: ExtractionResult,
): Promise<string[]> {
  if (extraction.evidence.length === 0) return [];

  const rows = extraction.evidence.map((e) => ({
    org_id: params.orgId,
    account_id: params.accountId,
    source_id: params.sourceId,
    source_type: params.sourceType,
    evidence_type: e.evidenceType,
    quote_text: e.quoteText || null,
    summary: e.summary || null,
    speaker: e.speaker || null,
    occurred_at: params.occurredAt || new Date().toISOString(),
    relevance_score: e.relevanceScore,
    linked_claim_ids: [],
    linked_page_types: e.linkedPageTypes,
    metadata: {},
  }));

  const { data, error } = await admin
    .from(CIL_TABLES.evidence)
    .insert(rows)
    .select('id');

  if (error) {
    console.error('[cil-ingest] evidence insert error:', error.message);
    return [];
  }

  return (data ?? []).map((r: { id: string }) => r.id);
}

// ─── Step 3: Upsert claims (with dedupe / revalidation) ────────────

/** Similarity threshold above which we consider two claims as "same" */
export const CLAIM_MATCH_THRESHOLD = 0.55;
/** Lower threshold for potentially conflicting claims on the same topic */
export const CLAIM_CONFLICT_THRESHOLD = 0.35;
/** If a claim drops below this confidence after conflict, mark it stale */
export const CLAIM_STALE_CONFIDENCE_THRESHOLD = 0.4;
/** Minimal staleness window for unrefreshed claims */
export const CLAIM_STALE_DAYS = 14;

async function upsertClaims(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  params: CILIngestParams,
  extraction: ExtractionResult,
  evidenceIds: string[],
): Promise<string[]> {
  if (extraction.claims.length === 0) return [];

  // Fetch existing live claims for this account to match against
  const { data: existingClaims } = await admin
    .from(CIL_TABLES.claims)
    .select('id, claim_type, statement, status, confidence, supporting_evidence_ids, counter_evidence_ids, affected_object_ids, last_revalidated_at')
    .eq('org_id', params.orgId)
    .eq('account_id', params.accountId)
    .in('status', ['active', 'stale']);

  const existing: Array<{
    id: string;
    claim_type: string;
    statement: string;
    status: string;
    confidence: number;
    supporting_evidence_ids: string[];
    counter_evidence_ids: string[];
    affected_object_ids: string[];
    last_revalidated_at?: string;
  }> = existingClaims ?? [];

  const now = new Date().toISOString();
  const resultIds = new Set<string>();
  const toInsert: Array<Record<string, unknown>> = [];

  for (const c of extraction.claims) {
    const sameTypeClaims = existing.filter((ex) => ex.claim_type === c.claimType);
    const supportMatch = c.stance !== 'contradicts'
      ? sameTypeClaims.find(
          (ex) =>
            tokenOverlapScore(ex.statement, c.statement) >= CLAIM_MATCH_THRESHOLD &&
            assessClaimRelation(ex.statement, c.statement) === 'support',
        )
      : undefined;

    const conflictingClaims = sameTypeClaims.filter(
      (ex) =>
        tokenOverlapScore(ex.statement, c.statement) >= CLAIM_CONFLICT_THRESHOLD &&
        (c.stance === 'contradicts' || assessClaimRelation(ex.statement, c.statement) === 'conflict'),
    );

    if (supportMatch) {
      const mergedEvIds = Array.from(
        new Set([...(supportMatch.supporting_evidence_ids ?? []), ...evidenceIds]),
      );
      const mergedAffected = Array.from(
        new Set([...(supportMatch.affected_object_ids ?? []), ...c.affectedPageTypes]),
      );
      const newConf = roundConfidence(c.confidence * 0.6 + supportMatch.confidence * 0.4);

      await admin
        .from(CIL_TABLES.claims)
        .update({
          status: 'active',
          confidence: newConf,
          supporting_evidence_ids: mergedEvIds,
          affected_object_ids: mergedAffected,
          last_revalidated_at: now,
          updated_at: now,
        })
        .eq('id', supportMatch.id);

      resultIds.add(supportMatch.id);
      continue;
    }

    for (const conflict of conflictingClaims) {
      const mergedCounterEvIds = Array.from(
        new Set([...(conflict.counter_evidence_ids ?? []), ...evidenceIds]),
      );
      const mergedAffected = Array.from(
        new Set([...(conflict.affected_object_ids ?? []), ...c.affectedPageTypes]),
      );
      const downgradedConfidence = roundConfidence(
        Math.max(0.1, conflict.confidence * 0.55 - c.confidence * 0.15),
      );
      const staleByAge = isClaimStale(conflict.last_revalidated_at, now);
      const nextStatus = (downgradedConfidence <= CLAIM_STALE_CONFIDENCE_THRESHOLD || staleByAge)
        ? 'stale'
        : 'active';

      await admin
        .from(CIL_TABLES.claims)
        .update({
          status: nextStatus,
          confidence: downgradedConfidence,
          counter_evidence_ids: mergedCounterEvIds,
          affected_object_ids: mergedAffected,
          last_revalidated_at: now,
          updated_at: now,
        })
        .eq('id', conflict.id);

      resultIds.add(conflict.id);
    }

    toInsert.push({
      org_id: params.orgId,
      account_id: params.accountId,
      claim_type: c.claimType,
      statement: c.statement,
      status: 'active',
      confidence: c.confidence,
      supporting_evidence_ids: evidenceIds,
      counter_evidence_ids: [],
      affected_object_ids: c.affectedPageTypes,
      last_revalidated_at: now,
    });
  }

  // Insert genuinely new claims
  if (toInsert.length > 0) {
    const { data, error } = await admin
      .from(CIL_TABLES.claims)
      .insert(toInsert)
      .select('id');

    if (error) {
      console.error('[cil-ingest] claims insert error:', error.message);
    } else {
      for (const r of data ?? []) {
        resultIds.add((r as { id: string }).id);
      }
    }
  }

  // Back-link: update evidence rows with claim IDs
  const linkedClaimIds = Array.from(resultIds);

  if (linkedClaimIds.length > 0 && evidenceIds.length > 0) {
    for (const evId of evidenceIds) {
      await admin
        .from(CIL_TABLES.evidence)
        .update({ linked_claim_ids: linkedClaimIds })
        .eq('id', evId);
    }
  }

  return linkedClaimIds;
}

// ─── Step 4: Upsert open questions (with resolve + dedupe) ─────────

/** Threshold for considering a new question as duplicate of existing */
const QUESTION_DUPE_THRESHOLD = 0.55;
/** Threshold for considering new content as answering an existing question */
const QUESTION_ANSWER_THRESHOLD = 0.40;

async function upsertOpenQuestions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  params: CILIngestParams,
  extraction: ExtractionResult,
): Promise<void> {
  // Fetch existing open questions for this account
  const { data: existingRows } = await admin
    .from(CIL_TABLES.openQuestions)
    .select('id, question')
    .eq('org_id', params.orgId)
    .eq('account_id', params.accountId)
    .eq('status', 'open');

  const existingQuestions: Array<{ id: string; question: string }> = existingRows ?? [];

  // ── Phase A: Try to resolve existing open questions with new intel ──
  // Build a combined "answer corpus" from this extraction's claims + evidence + summary
  const answerCorpus = buildAnswerCorpus(extraction);

  if (answerCorpus && existingQuestions.length > 0) {
    const now = new Date().toISOString();
    for (const eq of existingQuestions) {
      const score = tokenOverlapScore(eq.question, answerCorpus);
      if (score >= QUESTION_ANSWER_THRESHOLD) {
        // Build a short answer from the extraction summary + matching claim/evidence
        const answer = buildAnswerSnippet(eq.question, extraction);
        await admin
          .from(CIL_TABLES.openQuestions)
          .update({
            status: 'answered',
            answer,
            resolved_at: now,
            updated_at: now,
          })
          .eq('id', eq.id);
      }
    }
  }

  // ── Phase B: Insert new questions (skip duplicates of existing open ones) ──
  if (extraction.openQuestions.length === 0) return;

  // Re-fetch open questions (some may have been resolved above)
  const { data: currentOpenRows } = await admin
    .from(CIL_TABLES.openQuestions)
    .select('id, question')
    .eq('org_id', params.orgId)
    .eq('account_id', params.accountId)
    .eq('status', 'open');

  const currentOpen: Array<{ id: string; question: string }> = currentOpenRows ?? [];

  const toInsert: Array<Record<string, unknown>> = [];

  for (const q of extraction.openQuestions) {
    // Check for duplicates among existing open questions
    const isDupe = currentOpen.some(
      (eq) => tokenOverlapScore(eq.question, q.question) >= QUESTION_DUPE_THRESHOLD,
    );
    if (isDupe) continue;

    // Also skip if this question is already answered by this extraction
    if (answerCorpus && tokenOverlapScore(q.question, answerCorpus) >= QUESTION_ANSWER_THRESHOLD) {
      continue;
    }

    toInsert.push({
      org_id: params.orgId,
      account_id: params.accountId,
      question: q.question,
      priority: q.priority,
      status: 'open',
      related_objects: q.relatedObjects,
      blocking_outputs: q.blockingOutputs,
    });
  }

  if (toInsert.length > 0) {
    const { error } = await admin.from(CIL_TABLES.openQuestions).insert(toInsert);
    if (error) {
      console.error('[cil-ingest] open questions insert error:', error.message);
    }
  }
}

/**
 * Build a combined text corpus from extraction results for matching against open questions.
 */
export function buildAnswerCorpus(extraction: ExtractionResult): string {
  const parts: string[] = [];
  if (extraction.summary) parts.push(extraction.summary);
  for (const c of extraction.claims) {
    parts.push(c.statement);
  }
  for (const e of extraction.evidence) {
    if (e.summary) parts.push(e.summary);
  }
  return parts.join(' ');
}

/**
 * Build a short answer snippet for a resolved question from extraction data.
 */
export function buildAnswerSnippet(question: string, extraction: ExtractionResult): string {
  const resolution = buildResolutionExplanation(question, extraction);
  if (!resolution.answer && !resolution.claim && !resolution.evidence && !resolution.summary) {
    return extraction.summary || '已通过新资料解答';
  }

  const lines = [resolution.answer || extraction.summary || '已通过新资料解答'];
  const explainability: string[] = [];
  if (resolution.claim) explainability.push(`claim：${resolution.claim}`);
  if (resolution.evidence) explainability.push(`evidence：${resolution.evidence}`);
  if (resolution.summary) explainability.push(`summary：${resolution.summary}`);

  if (explainability.length > 0) {
    lines.push(`解答依据：${explainability.join('；')}`);
  }

  return lines.join('\n');
}

// ─── Step 5: Localized page update ─────────────────────────────────

async function localizedPageUpdate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  params: CILIngestParams,
  extraction: ExtractionResult,
): Promise<CILPageType[]> {
  if (extraction.pageUpdates.length === 0) return [];

  const updatedPages: CILPageType[] = [];

  for (const pu of extraction.pageUpdates) {
    // Fetch existing page (if any)
    const { data: existing } = await admin
      .from(CIL_TABLES.knowledgePages)
      .select('id, content_json, version')
      .eq('org_id', params.orgId)
      .eq('account_id', params.accountId)
      .eq('page_type', pu.pageType)
      .maybeSingle();

    if (existing) {
      // Merge patch into existing content_json
      const merged = deepMergePatch(existing.content_json ?? {}, pu.patch);
      await admin
        .from(CIL_TABLES.knowledgePages)
        .update({
          content_json: merged,
          version: (existing.version ?? 1) + 1,
          updated_by: 'ai',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      // Create new page
      await admin.from(CIL_TABLES.knowledgePages).insert({
        org_id: params.orgId,
        account_id: params.accountId,
        page_type: pu.pageType,
        title: pageTypeTitle(pu.pageType),
        content_json: pu.patch,
        version: 1,
        updated_by: 'ai',
      });
    }

    updatedPages.push(pu.pageType);
  }

  return updatedPages;
}

// ─── Step 6: Write update log ───────────────────────────────────────

async function writeUpdateLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  params: CILIngestParams,
  extraction: ExtractionResult,
  updatedPages: CILPageType[],
  claimIds: string[],
): Promise<void> {
  const { error } = await admin.from(CIL_TABLES.updateLog).insert({
    org_id: params.orgId,
    account_id: params.accountId,
    trigger_source_id: params.sourceId,
    update_type: 'ingest',
    changed_pages: updatedPages,
    changed_claims: claimIds,
    summary: extraction.summary,
  });

  if (error) {
    console.error('[cil-ingest] update log insert error:', error.message);
  }
}

// ─── Text matching helpers (minimal, no external deps) ──────────────

/**
 * Normalize a statement for comparison: lowercase, strip punctuation,
 * collapse whitespace. Works for Chinese + ASCII mixed text.
 */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[，。！？、；：""''（）【】《》\s]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute token-overlap (Jaccard-like) score between two normalized strings.
 * Returns 0..1. Tokens are split by spaces; single-char tokens are ignored.
 */
export function tokenOverlapScore(a: string, b: string): number {
  const tokA = new Set(tokenizeForOverlap(a));
  const tokB = new Set(tokenizeForOverlap(b));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokA) {
    if (tokB.has(t)) intersection++;
  }
  return intersection / Math.max(tokA.size, tokB.size);
}

// ─── Helpers ────────────────────────────────────────────────────────

export function lintHighImpactClaims(
  claims: Array<{
    id: string;
    claim_type: string;
    statement: string;
    confidence: number;
    status: string;
    last_revalidated_at?: string;
  }>,
  nowIso: string,
): CILClaimLintFinding[] {
  return claims
    .filter((claim) => claim.status === 'active' || claim.status === 'stale')
    .filter((claim) => isHighImpactClaim(claim.claim_type, claim.confidence))
    .map((claim) => ({
      claim,
      daysSinceRevalidation: daysSinceIso(claim.last_revalidated_at, nowIso),
    }))
    .filter(({ daysSinceRevalidation }) => daysSinceRevalidation !== null)
    .flatMap(({ claim, daysSinceRevalidation }) => {
      if (daysSinceRevalidation === null || daysSinceRevalidation < CLAIM_STALE_DAYS) {
        return [];
      }

      const severity = daysSinceRevalidation >= CLAIM_STALE_DAYS * 2
        ? 'stale_candidate'
        : 'review';

      return [{
        claimId: claim.id,
        statement: claim.statement,
        claimType: claim.claim_type,
        severity,
        reason: severity === 'stale_candidate'
          ? `高影响 claim 已超过 ${CLAIM_STALE_DAYS * 2} 天未复核，建议标记 stale`
          : `高影响 claim 已超过 ${CLAIM_STALE_DAYS} 天未复核，需进入 refresh/review`,
        daysSinceRevalidation,
      } satisfies CILClaimLintFinding];
    })
    .sort((a, b) => b.daysSinceRevalidation - a.daysSinceRevalidation);
}

export async function runCILClaimLintPass(params: {
  orgId: string;
  accountId: string;
  nowIso?: string;
}): Promise<CILClaimLintResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      success: false,
      scannedClaims: 0,
      flaggedClaims: 0,
      staleCandidates: 0,
      findings: [],
      summary: 'Supabase 不可用',
    };
  }

  const nowIso = params.nowIso || new Date().toISOString();
  const { data: rows, error } = await admin
    .from(CIL_TABLES.claims)
    .select('id, claim_type, statement, status, confidence, last_revalidated_at')
    .eq('org_id', params.orgId)
    .eq('account_id', params.accountId)
    .in('status', ['active', 'stale']);

  if (error) {
    console.error('[cil-lint] claims scan error:', error.message);
    return {
      success: false,
      scannedClaims: 0,
      flaggedClaims: 0,
      staleCandidates: 0,
      findings: [],
      summary: 'claim 扫描失败',
    };
  }

  const findings = lintHighImpactClaims(rows ?? [], nowIso);
  const staleCandidates = findings.filter((finding) => finding.severity === 'stale_candidate');

  for (const finding of staleCandidates) {
    await admin
      .from(CIL_TABLES.claims)
      .update({
        status: 'stale',
        updated_at: nowIso,
      })
      .eq('id', finding.claimId);
  }

  await admin.from(CIL_TABLES.updateLog).insert({
    org_id: params.orgId,
    account_id: params.accountId,
    update_type: 'lint',
    changed_pages: [],
    changed_claims: findings.map((finding) => finding.claimId),
    summary: findings.length > 0
      ? `lint 扫描发现 ${findings.length} 条高影响 claim 需复核，其中 ${staleCandidates.length} 条可降级为 stale 候选`
      : 'lint 扫描未发现需复核的高影响 claim',
  });

  return {
    success: true,
    scannedClaims: (rows ?? []).length,
    flaggedClaims: findings.length,
    staleCandidates: staleCandidates.length,
    findings,
    summary: findings.length > 0
      ? `已标记 ${findings.length} 条高影响 claim，其中 ${staleCandidates.length} 条为 stale 候选`
      : '未发现需复核的高影响 claim',
  };
}

function emptyResult(summary: string): CILIngestResult {
  return {
    success: false,
    evidenceCount: 0,
    claimCount: 0,
    questionCount: 0,
    updatedPages: [],
    summary,
  };
}

function pageTypeTitle(pt: CILPageType): string {
  const titles: Record<CILPageType, string> = {
    overview: '账户总览',
    stakeholders: '利益相关人地图',
    initiatives: '业务议题与痛点',
    risks: '风险与阻塞',
    timeline: '账户时间线',
    open_questions: '开放问题',
  };
  return titles[pt] ?? pt;
}

/**
 * Deep merge a patch into a base object. Arrays in patch replace base arrays.
 * Nested objects are recursively merged.
 */
export function buildResolutionExplanation(
  question: string,
  extraction: ExtractionResult,
): {
  answer: string;
  claim?: string;
  evidence?: string;
  summary?: string;
} {
  let bestClaim: string | undefined;
  let bestClaimScore = 0;
  for (const c of extraction.claims) {
    const score = tokenOverlapScore(question, c.statement);
    if (score > bestClaimScore) {
      bestClaimScore = score;
      bestClaim = c.statement;
    }
  }

  let bestEvidence: string | undefined;
  let bestEvidenceScore = 0;
  for (const e of extraction.evidence) {
    const text = e.summary || e.quoteText;
    if (!text) continue;
    const score = tokenOverlapScore(question, text);
    if (score > bestEvidenceScore) {
      bestEvidenceScore = score;
      bestEvidence = text;
    }
  }

  const answer = bestClaim || bestEvidence || extraction.summary || '已通过新资料解答';
  return {
    answer,
    claim: bestClaim,
    evidence: bestEvidence,
    summary: extraction.summary || undefined,
  };
}

export function assessClaimRelation(
  existingStatement: string,
  incomingStatement: string,
): 'support' | 'conflict' | 'none' {
  const overlap = tokenOverlapScore(existingStatement, incomingStatement);
  if (overlap < CLAIM_CONFLICT_THRESHOLD) return 'none';

  const existingNegative = hasConflictMarker(existingStatement);
  const incomingNegative = hasConflictMarker(incomingStatement);
  if (existingNegative !== incomingNegative) return 'conflict';

  return overlap >= CLAIM_MATCH_THRESHOLD ? 'support' : 'none';
}

function hasConflictMarker(text: string): boolean {
  return [
    '不',
    '没',
    '未',
    '无',
    '不是',
    '不会',
    '无法',
    '缺乏',
    '暂停',
    '推迟',
    '延后',
    '冻结',
    '拒绝',
    '反对',
    '担心',
    '风险',
    '阻塞',
    '存疑',
    '需复核',
  ].some((marker) => text.includes(marker));
}

export function isClaimStale(lastRevalidatedAt: string | undefined, nowIso: string): boolean {
  if (!lastRevalidatedAt) return false;
  const last = new Date(lastRevalidatedAt).getTime();
  const now = new Date(nowIso).getTime();
  if (Number.isNaN(last) || Number.isNaN(now)) return false;
  const diffDays = (now - last) / (1000 * 60 * 60 * 24);
  return diffDays >= CLAIM_STALE_DAYS;
}

export function roundConfidence(n: number): number {
  return Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;
}

function tokenizeForOverlap(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const spaceTokens = normalized.split(' ').filter((token) => token.length > 1);
  const cjkCompact = normalized.replace(/ /g, '');
  const cjkChunks = cjkCompact.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  const cjkBigrams = cjkChunks.flatMap((chunk) => {
    const grams: string[] = [];
    for (let i = 0; i < chunk.length - 1; i++) {
      grams.push(chunk.slice(i, i + 2));
    }
    return grams;
  });

  return Array.from(new Set([...spaceTokens, ...cjkBigrams]));
}

function isHighImpactClaim(claimType: string, confidence: number): boolean {
  return confidence >= 0.7 || ['risk_hypothesis', 'procurement_signal', 'budget_signal'].includes(claimType);
}

function daysSinceIso(lastRevalidatedAt: string | undefined, nowIso: string): number | null {
  if (!lastRevalidatedAt) return null;
  const last = new Date(lastRevalidatedAt).getTime();
  const now = new Date(nowIso).getTime();
  if (Number.isNaN(last) || Number.isNaN(now)) return null;
  return Math.floor((now - last) / (1000 * 60 * 60 * 24));
}

export function deepMergePatch(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    const bv = result[key];
    if (
      pv !== null &&
      typeof pv === 'object' &&
      !Array.isArray(pv) &&
      bv !== null &&
      typeof bv === 'object' &&
      !Array.isArray(bv)
    ) {
      result[key] = deepMergePatch(
        bv as Record<string, unknown>,
        pv as Record<string, unknown>,
      );
    } else {
      result[key] = pv;
    }
  }
  return result;
}
