import { ApiError, guardResponse, requireAccountAccess, requireAdmin, requireAuth } from '@/lib/api-guard';
import { rejectClientOrgId, validateBusinessTeamId } from '@/lib/account-team/access';
import { loadPursuitTeamMembers } from '@/lib/account-team/loaders';
import { mapPursuitTeam } from '@/lib/account-team/mappers';
import type { PursuitTeamRow } from '@/lib/account-team/types';

export const dynamic = 'force-dynamic';

async function loadActiveTeam(admin: ReturnType<typeof requireAdmin>, orgId: string, accountId: string) {
  const { data, error } = await admin
    .from('pursuit_teams')
    .select('id, org_id, parent_team_id, account_id, opportunity_id, strategic_play_id, name, status, created_by, created_at, updated_at')
    .eq('org_id', orgId)
    .eq('account_id', accountId)
    .eq('status', 'active')
    .is('opportunity_id', null)
    .is('strategic_play_id', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as PursuitTeamRow | null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await requireAccountAccess(ctx, id);
    const admin = requireAdmin();

    const activeTeam = await loadActiveTeam(admin, ctx.orgId, id);
    if (!activeTeam) return Response.json({ pursuitTeam: null });

    const members = await loadPursuitTeamMembers(admin, { orgId: ctx.orgId, pursuitTeamId: activeTeam.id });
    return Response.json({ pursuitTeam: mapPursuitTeam(activeTeam, members) });
  } catch (err) {
    return guardResponse(err);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await requireAccountAccess(ctx, id);
    const admin = requireAdmin();
    const body = await request.json().catch(() => ({}));
    rejectClientOrgId(body);

    const input = body as { name?: unknown; parentTeamId?: unknown };
    if (input.parentTeamId !== undefined && input.parentTeamId !== null && typeof input.parentTeamId !== 'string') {
      return Response.json({ error: 'parentTeamId 必须是 string 或 null' }, { status: 400 });
    }
    if (input.name !== undefined && typeof input.name !== 'string') {
      return Response.json({ error: 'name 必须是字符串' }, { status: 400 });
    }

    const existing = await loadActiveTeam(admin, ctx.orgId, id);
    if (existing) {
      return Response.json({ error: '该客户已有活跃项目推进组', pursuitTeam: mapPursuitTeam(existing) }, { status: 409 });
    }

    const parentTeamId = input.parentTeamId === undefined ? null : input.parentTeamId;
    await validateBusinessTeamId(admin, ctx, parentTeamId);

    const { data: account, error: accountError } = await admin
      .from('accounts')
      .select('id, name')
      .eq('id', id)
      .eq('org_id', ctx.orgId)
      .maybeSingle();
    if (accountError) throw new Error(accountError.message);
    if (!account) throw new ApiError(404, '客户不存在');

    const rawName = input.name?.trim();
    const name = rawName || `${(account as { name: string }).name} 项目推进组`;
    const { data, error } = await admin
      .from('pursuit_teams')
      .insert({
        org_id: ctx.orgId,
        account_id: id,
        parent_team_id: parentTeamId,
        name,
        status: 'active',
        created_by: ctx.userId,
      })
      .select('id, org_id, parent_team_id, account_id, opportunity_id, strategic_play_id, name, status, created_by, created_at, updated_at')
      .single();
    if (error) throw new Error(error.message);

    return Response.json({ pursuitTeam: mapPursuitTeam(data as PursuitTeamRow, []) }, { status: 201 });
  } catch (err) {
    return guardResponse(err);
  }
}
