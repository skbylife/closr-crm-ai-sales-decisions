import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { JudgmentMemoryInput, JudgmentMemorySourceRecordRow } from './memory';
import { buildJudgmentMemoryFromRfpAnalysis } from './memory';
import { persistJudgmentMemorySourceRecord } from './persistence';
import type { RfpJudgment } from '@/lib/babel-engine/types';

type ExistingSourceRecordRow = Omit<Partial<JudgmentMemorySourceRecordRow>, 'account_id' | 'source_table' | 'metadata'> & {
  id?: string;
  account_id?: string | null;
  source_table?: string | null;
  metadata?: Record<string, unknown> | null;
};

function sampleMemory(overrides: Partial<JudgmentMemoryInput> = {}): JudgmentMemoryInput {
  return {
    sourceKind: 'decode',
    sourceId: 'decode_1',
    accountId: 'account_1',
    title: 'Decode 判断',
    currentJudgment: '客户正在推进，但需要确认采购人。',
    risk: '真实决策链还不完整。',
    nextAction: '确认采购人和下一次会议。',
    confidence: 0.72,
    uncertainty: '仍需验证采购流程。',
    evidenceRefs: [{ sourceId: 'decode_1', sourceKind: 'email_decode', title: '邮件解读' }],
    provisional: true,
    createdAt: '2026-04-30T00:00:00.000Z',
    ...overrides,
  };
}

class FakeSourceRecordsQuery {
  private filters = new Map<string, string>();

  constructor(private rows: ExistingSourceRecordRow[], private upserts: JudgmentMemorySourceRecordRow[]) {}

  select() {
    return this;
  }

  eq(column: string, value: string) {
    this.filters.set(column, value);
    return this;
  }

  async maybeSingle() {
    const row = this.rows.find((candidate) => (
      candidate.org_id === this.filters.get('org_id')
      && candidate.source_kind === this.filters.get('source_kind')
      && candidate.source_row_id === this.filters.get('source_row_id')
    ));
    return { data: row ?? null, error: null };
  }

  async upsert(row: JudgmentMemorySourceRecordRow) {
    this.upserts.push(row);
    const index = this.rows.findIndex((candidate) => (
      candidate.org_id === row.org_id
      && candidate.source_kind === row.source_kind
      && candidate.source_row_id === row.source_row_id
    ));
    if (index >= 0) {
      this.rows[index] = { ...this.rows[index], ...row };
    } else {
      this.rows.push({ id: `sr_${this.rows.length + 1}`, ...row });
    }
    return { error: null };
  }
}

function fakeAdmin(rows: ExistingSourceRecordRow[] = []) {
  const upserts: JudgmentMemorySourceRecordRow[] = [];
  const admin = {
    from(table: string) {
      if (table !== 'source_records') throw new Error(`Unexpected table ${table}`);
      return new FakeSourceRecordsQuery(rows, upserts);
    },
  } as unknown as SupabaseClient;
  return { admin, rows, upserts };
}

