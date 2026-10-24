import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { requireAccountAccess, requireAdmin, requireAuth } from '@/lib/api-guard';
import type { InterventionOutcomeSourceRecordRow } from '@/lib/judgment/intervention-learning';

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
  return new Request('http://localhost/api/accounts/acc_1/intervention-outcomes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function matches(row: TestTableRow, filters: Array<[string, unknown]>) {
  return filters.every(([key, value]) => row[key] === value);
}

function makeAdmin(inserted: InterventionOutcomeSourceRecordRow[], tables: Record<string, TestTableRow[]>) {
  const tableRows: Record<string, TestTableRow[]> = {
    source_records: [],
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
        async insert(row: InterventionOutcomeSourceRecordRow) {
          if (table !== 'source_records') throw new Error(`unexpected insert table ${table}`);
          inserted.push(row);
          return { error: null };
        },
      };
      return query;
    },
  } as unknown as ReturnType<typeof requireAdmin>;
}

function managerInterventionRow(overrides: TestTableRow = {}): TestTableRow {
  return {
    id: 'sr_intervention_1',
    org_id: 'org_1',
    account_id: 'acc_1',
    source_kind: 'manager_intervention',
    source_table: 'opportunities',
    source_row_id: 'opp_1',
    occurred_at: '2026-05-01T14:00:00.000Z',
    created_at: '2026-05-01T14:00:00.000Z',
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
        reason: '证据不足，不能直接升级。',
        recommendedAction: '补一条一手证据。',
        evidenceRefs: [],
        createdAt: '2026-05-01T14:00:00.000Z',
      },
    },
    ...overrides,
  };
}

function outcomeBody(overrides: Record<string, unknown> = {}) {
  return {
    accountId: 'acc_1',
    opportunityId: 'opp_1',
    interventionId: 'int_1',
    sourceRecordId: 'sr_intervention_1',
    outcome: 'effective',
    impact: 'evidence_improved',
    confidence: 0.8,
    outcomeNote: 'AE 补回一手采购 owner 证据。',
    learningSummary: '先核验证据比直接升级更有效。',
    evidenceRefs: [],
    ...overrides,
  };
}

describe('/api/accounts/[id]/intervention-outcomes', () => {
  const inserted: InterventionOutcomeSourceRecordRow[] = [];
  const sourceRecords: TestTableRow[] = [];

  beforeEach(() => {
    inserted.length = 0;
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
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin(inserted, { source_records: sourceRecords }));
  });

  it('persists an intervention outcome in source_records', async () => {
    sourceRecords.push(managerInterventionRow());

    const response = await POST(request(outcomeBody()), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.interventionOutcome).toMatchObject({
      accountId: 'acc_1',
      orgId: 'org_1',
      interventionId: 'int_1',
      sourceRecordId: 'sr_intervention_1',
      outcome: 'effective',
      impact: 'evidence_improved',
      createdBy: 'user_1',
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'intervention_outcome',
      source_table: 'source_records',
    });
    expect(inserted[0].metadata.interventionOutcome.evidenceRefs[0]).toMatchObject({ sourceRowId: 'sr_intervention_1' });
    expect(requireAccountAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), 'acc_1');
  });

  it('rejects outcome when original intervention source_record does not exist', async () => {
    const response = await POST(request(outcomeBody()), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toContain('原介入');
    expect(inserted).toHaveLength(0);
  });

  it('rejects outcome for a source_record from another account', async () => {
    sourceRecords.push(managerInterventionRow({ account_id: 'other_acc' }));

    const response = await POST(request(outcomeBody()), { params: Promise.resolve({ id: 'acc_1' }) });

    expect(response.status).toBe(404);
    expect(inserted).toHaveLength(0);
  });

  it('rejects mismatched intervention id', async () => {
    sourceRecords.push(managerInterventionRow());

    const response = await POST(request(outcomeBody({ interventionId: 'int_other' })), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('不匹配');
    expect(inserted).toHaveLength(0);
  });

  it('rejects executive intervention outcome for non-executive/non-admin users', async () => {
    sourceRecords.push(managerInterventionRow({
      source_kind: 'executive_intervention',
      metadata: {
        intervention: {
          id: 'int_1',
          orgId: 'org_1',
          accountId: 'acc_1',
          opportunityId: 'opp_1',
          type: 'executive_intervention',
          action: 'assign_sponsor',
          status: 'planned',
          reason: '高价值机会需要 sponsor。',
          recommendedAction: '指派 CRO sponsor。',
          evidenceRefs: [],
          createdAt: '2026-05-01T14:00:00.000Z',
        },
      },
    }));

    const response = await POST(request(outcomeBody()), { params: Promise.resolve({ id: 'acc_1' }) });

    expect(response.status).toBe(403);
    expect(inserted).toHaveLength(0);
  });
});
