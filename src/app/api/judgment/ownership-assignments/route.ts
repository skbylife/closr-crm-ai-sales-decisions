import { ApiError, guardResponse, requireAccountAccess, requireAdmin, requireAuth, requireOpportunityAccess } from '@/lib/api-guard';
import {
  mapJudgmentOwnershipAssignment,
  parseCreateJudgmentOwnershipAssignmentInput,
  type JudgmentOwnershipAssignmentRow,
} from '@/lib/judgment/ownership-assignments';

export const dynamic = 'force-dynamic';

type AdminClient = ReturnType<typeof requireAdmin>;

async function validateOrgMember(admin: AdminClient, orgId: string, userId: string) {
  const { data, error } = await admin
    .from('org_memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ApiError(400, '负责人不存在或不属于当前组织');
}

async function requireStrategicPlayAccount(admin: AdminClient, orgId: string, playId: string) {
  const { data, error } = await admin
    .from('strategic_plays')
    .select('id, account_id, opportunity_id')
    .eq('id', playId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ApiError(404, '谋局不存在');
  return data as { id: string; account_id: string | null; opportunity_id: string | null };
}

async function replaceActiveAssignment(admin: AdminClient, params: {
  orgId: string;
  accountId: string;
  opportunityId: string | null;
  strategicPlayId: string | null;
  judgmentType: string;
}) {
  let query = admin
    .from('judgment_ownership_assignments')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', params.orgId)
    .eq('account_id', params.accountId)
    .eq('judgment_type', params.judgmentType)
    .eq('status', 'active');

  query = params.opportunityId
    ? query.eq('opportunity_id', params.opportunityId)
    : query.is('opportunity_id', null);
  query = params.strategicPlayId
    ? query.eq('strategic_play_id', params.strategicPlayId)
    : query.is('strategic_play_id', null);

  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const url = new URL(request.url);
    const accountId = url.searchParams.get('accountId');
    if (!accountId) throw new ApiError(400, 'accountId 必填');
    await requireAccountAccess(ctx, accountId);

    let query = admin
      .from('judgment_ownership_assignments')
      .select('id, org_id, account_id, opportunity_id, strategic_play_id, judgment_type, assigned_user_id, assigned_by, status, source, reason, due_at, completed_at, revoked_at, created_at, updated_at')
      .eq('org_id', ctx.orgId)
      .eq('account_id', accountId);

    const status = url.searchParams.get('status');
    if (status) query = query.eq('status', status);
    const opportunityId = url.searchParams.get('opportunityId');
    if (opportunityId) query = query.eq('opportunity_id', opportunityId);
    const strategicPlayId = url.searchParams.get('strategicPlayId');
    if (strategicPlayId) query = query.eq('strategic_play_id', strategicPlayId);

    const { data, error } = await query.order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);

    return Response.json({
      assignments: ((data ?? []) as JudgmentOwnershipAssignmentRow[]).map(mapJudgmentOwnershipAssignment),
    });
  } catch (err) {
    return guardResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const input = parseCreateJudgmentOwnershipAssignmentInput(await request.json().catch(() => ({})));

    await requireAccountAccess(ctx, input.accountId);
    await validateOrgMember(admin, ctx.orgId, input.assignedUserId);

    if (input.opportunityId) {
      const opportunity = await requireOpportunityAccess(ctx, input.opportunityId);
      if (opportunity.account_id !== input.accountId) {
        throw new ApiError(400, 'opportunityId 不属于 accountId');
      }
    }

    if (input.strategicPlayId) {
      const play = await requireStrategicPlayAccount(admin, ctx.orgId, input.strategicPlayId);
      if (play.account_id !== input.accountId) throw new ApiError(400, 'strategicPlayId 不属于 accountId');
      if (input.opportunityId && play.opportunity_id && play.opportunity_id !== input.opportunityId) {
        throw new ApiError(400, 'strategicPlayId 不属于 opportunityId');
      }
    }

    await replaceActiveAssignment(admin, {
      orgId: ctx.orgId,
      accountId: input.accountId,
      opportunityId: input.opportunityId ?? null,
      strategicPlayId: input.strategicPlayId ?? null,
      judgmentType: input.judgmentType,
    });

    const { data, error } = await admin
      .from('judgment_ownership_assignments')
      .insert({
        org_id: ctx.orgId,
        account_id: input.accountId,
        opportunity_id: input.opportunityId ?? null,
        strategic_play_id: input.strategicPlayId ?? null,
        judgment_type: input.judgmentType,
        assigned_user_id: input.assignedUserId,
        assigned_by: ctx.userId,
        status: 'active',
        source: input.source,
        reason: input.reason ?? null,
        due_at: input.dueAt ?? null,
      })
      .select('id, org_id, account_id, opportunity_id, strategic_play_id, judgment_type, assigned_user_id, assigned_by, status, source, reason, due_at, completed_at, revoked_at, created_at, updated_at')
      .single();
    if (error) throw new Error(error.message);

    return Response.json({
      assignment: mapJudgmentOwnershipAssignment(data as JudgmentOwnershipAssignmentRow),
    }, { status: 201 });
  } catch (err) {
    return guardResponse(err);
  }
}
