import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { requireAdmin } from '@/lib/api-guard';
import { persistStrategicPlayJudgmentMemoryById } from '@/lib/strategic-play-judgment-memory';
import {
  updateStrategicPlayStatus,
  updateStrategicPlayStepPreparationChecklist,
  updateStrategicPlayV2RouteState,
} from '@/lib/strategic-play-mutations';

vi.mock('@/lib/strategic-play-judgment-memory', () => ({
  persistStrategicPlayJudgmentMemoryById: vi.fn(),
}));

type TestTableRow = Record<string, unknown>;

function matches(row: TestTableRow, filters: Array<[string, unknown]>) {
  return filters.every(([key, value]) => row[key] === value);
}

function makeAdmin(params: { tables: Record<string, TestTableRow[]>; updateError?: { message: string } }) {
  const tables = params.tables;

  return {
    from(table: string) {
      const rows = tables[table];
      if (!rows) throw new Error(`unexpected table ${table}`);
      const filters: Array<[string, unknown]> = [];
      let pendingUpdate: Record<string, unknown> | null = null;
      const query = {
        select() {
          return query;
        },
        update(payload: Record<string, unknown>) {
          pendingUpdate = payload;
          return query;
        },
        eq(key: string, value: unknown) {
          filters.push([key, value]);
          return query;
        },
        async single() {
          return { data: rows.find((row) => matches(row, filters)) ?? null, error: null };
        },
        then(resolve: (value: { data: null; error: { message: string } | null }) => void) {
          if (pendingUpdate && !params.updateError) {
            for (const row of rows) {
              if (matches(row, filters)) Object.assign(row, pendingUpdate);
            }
          }
          resolve({ data: null, error: params.updateError ?? null });
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
    status: 'active',
    updated_at: '2026-05-18T20:00:00.000Z',
    steps: [
      { title: '验证采购评分表', status: 'planned' },
      { title: '推动 sponsor 复核', status: 'planned' },
    ],
    ...overrides,
  };
}

describe('strategic-play simple mutation helpers', () => {
  beforeEach(() => {
    vi.mocked(persistStrategicPlayJudgmentMemoryById).mockReset();
  });

  it('updates play status and keeps ok response shape with judgment memory but no warnings', async () => {
    const judgmentMemory = {
      sourceKind: 'strategic_play' as const,
      sourceId: 'play_1',
      accountId: 'acc_1',
      currentJudgment: '继续推进',
      risk: '采购不透明',
      nextAction: '准备 ROI 证据',
      confidence: 0.7,
      uncertainty: '采购标准未确认',
      evidenceRefs: [],
      provisional: true,
      createdAt: '2026-05-06T00:00:00.000Z',
    };
    vi.mocked(persistStrategicPlayJudgmentMemoryById).mockResolvedValue(judgmentMemory);
    const plays = [play()];
    const admin = makeAdmin({ tables: { strategic_plays: plays } });

    const result = await updateStrategicPlayStatus({
      admin,
      orgId: 'org_1',
      playId: 'play_1',
      status: 'completed',
    });

    expect(result).toEqual({ body: { ok: true, judgmentMemory } });
    expect('warnings' in result.body).toBe(false);
    expect(plays[0]).toMatchObject({ status: 'completed', updated_at: expect.any(String) });
    expect(persistStrategicPlayJudgmentMemoryById).toHaveBeenCalledWith({ admin, orgId: 'org_1', playId: 'play_1' });
  });

  it('updates preparation checklist and keeps ok response shape when judgment memory is skipped', async () => {
    vi.mocked(persistStrategicPlayJudgmentMemoryById).mockResolvedValue(null);
    const plays = [play()];
    const admin = makeAdmin({ tables: { strategic_plays: plays } });

    const result = await updateStrategicPlayStepPreparationChecklist({
      admin,
      orgId: 'org_1',
      playId: 'play_1',
      stepIndex: 1,
      preparationChecklist: [{ text: '准备 ROI 证据', done: true }],
    });

    expect(result).toEqual({ body: { ok: true } });
    expect('warnings' in result.body).toBe(false);
    expect((plays[0].steps as Record<string, unknown>[])[1]).toMatchObject({
      preparationChecklist: [{ text: '准备 ROI 证据', done: true }],
    });
  });

  it('rejects stale strategic play mutations instead of silently overwriting another user', async () => {
    vi.mocked(persistStrategicPlayJudgmentMemoryById).mockResolvedValue(null);
    const plays = [play({ updated_at: '2026-05-18T20:05:00.000Z' })];
    const admin = makeAdmin({ tables: { strategic_plays: plays } });

    const result = await updateStrategicPlayStepPreparationChecklist({
      admin,
      orgId: 'org_1',
      playId: 'play_1',
      expectedUpdatedAt: '2026-05-18T20:00:00.000Z',
      stepIndex: 0,
      preparationChecklist: [{ text: '准备 ROI 证据', done: true }],
    });

    expect(result).toEqual({
      body: { error: 'Strategic Play 已被其他成员更新，请刷新后再保存。' },
      init: { status: 409 },
    });
    expect((plays[0].steps as Record<string, unknown>[])[0]).not.toHaveProperty('preparationChecklist');
    expect(persistStrategicPlayJudgmentMemoryById).not.toHaveBeenCalled();
  });

  it('returns stable update failure shape and does not persist judgment memory', async () => {
    const plays = [play()];
    const admin = makeAdmin({ tables: { strategic_plays: plays }, updateError: { message: 'permission denied' } });

    const result = await updateStrategicPlayStatus({
      admin,
      orgId: 'org_1',
      playId: 'play_1',
      status: 'abandoned',
    });

    expect(result).toEqual({ body: { error: 'Update failed' }, init: { status: 500 } });
    expect(persistStrategicPlayJudgmentMemoryById).not.toHaveBeenCalled();
  });

  it('updates strategic play v2 route state through an explicit whitelist', async () => {
    vi.mocked(persistStrategicPlayJudgmentMemoryById).mockResolvedValue(null);
    const plays = [play()];
    const admin = makeAdmin({ tables: { strategic_plays: plays } });

    const result = await updateStrategicPlayV2RouteState({
      admin,
      orgId: 'org_1',
      playId: 'play_1',
      expectedUpdatedAt: '2026-05-18T20:00:00.000Z',
      routeState: {
        winGaps: [{ id: 'gap_1', currentState: '缺少 CFO 证据' }],
        nextVerificationPoint: '验证 CFO 是否参与扩容评审',
        playVersions: [{ version: 2, diffSummary: '新信号改变下一步路线' }],
      },
    });

    expect(result).toEqual({ body: { ok: true } });
    expect(plays[0]).toMatchObject({
      win_gaps: [{ id: 'gap_1', currentState: '缺少 CFO 证据' }],
      next_verification_point: '验证 CFO 是否参与扩容评审',
      play_versions: [{ version: 2, diffSummary: '新信号改变下一步路线' }],
      updated_at: expect.any(String),
    });
  });

  it('rejects empty strategic play v2 route state updates', async () => {
    vi.mocked(persistStrategicPlayJudgmentMemoryById).mockResolvedValue(null);
    const plays = [play()];
    const admin = makeAdmin({ tables: { strategic_plays: plays } });

    const result = await updateStrategicPlayV2RouteState({
      admin,
      orgId: 'org_1',
      playId: 'play_1',
      routeState: {},
    });

    expect(result).toEqual({ body: { error: 'No route state update specified' }, init: { status: 400 } });
    expect(plays[0]).not.toHaveProperty('win_gaps');
    expect(persistStrategicPlayJudgmentMemoryById).not.toHaveBeenCalled();
  });

  it('rejects stale strategic play v2 route state updates', async () => {
    vi.mocked(persistStrategicPlayJudgmentMemoryById).mockResolvedValue(null);
    const plays = [play({ updated_at: '2026-05-18T20:05:00.000Z' })];
    const admin = makeAdmin({ tables: { strategic_plays: plays } });

    const result = await updateStrategicPlayV2RouteState({
      admin,
      orgId: 'org_1',
      playId: 'play_1',
      expectedUpdatedAt: '2026-05-18T20:00:00.000Z',
      routeState: {
        nextVerificationPoint: '验证 CFO 是否参与扩容评审',
      },
    });

    expect(result).toEqual({
      body: { error: 'Strategic Play 已被其他成员更新，请刷新后再保存。' },
      init: { status: 409 },
    });
    expect(plays[0]).not.toHaveProperty('next_verification_point');
    expect(persistStrategicPlayJudgmentMemoryById).not.toHaveBeenCalled();
  });
});
