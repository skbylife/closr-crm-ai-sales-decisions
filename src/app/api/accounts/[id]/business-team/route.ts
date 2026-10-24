import { ApiError, guardResponse, requireAccountAccess, requireAdmin, requireAuth } from '@/lib/api-guard';
import { rejectClientOrgId, validateBusinessTeamId } from '@/lib/account-team/access';
import { mapBusinessTeam } from '@/lib/account-team/mappers';
import type { BusinessTeamRow } from '@/lib/account-team/types';

export const dynamic = 'force-dynamic';

async function loadTeams(admin: ReturnType<typeof requireAdmin>, orgId: string) {
  const [{ data: teams, error: teamsError }, { data: memberships, error: membersError }] = await Promise.all([
    admin.from('teams').select('id, org_id, name, created_at').eq('org_id', orgId).order('created_at', { ascending: true }),
    admin.from('org_memberships').select('team_id').eq('org_id', orgId).not('team_id', 'is', null),
  ]);
  if (teamsError) throw new Error(teamsError.message);
  if (membersError) throw new Error(membersError.message);

  const counts = new Map<string, number>();
  for (const row of memberships ?? []) {
    const teamId = (row as { team_id: string | null }).team_id;
    if (teamId) counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
  }
  return ((teams ?? []) as BusinessTeamRow[]).map((team) => mapBusinessTeam(team, counts.get(team.id) ?? 0));
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await requireAccountAccess(ctx, id);
    const admin = requireAdmin();

    const { data: account, error } = await admin
      .from('accounts')
      .select('id, org_id, business_team_id')
      .eq('id', id)
      .eq('org_id', ctx.orgId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!account) throw new ApiError(404, '客户不存在');

    const businessTeamId = (account as { business_team_id: string | null }).business_team_id;
    const [businessTeam, teams] = await Promise.all([
      validateBusinessTeamId(admin, ctx, businessTeamId),
      loadTeams(admin, ctx.orgId),
    ]);

    return Response.json({
      businessTeamId,
      businessTeam: businessTeam ? mapBusinessTeam(businessTeam) : null,
      teams,
    });
  } catch (err) {
    return guardResponse(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await requireAccountAccess(ctx, id);
    const admin = requireAdmin();
    const body = await request.json().catch(() => ({}));
    rejectClientOrgId(body);

    const businessTeamId = (body as { businessTeamId?: unknown }).businessTeamId;
    if (businessTeamId !== null && typeof businessTeamId !== 'string') {
      return Response.json({ error: 'businessTeamId 必须是 string 或 null' }, { status: 400 });
    }

    const businessTeam = await validateBusinessTeamId(admin, ctx, businessTeamId);
    const { data: updatedAccount, error } = await admin
      .from('accounts')
      .update({ business_team_id: businessTeamId })
      .eq('id', id)
      .eq('org_id', ctx.orgId)
      .select('id, business_team_id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updatedAccount) throw new ApiError(404, '客户不存在或团队归属未保存');

    return Response.json({
      ok: true,
      businessTeamId: (updatedAccount as { business_team_id: string | null }).business_team_id,
      businessTeam: businessTeam ? mapBusinessTeam(businessTeam) : null,
    });
  } catch (err) {
    return guardResponse(err);
  }
}
