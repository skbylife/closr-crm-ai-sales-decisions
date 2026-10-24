import { requireAccountAccess, requireOpportunityAccess, ApiError } from '@/lib/api-guard';
import { canViewScope, getEffectiveScope, type DataScope, type UserContext } from '@/lib/permissions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryBuilder = any;

export interface PortfolioVisibility {
  scope: DataScope;
  restrict: boolean;
  accountIds: string[];
  opportunityIds: string[];
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function scopedOwnerIds(ctx: UserContext, scope: DataScope): string[] {
  if (scope === 'mine') return [ctx.userId];
  if (scope === 'team') return unique([ctx.userId, ...ctx.teamMemberIds]);
  return [];
}

function inExpr(column: string, ids: string[]): string | null {
  return ids.length > 0 ? `${column}.in.(${ids.join(',')})` : null;
}

export function parseDashboardScope(rawScope: string | null): DataScope | null {
  if (!rawScope) return null;
  switch (rawScope) {
    case 'personal':
    case 'mine':
      return 'mine';
    case 'team':
      return 'team';
    case 'global':
    case 'all':
      return 'all';
    default:
      throw new ApiError(400, `未知数据范围: ${rawScope}`);
  }
}

/**
 * Resolve a caller-requested dashboard scope against server-side jobLevel.
 * Explicit overreach is rejected instead of trusting UI role-view state.
 */
export function resolveDashboardScope(ctx: UserContext, rawScope: string | null): DataScope {
  const requestedScope = parseDashboardScope(rawScope);
  if (requestedScope) {
    if (!canViewScope(ctx.jobLevel, requestedScope)) {
      throw new ApiError(403, `权限不足，无法查看 ${requestedScope} 范围的数据`);
    }
    return requestedScope;
  }
  return getEffectiveScope(ctx.jobLevel);
}

export async function assertPatternEntityAccess(ctx: UserContext, params: { opportunityId?: string; accountId?: string }): Promise<void> {
  if (params.opportunityId) {
    await requireOpportunityAccess(ctx, params.opportunityId);
    return;
  }
  if (params.accountId) {
    await requireAccountAccess(ctx, params.accountId);
  }
}

export async function getVisiblePortfolioIds(
  admin: { from: (table: string) => QueryBuilder },
  ctx: UserContext,
  scope: DataScope = getEffectiveScope(ctx.jobLevel),
): Promise<PortfolioVisibility> {
  if (scope === 'all') {
    return { scope, restrict: false, accountIds: [], opportunityIds: [] };
  }

  const ownerIds = scopedOwnerIds(ctx, scope);
  if (ownerIds.length === 0) {
    return { scope, restrict: true, accountIds: [], opportunityIds: [] };
  }

  const accountOwnerFilter = [
    inExpr('owner_id', ownerIds),
    `and(owner_id.is.null,${inExpr('user_id', ownerIds)})`,
    'and(owner_id.is.null,user_id.is.null)',
  ]
    .filter((value): value is string => Boolean(value))
    .join(',');

  const { data: visibleAccounts } = await admin
    .from('accounts')
    .select('id')
    .eq('org_id', ctx.orgId)
    .or(accountOwnerFilter)
    .limit(10_000);

  const accountIds = unique((visibleAccounts ?? []).map((account: { id?: string }) => account.id));

  const opportunityFilters = [
    inExpr('assigned_to', ownerIds),
    inExpr('user_id', ownerIds),
    inExpr('account_id', accountIds),
  ].filter((value): value is string => Boolean(value));

  const { data: visibleOpps } = opportunityFilters.length > 0
    ? await admin
      .from('opportunities')
      .select('id, account_id')
      .eq('org_id', ctx.orgId)
      .or(opportunityFilters.join(','))
      .limit(10_000)
    : { data: [] };

  const opportunityIds = unique((visibleOpps ?? []).map((opp: { id?: string }) => opp.id));
  const accountIdsFromOpps = unique((visibleOpps ?? []).map((opp: { account_id?: string | null }) => opp.account_id));

  return {
    scope,
    restrict: true,
    accountIds: unique([...accountIds, ...accountIdsFromOpps]),
    opportunityIds,
  };
}

export function restrictQueryToIds(query: QueryBuilder, visibility: PortfolioVisibility, column: string, ids: string[]): QueryBuilder {
  if (!visibility.restrict) return query;
  if (ids.length === 0) return query.limit(0);
  return query.in(column, ids);
}

export function restrictQueryToVisibleAccounts(query: QueryBuilder, visibility: PortfolioVisibility, column = 'account_id'): QueryBuilder {
  return restrictQueryToIds(query, visibility, column, visibility.accountIds);
}

export function restrictQueryToVisibleOpportunities(query: QueryBuilder, visibility: PortfolioVisibility, column = 'id'): QueryBuilder {
  return restrictQueryToIds(query, visibility, column, visibility.opportunityIds);
}

export function restrictQueryToVisibleEntities(query: QueryBuilder, visibility: PortfolioVisibility, column = 'entity_id'): QueryBuilder {
  return restrictQueryToIds(query, visibility, column, unique([...visibility.accountIds, ...visibility.opportunityIds]));
}

export function restrictQueryToVisiblePortfolio(
  query: QueryBuilder,
  visibility: PortfolioVisibility,
  fields: { accountField?: string; opportunityField?: string } = {},
): QueryBuilder {
  if (!visibility.restrict) return query;

  const filters = [
    fields.accountField ? inExpr(fields.accountField, visibility.accountIds) : null,
    fields.opportunityField ? inExpr(fields.opportunityField, visibility.opportunityIds) : null,
  ].filter((value): value is string => Boolean(value));

  if (filters.length === 0) return query.limit(0);
  if (filters.length === 1) {
    const [column, rest] = filters[0].split('.in.');
    const ids = rest.slice(1, -1).split(',').filter(Boolean);
    return query.in(column, ids);
  }
  return query.or(filters.join(','));
}
