/**
 * CIL P2 — Comprehensive Knowledge Linting
 *
 * Extends P1 staleness-only lint with:
 *   - Contradiction detection (same-type claims with conflicting polarity)
 *   - Unsupported claims (no supporting evidence)
 *   - Orphan evidence (evidence not linked to any claim)
 *   - Critical gaps (missing key page types, high-priority open questions blocking outputs)
 *   - Refresh targets with prioritized recommendations
 *   - Account health score (0-100)
 *
 * All lint check functions are pure — they take typed data and return findings.
 * The async `runComprehensiveLint` loads context from DB and orchestrates all checks.
 */

import type {
  AccountClaim,
  AccountEvidence,
  AccountKnowledgePage,
  AccountOpenQuestion,
  CILPageType,
} from '@/lib/babel-engine/types';
import type { CILAccountContext } from '@/lib/compiled-intelligence/context';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { CIL_TABLES } from '@/lib/compiled-intelligence/index';
import { loadCILAccountContextUnsafeInternal } from '@/lib/compiled-intelligence/context';
import {
  CLAIM_STALE_DAYS,
  tokenOverlapScore,
  assessClaimRelation,
} from '@/lib/compiled-intelligence/ingest';

// ─── Types ──────────────────────────────────────────────────────────

export type CILLintCheckType =
  | 'stale'
  | 'contradiction'
  | 'unsupported'
  | 'orphan_evidence'
  | 'critical_gap';

export type CILLintSeverity = 'info' | 'review' | 'warning' | 'critical';

export interface CILLintFinding {
  checkType: CILLintCheckType;
  severity: CILLintSeverity;
  targetType: 'claim' | 'evidence' | 'page' | 'account';
  targetId?: string;
  title: string;
  description: string;
  suggestedAction?: string;
  relatedIds?: string[];
}

export interface CILRefreshTarget {
  targetType: 'claim' | 'page';
  targetId: string;
  statement: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  staleDays?: number;
}

export interface CILComprehensiveLintResult {
  success: boolean;
  accountId: string;
  scannedClaims: number;
  scannedEvidence: number;
  scannedPages: number;
  findings: CILLintFinding[];
  healthScore: number;
  refreshTargets: CILRefreshTarget[];
  summary: string;
}

// ─── Expected page types for a healthy account ─────────────────────

const EXPECTED_PAGE_TYPES: CILPageType[] = [
  'overview',
  'stakeholders',
  'risks',
  'timeline',
  'open_questions',
];

// ─── Check 1: Stale claims ──────────────────────────────────────────

export function lintStaleClaims(
  claims: AccountClaim[],
  nowIso: string,
): CILLintFinding[] {
  const findings: CILLintFinding[] = [];
  const now = new Date(nowIso).getTime();

  for (const claim of claims) {
    if (claim.status !== 'active' && claim.status !== 'stale') continue;

    const last = new Date(claim.lastRevalidatedAt).getTime();
    if (Number.isNaN(last) || Number.isNaN(now)) continue;

    const daysSince = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    if (daysSince < CLAIM_STALE_DAYS) continue;

    const isHighImpact =
      claim.confidence >= 0.7 ||
      ['risk_hypothesis', 'procurement_signal', 'budget_signal'].includes(claim.claimType);

    const severity: CILLintSeverity =
      daysSince >= CLAIM_STALE_DAYS * 2
        ? 'critical'
        : isHighImpact
          ? 'warning'
          : 'review';

    findings.push({
      checkType: 'stale',
      severity,
      targetType: 'claim',
      targetId: claim.id,
      title: `Claim 已 ${daysSince} 天未复核`,
      description: `「${claim.statement.slice(0, 80)}」上次复核距今 ${daysSince} 天，confidence=${claim.confidence}`,
      suggestedAction:
        daysSince >= CLAIM_STALE_DAYS * 2
          ? '建议标记为 stale 或安排即时 refresh'
          : '建议在下次 ingest 时优先复核此 claim',
    });
  }

  return findings.sort((a, b) => {
    const sevOrder: Record<CILLintSeverity, number> = { critical: 0, warning: 1, review: 2, info: 3 };
    return sevOrder[a.severity] - sevOrder[b.severity];
  });
}

