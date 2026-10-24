import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  rejectClientOrgId,
  requirePursuitTeamAccess,
  validateBusinessTeamId,
  validateOrgMemberIds,
  validateResponsibilityIds,
} from './access';
import { requireAccountAccess } from '@/lib/api-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

vi.mock('@/lib/api-guard', () => {
  class MockApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  }
  return {
    ApiError: MockApiError,
    requireAccountAccess: vi.fn(),
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

type TableData = Record<string, Array<Record<string, unknown>>>;

function makeAdmin(tables: TableData) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const query = {
        select() { return query; },
        eq(column: string, value: unknown) {
          rows = rows.filter((row) => row[column] === value);
          return query;
        },
        in(column: string, values: unknown[]) {
          rows = rows.filter((row) => values.includes(row[column]));
          return query;
        },
        maybeSingle() {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => void) {
          resolve({ data: rows, error: null });
        },
      };
      return query;
    },
  };
}

const ctx = {
  userId: 'user_1',
  orgId: 'org_1',
  orgRole: 'member' as const,
  roleLevel: 'member' as const,
  jobLevel: 0,
  teamId: null,
  teamMemberIds: ['user_1'],
};

describe('account-team access guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAccountAccess).mockResolvedValue(undefined);
  });

  it('requires pursuit team to belong to ctx org and reuses account access', async () => {
    const admin = makeAdmin({
      pursuit_teams: [{ id: 'pt_1', org_id: 'org_1', account_id: 'acc_1', parent_team_id: null, opportunity_id: null, strategic_play_id: null, name: 'Deal room', status: 'active', created_by: 'user_1', created_at: null, updated_at: null }],
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>);

    const team = await requirePursuitTeamAccess(ctx, 'pt_1');

    expect(team.account_id).toBe('acc_1');
    expect(requireAccountAccess).toHaveBeenCalledWith(ctx, 'acc_1');
  });

  it('rejects cross-org business teams', async () => {
    const admin = makeAdmin({ teams: [{ id: 'team_other', org_id: 'org_2', name: 'Other' }] });

    await expect(validateBusinessTeamId(admin as never, ctx, 'team_other')).rejects.toMatchObject({ status: 400 });
  });

  it('rejects org members outside current org', async () => {
    const admin = makeAdmin({ org_memberships: [{ user_id: 'user_1', org_id: 'org_1' }] });

    await expect(validateOrgMemberIds(admin as never, ctx, ['user_1', 'user_2'])).rejects.toMatchObject({ status: 400 });
  });

  it('allows system and current-org responsibilities only', async () => {
    const admin = makeAdmin({
      responsibility_catalog: [
        { id: 'r_system', org_id: null, is_system: true, key: 'account_lead', label: 'Lead', description: null, category: null, created_by: null, created_at: null },
        { id: 'r_custom', org_id: 'org_1', is_system: false, key: 'custom', label: 'Custom', description: null, category: null, created_by: null, created_at: null },
        { id: 'r_other', org_id: 'org_2', is_system: false, key: 'other', label: 'Other', description: null, category: null, created_by: null, created_at: null },
      ],
    });

    await expect(validateResponsibilityIds(admin as never, ctx, ['r_system', 'r_custom'])).resolves.toHaveLength(2);
    await expect(validateResponsibilityIds(admin as never, ctx, ['r_other'])).rejects.toMatchObject({ status: 400 });
  });

  it('rejects client-supplied orgId', () => {
    expect(() => rejectClientOrgId({ orgId: 'org_2' })).toThrow(/orgId/);
  });
});
