/**
 * CIL P2 — Explainability and Debug Surface
 *
 * Provides claim-level traceability and account-level health reports.
 * All core functions are pure for testability; async wrappers load from DB.
 */

import type {
  AccountClaim,
  AccountEvidence,
  AccountKnowledgePage,
  AccountOpenQuestion,
  CILPageType,
} from '@/lib/babel-engine/types';
import type { CILAccountContext } from '@/lib/compiled-intelligence/context';
import { loadCILAccountContextUnsafeInternal } from '@/lib/compiled-intelligence/context';
import { CLAIM_STALE_DAYS } from '@/lib/compiled-intelligence/ingest';
import {
  lintStaleClaims,
  lintContradictions,
  lintUnsupportedClaims,
  lintOrphanEvidence,
  lintCriticalGaps,
  buildRefreshTargets,
  computeHealthScore,
  type CILLintFinding,
  type CILRefreshTarget,
} from '@/lib/compiled-intelligence/lint';

// ─── Types ──────────────────────────────────────────────────────────

export interface CILClaimExplainability {
  claim: AccountClaim;
  supportingEvidence: AccountEvidence[];
  counterEvidence: AccountEvidence[];
  affectedPages: AccountKnowledgePage[];
  isStale: boolean;
  staleDays: number | null;
  refreshSuggestion: string | null;
}

export interface CILEvidenceCoverage {
  total: number;
  linked: number;
  orphaned: number;
}

export interface CILKnowledgeFreshness {
  freshPages: number;
  stalePages: number;
  missingPageTypes: string[];
}

export interface CILAccountHealthReport {
  accountId: string;
  healthScore: number;
  claimDistribution: {
    active: number;
    stale: number;
    archived: number;
    total: number;
  };
  evidenceCoverage: CILEvidenceCoverage;
  knowledgeFreshness: CILKnowledgeFreshness;
  lintFindings: CILLintFinding[];
  refreshTargets: CILRefreshTarget[];
  summary: string;
}

// ─── Claim explainability (pure) ────────────────────────────────────

export function buildClaimExplainability(
  claim: AccountClaim,
  allEvidence: AccountEvidence[],
  allPages: AccountKnowledgePage[],
  nowIso: string,
): CILClaimExplainability {
  // Find supporting evidence
  const supportingEvidence = allEvidence.filter((e) =>
    claim.supportingEvidenceIds.includes(e.id),
  );

  // Find counter evidence
  const counterEvidence = allEvidence.filter((e) =>
    claim.counterEvidenceIds.includes(e.id),
  );

  // Find affected pages
  const affectedPages = allPages.filter((p) =>
    Array.isArray(claim.affectedObjectIds) &&
    claim.affectedObjectIds.includes(p.pageType),
  );

  // Staleness
  const now = new Date(nowIso).getTime();
  const last = new Date(claim.lastRevalidatedAt).getTime();
  let staleDays: number | null = null;
  let isStale = claim.status === 'stale';

  if (!Number.isNaN(last) && !Number.isNaN(now)) {
    staleDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    if (staleDays >= CLAIM_STALE_DAYS && claim.status === 'active') {
      isStale = true;
    }
  }

  // Refresh suggestion
  let refreshSuggestion: string | null = null;
  if (isStale) {
    refreshSuggestion = `此 claim 已 ${staleDays ?? '?'} 天未复核，建议通过新 evidence ingest 重新验证`;
  } else if (supportingEvidence.length === 0) {
    refreshSuggestion = '此 claim 缺少支持性 evidence，建议补充或降低 confidence';
  } else if (counterEvidence.length > 0 && counterEvidence.length >= supportingEvidence.length) {
    refreshSuggestion = '反对 evidence 数量 >= 支持 evidence，建议重新评估此判断的有效性';
  }

  return {
    claim,
    supportingEvidence,
    counterEvidence,
    affectedPages,
    isStale,
    staleDays,
    refreshSuggestion,
  };
}

// ─── Evidence coverage (pure) ───────────────────────────────────────

export function computeEvidenceCoverage(
  evidence: AccountEvidence[],
  claims: AccountClaim[],
): CILEvidenceCoverage {
  const referencedIds = new Set<string>();
  for (const c of claims) {
    if (c.status === 'archived' || c.status === 'invalidated') continue;
    for (const id of c.supportingEvidenceIds) referencedIds.add(id);
    for (const id of c.counterEvidenceIds) referencedIds.add(id);
  }

  let linked = 0;
  for (const ev of evidence) {
    const isLinked =
      referencedIds.has(ev.id) ||
      (Array.isArray(ev.linkedClaimIds) && ev.linkedClaimIds.length > 0);
    if (isLinked) linked++;
  }

  return {
    total: evidence.length,
    linked,
    orphaned: evidence.length - linked,
  };
}

