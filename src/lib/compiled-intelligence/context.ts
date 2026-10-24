import { ApiError, requireAccountAccess } from '@/lib/api-guard';
import type { UserContext } from '@/lib/permissions';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  CIL_TABLES,
  mapClaim,
  mapEvidence,
  mapKnowledgePage,
  mapOpenQuestion,
} from '@/lib/compiled-intelligence';
import type {
  AccountClaim,
  AccountEvidence,
  AccountKnowledgePage,
  AccountOpenQuestion,
} from '@/lib/babel-engine/types';

export interface CILAccountContext {
  accountId: string;
  orgId: string;
  claims: AccountClaim[];
  openQuestions: AccountOpenQuestion[];
  evidence: AccountEvidence[];
  knowledgePages: AccountKnowledgePage[];
}

export interface LoadCILAccountContextUnsafeInternalParams {
  orgId: string;
  accountId: string;
  limitEvidence?: number;
  limitClaims?: number;
  limitOpenQuestions?: number;
}

export type LoadCILAccountContextParams = LoadCILAccountContextUnsafeInternalParams & {
  /** Request user context. Required for route/request-scoped CIL loads. */
  ctx: UserContext;
};

async function assertCILAccountScope(params: LoadCILAccountContextParams): Promise<void> {
  if (params.ctx.orgId !== params.orgId) {
    throw new ApiError(403, '组织上下文不匹配，无法加载判断证据');
  }
  await requireAccountAccess(params.ctx, params.accountId);
}

export async function loadCILAccountContextScoped(
  params: LoadCILAccountContextParams,
): Promise<CILAccountContext | null> {
  await assertCILAccountScope(params);
  return loadCILAccountContextUnsafeInternal(params);
}

export async function loadCILAccountContextUnsafeInternal(
  params: LoadCILAccountContextUnsafeInternalParams,
): Promise<CILAccountContext | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const claimLimit = params.limitClaims ?? 50;
  const questionLimit = params.limitOpenQuestions ?? 50;
  const evidenceLimit = params.limitEvidence ?? 100;

  const [claimsRes, questionsRes, evidenceRes, pagesRes] = await Promise.all([
    admin
      .from(CIL_TABLES.claims)
      .select('*')
      .eq('org_id', params.orgId)
      .eq('account_id', params.accountId)
      .order('updated_at', { ascending: false })
      .limit(claimLimit),
    admin
      .from(CIL_TABLES.openQuestions)
      .select('*')
      .eq('org_id', params.orgId)
      .eq('account_id', params.accountId)
      .order('updated_at', { ascending: false })
      .limit(questionLimit),
    admin
      .from(CIL_TABLES.evidence)
      .select('*')
      .eq('org_id', params.orgId)
      .eq('account_id', params.accountId)
      .order('occurred_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(evidenceLimit),
    admin
      .from(CIL_TABLES.knowledgePages)
      .select('*')
      .eq('org_id', params.orgId)
      .eq('account_id', params.accountId)
      .order('updated_at', { ascending: false }),
  ]);

  if (claimsRes.error || questionsRes.error || evidenceRes.error || pagesRes.error) {
    console.error('[cil-context] load failed:', {
      claims: claimsRes.error?.message,
      openQuestions: questionsRes.error?.message,
      evidence: evidenceRes.error?.message,
      knowledgePages: pagesRes.error?.message,
    });
    return null;
  }

  return {
    accountId: params.accountId,
    orgId: params.orgId,
    claims: (claimsRes.data ?? []).map(mapClaim),
    openQuestions: (questionsRes.data ?? []).map(mapOpenQuestion),
    evidence: (evidenceRes.data ?? []).map(mapEvidence),
    knowledgePages: (pagesRes.data ?? []).map(mapKnowledgePage),
  };
}
