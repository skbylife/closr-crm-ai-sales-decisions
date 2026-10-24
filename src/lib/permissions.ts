import type { Account, PlayMomentum } from '@/lib/babel-engine/types';

// OrgRole: 平台管理权限（能不能邀请人、改设置）
// 保留 'manager' 兼容历史 DB 数据，逻辑上等同 'member'
export type OrgRole = 'owner' | 'admin' | 'manager' | 'member';
export type RoleLevel = 'admin' | 'member';
export type DataScope = 'mine' | 'team' | 'all';

export interface UserContext {
  userId: string;
  orgId: string;
  orgRole: OrgRole;
  roleLevel: RoleLevel;
  jobLevel: number; // 0=AE, 1=Director, 2=Executive — 数据可见性唯一依据
  teamId: string | null;
  teamMemberIds: string[];
}

/**
 * 获取当前用户的完整权限上下文（带 5 分钟缓存）
 */

export function getRoleLevel(orgRole: OrgRole): RoleLevel {
  return orgRole === 'owner' || orgRole === 'admin' ? 'admin' : 'member';
}

/** 平台管理权限（邀请、设置等），仅 owner/admin */
export function canManagePlatform(orgRole: OrgRole): boolean {
  return getRoleLevel(orgRole) === 'admin';
}

/** jobLevel >= 2 (Executive) 可看全部数据 */
export function canViewAllAccounts(jobLevel: number): boolean {
  return jobLevel >= 2;
}

export function canAccessAssignedAccounts(jobLevel: number): boolean {
  return !canViewAllAccounts(jobLevel);
}

export function filterVisibleAccounts(accounts: Account[], ctx: Pick<UserContext, 'userId' | 'jobLevel'>): Account[] {
  if (canViewAllAccounts(ctx.jobLevel)) return accounts;
  return accounts.filter((account) => (account.ownerId ?? account.userId) === ctx.userId);
}


/**
 * 根据 jobLevel 决定数据范围
 * Executive (2) → all | Director (1) → team | AE (0) → mine
 */
export function getDefaultScope(jobLevel: number): DataScope {
  if (jobLevel >= 2) return 'all';
  if (jobLevel >= 1) return 'team';
  return 'mine';
}

/**
 * 根据 jobLevel 调整请求的 scope（向下钳位）
 */
export function getEffectiveScope(jobLevel: number): DataScope {
  if (jobLevel >= 2) return 'all';
  if (jobLevel >= 1) return 'team';
  return 'mine';
}

/**
 * 检查用户是否可以查看指定范围的数据
 */
export function canViewScope(jobLevel: number, requestedScope: DataScope): boolean {
  if (jobLevel >= 2) return true;
  if (jobLevel >= 1) return requestedScope !== 'all';
  return requestedScope === 'mine';
}

/**
 * 对 Supabase 查询应用权限过滤
 */
export function applyPermissionFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  ctx: UserContext,
  ownerField: string = 'owner_id',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // org 级别过滤（始终）
  query = query.eq('org_id', ctx.orgId);

  const effectiveScope = getEffectiveScope(ctx.jobLevel);

  switch (effectiveScope) {
    case 'all':
      break;
    case 'team':
      if (ctx.teamMemberIds.length > 0) {
        query = query.or(
          `${ownerField}.in.(${ctx.teamMemberIds.join(',')}),${ownerField}.is.null,visibility.eq.org`
        );
      }
      break;
    case 'mine':
      query = query.or(
        `${ownerField}.eq.${ctx.userId},${ownerField}.is.null,visibility.eq.org`
      );
      break;
  }

  return query;
}

// ─── Play Permissions ────────────────────────────────────────────────

export interface PlayPermissions {
  canCreateAccountPlay: boolean;
  canCreateOpportunityPlay: boolean;
  canViewCompass: boolean;
  canViewTeam: boolean;
  canDeletePlay: boolean;
  canAssignTasks: boolean;
  canExportData: boolean;
  dataScope: 'own' | 'team' | 'all';
}

/**
 * 谋局权限，仅基于 jobLevel
 * Executive (2) → full | Director (1) → team | AE (0) → own
 */
export function getPlayPermissions(jobLevel: number): PlayPermissions {
  if (jobLevel >= 2) {
    return {
      canCreateAccountPlay: true,
      canCreateOpportunityPlay: true,
      canViewCompass: true,
      canViewTeam: true,
      canDeletePlay: true,
      canAssignTasks: true,
      canExportData: true,
      dataScope: 'all',
    };
  }
  if (jobLevel >= 1) {
    return {
      canCreateAccountPlay: true,
      canCreateOpportunityPlay: true,
      canViewCompass: true,
      canViewTeam: true,
      canDeletePlay: true,
      canAssignTasks: true,
      canExportData: true,
      dataScope: 'team',
    };
  }
  return {
    canCreateAccountPlay: false,
    canCreateOpportunityPlay: true,
    canViewCompass: false,
    canViewTeam: false,
    canDeletePlay: false,
    canAssignTasks: false,
    canExportData: false,
    dataScope: 'own',
  };
}

// Momentum labels and colors for UI
export const MOMENTUM_CONFIG: Record<PlayMomentum, { label: string; color: string; dotColor: string }> = {
  progressing: { label: '推进顺利', color: 'text-positive', dotColor: 'bg-positive' },
  active: { label: '活跃', color: 'text-accent', dotColor: 'bg-accent' },
  slowing: { label: '放缓', color: 'text-warning', dotColor: 'bg-warning' },
  stalled: { label: '停滞', color: 'text-orange-500', dotColor: 'bg-orange-500' },
  blocked: { label: '受阻', color: 'text-danger', dotColor: 'bg-danger' },
};
