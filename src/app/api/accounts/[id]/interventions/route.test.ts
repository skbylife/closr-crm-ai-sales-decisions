import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { requireAccountAccess, requireAdmin, requireAuth } from '@/lib/api-guard';
import type { JudgmentInterventionSourceRecordRow } from '@/lib/judgment/intervention';

vi.mock('@/lib/api-guard', () => ({
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

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/accounts/acc_1/interventions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function matches(row: TestTableRow, filters: Array<[string, unknown]>) {
  return filters.every(([key, value]) => row[key] === value);
}

function makeAdmin(inserted: JudgmentInterventionSourceRecordRow[], tables: Record<string, TestTableRow[]>) {
  const tableRows: Record<string, TestTableRow[]> = {
    source_records: [],
    opportunities: [],
    ...tables,
  };

  return {
    from(table: string) {
      const rows = tableRows[table];
      if (!rows) throw new Error(`unexpected table ${table}`);
      const filters: Array<[string, unknown]> = [];
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          filters.push([key, value]);
          return query;
        },
        async maybeSingle() {
          return { data: rows.find((row) => matches(row, filters)) ?? null, error: null };
        },
        async insert(row: JudgmentInterventionSourceRecordRow) {
          if (table !== 'source_records') throw new Error(`unexpected insert table ${table}`);
          inserted.push(row);
          return { error: null };
        },
      };
      return query;
    },
  } as unknown as ReturnType<typeof requireAdmin>;
}

describe('/api/accounts/[id]/interventions', () => {
  const inserted: JudgmentInterventionSourceRecordRow[] = [];
  const opportunities: TestTableRow[] = [];
  const sourceRecords: TestTableRow[] = [];

  beforeEach(() => {
    inserted.length = 0;
    opportunities.length = 0;
    sourceRecords.length = 0;
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
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin(inserted, { opportunities, source_records: sourceRecords }));
  });

  it('persists a manager intervention in source_records', async () => {
    opportunities.push({ id: 'opp_1', org_id: 'org_1', account_id: 'acc_1' });

    const response = await POST(request({
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      signalId: 'verify:opp_1',
      type: 'manager_intervention',
      action: 'verify_evidence',
      status: 'completed',
      role: 'manager',
      reason: '证据不足，不能直接升级。',
      recommendedAction: '核实采购 owner。',
      outcomeNote: '已要求 AE 明天补证据。',
    }), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.intervention).toMatchObject({
      accountId: 'acc_1',
      orgId: 'org_1',
      opportunityId: 'opp_1',
      type: 'manager_intervention',
      action: 'verify_evidence',
      createdBy: 'user_1',
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'manager_intervention',
      source_table: 'opportunities',
      source_row_id: 'opp_1',
    });
    expect(inserted[0].metadata.intervention.reason).toBe('证据不足，不能直接升级。');
    expect(requireAccountAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), 'acc_1');
  });

  it('rejects an opportunity from another account', async () => {
    opportunities.push({ id: 'opp_other', org_id: 'org_1', account_id: 'other_acc' });

    const response = await POST(request({
      accountId: 'acc_1',
      opportunityId: 'opp_other',
      type: 'manager_intervention',
      action: 'coach_ae',
      reason: '需要辅导 AE。',
      recommendedAction: '做 deal review。',
    }), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('opportunity');
    expect(inserted).toHaveLength(0);
  });

  it('rejects executive intervention for non-executive/non-admin users', async () => {
    opportunities.push({ id: 'opp_1', org_id: 'org_1', account_id: 'acc_1' });

    const response = await POST(request({
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      type: 'executive_intervention',
      action: 'assign_sponsor',
      reason: '高价值机会需要 sponsor。',
      recommendedAction: '指派 CRO sponsor。',
    }), { params: Promise.resolve({ id: 'acc_1' }) });

    expect(response.status).toBe(403);
    expect(inserted).toHaveLength(0);
  });

  it('allows executive intervention for jobLevel >= 2', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'exec_1',
      orgId: 'org_1',
      orgRole: 'member',
      roleLevel: 'member',
      jobLevel: 2,
      teamId: null,
      teamMemberIds: [],
    });
    opportunities.push({ id: 'opp_1', org_id: 'org_1', account_id: 'acc_1' });

    const response = await POST(request({
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      type: 'executive_intervention',
      action: 'assign_sponsor',
      reason: '高价值机会需要 sponsor。',
      recommendedAction: '指派 CRO sponsor。',
    }), { params: Promise.resolve({ id: 'acc_1' }) });

    expect(response.status).toBe(201);
    expect(inserted[0]).toMatchObject({ source_kind: 'executive_intervention' });
  });
});
