import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { requireAdmin, requireAuth } from '@/lib/api-guard';

vi.mock('@/lib/api-guard', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
}));

type TestTableRow = Record<string, unknown>;
type QueryResult = { data: TestTableRow[] | null; error: { message?: string } | null };

function matches(row: TestTableRow, filters: Array<[string, unknown]>, inFilters: Array<[string, unknown[]]>) {
  return filters.every(([key, value]) => row[key] === value)
    && inFilters.every(([key, values]) => values.includes(row[key]));
}

function makeAdmin(tables: Record<string, TestTableRow[]>, overrides: Record<string, QueryResult> = {}) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const inFilters: Array<[string, unknown[]]> = [];
      let capped = tables[table]?.length ?? 0;
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
          if (overrides[table]) return Promise.resolve(overrides[table]).then(resolve);
          const data = (tables[table] ?? []).filter((row) => matches(row, filters, inFilters)).slice(0, capped);
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as ReturnType<typeof requireAdmin>;
}

function persistedDecodeRecord(overrides: TestTableRow = {}): TestTableRow {
  return {
    id: 'sr_decode_1',
    org_id: 'org_1',
    account_id: 'acc_1',
    source_kind: 'email_decode',
    source_table: 'email_decodes',
    source_row_id: 'decode_1',
    metadata: {
      judgmentMemory: {
        sourceKind: 'decode',
        sourceId: 'decode_1',
        accountId: 'acc_1',
        currentJudgment: 'Buyer is engaged.',
        risk: 'Procurement is opaque.',
        nextAction: 'Verify procurement criteria.',
        evidenceRefs: [{ sourceId: 'decode_1', sourceKind: 'email_decode', sourceTable: 'email_decodes', sourceRowId: 'decode_1' }],
      },
    },
    ...overrides,
  };
}

describe('GET /api/judgment/provenance-gaps', () => {
  beforeEach(() => {
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'owner',
      roleLevel: 'admin',
      jobLevel: 2,
      teamId: null,
      teamMemberIds: [],
    });
  });

  it('returns scoped counts, top gaps, trace summaries, and drilldown hrefs', async () => {
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin({
      accounts: [
        { id: 'acc_1', name: 'Acme', org_id: 'org_1' },
        { id: 'acc_2', name: 'Foreign org', org_id: 'org_2' },
        { id: 'acc_empty', name: 'Empty Account', org_id: 'org_1' },
      ],
      email_decodes: [
        { id: 'decode_1', account_id: 'acc_1', org_id: 'org_1' },
        { id: 'decode_2', account_id: 'acc_1', org_id: 'org_1' },
        { id: 'foreign_decode', account_id: 'acc_2', org_id: 'org_2' },
      ],
      strategic_plays: [],
      rfps: [],
      rfp_ai_analyses: [],
      source_records: [
        persistedDecodeRecord(),
        persistedDecodeRecord({ id: 'sr_foreign', org_id: 'org_2', account_id: 'acc_2', source_row_id: 'foreign_decode' }),
      ],
    }));

    const response = await GET(new Request('http://localhost/api/judgment/provenance-gaps?limit=5'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.scope).toMatchObject({ orgId: 'org_1', accounts: 2 });
    expect(JSON.stringify(payload)).not.toContain('acc_2');
    expect(JSON.stringify(payload)).not.toContain('Foreign org');
    expect(payload.counts).toMatchObject({ accounts: 2, persisted: 1, derived: 1, gaps: 2 });
    expect(payload.traceStatusSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'derived', traceCount: 1, accountCount: 1 }),
      expect.objectContaining({ status: 'missing', accountCount: 1 }),
    ]));
    expect(payload.topGapAccounts.map((account: { accountId: string }) => account.accountId)).toEqual(['acc_empty', 'acc_1']);
    expect(payload.topGapAccounts[1]).toMatchObject({
      accountId: 'acc_1',
      traceStatus: 'derived',
      gapKinds: ['decode'],
    });
    expect(payload.topGapAccounts[1].traces[0]).toMatchObject({
      sourceKind: 'decode',
      traceStatus: 'derived',
      sourceRowId: 'decode_2',
      drilldownHref: '/accounts/acc_1?tab=activity&targetKind=email_decode&targetId=decode_2',
    });
    expect(payload.topGapAccounts[0].drilldownHref).toBe('/accounts/acc_empty?tab=knowledge');
  });
});