describe('persistJudgmentMemorySourceRecord', () => {
  it('upserts idempotently by org/source kind/source id', async () => {
    const { admin, rows, upserts } = fakeAdmin();
    const memory = sampleMemory();

    const first = await persistJudgmentMemorySourceRecord({
      admin,
      orgId: 'org_1',
      judgmentMemory: memory,
      sourceTable: 'email_decodes',
      expectedAccountId: 'account_1',
    });
    const firstMetadata = JSON.stringify(upserts[0].metadata);

    const second = await persistJudgmentMemorySourceRecord({
      admin,
      orgId: 'org_1',
      judgmentMemory: memory,
      sourceTable: 'email_decodes',
      expectedAccountId: 'account_1',
    });

    expect(first.status).toBe('persisted');
    expect(second.status).toBe('persisted');
    expect(rows).toHaveLength(1);
    expect(upserts).toHaveLength(2);
    expect(JSON.stringify(upserts[1].metadata)).toBe(firstMetadata);
    expect(upserts[1].source_row_id).toBe('decode_1');
  });

  it('preserves old metadata while replacing judgmentMemory and evidence refs', async () => {
    const rows: ExistingSourceRecordRow[] = [{
      id: 'sr_1',
      org_id: 'org_1',
      account_id: 'account_1',
      source_kind: 'email_decode',
      source_table: 'email_decodes',
      source_row_id: 'decode_1',
      metadata: {
        customFlag: 'keep-me',
        judgmentMemory: { sourceId: 'old' },
        evidenceRefs: [{ sourceId: 'old', sourceKind: 'email_decode' }],
      },
    }];
    const { admin, upserts } = fakeAdmin(rows);
    const memory = sampleMemory({ currentJudgment: '新的判断已经形成。' });

    const result = await persistJudgmentMemorySourceRecord({
      admin,
      orgId: 'org_1',
      judgmentMemory: memory,
      sourceTable: 'email_decodes',
      expectedAccountId: 'account_1',
      extraMetadata: {
        matchedContactId: 'contact_1',
        decodeStability: {
          schemaVersion: 1,
          summary: {
            status: 'same_judgment',
            unstable: false,
            judgmentChanged: false,
            contextChanged: false,
            snapshotAvailable: true,
            inputFingerprint: 'fp_input',
            contextFingerprint: 'fp_context',
            changedFields: [],
          },
        },
      },
    });

    expect(result.status).toBe('persisted');
    expect(upserts[0].metadata.customFlag).toBe('keep-me');
    expect(upserts[0].metadata.matchedContactId).toBe('contact_1');
    expect((upserts[0].metadata.decodeStability as { summary: { inputFingerprint: string } }).summary.inputFingerprint).toBe('fp_input');
    expect((upserts[0].metadata.judgmentMemory as JudgmentMemoryInput).currentJudgment).toBe('新的判断已经形成。');
    expect(upserts[0].metadata.evidenceRefs).toEqual(memory.evidenceRefs);
  });

  it('skips mismatched account or source table instead of overwriting another source', async () => {
    const { admin, upserts } = fakeAdmin([{
      id: 'sr_1',
      org_id: 'org_1',
      account_id: 'other_account',
      source_kind: 'email_decode',
      source_table: 'email_decodes',
      source_row_id: 'decode_1',
      metadata: {},
    }]);

    const accountMismatch = await persistJudgmentMemorySourceRecord({
      admin,
      orgId: 'org_1',
      judgmentMemory: sampleMemory(),
      sourceTable: 'email_decodes',
      expectedAccountId: 'account_1',
    });

    const sourceTableMismatch = await persistJudgmentMemorySourceRecord({
      admin,
      orgId: 'org_1',
      judgmentMemory: sampleMemory(),
      sourceTable: 'rfp_ai_analyses',
      expectedAccountId: 'account_1',
    });

    expect(accountMismatch.status).toBe('skipped');
    expect(accountMismatch.reason).toBe('source_account_mismatch');
    expect(sourceTableMismatch.status).toBe('skipped');
    expect(sourceTableMismatch.reason).toBe('source_table_mismatch');
    expect(upserts).toHaveLength(0);
  });

  it('does not claim nullable legacy conflict rows unless metadata proves the same judgment source', async () => {
    const { admin, upserts } = fakeAdmin([{
      id: 'sr_1',
      org_id: 'org_1',
      account_id: null,
      source_kind: 'email_decode',
      source_table: null,
      source_row_id: 'decode_1',
      metadata: { customFlag: 'legacy-row' },
    }]);

    const result = await persistJudgmentMemorySourceRecord({
      admin,
      orgId: 'org_1',
      judgmentMemory: sampleMemory(),
      sourceTable: 'email_decodes',
      expectedAccountId: 'account_1',
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('source_account_mismatch');
    expect(upserts).toHaveLength(0);
  });

  it('can repair nullable legacy rows when metadata already identifies the same judgment source', async () => {
    const memory = sampleMemory();
    const { admin, upserts } = fakeAdmin([{
      id: 'sr_1',
      org_id: 'org_1',
      account_id: null,
      source_kind: 'email_decode',
      source_table: null,
      source_row_id: 'decode_1',
      metadata: { judgmentMemory: memory, customFlag: 'keep-me' },
    }]);

    const result = await persistJudgmentMemorySourceRecord({
      admin,
      orgId: 'org_1',
      judgmentMemory: memory,
      sourceTable: 'email_decodes',
      expectedAccountId: 'account_1',
    });

    expect(result.status).toBe('persisted');
    expect(upserts).toHaveLength(1);
    expect(upserts[0].account_id).toBe('account_1');
    expect(upserts[0].source_table).toBe('email_decodes');
    expect(upserts[0].metadata.customFlag).toBe('keep-me');
  });
});

describe('buildJudgmentMemoryFromRfpAnalysis', () => {
  it('tolerates historical RFP judgments with missing array fields', () => {
    const dirtyJudgment = {
      decision: 'need_more_intel',
      confidence: 42,
      rationale: '缺少评分规则，暂时只能先补情报。',
      uncertainty: '需要确认真实采购标准。',
    } as unknown as RfpJudgment;

    const memory = buildJudgmentMemoryFromRfpAnalysis({
      rfp: { id: 'rfp_1', account_id: 'account_1', title: '历史 RFP', due_date: null },
      analysis: { id: 'analysis_1', created_at: '2026-04-30T00:00:00.000Z' },
      judgment: dirtyJudgment,
      recommendations: ['先补齐评分规则'],
      weaknesses: ['评分规则未知'],
      winProbability: 40,
    });

    expect(memory.sourceKind).toBe('rfp_analysis');
    expect(memory.sourceId).toBe('analysis_1');
    expect(memory.risk).toContain('评分规则未知');
    expect(memory.provisional).toBe(true);
  });
});
