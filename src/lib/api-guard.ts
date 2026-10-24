/**
 * API Guard — 统一的 RBAC 权限中间件
 *
 * 用法:
 *   const ctx = await requireAuth();           // 401 if not logged in
 *   requireRole(ctx, 'admin');                 // 403 if role insufficient
 *   requireOwnership(ctx, resource.user_id);   // 403 if not owner & not admin+
 *   requireScope(ctx, 'team');                 // 403 if scope not allowed
 */

import { getAuthUser } from '@/lib/api-auth';
import { getUserContext } from '@/lib/permissions-server';
import { type UserContext, type OrgRole, type DataScope, canViewScope } from '@/lib/permissions';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

// Role hierarchy: owner > admin > manager > member
const ROLE_RANK: Record<OrgRole, number> = {
  owner: 3,
  admin: 2,
  manager: 1,
  member: 0,
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * 认证 + 获取 UserContext。
 * 所有用户（含 demo）必须有真实 Supabase session + org membership。
 */
export async function requireAuth(): Promise<UserContext> {
  const authUser = await getAuthUser();
  if (!authUser) {
    throw new ApiError(401, '请先登录');
  }

  const ctx = await getUserContext(authUser.id);
  if (!ctx) {
    throw new ApiError(403, '未加入组织或组织信息无效');
  }

  return ctx;
}

/**
 * 检查用户角色是否 >= 所需最低角色
 */
export function requireRole(ctx: UserContext, minRole: OrgRole): void {
  if (ROLE_RANK[ctx.orgRole] < ROLE_RANK[minRole]) {
    throw new ApiError(403, `权限不足，需要 ${minRole} 或更高角色`);
  }
}

/**
 * Enterprise destructive org-data actions are owner-only by default.
 * Use this for bulk delete, clear-all-data, seed reset, and similarly
 * irreversible organization-level data operations.
 */
export function requireOwnerForDestructiveOrgData(ctx: UserContext): void {
  requireRole(ctx, 'owner');
}

/**
 * 检查用户是否是资源所有者，或拥有 admin+ 角色可以操作他人资源
 */
export function requireOwnership(ctx: UserContext, resourceUserId: string): void {
  if (ctx.userId === resourceUserId) return;
  // admin+ / Executive 可以操作本组织内任何人的资源（调用方必须先做 org_id 约束）
  if (ROLE_RANK[ctx.orgRole] >= ROLE_RANK['admin']) return;
  if (ctx.jobLevel >= 2) return;
  // Director (jobLevel >= 1) 可以操作团队成员的资源
  if (ctx.jobLevel >= 1 && ctx.teamMemberIds.includes(resourceUserId)) return;
  throw new ApiError(403, '只能操作自己的数据');
}

/**
 * 检查用户是否可以查看指定范围的数据
 */
export function requireScope(ctx: UserContext, scope: DataScope): void {
  if (!canViewScope(ctx.jobLevel, scope)) {
    throw new ApiError(403, `权限不足，无法查看 ${scope} 范围的数据`);
  }
}

/**
 * 检查用户是否有权限访问指定 account（按 account owner 做 scope 校验）
 * admin+ 直接通过，manager 检查团队，member 只能访问自己的 account
 */
export async function requireAccountAccess(ctx: UserContext, accountId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new ApiError(503, '数据库暂时不可用');

  const { data: account } = await admin
    .from('accounts')
    .select('owner_id, user_id')
    .eq('id', accountId)
    .eq('org_id', ctx.orgId)
    .single();

  if (!account) throw new ApiError(404, '客户不存在');

  // admin+ / Executive 可访问本组织内所有 account，但不能跨 org。
  if (ROLE_RANK[ctx.orgRole] >= ROLE_RANK['admin'] || ctx.jobLevel >= 2) return;

  const ownerId = account.owner_id ?? account.user_id;
  if (!ownerId) return; // 无 owner，允许访问
  requireOwnership(ctx, ownerId);
}

/**
 * 检查用户是否有权限访问指定 contact。
 * 先强制 org_id 绑定，再通过其 account 复用 account 可见范围；无 account 时按 contact.user_id 校验。
 */
export async function requireContactAccess(
  ctx: UserContext,
  contactId: string,
): Promise<{ id: string; account_id: string | null; user_id: string | null }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new ApiError(503, '数据库暂时不可用');

  const { data: contact } = await admin
    .from('contacts')
    .select('id, account_id, user_id')
    .eq('id', contactId)
    .eq('org_id', ctx.orgId)
    .single();

  if (!contact) throw new ApiError(404, '联系人不存在');

  const contactRow = contact as { id: string; account_id: string | null; user_id: string | null };
  if (contactRow.account_id) {
    await requireAccountAccess(ctx, contactRow.account_id);
    return contactRow;
  }

  if (ROLE_RANK[ctx.orgRole] >= ROLE_RANK['admin']) return contactRow;
  if (contactRow.user_id) requireOwnership(ctx, contactRow.user_id);
  return contactRow;
}

/**
 * 检查用户是否有权限访问指定 opportunity。
 * 先强制 org_id 绑定，再通过 account_id 复用 account 可见范围；无 account 时按 opportunity.user_id 校验。
 */
export async function requireOpportunityAccess(
  ctx: UserContext,
  opportunityId: string,
): Promise<{ id: string; account_id: string | null; user_id: string | null; assigned_to: string | null }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new ApiError(503, '数据库暂时不可用');

  const { data: opportunity } = await admin
    .from('opportunities')
    .select('id, account_id, user_id, assigned_to')
    .eq('id', opportunityId)
    .eq('org_id', ctx.orgId)
    .single();

  if (!opportunity) throw new ApiError(404, '商机不存在');

  const opportunityRow = opportunity as { id: string; account_id: string | null; user_id: string | null; assigned_to: string | null };
  if (opportunityRow.account_id) {
    try {
      await requireAccountAccess(ctx, opportunityRow.account_id);
      return opportunityRow;
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 403) throw err;
      // Account 权限优先；若 account 不可见，同组织内明确被分配人仍可访问该商机。
    }
  }

  if (ROLE_RANK[ctx.orgRole] >= ROLE_RANK['admin']) return opportunityRow;
  if (opportunityRow.assigned_to) {
    requireOwnership(ctx, opportunityRow.assigned_to);
    return opportunityRow;
  }
  if (opportunityRow.user_id) requireOwnership(ctx, opportunityRow.user_id);
  return opportunityRow;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, 'public', any>;

/**
 * 获取 Supabase admin client，不可用时抛出 503。
 * 用法：const admin = requireAdmin();
 */
export function requireAdmin(): AnySupabaseClient {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new ApiError(503, '数据库暂时不可用');
  }
  return admin;
}

/**
 * 统一错误响应 — 在 route handler 的 catch 块中使用
 */
export function guardResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error('[api-guard] Unexpected error:', err);
  return Response.json({ error: '服务器错误' }, { status: 500 });
}
