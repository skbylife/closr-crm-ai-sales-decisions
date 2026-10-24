import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
import { requireAccountAccess, requireAdmin, requireAuth } from '@/lib/api-guard';
import type { WinLossCalibrationSourceRecordRow } from '@/lib/judgment/win-loss-calibration';

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

type SourceRecordTestRow = WinLossCalibrationSourceRecordRow & { id?: string | null };

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/accounts/acc_1/win-loss-calibration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest() {
  return new Request('http://localhost/api/accounts/acc_1/win-loss-calibration?limit=10', { method: 'GET' });
}

function matches(row: TestTableRow, filters: Array<[string, unknown]>) {
  return filters.every(([key, value]) => row[key] === value);
}

function makeAdmin(
  sourceRecords: SourceRecordTestRow[],
  inserted: WinLossCalibrationSourceRecordRow[],
  tables: Record<string, TestTableRow[]> = {},
) {
  const tableRows: Record<string, TestTableRow[]> = {
    ...tables,
    source_records: sourceRecords as unknown as TestTableRow[],
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
        order() {
          return query;
        },
        async limit(limit: number) {
          return { data: rows.filter((row) => matches(row, filters)).slice(0, limit), error: null };
        },
        async maybeSingle() {
          return { data: rows.find((row) => matches(row, filters)) ?? null, error: null };
        },
        async insert(row: WinLossCalibrationSourceRecordRow) {
          if (table !== 'source_records') throw new Error(`unexpected insert table ${table}`);
          inserted.push(row);
          sourceRecords.unshift({ id: `sr_${row.source_row_id}`, ...row });
          return { error: null };
        },
      };
      return query;
    },
  } as unknown as ReturnType<typeof requireAdmin>;
}

