import { describe, expect, it, vi } from 'vitest';

import { ApiError, requireAccountAccess, requireOpportunityAccess } from './api-guard';
import type { UserContext } from './permissions';

const mockAdmin = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => mockAdmin,
}));

function ctx(overrides: Partial<UserContext> = {}): UserContext {
  return {
    userId: 'user_1',
    orgId: 'org_1',
    orgRole: 'member',
    roleLevel: 'member',
    jobLevel: 0,
    teamId: null,
    teamMemberIds: ['user_1'],
    ...overrides,
  };
}

function mockTableRows(rowsByTable: Record<string, Array<Record<string, unknown>>>) {
  mockAdmin.from.mockImplementation((table: string) => {
    const rows = rowsByTable[table] ?? [];
    const filters: Array<[string, unknown]> = [];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((key: string, value: unknown) => {
        filters.push([key, value]);
        return query;
      }),
      single: vi.fn(async () => ({
        data: rows.find((row) => filters.every(([key, value]) => row[key] === value)) ?? null,
        error: null,
      })),
    };
    return query;
  });
}

describe('api guard multi-user access boundaries', () => {
  it('allows a manager to access team-owned accounts but blocks unrelated members', async () => {
    mockTableRows({
      accounts: [{ id: 'acc_1', org_id: 'org_1', owner_id: 'rep_2', user_id: 'rep_2' }],
    });

    await expect(requireAccountAccess(ctx({
      userId: 'manager_1',
      jobLevel: 1,
      teamId: 'team_1',
      teamMemberIds: ['manager_1', 'rep_2'],
    }), 'acc_1')).resolves.toBeUndefined();

    await expect(requireAccountAccess(ctx({ userId: 'rep_3' }), 'acc_1')).rejects.toMatchObject({
      status: 403,
      message: '只能操作自己的数据',
    });
  });

  it('allows assigned opportunity access even when the parent account owner differs', async () => {
    mockTableRows({
      accounts: [{ id: 'acc_1', org_id: 'org_1', owner_id: 'rep_2', user_id: 'rep_2' }],
      opportunities: [{ id: 'opp_1', org_id: 'org_1', account_id: 'acc_1', user_id: 'rep_2', assigned_to: 'rep_1' }],
    });

    await expect(requireOpportunityAccess(ctx({ userId: 'rep_1' }), 'opp_1')).resolves.toMatchObject({
      id: 'opp_1',
      assigned_to: 'rep_1',
    });
  });

  it('still binds all resource checks to the caller organization', async () => {
    mockTableRows({
      accounts: [{ id: 'acc_1', org_id: 'org_2', owner_id: 'user_1', user_id: 'user_1' }],
    });

    await expect(requireAccountAccess(ctx(), 'acc_1')).rejects.toBeInstanceOf(ApiError);
    await expect(requireAccountAccess(ctx(), 'acc_1')).rejects.toMatchObject({ status: 404 });
  });
});