// ─── Check 2: Contradictions ────────────────────────────────────────

export function lintContradictions(
  claims: AccountClaim[],
): CILLintFinding[] {
  const findings: CILLintFinding[] = [];
  const activeClaims = claims.filter(
    (c) => c.status === 'active' || c.status === 'stale',
  );

  // Group by claim type for comparison
  const byType = new Map<string, AccountClaim[]>();
  for (const c of activeClaims) {
    const list = byType.get(c.claimType) ?? [];
    list.push(c);
    byType.set(c.claimType, list);
  }

  const seen = new Set<string>();

  for (const [, groupClaims] of byType) {
    for (let i = 0; i < groupClaims.length; i++) {
      for (let j = i + 1; j < groupClaims.length; j++) {
        const a = groupClaims[i];
        const b = groupClaims[j];
        const pairKey = [a.id, b.id].sort().join(':');
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        const relation = assessClaimRelation(a.statement, b.statement);
        if (relation !== 'conflict') continue;

        // Both claims are on the same type and conflict with each other
        findings.push({
          checkType: 'contradiction',
          severity: 'warning',
          targetType: 'claim',
          targetId: a.id,
          title: `Claims 存在矛盾`,
          description: `「${a.statement.slice(0, 60)}」(conf=${a.confidence}) 与「${b.statement.slice(0, 60)}」(conf=${b.confidence}) 存在冲突`,
          suggestedAction: '建议人工审核并决定保留哪个判断，或降低低置信方的 confidence',
          relatedIds: [b.id],
        });
      }
    }
  }

  return findings;
}

// ─── Check 3: Unsupported claims ────────────────────────────────────

export function lintUnsupportedClaims(
  claims: AccountClaim[],
): CILLintFinding[] {
  const findings: CILLintFinding[] = [];

  for (const claim of claims) {
    if (claim.status !== 'active') continue;

    const hasSupport =
      Array.isArray(claim.supportingEvidenceIds) &&
      claim.supportingEvidenceIds.length > 0;

    if (hasSupport) continue;

    const isHighConfidence = claim.confidence >= 0.6;

    findings.push({
      checkType: 'unsupported',
      severity: isHighConfidence ? 'warning' : 'review',
      targetType: 'claim',
      targetId: claim.id,
      title: `Claim 缺少 supporting evidence`,
      description: `「${claim.statement.slice(0, 80)}」confidence=${claim.confidence}，但没有关联的支持性证据`,
      suggestedAction: '建议补充 evidence 或降低 confidence；高置信无支撑判断不应长期存在',
    });
  }

  return findings;
}

// ─── Check 4: Orphan evidence ───────────────────────────────────────

export function lintOrphanEvidence(
  evidence: AccountEvidence[],
  claims: AccountClaim[],
): CILLintFinding[] {
  const findings: CILLintFinding[] = [];

  // Build set of all evidence IDs referenced by any claim
  const referencedEvidenceIds = new Set<string>();
  for (const claim of claims) {
    if (claim.status === 'archived' || claim.status === 'invalidated') continue;
    for (const id of claim.supportingEvidenceIds) referencedEvidenceIds.add(id);
    for (const id of claim.counterEvidenceIds) referencedEvidenceIds.add(id);
  }

  for (const ev of evidence) {
    const isLinkedByClaim = referencedEvidenceIds.has(ev.id);
    const hasLinkedClaimIds =
      Array.isArray(ev.linkedClaimIds) && ev.linkedClaimIds.length > 0;

    if (isLinkedByClaim || hasLinkedClaimIds) continue;

    // Only flag high-relevance orphan evidence (low-relevance is expected to be unlinked sometimes)
    if (ev.relevanceScore < 0.6) continue;

    findings.push({
      checkType: 'orphan_evidence',
      severity: 'info',
      targetType: 'evidence',
      targetId: ev.id,
      title: `Evidence 未关联到任何 claim`,
      description: `类型=${ev.evidenceType}，relevance=${ev.relevanceScore}，摘要「${(ev.summary || ev.quoteText || '').slice(0, 60)}」未被任何 claim 引用`,
      suggestedAction: '建议在下次 ingest 时尝试关联到已有 claim 或创建新 claim',
    });
  }

  return findings;
}

// ─── Check 5: Critical gaps ─────────────────────────────────────────

