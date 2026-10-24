import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH } from './route';
import { requireAccountAccess, requireAdmin, requireAuth, requireOwnership } from '@/lib/api-guard';
import type { PlayExecutionEventRecord } from '@/lib/strategic-play-execution';

vi.mock('@/lib/api-guard', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
  requireOwnership: vi.fn(),
  requireAccountAccess: vi.fn(),
  requireContactAccess: vi.fn(),
  requireOpportunityAccess: vi.fn(),
  guardResponse: (err: unknown) => {
    const status = typeof err === 'object' && err !== null && 'status' in err ? Number((err as { status: unknown }).status) : 500;
    const message = err instanceof Error ? err.message : 'error';
    return Response.json({ error: message }, { status });
  },
}));

vi.mock('@/lib/strategic-play-engine', () => ({
  buildRelationshipGraph: vi.fn(),
  generateStrategicPlay: vi.fn(),
}));

vi.mock('@/lib/knowledge-engine', () => ({ depositKnowledge: vi.fn() }));
vi.mock('@/lib/evidence-memory/server', () => ({ getAccountMemoryPayload: vi.fn(), invalidateAccountCaches: vi.fn() }));
vi.mock('@/lib/evidence-provenance', () => ({ buildMemoryProvenance: vi.fn() }));
vi.mock('@/lib/judgment/memory', () => ({ buildJudgmentMemoryFromStrategicPlay: vi.fn(() => ({ id: 'jm_1' })) }));
vi.mock('@/lib/judgment/persistence', () => ({ persistJudgmentMemorySourceRecord: vi.fn(async () => ({ ok: true })) }));

type TestTableRow = Record<string, unknown>;

type InsertErrorMode = 'none' | 'unavailable';

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/strategic-play', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function matches(row: TestTableRow, filters: Array<[string, unknown]>) {
  return filters.every(([key, value]) => row[key] === value);
}

function makeAdmin(params: { tables: Record<string, TestTableRow[]>; inserted: PlayExecutionEventRecord[]; insertMode?: InsertErrorMode }) {
  const tables = params.tables;
  const insertMode = params.insertMode ?? 'none';

  return {
    from(table: string) {
      const rows = tables[table];
      if (!rows) throw new Error(`unexpected table ${table}`);
      const filters: Array<[string, unknown]> = [];
      let pendingUpdate: Record<string, unknown> | null = null;
      const query = {
        error: null as { message?: string } | null,
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          filters.push([key, value]);
          return query;
        },
        async single() {
          return { data: rows.find((row) => matches(row, filters)) ?? null, error: null };
        },
        async maybeSingle() {
          return { data: rows.find((row) => matches(row, filters)) ?? null, error: null };
        },
        update(payload: Record<string, unknown>) {
          pendingUpdate = payload;
          return query;
        },
        async insert(row: PlayExecutionEventRecord) {
          if (table !== 'source_records') throw new Error(`unexpected insert table ${table}`);
          if (insertMode === 'unavailable') return { error: { message: 'source_records does not exist' } };
          params.inserted.push(row);
          return { error: null };
        },
        then(resolve: (value: { data: null; error: { message?: string } | null }) => void) {
          if (pendingUpdate) {
            for (const row of rows) {
              if (matches(row, filters)) Object.assign(row, pendingUpdate);
            }
          }
          resolve({ data: null, error: null });
        },
      };
      return query;
    },
  } as unknown as ReturnType<typeof requireAdmin>;
}

