import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeRecordTaskOutcome } from './task-outcome';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getOrgIdForUser } from '@/lib/get-org-id';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/get-org-id', () => ({ getOrgIdForUser: vi.fn() }));

type Row = Record<string, unknown>;

function makeSelectQuery(rows: Row[]) {
  const filters: Array<[string, unknown]> = [];
  const query = {
    select() { return query; },
    eq(key: string, value: unknown) { filters.push([key, value]); return query; },
    async maybeSingle() {
      const row = rows.find((candidate) => filters.every(([key, value]) => candidate[key] === value));
      return { data: row ?? null, error: null };
    },
  };
  return query;
}

function makeInsertQuery(inserts: Row[]) {
  return {
    select() { return this; },
    async single() { return { data: { id: 'sr_task_outcome_1' }, error: null }; },
    insert(row: Row) {
      inserts.push(row);
      return this;
    },
  };
}

describe('executeRecordTaskOutcome', () => {
  const tasks: Row[] = [];
  const sourceRecords: Row[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    tasks.length = 0;
    sourceRecords.length = 0;
    tasks.push({
      id: 'task_1',
      title: '跟进李总确认评审时间',
      status: 'todo',
      org_id: 'org_1',
      account_id: 'acc_1',
      opportunity_id: 'opp_1',
      contact_id: 'con_1',
    });
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user_1' } } }) },
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(getOrgIdForUser).mockResolvedValue('org_1');
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from(table: string) {
        if (table === 'tasks') return makeSelectQuery(tasks);
        if (table === 'source_records') return makeInsertQuery(sourceRecords);
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as ReturnType<typeof getSupabaseAdmin>);
  });

  it('writes a task_outcome source_record after confirmation', async () => {
    const result = await executeRecordTaskOutcome({
      taskId: 'task_1',
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      contactId: 'con_1',
      outcome: 'completed',
      outcomeNote: '李总同意下周评审',
      reason: '李总同意下周评审',
      source_quote: '刚才那个跟进任务完成了，因为李总同意下周评审',
    });

    expect(result.success).toBe(true);
    expect(sourceRecords).toHaveLength(1);
    expect(sourceRecords[0]).toMatchObject({
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'task_outcome',
      source_table: 'tasks',
      title: '任务执行反馈 · 完成',
      summary: '完成：李总同意下周评审',
    });
    expect(sourceRecords[0].source_row_id).toEqual(expect.stringMatching(/^task_1:/));
    expect(sourceRecords[0].source_row_id).not.toBe('task_1');
    expect(sourceRecords[0].metadata).toMatchObject({
      taskId: 'task_1',
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      contactId: 'con_1',
      outcome: 'completed',
      previousTaskStatus: 'todo',
      judgmentImpact: '验证了下一步动作有效',
      evidenceRefs: [],
      createdBy: 'user_1',
    });
  });

  it('allows multiple task_outcome records for the same task without source_row_id conflicts', async () => {
    const delayed = await executeRecordTaskOutcome({
      taskId: 'task_1',
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      contactId: 'con_1',
      outcome: 'delayed',
      outcomeNote: '客户没回复，任务延期',
      reason: '客户没回复',
      source_quote: '任务延期了，因为客户没回复',
    });
    const completed = await executeRecordTaskOutcome({
      taskId: 'task_1',
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      contactId: 'con_1',
      outcome: 'completed',
      outcomeNote: '客户已确认评审时间',
      reason: '客户已确认评审时间',
      source_quote: '任务完成了，客户已确认评审时间',
    });

    expect(delayed.success).toBe(true);
    expect(completed.success).toBe(true);
    expect(sourceRecords).toHaveLength(2);
    expect(sourceRecords.map((row) => row.source_row_id)).toHaveLength(2);
    expect(new Set(sourceRecords.map((row) => row.source_row_id)).size).toBe(2);
    expect(sourceRecords.map((row) => (row.metadata as Row).taskId)).toEqual(['task_1', 'task_1']);
    expect(sourceRecords.map((row) => (row.metadata as Row).outcome)).toEqual(['delayed', 'completed']);
  });
});
