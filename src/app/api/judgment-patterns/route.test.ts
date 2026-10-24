import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { requireAccountAccess, requireAdmin, requireAuth } from '@/lib/api-guard';

vi.mock('@/lib/api-guard', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
  requireAccountAccess: vi.fn(),
  guardResponse: (err: unknown) => {
    const status = typeof err === 'object' && err !== null && 'status' in err ? Number((err as { status: unknown }).status) : 500;
    const message = err instanceof Error ? err.message : 'error';
    return Response.json({ error: message }, { status });
  },
}));

type TestTableRow = Record<string, unknown>;
type QueryResult = { data: TestTableRow[] | null; error: { message?: string } | null };

function request(path = 'http://localhost/api/judgment-patterns') {
  return new Request(path, { method: 'GET' });
}

function matches(row: TestTableRow, filters: Array<[string, unknown]>, inFilters: Array<[string, unknown[]]>) {
  return filters.every(([key, value]) => row[key] === value)
    && inFilters.every(([key, values]) => values.includes(row[key]));
}

function makeAdmin(rows: TestTableRow[], overrideResult?: QueryResult) {
  return {
    from(table: string) {
      if (table !== 'source_records') throw new Error(`unexpected table ${table}`);
      const filters: Array<[string, unknown]> = [];
      const inFilters: Array<[string, unknown[]]> = [];
      let capped = rows.length;
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          filters.push([key, value]);
          return query;
        },
        in(key: string, values: unknown[]) {
          inFilters.push([key, values]);
          return query;
        },
        order() {
          return query;
        },
        limit(value: number) {
          capped = value;
          return query;
        },
        then(resolve: (value: QueryResult) => void) {
          if (overrideResult) return Promise.resolve(overrideResult).then(resolve);
          const data = rows.filter((row) => matches(row, filters, inFilters)).slice(0, capped);
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as ReturnType<typeof requireAdmin>;
}

function interventionRow(overrides: TestTableRow = {}): TestTableRow {
  return {
    id: 'sr_int_1',
    org_id: 'org_1',
    account_id: 'acc_1',
    source_kind: 'manager_intervention',
    source_table: 'opportunities',
    source_row_id: 'opp_1',
    occurred_at: '2026-05-01T12:00:00.000Z',
    created_at: '2026-05-01T12:00:00.000Z',
    metadata: {
      intervention: {
        id: 'int_1',
        orgId: 'org_1',
        accountId: 'acc_1',
        opportunityId: 'opp_1',
        type: 'manager_intervention',
        action: 'verify_evidence',
        status: 'completed',
        role: 'manager',
        reason: '证据不足，先核验。',
        recommendedAction: '补一手采购 owner 证据。',
        evidenceRefs: [],
        createdAt: '2026-05-01T12:00:00.000Z',
      },
    },
    ...overrides,
  };
}

function outcomeRow(overrides: TestTableRow = {}): TestTableRow {
  return {
    id: 'sr_out_1',
    org_id: 'org_1',
    account_id: 'acc_1',
    source_kind: 'intervention_outcome',
    source_table: 'source_records',
    source_row_id: 'out_1',
    occurred_at: '2026-05-04T12:00:00.000Z',
    created_at: '2026-05-04T12:00:00.000Z',
    metadata: {
      interventionOutcome: {
        id: 'out_1',
        orgId: 'org_1',
        accountId: 'acc_1',
        opportunityId: 'opp_1',
        interventionId: 'int_1',
        sourceRecordId: 'sr_int_1',
        outcome: 'effective',
        impact: 'evidence_improved',
        confidence: 0.82,
        outcomeNote: 'AE 补回一手证据。',
        learningSummary: '先核验证据比直接升级更有效。',
        evidenceRefs: [],
        createdAt: '2026-05-04T12:00:00.000Z',
      },
    },
    ...overrides,
  };
}

describe('/api/judgment-patterns', () => {
  beforeEach(() => {
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'member',
      roleLevel: 'member',
      jobLevel: 1,
      teamId: null,
      teamMemberIds: [],
    });
    vi.mocked(requireAccountAccess).mockResolvedValue(undefined);
  });

  it('returns org scoped patterns for manager and above', async () => {
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin([interventionRow(), outcomeRow()]));

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.patterns).toHaveLength(1);
    expect(payload.patterns[0]).toMatchObject({ patternType: 'effective_intervention', sampleSize: 1 });
    expect(payload.patterns[0].caveat).toContain('仅单一账户样本');
    expect(payload.recentLearningSamples).toHaveLength(1);
    expect(payload.calibrationNote).toContain('不是自动真理');
  });

  it('requires accountId for member users and returns 403 conservatively', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'member',
      roleLevel: 'member',
      jobLevel: 0,
      teamId: null,
      teamMemberIds: [],
    });
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin([interventionRow(), outcomeRow()]));

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain('成员只能查看');
  });

  it('allows member users to fetch a specific accessible account and filters source_records by account', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'member',
      roleLevel: 'member',
      jobLevel: 0,
      teamId: null,
      teamMemberIds: [],
    });
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin([
      interventionRow(),
      outcomeRow(),
      interventionRow({ id: 'sr_int_2', account_id: 'acc_2' }),
    ]));

    const response = await GET(request('http://localhost/api/judgment-patterns?accountId=acc_1'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(requireAccountAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), 'acc_1');
    expect(payload.scope).toMatchObject({ type: 'account', accountId: 'acc_1' });
    expect(payload.patterns).toHaveLength(1);
    expect(payload.patterns[0].accounts.map((account: { accountId: string }) => account.accountId)).toEqual(['acc_1']);
  });

  it('returns empty fallback when source_records is unavailable', async () => {
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin([], { data: null, error: { message: 'source_records does not exist' } }));

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.patterns).toEqual([]);
    expect(payload.calibrationNote).toContain('暂无可复用');
  });
});
