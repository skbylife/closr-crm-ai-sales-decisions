import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { requireAccountAccess, requireAdmin, requireAuth } from '@/lib/api-guard';

vi.mock('@/lib/api-guard', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
  requireAccountAccess: vi.fn(),
  requireContactAccess: vi.fn(),
  requireOpportunityAccess: vi.fn(),
  guardResponse: (err: unknown) => {
    const message = err instanceof Error ? err.message : 'error';
    const status = typeof err === 'object' && err !== null && 'status' in err ? Number((err as { status: unknown }).status) : 500;
    return Response.json({ error: message }, { status });
  },
}));

type Row = Record<string, unknown>;

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/decode/play-impact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function matches(row: Row, filters: Array<[string, unknown]>, inFilters: Array<[string, unknown[]]>) {
  return filters.every(([key, value]) => row[key] === value)
    && inFilters.every(([key, values]) => values.includes(row[key]));
}

function makeAdmin(tables: Record<string, Row[]>, writes: { insights: Row[]; notifications: Row[] }) {
  return {
    from(table: string) {
      if (!tables[table]) tables[table] = [];
      const rows = tables[table];
      const filters: Array<[string, unknown]> = [];
      const inFilters: Array<[string, unknown[]]> = [];
      let orFilter: string | null = null;

      const filteredRows = () => {
        let result = rows.filter((row) => matches(row, filters, inFilters));
        if (table === 'strategic_plays' && orFilter?.includes('opportunity_id.eq.')) {
          const opportunityId = orFilter.match(/opportunity_id\.eq\.([^,]+)/)?.[1];
          result = result.filter((row) => row.opportunity_id === opportunityId || row.opportunity_id === null);
        }
        return result;
      };

      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters.push([key, value]); return query; },
        in(key: string, values: unknown[]) { inFilters.push([key, values]); return query; },
        or(value: string) { orFilter = value; return query; },
        async maybeSingle() {
          return { data: filteredRows()[0] ?? null, error: null };
        },
        async upsert(payload: Row) {
          if (table !== 'ai_insights') throw new Error('unexpected upsert table ' + table);
          writes.insights.push(payload);
          return { error: null };
        },
        async insert(payload: Row) {
          if (table !== 'agent_notifications') throw new Error('unexpected insert table ' + table);
          writes.notifications.push(payload);
          return { error: null };
        },
        then(resolve: (value: { data: Row[]; error: null }) => void) {
          resolve({ data: filteredRows(), error: null });
        },
      };
      return query;
    },
  } as unknown as ReturnType<typeof requireAdmin>;
}