// ─── Knowledge freshness (pure) ─────────────────────────────────────

const EXPECTED_PAGE_TYPES: CILPageType[] = [
  'overview',
  'stakeholders',
  'risks',
  'timeline',
  'open_questions',
];

export function computeKnowledgeFreshness(
  pages: AccountKnowledgePage[],
  nowIso: string,
): CILKnowledgeFreshness {
  const now = new Date(nowIso).getTime();
  const existingTypes = new Set(pages.map((p) => p.pageType));
  const missingPageTypes = EXPECTED_PAGE_TYPES.filter((t) => !existingTypes.has(t));

  let freshPages = 0;
  let stalePages = 0;

  for (const page of pages) {
    const updated = new Date(page.updatedAt).getTime();
    if (Number.isNaN(updated)) {
      stalePages++;
      continue;
    }
    const daysSince = Math.floor((now - updated) / (1000 * 60 * 60 * 24));
    if (daysSince >= 30) {
      stalePages++;
    } else {
      freshPages++;
    }
  }

  return { freshPages, stalePages, missingPageTypes };
}

// ─── Account health report (pure core) ──────────────────────────────

export function buildAccountHealthReport(
  ctx: CILAccountContext,
  nowIso: string,
): CILAccountHealthReport {
  // Claim distribution
  const claimDistribution = {
    active: ctx.claims.filter((c) => c.status === 'active').length,
    stale: ctx.claims.filter((c) => c.status === 'stale').length,
    archived: ctx.claims.filter(
      (c) => c.status === 'archived' || c.status === 'invalidated',
    ).length,
    total: ctx.claims.length,
  };

  // Evidence coverage
  const evidenceCoverage = computeEvidenceCoverage(ctx.evidence, ctx.claims);

  // Knowledge freshness
  const knowledgeFreshness = computeKnowledgeFreshness(ctx.knowledgePages, nowIso);

  // Lint findings
  const lintFindings = [
    ...lintStaleClaims(ctx.claims, nowIso),
    ...lintContradictions(ctx.claims),
    ...lintUnsupportedClaims(ctx.claims),
    ...lintOrphanEvidence(ctx.evidence, ctx.claims),
    ...lintCriticalGaps(ctx.knowledgePages, ctx.claims, ctx.openQuestions),
  ];

  const healthScore = computeHealthScore(lintFindings);
  const refreshTargets = buildRefreshTargets(ctx.claims, ctx.knowledgePages, nowIso);

  // Summary
  const parts: string[] = [];
  parts.push(`健康分 ${healthScore}/100`);
  parts.push(`${claimDistribution.active} active / ${claimDistribution.stale} stale claims`);
  parts.push(`${evidenceCoverage.linked}/${evidenceCoverage.total} evidence 已关联`);
  if (knowledgeFreshness.missingPageTypes.length > 0) {
    parts.push(`缺少页面：${knowledgeFreshness.missingPageTypes.join(', ')}`);
  }
  if (refreshTargets.length > 0) {
    parts.push(`${refreshTargets.length} 项需 refresh`);
  }

  return {
    accountId: ctx.accountId,
    healthScore,
    claimDistribution,
    evidenceCoverage,
    knowledgeFreshness,
    lintFindings,
    refreshTargets,
    summary: parts.join('；'),
  };
}

// ─── Async wrappers (load from DB) ─────────────────────────────────

export async function getClaimExplainability(params: {
  orgId: string;
  accountId: string;
  claimId: string;
  nowIso?: string;
}): Promise<CILClaimExplainability | null> {
  const ctx = await loadCILAccountContextUnsafeInternal({
    orgId: params.orgId,
    accountId: params.accountId,
  });
  if (!ctx) return null;

  const claim = ctx.claims.find((c) => c.id === params.claimId);
  if (!claim) return null;

  const nowIso = params.nowIso || new Date().toISOString();
  return buildClaimExplainability(claim, ctx.evidence, ctx.knowledgePages, nowIso);
}

export async function getAccountHealthReport(params: {
  orgId: string;
  accountId: string;
  nowIso?: string;
}): Promise<CILAccountHealthReport | null> {
  const ctx = await loadCILAccountContextUnsafeInternal({
    orgId: params.orgId,
    accountId: params.accountId,
  });
  if (!ctx) return null;

  const nowIso = params.nowIso || new Date().toISOString();
  return buildAccountHealthReport(ctx, nowIso);
}
