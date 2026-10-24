/**
 * Query Filter — 根据 UserContext 自动添加 WHERE 条件
 *
 * 用法:
 *   let query = admin.from('accounts').select('*');
 *   query = applyScopeFilter(query, ctx, 'owner_id');
 *   const { data } = await query;
 */

import type { UserContext } from '@/lib/permissions';
import { getEffectiveScope } from '@/lib/permissions';

/**
 * 根据用户 jobLevel 自动添加 org_id + 数据范围过滤
 *
 * - AE (0): WHERE owner_field = ctx.userId  (只看自己的)
 * - Director (1): WHERE owner_field IN (ctx.teamMemberIds)  (看团队的)
 * - Executive (2): WHERE org_id = ctx.orgId  (看全组织)
 */
export function applyScopeFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  ctx: UserContext,
  ownerField: string = 'owner_id',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // 始终按 org 过滤（硬隔离）
  query = query.eq('org_id', ctx.orgId);

  const scope = getEffectiveScope(ctx.jobLevel);

  switch (scope) {
    case 'all':
      break;
    case 'team':
      if (ctx.teamMemberIds.length > 0) {
        query = query.in(ownerField, ctx.teamMemberIds);
      }
      break;
    case 'mine':
      query = query.eq(ownerField, ctx.userId);
      break;
  }

  return query;
}
