import { isNativeDatabase } from '@/lib/database-backend';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getOrgIdForUser } from '@/lib/get-org-id';
import { withCache, permissionCache, PERMISSION_TTL } from '@/lib/cache';
import { getRoleLevel, type UserContext, type OrgRole } from './permissions';

export async function getUserContext(userId: string): Promise<UserContext | null> {
  // Native server APIs use owner connections after this guard; re-read membership
  // on every request so team moves/revocation cannot retain cached access.
  if (isNativeDatabase()) return _fetchUserContext(userId);
  return withCache(permissionCache as import('@/lib/cache').MemoryCache<UserContext | null>, `user_ctx:${userId}`, PERMISSION_TTL, () => _fetchUserContext(userId));
}

async function _fetchUserContext(userId: string): Promise<UserContext | null> {
  const orgId = await getOrgIdForUser(userId);
  if (!orgId) return null;

  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data: membership } = await admin
    .from('org_memberships')
    .select('role, team_id, job_level, role_level')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .single();

  if (!membership) return null;

  const orgRole = membership.role as OrgRole;
  // 优先读 job_level，兼容旧 role_level
  const jobLevel = Math.min((membership.job_level as number) ?? (membership.role_level as number) ?? 0, 2);
  const teamId = membership.team_id as string | null;

  // Director (jobLevel >= 1) 且有 teamId → 获取团队成员 IDs
  let teamMemberIds: string[] = [userId];
  if (jobLevel >= 1 && teamId) {
    const { data: members } = await admin
      .from('org_memberships')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('team_id', teamId);

    teamMemberIds = (members ?? []).map(m => m.user_id);
    if (!teamMemberIds.includes(userId)) teamMemberIds.push(userId);
  }

  return { userId, orgId, orgRole, roleLevel: getRoleLevel(orgRole), jobLevel, teamId, teamMemberIds };
}