describe('/api/decode/play-impact', () => {
  const writes = { insights: [] as Row[], notifications: [] as Row[] };
  const tables: Record<string, Row[]> = {};

  beforeEach(() => {
    writes.insights.length = 0;
    writes.notifications.length = 0;
    tables.source_records = [];
    tables.strategic_plays = [];
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'member',
      roleLevel: 'member',
      jobLevel: 0,
      teamId: null,
      teamMemberIds: [],
    } as Awaited<ReturnType<typeof requireAuth>>);
    vi.mocked(requireAccountAccess).mockResolvedValue(undefined);
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin(tables, writes));
  });

  it('creates a source-backed impact alert for active strategic plays after decode save', async () => {
    tables.source_records.push({
      id: 'sr_decode_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'email_decode',
      source_table: 'email_decodes',
      source_row_id: 'decode_1',
      title: 'Decode · 李总',
      summary: '当前判断：客户要求提前技术评审；最大风险：安全边界材料还没有补齐；下一步：先确认评审口径。',
      occurred_at: '2026-05-17T10:00:00.000Z',
      metadata: {
        judgmentMemory: {
          currentJudgment: '客户要求提前技术评审',
          risk: '安全边界材料还没有补齐',
          uncertainty: '技术评审提前是否会压缩补材料时间仍未确认。',
          nextAction: '先确认评审口径，再补一页安全边界说明。',
        },
      },
    });
    tables.strategic_plays.push({
      id: 'play_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      opportunity_id: null,
      status: 'active',
      user_id: 'owner_1',
      goal_description: '推进 AIOps 三年框架',
      situation_judgment: '客户愿意把续约升级为三年框架',
      strategic_objective: '用技术评审锁定扩容范围',
      assumptions: [{ id: 'a1', text: '技术评审材料会按原节奏通过', status: 'pending' }],
      steps: [{ title: '约架构负责人确认安全边界', status: 'planned' }],
    });

    const res = await POST(request({
      decodeId: 'decode_1',
      accountId: 'acc_1',
      emailText: '李总说技术评审提前到下周，请补安全边界说明。',
      decode: {
        threadAnalysis: {
          keySignal: '客户要求提前技术评审',
          riskLevel: 'medium',
        },
        messages: [{ decode: { meaning: '技术评审节奏提前，需要补安全边界说明。' } }],
      },
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, created: 1 });
    expect(requireAccountAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), 'acc_1');
    expect(writes.insights).toHaveLength(1);
    expect(writes.insights[0]).toMatchObject({
      org_id: 'org_1',
      entity_type: 'strategic_play',
      entity_id: 'play_1',
      insight_type: 'play_impact_alert',
    });
    expect(writes.insights[0].data).toMatchObject({
      impacted: true,
      sourceDecodeId: 'decode_1',
      source: expect.objectContaining({ sourceRecordId: 'sr_decode_1', sourceTable: 'email_decodes' }),
      signalStatement: '客户要求提前技术评审',
      evidence: expect.stringContaining('安全边界材料还没有补齐'),
      question: '技术评审提前是否会压缩补材料时间仍未确认。',
      nextMove: '先确认评审口径，再补一页安全边界说明。',
      routeChangeProposal: expect.objectContaining({
        status: 'proposed',
        requiresHumanConfirmation: true,
        triggerKind: 'decode_signal',
        proposedMoveDelta: expect.objectContaining({
          currentMoveTitle: '约架构负责人确认安全边界',
          proposedNextMove: '先确认评审口径，再补一页安全边界说明。',
        }),
        proposedVersion: expect.objectContaining({
          version: 1,
          triggerKind: 'decode_signal',
          diffSummary: expect.stringContaining('新信号「客户要求提前技术评审」影响'),
        }),
      }),
    });
    expect(writes.notifications[0]).toMatchObject({
      org_id: 'org_1',
      user_id: 'owner_1',
      type: 'play_assumption_alert',
      priority: 'medium',
      title: '新信号可能影响当前谋局',
    });
  });

  it('does not use source_records from another account as alert evidence', async () => {
    tables.source_records.push({
      id: 'sr_other_account',
      org_id: 'org_1',
      account_id: 'acc_2',
      source_kind: 'email_decode',
      source_table: 'email_decodes',
      source_row_id: 'decode_1',
      title: 'Other account decode',
      summary: '不应被当前 account 使用',
      occurred_at: '2026-05-17T10:00:00.000Z',
      metadata: { judgmentMemory: { currentJudgment: '错误客户判断' } },
    });
    tables.strategic_plays.push({
      id: 'play_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      opportunity_id: null,
      status: 'active',
      user_id: 'owner_1',
      goal_description: '推进扩容',
      assumptions: [],
      steps: [],
    });

    const res = await POST(request({
      decodeId: 'decode_1',
      accountId: 'acc_1',
      emailText: '客户要求下周确认技术评审。',
      decode: {
        threadAnalysis: {
          keySignal: '客户要求下周确认技术评审',
          riskLevel: 'low',
        },
        messages: [{ decode: { meaning: '客户仍在推进评估。' } }],
      },
    }));

    expect(res.status).toBe(200);
    expect(writes.insights).toHaveLength(1);
    expect(writes.insights[0].data).toMatchObject({
      source: expect.objectContaining({ sourceRecordId: null, sourceRowId: 'decode_1' }),
      signalStatement: '客户要求下周确认技术评审',
    });
    expect(JSON.stringify(writes.insights[0].data)).not.toContain('错误客户判断');
    expect(JSON.stringify(writes.insights[0].data)).not.toContain('不应被当前 account 使用');
  });
});