export function lintCriticalGaps(
  pages: AccountKnowledgePage[],
  claims: AccountClaim[],
  openQuestions: AccountOpenQuestion[],
): CILLintFinding[] {
  const findings: CILLintFinding[] = [];

  // 5a: Missing expected page types
  const existingPageTypes = new Set(pages.map((p) => p.pageType));
  for (const expected of EXPECTED_PAGE_TYPES) {
    if (!existingPageTypes.has(expected)) {
      findings.push({
        checkType: 'critical_gap',
        severity: 'review',
        targetType: 'page',
        title: `缺少知识页面：${expected}`,
        description: `账户尚未建立 ${expected} 类型的知识页面，可能影响下游 AI 推理质量`,
        suggestedAction: '建议通过 ingest 或手动创建补充此类型页面',
      });
    }
  }

  // 5b: High-priority open questions blocking critical outputs
  const blockingQuestions = openQuestions.filter(
    (q) =>
      q.status === 'open' &&
      q.priority === 'high' &&
      Array.isArray(q.blockingOutputs) &&
      q.blockingOutputs.length > 0,
  );
  for (const q of blockingQuestions) {
    findings.push({
      checkType: 'critical_gap',
      severity: 'warning',
      targetType: 'account',
      targetId: q.id,
      title: `高优先级开放问题阻塞输出`,
      description: `「${q.question.slice(0, 80)}」阻塞 [${q.blockingOutputs.join(', ')}]`,
      suggestedAction: '建议优先收集能回答此问题的 evidence',
      relatedIds: q.relatedObjects,
    });
  }

  // 5c: No active claims at all (account has zero compiled intelligence)
  const activeClaims = claims.filter((c) => c.status === 'active');
  if (activeClaims.length === 0 && claims.length > 0) {
    findings.push({
      checkType: 'critical_gap',
      severity: 'warning',
      targetType: 'account',
      title: `所有 claims 均非 active 状态`,
      description: `共 ${claims.length} 条 claim，但无一处于 active 状态，账户编译智能可能已过期`,
      suggestedAction: '建议触发整体 refresh 以重新验证 claims',
    });
  }

  return findings;
}

// ─── Refresh targets ────────────────────────────────────────────────

export function buildRefreshTargets(
  claims: AccountClaim[],
  pages: AccountKnowledgePage[],
  nowIso: string,
): CILRefreshTarget[] {
  const targets: CILRefreshTarget[] = [];
  const now = new Date(nowIso).getTime();

  // Stale / nearly-stale claims
  for (const claim of claims) {
    if (claim.status === 'archived' || claim.status === 'invalidated') continue;

    const last = new Date(claim.lastRevalidatedAt).getTime();
    if (Number.isNaN(last) || Number.isNaN(now)) continue;

    const daysSince = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    if (daysSince < CLAIM_STALE_DAYS) continue;

    const isHighImpact =
      claim.confidence >= 0.7 ||
      ['risk_hypothesis', 'procurement_signal', 'budget_signal'].includes(claim.claimType);

    targets.push({
      targetType: 'claim',
      targetId: claim.id,
      statement: claim.statement,
      reason:
        daysSince >= CLAIM_STALE_DAYS * 2
          ? `已超过 ${daysSince} 天未复核，严重过期`
          : `已超过 ${daysSince} 天未复核`,
      priority:
        daysSince >= CLAIM_STALE_DAYS * 2
          ? 'high'
          : isHighImpact
            ? 'high'
            : 'medium',
      staleDays: daysSince,
    });
  }

  // Stale pages (not updated in 30+ days)
  for (const page of pages) {
    const updatedAt = new Date(page.updatedAt).getTime();
    if (Number.isNaN(updatedAt)) continue;
    const daysSince = Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24));
    if (daysSince < 30) continue;

    targets.push({
      targetType: 'page',
      targetId: page.id,
      statement: page.title || page.pageType,
      reason: `页面 ${page.pageType} 已 ${daysSince} 天未更新`,
      priority: daysSince >= 60 ? 'high' : 'medium',
      staleDays: daysSince,
    });
  }

  return targets.sort((a, b) => {
    const prioOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return (prioOrder[a.priority] ?? 2) - (prioOrder[b.priority] ?? 2);
  });
}

