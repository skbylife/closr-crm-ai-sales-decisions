import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, PATCH } from './route';
import { requireAccountAccess, requireAdmin, requireAuth } from '@/lib/api-guard';

vi.mock('@/lib/api-guard', () => {
  class MockApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  }
  return {
    ApiError: MockApiError,
    requireAuth: vi.fn(),
    requireAdmin: vi.fn(),
    requireAccountAccess: vi.fn(),
    guardResponse: (err: unknown) => {
      if (err instanceof MockApiError) return Response.json({ error: err.message }, { status: err.status });
      return Response.json({ error: err instanceof Error ? err.message : 'error' }, { status: 500 });
    },
  };
});

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/accounts/acc_1/business-team', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeAdmin(params: { noAccountUpdateMatch?: boolean } = {}) {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    accounts: [{ id: 'acc_1', org_id: 'org_1', business_team_id: 'team_1' }],
    teams: [{ id: 'team_1', org_id: 'org_1', name: 'KA Team', created_at: '2026-05-01' }],
    org_memberships: [{ user_id: 'user_1', org_id: 'org_1', team_id: 'team_1' }],
  };
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let updatePayload: Record<string, unknown> | null = null;
      const query = {
        select() { return query; },
        order() { return query; },
        not(column: string, operator: string, value: unknown) {
          if (operator === 'is' && value === null) rows = rows.filter((row) => row[column] !== null && row[column] !== undefined);
          return query;
        },
        eq(column: string, value: unknown) {
          rows = rows.filter((row) => row[column] === value);
          return query;
        },
        update(payload: Record<string, unknown>) {
          updatePayload = payload;
          return query;
        },
        maybeSingle() {
          if (updatePayload) {
            if (params.noAccountUpdateMatch && table === 'accounts') return Promise.resolve({ data: null, error: null });
            for (const row of rows) Object.assign(row, updatePayload);
          }
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => void) {
          if (updatePayload) {
            for (const row of rows) Object.assign(row, updatePayload);
          }
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
  teamId: 'team_1',
  teamMemberIds: ['user_1'],
};

describe('/api/accounts/[id]/business-team', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(ctx);
    vi.mocked(requireAccountAccess).mockResolvedValue(undefined);
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin() as unknown as ReturnType<typeof requireAdmin>);
  });

  it('derives org from auth and returns account business team plus available teams', async () => {
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(requireAccountAccess).toHaveBeenCalledWith(ctx, 'acc_1');
    expect(payload.businessTeamId).toBe('team_1');
    expect(payload.teams).toEqual([expect.objectContaining({ id: 'team_1', memberCount: 1 })]);
  });

  it('rejects client-supplied orgId on patch', async () => {
    const response = await PATCH(jsonRequest({ orgId: 'org_2', businessTeamId: 'team_1' }), { params: Promise.resolve({ id: 'acc_1' }) });
    expect(response.status).toBe(400);
  });

  it('returns the saved business team id from the updated account row', async () => {
    const response = await PATCH(jsonRequest({ businessTeamId: null }), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, businessTeamId: null });
  });

  it('does not report success when the account update matched no rows', async () => {
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin({ noAccountUpdateMatch: true }) as unknown as ReturnType<typeof requireAdmin>);

    const response = await PATCH(jsonRequest({ businessTeamId: 'team_1' }), { params: Promise.resolve({ id: 'acc_missing' }) });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: '客户不存在或团队归属未保存' });
  });
});
