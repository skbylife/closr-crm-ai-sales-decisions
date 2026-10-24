import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
import { requireAccountAccess, requireAdmin, requireAuth, requireOpportunityAccess } from '@/lib/api-guard';

vi.mock('@/lib/api-guard', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-guard')>('@/lib/api-guard');
  return {
    ApiError: actual.ApiError,
    requireAuth: vi.fn(),
    requireAdmin: vi.fn(),
    requireAccountAccess: vi.fn(),
    requireOpportunityAccess: vi.fn(),
    guardResponse: (err: unknown) => {
      const status = err instanceof actual.ApiError ? err.status : 500;
      const message = err instanceof Error ? err.message : 'error';
      return Response.json({ error: message }, { status });
    },
  };
});

type Row = Record<string, unknown>;

function matches(row: Row, filters: Array<[string, unknown]>, nullFilters: string[]) {
  return filters.every(([key, value]) => row[key] === value)
    && nullFilters.every((key) => row[key] === null || row[key] === undefined);
}

function makeAdmin(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      if (!tables[table]) tables[table] = [];
      const filters: Array<[string, unknown]> = [];
      const nullFilters: string[] = [];
      let updatePayload: Row | null = null;
      let insertPayload: Row | null = null;

      const rows = () => tables[table].filter((row) => matches(row, filters, nullFilters));
      const result = () => {
        if (updatePayload) {
          for (const row of rows()) Object.assign(row, updatePayload);
          return { error: null };
        }
        return { data: rows(), error: null };
      };

      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters.push([key, value]); return query; },
        is(key: string, value: unknown) {
          if (value !== null) throw new Error('only null filters supported');
          nullFilters.push(key);
          return query;
        },
        update(payload: Row) { updatePayload = payload; return query; },
        insert(payload: Row) {
          insertPayload = {
            id: 'assign_new',
            completed_at: null,
            revoked_at: null,
            created_at: '2026-05-17T22:00:00.000Z',
            updated_at: '2026-05-17T22:00:00.000Z',
            ...payload,
          };
          tables[table].push(insertPayload);
          return query;
        },
        async maybeSingle() {
          return { data: rows()[0] ?? null, error: null };
        },
        async single() {
          return { data: insertPayload ?? rows()[0] ?? null, error: null };
        },
        async order() {
          return { data: rows(), error: null };
        },
        then(resolve: (value: { data?: Row[]; error: null }) => void) {
          resolve(result());
        },
      };
      return query;
    },
  } as unknown as ReturnType<typeof requireAdmin>;
}

function postRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/judgment/ownership-assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/judgment/ownership-assignments', () => {
  const tables: Record<string, Row[]> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    tables.org_memberships = [{ org_id: 'org_1', user_id: 'owner_2' }];
    tables.strategic_plays = [{ id: 'play_1', org_id: 'org_1', account_id: 'acc_1', opportunity_id: 'opp_1' }];
    tables.judgment_ownership_assignments = [{
      id: 'assign_old',
      org_id: 'org_1',
      account_id: 'acc_1',
      opportunity_id: 'opp_1',
      strategic_play_id: 'play_1',
      judgment_type: 'strategic_play',
      assigned_user_id: 'owner_1',
      assigned_by: 'manager_1',
      status: 'active',
      source: 'manual',
      reason: null,
      due_at: null,
      completed_at: null,
      revoked_at: null,
      created_at: '2026-05-17T21:00:00.000Z',
      updated_at: '2026-05-17T21:00:00.000Z',
    }];
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'manager_1',
      orgId: 'org_1',
      orgRole: 'manager',
      roleLevel: 'member',
      jobLevel: 1,
      teamId: null,
      teamMemberIds: ['owner_2'],
    });
    vi.mocked(requireAccountAccess).mockResolvedValue(undefined);
    vi.mocked(requireOpportunityAccess).mockResolvedValue({
      id: 'opp_1',
      account_id: 'acc_1',
      user_id: 'owner_1',
      assigned_to: 'owner_1',
    });
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin(tables));
  });

  it('lists assignments under existing account access', async () => {
    const response = await GET(new Request('http://localhost/api/judgment/ownership-assignments?accountId=acc_1&status=active'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(requireAccountAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), 'acc_1');
    expect(payload.assignments).toEqual([
      expect.objectContaining({
        id: 'assign_old',
        accountId: 'acc_1',
        judgmentType: 'strategic_play',
        assignedUserId: 'owner_1',
      }),
    ]);
  });

  it('creates a human-confirmed assignment and revokes the previous active one', async () => {
    const response = await POST(postRequest({
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      strategicPlayId: 'play_1',
      judgmentType: 'strategic_play',
      assignedUserId: 'owner_2',
      source: 'management_queue',
      reason: 'Horizon queue surfaced a judgment ownership gap',
      dueAt: '2026-05-20T12:00:00.000Z',
    }));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(requireAccountAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), 'acc_1');
    expect(requireOpportunityAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), 'opp_1');
    expect(tables.judgment_ownership_assignments.find((row) => row.id === 'assign_old')).toMatchObject({
      status: 'revoked',
      revoked_at: expect.any(String),
    });
    expect(payload.assignment).toMatchObject({
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      strategicPlayId: 'play_1',
      judgmentType: 'strategic_play',
      assignedUserId: 'owner_2',
      assignedBy: 'manager_1',
      source: 'management_queue',
      status: 'active',
    });
  });

  it('rejects client-provided org ids and unknown assignees', async () => {
    const orgResponse = await POST(postRequest({
      orgId: 'org_2',
      accountId: 'acc_1',
      judgmentType: 'account_strategy',
      assignedUserId: 'owner_2',
    }));
    expect(orgResponse.status).toBe(400);

    const unknownResponse = await POST(postRequest({
      accountId: 'acc_1',
      judgmentType: 'account_strategy',
      assignedUserId: 'missing_user',
    }));
    expect(unknownResponse.status).toBe(400);
    expect(await unknownResponse.json()).toMatchObject({ error: '负责人不存在或不属于当前组织' });
  });
});