// ─── Health score ───────────────────────────────────────────────────

export function computeHealthScore(findings: CILLintFinding[]): number {
  let score = 100;
  for (const f of findings) {
    switch (f.severity) {
      case 'critical':
        score -= 15;
        break;
      case 'warning':
        score -= 8;
        break;
      case 'review':
        score -= 3;
        break;
      case 'info':
        score -= 1;
        break;
    }
  }
  return Math.max(0, Math.min(100, score));
}

// ─── Orchestrator ───────────────────────────────────────────────────

export async function runComprehensiveLint(params: {
  orgId: string;
  accountId: string;
  nowIso?: string;
}): Promise<CILComprehensiveLintResult> {
  const tag = '[cil-lint-p2]';
  const nowIso = params.nowIso || new Date().toISOString();

  const ctx = await loadCILAccountContextUnsafeInternal({
    orgId: params.orgId,
    accountId: params.accountId,
  });

  if (!ctx) {
    return {
      success: false,
      accountId: params.accountId,
      scannedClaims: 0,
      scannedEvidence: 0,
      scannedPages: 0,
      findings: [],
      healthScore: 0,
      refreshTargets: [],
      summary: 'CIL context 加载失败',
    };
  }

  // Run all checks
  const staleFindings = lintStaleClaims(ctx.claims, nowIso);
  const contradictionFindings = lintContradictions(ctx.claims);
  const unsupportedFindings = lintUnsupportedClaims(ctx.claims);
  const orphanFindings = lintOrphanEvidence(ctx.evidence, ctx.claims);
  const gapFindings = lintCriticalGaps(ctx.knowledgePages, ctx.claims, ctx.openQuestions);

  const allFindings = [
    ...staleFindings,
    ...contradictionFindings,
    ...unsupportedFindings,
    ...orphanFindings,
    ...gapFindings,
  ];

  const healthScore = computeHealthScore(allFindings);
  const refreshTargets = buildRefreshTargets(ctx.claims, ctx.knowledgePages, nowIso);

  // Auto-mark severely stale claims
  const admin = getSupabaseAdmin();
  let autoMarkedStale = 0;
  if (admin) {
    const severelyStale = staleFindings.filter((f) => f.severity === 'critical' && f.targetId);
    for (const f of severelyStale) {
      const claim = ctx.claims.find((c) => c.id === f.targetId);
      if (claim && claim.status === 'active') {
        await admin
          .from(CIL_TABLES.claims)
          .update({ status: 'stale', updated_at: nowIso })
          .eq('id', f.targetId);
        autoMarkedStale++;
      }
    }

    // Write lint log
    await admin.from(CIL_TABLES.updateLog).insert({
      org_id: params.orgId,
      account_id: params.accountId,
      update_type: 'lint',
      changed_pages: [],
      changed_claims: allFindings
        .filter((f) => f.targetType === 'claim' && f.targetId)
        .map((f) => f.targetId),
      summary: `P2 综合 lint：${allFindings.length} 项发现，健康分=${healthScore}，auto-stale=${autoMarkedStale}`,
    });
  }

  const summaryParts: string[] = [];
  if (staleFindings.length > 0) summaryParts.push(`${staleFindings.length} 条 stale`);
  if (contradictionFindings.length > 0) summaryParts.push(`${contradictionFindings.length} 条矛盾`);
  if (unsupportedFindings.length > 0) summaryParts.push(`${unsupportedFindings.length} 条无支撑`);
  if (orphanFindings.length > 0) summaryParts.push(`${orphanFindings.length} 条孤儿 evidence`);
  if (gapFindings.length > 0) summaryParts.push(`${gapFindings.length} 条关键缺口`);

  const summary =
    allFindings.length === 0
      ? '综合 lint 未发现问题，账户知识健康'
      : `发现 ${allFindings.length} 项问题（${summaryParts.join('，')}），健康分=${healthScore}`;

  console.log(tag, summary, params.accountId);

  return {
    success: true,
    accountId: params.accountId,
    scannedClaims: ctx.claims.length,
    scannedEvidence: ctx.evidence.length,
    scannedPages: ctx.knowledgePages.length,
    findings: allFindings,
    healthScore,
    refreshTargets,
    summary,
  };
}