function play(overrides: TestTableRow = {}): TestTableRow {
  return {
    id: 'play_1',
    org_id: 'org_1',
    account_id: 'acc_1',
    opportunity_id: 'opp_1',
    user_id: 'user_1',
    goal_description: '拿下 Q2 扩容',
    steps: [
      {
        index: 1,
        title: '验证采购评分表',
        description: '让采购解释真实评分标准',
        who: 'AE',
        target: 'Procurement',
        action: '15 分钟电话',
        timing: '本周',
        purpose: '拆掉采购黑箱',
        risk: '对方不说',
        fallback: '找 sponsor',
        status: 'planned',
      },
    ],
    last_step_at: null,
    status: 'active',
    confidence: 70,
    assumptions: [],
    alternative_paths: [],
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('/api/strategic-play PATCH step execution', () => {
  const inserted: PlayExecutionEventRecord[] = [];
  const plays: TestTableRow[] = [];

  beforeEach(() => {
    inserted.length = 0;
    plays.length = 0;
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'member',
      roleLevel: 'member',
      jobLevel: 1,
      teamMemberIds: ['user_1'],
    } as Awaited<ReturnType<typeof requireAuth>>);
    vi.mocked(requireOwnership).mockImplementation(() => undefined);
    vi.mocked(requireAccountAccess).mockResolvedValue(undefined);
  });

  it('updates one strategic play step execution status and writes source_records event', async () => {
    plays.push(play());
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin({ tables: { strategic_plays: plays, source_records: [] }, inserted }));

    const response = await PATCH(request({
      playId: 'play_1',
      accountId: 'acc_1',
      stepIndex: 0,
      executionStatus: 'done',
      actualOutcome: '采购确认 Q2 预算还在',
      nextAction: '让 sponsor 复核商业价值',
      outcomeAssessment: 'unknown',
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.calibration).toMatchObject({ status: 'applied', targetFields: ['steps[0].expectedOutcome'] });
    expect(plays[0].steps).toEqual([
      expect.objectContaining({
        status: 'done',
        actualOutcome: '采购确认 Q2 预算还在',
        actualResult: '采购确认 Q2 预算还在',
        completedAt: expect.any(String),
      }),
    ]);
    expect(plays[0].last_step_at).toEqual(expect.any(String));
    expect(plays[0].days_since_progress).toEqual(expect.any(Number));
    expect(requireAccountAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), 'acc_1');
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'play_execution_event',
      source_table: 'strategic_plays',
      source_row_id: expect.stringContaining('play_1:0:done'),
      metadata: {
        playExecutionEvent: expect.objectContaining({
          playId: 'play_1',
          status: 'done',
          actualOutcome: '采购确认 Q2 预算还在',
        }),
      },
    });
  });

  it('rejects cross-account play execution update', async () => {
    plays.push(play());
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin({ tables: { strategic_plays: plays, source_records: [] }, inserted }));

    const response = await PATCH(request({
      playId: 'play_1',
      accountId: 'acc_other',
      stepIndex: 0,
      executionStatus: 'done',
    }));

    expect(response.status).toBe(403);
    expect(inserted).toHaveLength(0);
    expect(plays[0].steps).toEqual([expect.objectContaining({ status: 'planned' })]);
  });

  it('rejects stale play execution updates before writing step state', async () => {
    plays.push(play({ updated_at: '2026-05-18T20:05:00.000Z' }));
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin({ tables: { strategic_plays: plays, source_records: [] }, inserted }));

    const response = await PATCH(request({
      playId: 'play_1',
      accountId: 'acc_1',
      stepIndex: 0,
      executionStatus: 'done',
      expectedUpdatedAt: '2026-05-18T20:00:00.000Z',
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Strategic Play 已被其他成员更新，请刷新后再保存。' });
    expect(inserted).toHaveLength(0);
    expect(plays[0].steps).toEqual([expect.objectContaining({ status: 'planned' })]);
  });

  it('returns warning when source_records is unavailable but keeps main update', async () => {
    plays.push(play());
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin({
      tables: { strategic_plays: plays, source_records: [] },
      inserted,
      insertMode: 'unavailable',
    }));

    const response = await PATCH(request({
      playId: 'play_1',
      accountId: 'acc_1',
      stepIndex: 0,
      executionStatus: 'blocked',
      blockerReason: '采购拒绝透露评分表',
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.warnings).toContain('source_records_unavailable');
    expect(payload.calibration).toMatchObject({ status: 'skipped', targetFields: ['steps[0].expectedOutcome'] });
    expect(plays[0].steps).toEqual([expect.objectContaining({ status: 'blocked', blockerReason: '采购拒绝透露评分表' })]);
    expect(plays[0].momentum).toBe('blocked');
    expect(inserted).toHaveLength(0);
  });
});
