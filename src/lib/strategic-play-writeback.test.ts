import { describe, expect, it } from 'vitest';

import type { PlayExecutionEventRecord } from '@/lib/strategic-play-execution';
import {
  applyStrategicPlayStepExecutionWriteback,
  buildPlayStepExecutionInput,
  buildStrategicPlayExecutionResponse,
  isSourceRecordsUnavailable,
} from '@/lib/strategic-play-writeback';
import type { requireAdmin } from '@/lib/api-guard';

type TestTableRow = Record<string, unknown>;

type InsertErrorMode = 'none' | 'unavailable' | 'other';

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
        update(payload: Record<string, unknown>) {
          pendingUpdate = payload;
          return query;
        },
        eq(key: string, value: unknown) {
          filters.push([key, value]);
          if (pendingUpdate && filters.length >= 3) {
            for (const row of rows) {
              if (matches(row, filters)) Object.assign(row, pendingUpdate);
            }
            return Promise.resolve({ error: null });
          }
          return query;
        },
        async insert(row: PlayExecutionEventRecord) {
          if (table !== 'source_records') throw new Error(`unexpected insert table ${table}`);
          if (insertMode === 'unavailable') return { error: { message: 'source_records does not exist' } };
          if (insertMode === 'other') return { error: { message: 'permission denied' } };
          params.inserted.push(row);
          return { error: null };
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
    goal_description: '拿下 Q2 扩容',
    steps: [
      {
        index: 1,
        title: '验证采购评分表',
        status: 'planned',
      },
    ],
    last_step_at: null,
    status: 'active',
    confidence: 70,
    assumptions: [],
    ...overrides,
  };
}

