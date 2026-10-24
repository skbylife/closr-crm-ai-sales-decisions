import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-guard';
import { getVisiblePortfolioIds, resolveDashboardScope } from '@/lib/portfolio-scope';
import type { UserContext } from '@/lib/permissions';

function ctx(overrides: Partial<UserContext>): UserContext {
  return {
    userId: 'ae_1',
    orgId: 'org_1',
    orgRole: 'member',
    roleLevel: 'member',
    jobLevel: 0,
    teamId: null,
    teamMemberIds: ['ae_1'],
    ...overrides,
  };
}

class QueryStub {
  calls: Array<{ method: string; args: unknown[] }> = [];

  constructor(private readonly table: string) {}

  select(...args: unknown[]) { this.calls.push({ method: 'select', args }); return this; }
  eq(...args: unknown[]) { this.calls.push({ method: 'eq', args }); return this; }
  or(...args: unknown[]) { this.calls.push({ method: 'or', args }); return this; }
  limit(...args: unknown[]) { this.calls.push({ method: 'limit', args }); return this; }

  then<TResult1 = { data: unknown[] }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[] }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const data = this.table === 'accounts'
      ? [{ id: 'acc_1' }]
      : [{ id: 'opp_1', account_id: 'acc_1' }];
    return Promise.resolve({ data }).then(onfulfilled, onrejected);
  }
}

function makeAdmin() {
  const queries: QueryStub[] = [];
  return {
    queries,
    admin: {
      from(table: string) {
        const query = new QueryStub(table);
        queries.push(query);
        return query;
      },
    },
  };
}

describe('portfolio-scope server-side role scoping', () => {
  it('rejects AE global/all and defaults AE to mine', () => {
    const ae = ctx({ jobLevel: 0, userId: 'ae_1' });

    expect(resolveDashboardScope(ae, null)).toBe('mine');
    expect(() => resolveDashboardScope(ae, 'global')).toThrow(ApiError);
    expect(() => resolveDashboardScope(ae, 'all')).toThrow(ApiError);
  });

  it('keeps Director at team scope unless they explicitly request mine', () => {
    const director = ctx({ jobLevel: 1, userId: 'director_1', teamMemberIds: ['director_1', 'ae_2'] });

    expect(resolveDashboardScope(director, null)).toBe('team');
    expect(resolveDashboardScope(director, 'team')).toBe('team');
    expect(resolveDashboardScope(director, 'personal')).toBe('mine');
    expect(() => resolveDashboardScope(director, 'global')).toThrow(ApiError);
  });

  it('allows Executive all scope', () => {
    const executive = ctx({ jobLevel: 2, userId: 'exec_1', orgRole: 'admin', roleLevel: 'admin' });

    expect(resolveDashboardScope(executive, null)).toBe('all');
    expect(resolveDashboardScope(executive, 'global')).toBe('all');
  });

  it('builds visible account/opportunity IDs through account and opportunity ownership for team scope', async () => {
    const { admin, queries } = makeAdmin();
    const visibility = await getVisiblePortfolioIds(
      admin,
      ctx({ jobLevel: 1, userId: 'director_1', teamMemberIds: ['director_1', 'ae_2'] }),
      'team',
    );

    expect(visibility).toMatchObject({ restrict: true, accountIds: ['acc_1'], opportunityIds: ['opp_1'] });
    expect(queries[0].calls).toContainEqual({ method: 'or', args: ['owner_id.in.(director_1,ae_2),and(owner_id.is.null,user_id.in.(director_1,ae_2)),and(owner_id.is.null,user_id.is.null)'] });
    expect(queries[1].calls).toContainEqual({ method: 'or', args: ['assigned_to.in.(director_1,ae_2),user_id.in.(director_1,ae_2),account_id.in.(acc_1)'] });
  });
});
