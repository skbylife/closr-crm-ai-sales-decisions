import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecodeOutput } from '@/lib/babel-engine/types';
import type { JudgmentMemorySourceRecordRow } from '@/lib/judgment/memory';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
  requireAccountAccess: vi.fn(),
  guardResponse: vi.fn((err: unknown) => { throw err; }),
  invalidateAccountCaches: vi.fn(),
}));

vi.mock('@/lib/api-guard', () => ({
  requireAuth: mocks.requireAuth,
  requireAdmin: mocks.requireAdmin,
  requireAccountAccess: mocks.requireAccountAccess,
  guardResponse: mocks.guardResponse,
}));

vi.mock('@/lib/evidence-memory/server', () => ({
  invalidateAccountCaches: mocks.invalidateAccountCaches,
}));

type EmailDecodeRow = {
  id: string;
  org_id: string;
  account_id: string | null;
  account_name: string | null;
  client_name: string | null;
  date: string | null;
  decode: DecodeOutput | null;
  matched_contact_id?: string | null;
  opportunity_id?: string | null;
};

type SourceRecordExistingRow = Partial<JudgmentMemorySourceRecordRow> & { id?: string };

type AdminState = {
  emailDecodes: EmailDecodeRow[];
  sourceRecords: SourceRecordExistingRow[];
  upserts: JudgmentMemorySourceRecordRow[];
};

class FakeQuery<Row extends Record<string, unknown>> {
  private filters = new Map<string, unknown>();

  constructor(private table: string, private state: AdminState) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.set(column, value);
    return this;
  }

  async maybeSingle() {
    if (this.table === 'email_decodes') {
      return { data: this.find(this.state.emailDecodes as unknown as Row[]) ?? null, error: null };
    }
    if (this.table === 'source_records') {
      return { data: this.find(this.state.sourceRecords as unknown as Row[]) ?? null, error: null };
    }
    throw new Error(`Unexpected maybeSingle table ${this.table}`);
  }

  async upsert(row: JudgmentMemorySourceRecordRow) {
    if (this.table !== 'source_records') throw new Error(`Unexpected upsert table ${this.table}`);
    this.state.upserts.push(row);
    this.state.sourceRecords.push({ id: `sr_${this.state.sourceRecords.length + 1}`, ...row });
    return { error: null };
  }

  private find(rows: Row[]) {
    return rows.find((row) => [...this.filters].every(([column, value]) => row[column] === value));
  }
}

function makeAdmin(state: AdminState) {
  return {
    from(table: string) {
      if (table !== 'email_decodes' && table !== 'source_records') throw new Error(`Unexpected table ${table}`);
      return new FakeQuery(table, state);
    },
  };
}

function sampleDecode(): DecodeOutput {
  return {
    messages: [{
      speaker: 'them',
      original: '可以推进，但 CFO 要看 ROI。',
      decode: { meaning: '客户愿意推进，但 CFO 是下一关。', emotion: '谨慎积极', urgency: 8, confidence: 0.86 },
    }],
    threadAnalysis: {
      sentimentTrend: 'warming',
      riskLevel: 'medium',
      buyerState: 'evaluating',
      keySignal: '客户愿意推进，但 CFO 需要 ROI 证据。',
    },
    actionItems: [{ title: '48小时内发送 CFO 版 ROI 摘要', priority: 'high', dueInDays: 2, reasoning: '回应下一关口' }],
    stableJudgment: {
      schema_version: 'stable_decode_judgment_v1',
      intent: 'evaluation',
      momentum_or_temperature: 'warming',
      risk: 'medium',
      confidence: 0.86,
      evidence: [{ id: 'input:1', source: 'input', summary: 'CFO 要看 ROI。' }],
      uncertainty: ['仍需确认 CFO 标准。'],
      recommended_next_action: '48小时内发送 CFO 版 ROI 摘要',
    },
  };
}

async function postDecodeJudgmentMemory(body: unknown) {
  const { POST } = await import('@/app/api/decode/judgment-memory/route');
  return POST(new Request('http://localhost/api/decode/judgment-memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

describe('/api/decode/judgment-memory', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'member',
      jobLevel: 0,
      teamId: null,
      teamMemberIds: ['user_1'],
    });
    mocks.requireAccountAccess.mockResolvedValue(undefined);
    mocks.invalidateAccountCaches.mockReset();
  });

  it('persists saved decode output into scoped judgment source_records and invalidates account cache', async () => {
    const state: AdminState = {
      emailDecodes: [{
        id: 'decode_1',
        org_id: 'org_1',
        account_id: 'acc_1',
        account_name: '测试客户',
        client_name: '李总',
        date: '2026-05-01T12:00:00.000Z',
        decode: sampleDecode(),
        matched_contact_id: 'contact_1',
        opportunity_id: 'opp_1',
      }],
      sourceRecords: [],
      upserts: [],
    };
    mocks.requireAdmin.mockReturnValue(makeAdmin(state));

    const response = await postDecodeJudgmentMemory({ decodeId: 'decode_1', accountId: 'acc_1' });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.judgmentMemory).toMatchObject({ sourceKind: 'decode', sourceId: 'decode_1', accountId: 'acc_1' });
    expect(mocks.requireAccountAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), 'acc_1');
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0]).toMatchObject({
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'email_decode',
      source_table: 'email_decodes',
      source_row_id: 'decode_1',
      metadata: {
        sourceKind: 'decode',
        matchedContactId: 'contact_1',
        opportunityId: 'opp_1',
        judgmentMemory: { sourceKind: 'decode', sourceId: 'decode_1', accountId: 'acc_1' },
      },
    });
    expect(state.upserts[0].metadata.evidenceRefs).toEqual([
      expect.objectContaining({ sourceTable: 'email_decodes', sourceRowId: 'decode_1' }),
    ]);
    expect(state.upserts[0].metadata.decodeStability).toMatchObject({
      schemaVersion: 1,
      summary: {
        unstable: false,
        judgmentChanged: false,
        contextChanged: false,
        snapshotAvailable: false,
        changedFields: [],
      },
    });
    expect(body.sourceRecord).toMatchObject({
      account_id: 'acc_1',
      source_table: 'email_decodes',
      source_row_id: 'decode_1',
      metadata: {
        decodeStability: expect.objectContaining({ schemaVersion: 1 }),
      },
    });
    expect(mocks.invalidateAccountCaches).toHaveBeenCalledWith('acc_1', 'org_1');
  });

  it('does not persist when the requested account scope does not match the saved decode row', async () => {
    const state: AdminState = {
      emailDecodes: [{
        id: 'decode_2',
        org_id: 'org_1',
        account_id: 'acc_other',
        account_name: '其他客户',
        client_name: '王总',
        date: '2026-05-01T12:00:00.000Z',
        decode: sampleDecode(),
      }],
      sourceRecords: [],
      upserts: [],
    };
    mocks.requireAdmin.mockReturnValue(makeAdmin(state));

    const response = await postDecodeJudgmentMemory({ decodeId: 'decode_2', accountId: 'acc_1' });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ skipped: true, reason: 'decode_has_no_account', judgmentMemory: null });
    expect(state.upserts).toHaveLength(0);
    expect(mocks.invalidateAccountCaches).not.toHaveBeenCalled();
  });
});
