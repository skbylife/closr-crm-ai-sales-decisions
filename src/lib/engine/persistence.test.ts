import { describe, expect, it, vi } from 'vitest';
import { buildEngineJudgmentSnapshot, type EngineSourceRecord } from './schema';
import { persistEngineJudgmentSnapshot } from './persistence';

const writes: Array<{ sql: string; params: unknown[] | undefined }> = [];

vi.mock('@/lib/postgres', () => ({
  withTransaction: vi.fn(async (fn: (query: (sql: string, params?: unknown[]) => Promise<Array<{id:string}>>) => Promise<unknown>) => fn(async (sql,params) => { writes.push({sql,params}); return [{id:String(params?.[0])}]; })),
}));

const source: EngineSourceRecord = {
  id: 'src_renewal_001',
  tenantId: 'tenant_demo',
  sourceType: 'email',
  accountId: 'acct_customer_a',
  opportunityId: 'opp_aiops_renewal',
  occurredAt: '2026-06-18T12:00:00.000Z',
  content: '今年集团有 5% 年降目标，TCS 报价更低。CFO 需要看到 AIOps 一年回本证明。',
};

describe('engine persistence adapter', () => {
  it('persists snapshot objects and audit event with proposal-only CRM boundary', async () => {
    writes.length = 0;
    const snapshot = buildEngineJudgmentSnapshot({
      tenantId: 'tenant_demo',
      accountId: 'acct_customer_a',
      opportunityId: 'opp_aiops_renewal',
      sources: [source],
    });

    const result = await persistEngineJudgmentSnapshot(snapshot, { actorId: 'service_engine_test' });

    expect(result.snapshotId).toMatch(/^snap_/);
    expect(result.counts).toEqual({
      sources: 1,
      evidenceRefs: snapshot.evidenceRefs.length,
      judgments: 1,
      winGaps: 1,
      moves: 1,
      auditEvents: 1,
    });

    const joinedSql = writes.map((write) => write.sql).join('\n');
    expect(joinedSql).toContain('INSERT INTO engine_source_records');
    expect(joinedSql).toContain('INSERT INTO engine_evidence_refs');
    expect(joinedSql).toContain('INSERT INTO engine_judgments');
    expect(joinedSql).toContain('INSERT INTO engine_win_gaps');
    expect(joinedSql).toContain('INSERT INTO engine_moves');
    expect(joinedSql).toContain('INSERT INTO engine_audit_events');

    const moveWrite = writes.find((write) => write.sql.includes('INSERT INTO engine_moves'));
    expect(moveWrite?.params).toContain(true);
    expect(JSON.stringify(writes)).not.toContain('opportunity.stage');
  });
});
