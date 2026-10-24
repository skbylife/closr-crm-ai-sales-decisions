import { ApiError, requireAccountAccess } from '@/lib/api-guard';
import type {
  AccountTeamAdminClient,
  AccountTeamAuthContext,
  BusinessTeamRow,
  PursuitTeamRow,
  ResponsibilityCatalogRow,
} from './types';

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export async function requirePursuitTeamAccess(
  ctx: AccountTeamAuthContext,
  teamId: string,
): Promise<PursuitTeamRow> {
  const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
  const admin = getSupabaseAdmin();
  if (!admin) throw new ApiError(503, '数据库暂时不可用');

  const { data, error } = await admin
    .from('pursuit_teams')
    .select('id, org_id, parent_team_id, account_id, opportunity_id, strategic_play_id, name, status, created_by, created_at, updated_at')
    .eq('id', teamId)
    .eq('org_id', ctx.orgId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new ApiError(404, '项目推进组不存在');

  const team = data as PursuitTeamRow;
  await requireAccountAccess(ctx, team.account_id);
  return team;
}

export async function validateBusinessTeamId(
  admin: AccountTeamAdminClient,
  ctx: AccountTeamAuthContext,
  teamId: string | null | undefined,
): Promise<BusinessTeamRow | null> {
  if (teamId == null) return null;
  const { data, error } = await admin
    .from('teams')
    .select('id, org_id, name, created_at')
    .eq('id', teamId)
    .eq('org_id', ctx.orgId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new ApiError(400, '管理团队不存在或不属于当前组织');
  return data as BusinessTeamRow;
}

export async function validateOrgMemberIds(
  admin: AccountTeamAdminClient,
  ctx: AccountTeamAuthContext,
  userIds: string[],
): Promise<void> {
  const ids = unique(userIds);
  if (ids.length === 0) return;

  const { data, error } = await admin
    .from('org_memberships')
    .select('user_id')
    .eq('org_id', ctx.orgId)
    .in('user_id', ids);

  if (error) throw new Error(error.message);
  const found = new Set((data ?? []).map((row: { user_id: string }) => row.user_id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new ApiError(400, '成员不存在或不属于当前组织');
  }
}

export async function validateResponsibilityIds(
  admin: AccountTeamAdminClient,
  ctx: AccountTeamAuthContext,
  responsibilityIds: string[],
): Promise<ResponsibilityCatalogRow[]> {
  const ids = unique(responsibilityIds);
  if (ids.length === 0) return [];

  const { data, error } = await admin
    .from('responsibility_catalog')
    .select('id, org_id, key, label, description, category, is_system, created_by, created_at')
    .in('id', ids);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ResponsibilityCatalogRow[];
  const allowed = rows.filter((row) => row.is_system || row.org_id === ctx.orgId);
  const allowedIds = new Set(allowed.map((row) => row.id));
  const missing = ids.filter((id) => !allowedIds.has(id));
  if (missing.length > 0) {
    throw new ApiError(400, '职责标签不存在或不属于当前组织');
  }
  return allowed;
}

export function rejectClientOrgId(body: unknown): void {
  if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'orgId')) {
    throw new ApiError(400, 'orgId 由登录上下文推导，不能由客户端传入');
  }
}