describe('strategic-play writeback helpers', () => {
  it('builds execution input with executionStatus taking precedence', () => {
    expect(buildPlayStepExecutionInput({
      stepStatus: 'planned',
      executionStatus: 'blocked',
      blockerReason: '采购拒绝透露评分表',
      actualResult: '旧字段结果',
    })).toEqual({
      status: 'blocked',
      owner: undefined,
      dueDate: undefined,
      startedAt: undefined,
      completedAt: undefined,
      executionNote: undefined,
      actualOutcome: undefined,
      actualResult: '旧字段结果',
      nextAction: undefined,
      blockerReason: '采购拒绝透露评分表',
      outcomeAssessment: undefined,
      calibrationNote: undefined,
      calibrates: undefined,
    });
  });

  it('updates the play row and writes a source_records event for key execution status', async () => {
    const plays = [play({
      evidence_provenance: {
        fieldEvidenceAttributions: [{ field: 'steps[0].expectedOutcome', classification: 'inference', evidenceRefs: [], gaps: [], rationale: '执行前只是推断' }],
      },
    })];
    const inserted: PlayExecutionEventRecord[] = [];
    const admin = makeAdmin({ tables: { strategic_plays: plays, source_records: [] }, inserted });

    const result = await applyStrategicPlayStepExecutionWriteback({
      admin,
      orgId: 'org_1',
      userId: 'user_1',
      playId: 'play_1',
      stepIndex: 0,
      play: plays[0],
      executionInput: buildPlayStepExecutionInput({
        executionStatus: 'done',
        actualOutcome: '采购确认 Q2 预算还在',
        outcomeAssessment: 'matched_expected',
        calibrationNote: '采购邮件和 call 结果一致',
      }),
      now: '2026-05-06T06:00:00.000Z',
    });

    expect(result.status).toBe('updated');
    expect(result.warnings).toEqual([]);
    expect(result.calibration).toMatchObject({
      status: 'applied',
      targetFields: ['steps[0].expectedOutcome'],
      sourceRef: expect.objectContaining({ sourceType: 'play_execution_event' }),
      calibratedAt: '2026-05-06T06:00:00.000Z',
    });
    expect(plays[0]).toEqual(expect.objectContaining({
      last_step_at: '2026-05-06T06:00:00.000Z',
      days_since_progress: expect.any(Number),
      confidence: expect.any(Number),
      evidence_provenance: expect.objectContaining({
        fieldEvidenceAttributions: [expect.objectContaining({
          field: 'steps[0].expectedOutcome',
          classification: 'fact',
          calibrations: [expect.objectContaining({ calibratedClassification: 'verified' })],
        })],
      }),
    }));
    expect(result.steps[0]).toEqual(expect.objectContaining({
      status: 'done',
      actualOutcome: '采购确认 Q2 预算还在',
      completedAt: '2026-05-06T06:00:00.000Z',
    }));
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'play_execution_event',
      source_table: 'strategic_plays',
      metadata: {
        playExecutionEvent: expect.objectContaining({
          playId: 'play_1',
          status: 'done',
          actualOutcome: '采购确认 Q2 预算还在',
        }),
      },
    });
  });

  it('normalizes source_records failures into response warnings without failing writeback', async () => {
    const plays = [play()];
    const inserted: PlayExecutionEventRecord[] = [];
    const admin = makeAdmin({ tables: { strategic_plays: plays, source_records: [] }, inserted, insertMode: 'unavailable' });

    const result = await applyStrategicPlayStepExecutionWriteback({
      admin,
      orgId: 'org_1',
      userId: 'user_1',
      playId: 'play_1',
      stepIndex: 0,
      play: plays[0],
      executionInput: buildPlayStepExecutionInput({
        executionStatus: 'blocked',
        blockerReason: '采购拒绝透露评分表',
      }),
      now: '2026-05-06T06:00:00.000Z',
    });

    expect(result.status).toBe('updated');
    expect(result.warnings).toEqual(['source_records_unavailable']);
    expect(result.calibration).toMatchObject({ status: 'skipped', targetFields: ['steps[0].expectedOutcome'] });
    expect(inserted).toHaveLength(0);
    expect(plays[0].momentum).toBe('blocked');
    expect(isSourceRecordsUnavailable({ message: 'schema cache missing source_records' })).toBe(true);
  });

  it('returns a route revision proposal when execution feedback blocks the current move', async () => {
    const plays = [play()];
    const inserted: PlayExecutionEventRecord[] = [];
    const admin = makeAdmin({ tables: { strategic_plays: plays, source_records: [] }, inserted });

    const result = await applyStrategicPlayStepExecutionWriteback({
      admin,
      orgId: 'org_1',
      userId: 'user_1',
      playId: 'play_1',
      stepIndex: 0,
      play: plays[0],
      executionInput: buildPlayStepExecutionInput({
        executionStatus: 'blocked',
        blockerReason: '采购拒绝透露评分表',
        nextAction: '改为请 champion 提供历史评分样例',
        outcomeAssessment: 'blocked',
      }),
      now: '2026-05-06T06:00:00.000Z',
    });

    expect(result.status).toBe('updated');
    expect(result.routeRevisionProposal).toMatchObject({
      status: 'proposed',
      requiresHumanConfirmation: true,
      triggerKind: 'execution_outcome',
      changedMoveIds: ['move-1'],
      changedWinGapIds: ['win-gap-execution-play_1-1'],
      proposedNextMove: '改为请 champion 提供历史评分样例',
      failureTest: '如果不能解除「采购拒绝透露评分表」，后续路线不得继续机械推进原步骤。',
      sourceRef: expect.objectContaining({ sourceType: 'play_execution_event' }),
    });
  });

  it('keeps execution response shape stable', () => {
    expect(buildStrategicPlayExecutionResponse({
      steps: [{ status: 'done' }],
      warnings: [],
      judgmentMemory: { id: 'jm_1' },
      calibration: { status: 'applied', targetFields: ['steps[0].expectedOutcome'], calibratedAt: '2026-05-06T06:00:00.000Z' },
      routeRevisionProposal: {
        status: 'proposed',
        requiresHumanConfirmation: true,
        triggerKind: 'execution_outcome',
        changedMoveIds: ['move-1'],
        changedWinGapIds: ['win-gap-1'],
        diffSummary: '执行受阻，建议改线。',
        proposedNextMove: '改线',
        failureTest: '不能继续机械推进',
        createdAt: '2026-05-06T06:00:00.000Z',
      },
    })).toEqual({
      ok: true,
      steps: [{ status: 'done' }],
      warnings: [],
      judgmentMemory: { id: 'jm_1' },
      calibration: { status: 'applied', targetFields: ['steps[0].expectedOutcome'], calibratedAt: '2026-05-06T06:00:00.000Z' },
      routeRevisionProposal: {
        status: 'proposed',
        requiresHumanConfirmation: true,
        triggerKind: 'execution_outcome',
        changedMoveIds: ['move-1'],
        changedWinGapIds: ['win-gap-1'],
        diffSummary: '执行受阻，建议改线。',
        proposedNextMove: '改线',
        failureTest: '不能继续机械推进',
        createdAt: '2026-05-06T06:00:00.000Z',
      },
    });
  });
});
