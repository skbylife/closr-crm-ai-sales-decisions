/**
 * Compiled Intelligence Layer (CIL) — minimal scaffolding.
 *
 * Re-exports CIL types and provides DB-row-to-object mappers.
 * No heavy ingest pipeline logic here — that belongs in Phase 2.
 */

export type {
  AccountKnowledgePage,
  AccountClaim,
  AccountEvidence,
  AccountOpenQuestion,
  KnowledgeUpdateLogEntry,
  CILPageType,
  CILClaimType,
  CILClaimStatus,
  CILEvidenceSourceType,
  CILEvidenceType,
  CILQuestionPriority,
  CILQuestionStatus,
  CILUpdateType,
} from '@/lib/babel-engine/types';

import type {
  AccountKnowledgePage,
  AccountClaim,
  AccountEvidence,
  AccountOpenQuestion,
  KnowledgeUpdateLogEntry,
} from '@/lib/babel-engine/types';

// ─── DB row mappers ────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

export function mapKnowledgePage(row: any): AccountKnowledgePage {
  return {
    id: row.id,
    orgId: row.org_id,
    accountId: row.account_id,
    pageType: row.page_type,
    title: row.title ?? '',
    contentJson: row.content_json ?? {},
    contentMd: row.content_md ?? undefined,
    version: row.version ?? 1,
    updatedBy: row.updated_by ?? 'system',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapClaim(row: any): AccountClaim {
  return {
    id: row.id,
    orgId: row.org_id,
    accountId: row.account_id,
    claimType: row.claim_type,
    statement: row.statement,
    status: row.status ?? 'active',
    confidence: Number(row.confidence ?? 0.5),
    supportingEvidenceIds: row.supporting_evidence_ids ?? [],
    counterEvidenceIds: row.counter_evidence_ids ?? [],
    affectedObjectIds: row.affected_object_ids ?? [],
    lastRevalidatedAt: row.last_revalidated_at,
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapEvidence(row: any): AccountEvidence {
  return {
    id: row.id,
    orgId: row.org_id,
    accountId: row.account_id,
    sourceId: row.source_id,
    sourceType: row.source_type,
    evidenceType: row.evidence_type,
    quoteText: row.quote_text ?? undefined,
    summary: row.summary ?? undefined,
    speaker: row.speaker ?? undefined,
    occurredAt: row.occurred_at ?? undefined,
    relevanceScore: Number(row.relevance_score ?? 0.5),
    linkedClaimIds: row.linked_claim_ids ?? [],
    linkedPageTypes: row.linked_page_types ?? [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

export function mapOpenQuestion(row: any): AccountOpenQuestion {
  return {
    id: row.id,
    orgId: row.org_id,
    accountId: row.account_id,
    question: row.question,
    priority: row.priority ?? 'medium',
    status: row.status ?? 'open',
    relatedObjects: row.related_objects ?? [],
    blockingOutputs: row.blocking_outputs ?? [],
    answer: row.answer ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}

export function mapUpdateLog(row: any): KnowledgeUpdateLogEntry {
  return {
    id: row.id,
    orgId: row.org_id,
    accountId: row.account_id,
    triggerSourceId: row.trigger_source_id ?? undefined,
    updateType: row.update_type ?? 'ingest',
    changedPages: row.changed_pages ?? [],
    changedClaims: row.changed_claims ?? [],
    summary: row.summary ?? undefined,
    createdAt: row.created_at,
  };
}

// ─── Table names (for consistent references) ──────────────────────

export const CIL_TABLES = {
  knowledgePages: 'account_knowledge_pages',
  claims: 'account_claims',
  evidence: 'account_evidence',
  openQuestions: 'account_open_questions',
  updateLog: 'knowledge_update_log',
} as const;

export type {
  CILAccountContext,
  LoadCILAccountContextParams,
} from '@/lib/compiled-intelligence/context';
export { loadCILAccountContextScoped, loadCILAccountContextUnsafeInternal } from '@/lib/compiled-intelligence/context';
