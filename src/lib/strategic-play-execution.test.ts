import { describe, expect, it } from 'vitest';
import {
  buildPlayExecutionSourceRecord,
  normalizePlayExecutionEventSourceRow,
  normalizePlayStepExecution,
  updateStepExecution,
} from './strategic-play-execution';

const now = '2026-05-05T04:50:00.000Z';

function step(overrides: Record<string, unknown> = {}) {
  return {
    index: 1,
    title: '拿到采购 owner 的真实标准',
    description: '验证采购方到底卡在哪里',
    who: 'AE',
    target: 'Procurement',
    action: '安排 15 分钟校准 call',
    timing: '本周',
    purpose: '把模糊异议变成可处理条件',
    risk: '对方继续拖延',
    fallback: '转 sponsor 侧面验证',
    status: 'pending' as const,
    customField: 'keep-me',
    ...overrides,
  };
}

describe('strategic-play-execution', () => {
  it('normalizes legacy step status without dropping old fields', () => {
    expect(normalizePlayStepExecution(step({ status: 'completed', actualResult: '拿到预算口径' }))).toMatchObject({
      status: 'done',
      actualOutcome: '拿到预算口径',
      actualResult: '拿到预算口径',
      customField: 'keep-me',
    });
  });

  it('updates status, responsibility fields, and preserves existing step fields', () => {
    const result = updateStepExecution([step()], 0, {
      status: 'in_progress',
      owner: 'Zeno',
      assignedToUserId: 'user_1',
      linkedTaskId: 'task_1',
      executionOwnerSource: 'task',
      dueDate: '2026-05-08',
    }, { now });
    expect(result.step).toMatchObject({
      status: 'in_progress',
      owner: 'Zeno',
      assignedToUserId: 'user_1',
      linkedTaskId: 'task_1',
      executionOwnerSource: 'task',
      dueDate: '2026-05-08T00:00:00.000Z',
      startedAt: now,
      customField: 'keep-me',
    });
  });

  it('sets completedAt and actualOutcome when marking done', () => {
    const result = updateStepExecution([step({ status: 'in_progress' })], 0, {
      status: 'done',
      actualOutcome: '采购确认 Q2 预算还在',
      nextAction: '让 champion 拉 sponsor 复核商业价值',
    }, { now });

    expect(result.step).toMatchObject({
      status: 'done',
      completedAt: now,
      actualOutcome: '采购确认 Q2 预算还在',
      actualResult: '采购确认 Q2 预算还在',
      nextAction: '让 champion 拉 sponsor 复核商业价值',
    });
  });

  it('requires blockerReason for blocked status', () => {
    expect(() => updateStepExecution([step()], 0, { status: 'blocked' }, { now })).toThrow('blocked 状态必须填写 blockerReason');
  });

  it('adds an invalidated caveat for re-strategy', () => {
    const result = updateStepExecution([step()], 0, {
      status: 'invalidated',
      executionNote: 'Champion 没有真实影响力',
      nextAction: '重新找 economic buyer 路径',
    }, { now });

    expect(result.step).toMatchObject({
      status: 'invalidated',
      executionCaveat: expect.stringContaining('需要重新谋局或调整打法'),
      nextAction: '重新找 economic buyer 路径',
    });
  });

  it('builds and normalizes source_record payload for play execution learning', () => {
    const updated = updateStepExecution([step()], 0, {
      status: 'blocked',
      blockerReason: '采购拒绝透露评分表',
      executionNote: '需要 sponsor 介入',
      assignedToUserId: 'user_1',
      linkedTaskId: 'task_1',
      outcomeAssessment: 'blocked',
      calibrationNote: '采购明确拒绝披露评分表',
      calibrates: { fields: ['risk', 'fallback'], assumptionIds: ['assumption_1'] },
    }, { now }).step;

    const row = buildPlayExecutionSourceRecord({
      orgId: 'org_1',
      accountId: 'acc_1',
      playId: 'play_1',
      opportunityId: 'opp_1',
      goalDescription: '拿下 Q2 扩容',
      stepIndex: 0,
      step: updated,
      status: 'blocked',
      actorId: 'user_1',
      occurredAt: now,
    });

    expect(row).toMatchObject({
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'play_execution_event',
      source_table: 'strategic_plays',
      source_row_id: expect.stringContaining('play_1:0:blocked'),
      title: '谋局执行 · 受阻',
      summary: expect.stringContaining('采购拒绝透露评分表'),
      occurred_at: now,
      metadata: {
        schemaVersion: 1,
        playExecutionEvent: expect.objectContaining({
          playId: 'play_1',
          accountId: 'acc_1',
          opportunityId: 'opp_1',
          status: 'blocked',
          assignedToUserId: 'user_1',
          linkedTaskId: 'task_1',
          blockerReason: '采购拒绝透露评分表',
          outcomeAssessment: 'blocked',
          calibrationNote: '采购明确拒绝披露评分表',
          targetFields: ['steps[0].expectedOutcome', 'steps[0].risk', 'steps[0].fallback'],
          assumptionIds: ['assumption_1'],
          createdBy: 'user_1',
        }),
      },
    });

    expect(normalizePlayExecutionEventSourceRow({ id: 'sr_play_evt_1', ...row })).toMatchObject({
      id: expect.stringContaining('play_1:0:blocked'),
      sourceRecordId: 'sr_play_evt_1',
      orgId: 'org_1',
      accountId: 'acc_1',
      playId: 'play_1',
      opportunityId: 'opp_1',
      status: 'blocked',
      assignedToUserId: 'user_1',
      linkedTaskId: 'task_1',
      blockerReason: '采购拒绝透露评分表',
      outcomeAssessment: 'blocked',
      targetFields: ['steps[0].expectedOutcome', 'steps[0].risk', 'steps[0].fallback'],
      assumptionIds: ['assumption_1'],
      occurredAt: now,
    });
  });
});