describe('/api/accounts/[id]/win-loss-calibration', () => {
  const inserted: WinLossCalibrationSourceRecordRow[] = [];
  const sourceRecords: SourceRecordTestRow[] = [];
  const opportunities: TestTableRow[] = [];

  beforeEach(() => {
    vi.useRealTimers();
    inserted.length = 0;
    sourceRecords.length = 0;
    opportunities.length = 0;
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'admin',
      roleLevel: 'admin',
      jobLevel: 2,
      teamId: null,
      teamMemberIds: [],
    });
    vi.mocked(requireAccountAccess).mockResolvedValue(undefined);
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin(sourceRecords, inserted, {
      opportunities,
      email_decodes: [],
      strategic_plays: [],
      rfps: [],
      rfp_ai_analyses: [],
    }));
  });

  it('persists account-scoped win/loss calibration in source_records', async () => {
    opportunities.push({ id: 'opp_1', org_id: 'org_1', account_id: 'acc_1' });
    sourceRecords.push({
      id: 'sr_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'win_loss_calibration',
      source_table: 'opportunities',
      source_row_id: 'old_opp',
      title: 'old',
      summary: 'old',
      occurred_at: '2026-04-30T12:00:00.000Z',
      metadata: {
        calibration: {
          id: 'cal_old',
          orgId: 'org_1',
          accountId: 'acc_1',
          opportunityId: 'old_opp',
          outcome: 'lost',
          outcomeAt: '2026-04-30T12:00:00.000Z',
          notes: '旧记录',
          validatedSignals: [],
          disprovenSignals: [],
          lessons: ['旧记录'],
          evidenceRefs: [],
          createdAt: '2026-04-30T12:00:00.000Z',
        },
        schemaVersion: 1,
        scopeNote: '',
      },
    });

    const response = await POST(request({
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      outcome: 'won',
      notes: 'Champion 提前拉齐采购，原本的预算风险被验证为可控。',
      evidenceRefs: [{ sourceKind: 'source_record', sourceId: 'sr_1', sourceTable: 'source_records' }],
    }), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.calibration).toMatchObject({
      accountId: 'acc_1',
      orgId: 'org_1',
      opportunityId: 'opp_1',
      outcome: 'won',
      createdBy: 'user_1',
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'win_loss_calibration',
      source_table: 'opportunities',
      source_row_id: 'opp_1',
    });
    expect(inserted[0].metadata.calibration.lessons[0]).toContain('Champion');
    expect(requireAccountAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), 'acc_1');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores forged audit fields and preserves outcomeAt as business time', async () => {
    const serverCreatedAt = '2026-05-01T20:00:00.000Z';
    const clientOutcomeAt = '2026-04-20T10:30:00.000Z';
    vi.useFakeTimers();
    vi.setSystemTime(new Date(serverCreatedAt));

    const response = await POST(request({
      id: 'cal_forged',
      accountId: 'acc_1',
      orgId: 'org_forged',
      outcome: 'lost',
      outcomeAt: clientOutcomeAt,
      notes: '真实结果证明之前高估了 champion 覆盖采购链路。',
      createdBy: 'attacker_user',
      createdAt: '1999-01-01T00:00:00.000Z',
    }), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.calibration).toMatchObject({
      accountId: 'acc_1',
      orgId: 'org_1',
      outcome: 'lost',
      outcomeAt: clientOutcomeAt,
      createdBy: 'user_1',
      createdAt: serverCreatedAt,
    });
    expect(payload.calibration.id).not.toBe('cal_forged');
    expect(inserted).toHaveLength(1);
    expect(inserted[0].source_row_id).toBe(payload.calibration.id);
    expect(inserted[0].metadata.calibration).toMatchObject({
      id: payload.calibration.id,
      orgId: 'org_1',
      createdBy: 'user_1',
      createdAt: serverCreatedAt,
      outcomeAt: clientOutcomeAt,
    });
    expect(inserted[0].metadata.calibration.id).not.toBe('cal_forged');
    expect(inserted[0].metadata.calibration.createdBy).not.toBe('attacker_user');
    expect(inserted[0].metadata.calibration.createdAt).not.toBe('1999-01-01T00:00:00.000Z');
  });

  it('rejects invalid outcome', async () => {
    const response = await POST(request({
      accountId: 'acc_1',
      outcome: 'closed_won',
      notes: '旧 CRM stage 不能直接作为校准 outcome。',
    }), { params: Promise.resolve({ id: 'acc_1' }) });

    expect(response.status).toBe(400);
    expect(inserted).toHaveLength(0);
  });

  it('rejects an opportunity from another account', async () => {
    opportunities.push({ id: 'opp_other', org_id: 'org_1', account_id: 'other_acc' });

    const response = await POST(request({
      accountId: 'acc_1',
      opportunityId: 'opp_other',
      outcome: 'lost',
      notes: '这条商机属于另一个账户，不能作为当前账户校准样本。',
    }), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('opportunity');
    expect(inserted).toHaveLength(0);
  });

  it('rejects source pointers from another account/org', async () => {
    opportunities.push({ id: 'opp_1', org_id: 'org_1', account_id: 'acc_1' });
    sourceRecords.push({
      id: 'sr_other',
      org_id: 'org_1',
      account_id: 'other_acc',
      source_kind: 'win_loss_calibration',
      source_table: 'opportunities',
      source_row_id: 'opp_other',
      title: 'other',
      summary: 'other',
      occurred_at: '2026-04-30T12:00:00.000Z',
      metadata: {
        calibration: {
          id: 'cal_other',
          orgId: 'org_1',
          accountId: 'other_acc',
          opportunityId: 'opp_other',
          outcome: 'lost',
          outcomeAt: '2026-04-30T12:00:00.000Z',
          notes: 'other',
          validatedSignals: [],
          disprovenSignals: [],
          lessons: ['other'],
          evidenceRefs: [],
          createdAt: '2026-04-30T12:00:00.000Z',
        },
        schemaVersion: 1,
        scopeNote: '',
      },
    });

    const response = await POST(request({
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      outcome: 'lost',
      notes: '不能引用其他 account 的 source_records。',
      evidenceRefs: [{ sourceKind: 'source_record', sourceId: 'sr_other', sourceTable: 'source_records' }],
    }), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('source pointer');
    expect(inserted).toHaveLength(0);
  });

  it('returns recent winLossCalibrations via GET', async () => {
    sourceRecords.push({
      id: 'sr_cal_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'win_loss_calibration',
      source_table: 'opportunities',
      source_row_id: 'opp_1',
      title: 'Win/Loss calibration · 丢单',
      summary: '丢单校准：低估采购阻力',
      occurred_at: '2026-05-01T12:00:00.000Z',
      metadata: {
        calibration: {
          id: 'cal_1',
          orgId: 'org_1',
          accountId: 'acc_1',
          opportunityId: 'opp_1',
          outcome: 'lost',
          outcomeAt: '2026-05-01T12:00:00.000Z',
          notes: '低估采购阻力。',
          validatedSignals: [],
          disprovenSignals: ['Champion 强度过度乐观'],
          lessons: ['下次必须提前验证采购路径'],
          evidenceRefs: [],
          createdAt: '2026-05-01T12:00:00.000Z',
        },
        schemaVersion: 1,
        scopeNote: '',
      },
    });

    const response = await GET(getRequest(), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.winLossCalibrations).toHaveLength(1);
    expect(payload.winLossCalibrations[0]).toMatchObject({ id: 'cal_1', accountId: 'acc_1', outcome: 'lost' });
  });

  it('falls back to default GET limit when limit is not numeric', async () => {
    sourceRecords.push({
      id: 'sr_cal_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'win_loss_calibration',
      source_table: 'opportunities',
      source_row_id: 'opp_1',
      title: 'Win/Loss calibration · 丢单',
      summary: '丢单校准：低估采购阻力',
      occurred_at: '2026-05-01T12:00:00.000Z',
      metadata: {
        calibration: {
          id: 'cal_1',
          orgId: 'org_1',
          accountId: 'acc_1',
          opportunityId: 'opp_1',
          outcome: 'lost',
          outcomeAt: '2026-05-01T12:00:00.000Z',
          notes: '低估采购阻力。',
          validatedSignals: [],
          disprovenSignals: ['Champion 强度过度乐观'],
          lessons: ['下次必须提前验证采购路径'],
          evidenceRefs: [],
          createdAt: '2026-05-01T12:00:00.000Z',
        },
        schemaVersion: 1,
        scopeNote: '',
      },
    });

    const response = await GET(
      new Request('http://localhost/api/accounts/acc_1/win-loss-calibration?limit=abc', { method: 'GET' }),
      { params: Promise.resolve({ id: 'acc_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.winLossCalibrations).toHaveLength(1);
  });
});
