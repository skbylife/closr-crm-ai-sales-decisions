import { describe, expect, it } from 'vitest';
import type { JudgmentFeedbackRevisionRecord } from '@/lib/judgment/feedback';
import type { JudgmentMemorySourceItem } from '@/lib/judgment/memory-sources';
import type { TaskOutcomeItem } from '@/lib/judgment/task-outcome';
import type { WinLossCalibrationItem } from '@/lib/judgment/win-loss-calibration';
import type { JudgmentInterventionItem } from '@/lib/judgment/intervention';
import type { InterventionOutcomeItem } from '@/lib/judgment/intervention-learning';
import { buildJudgmentTimeline } from './timeline';

const accountId = 'acc_1';

function judgmentMemory(overrides: Partial<JudgmentMemorySourceItem> = {}): JudgmentMemorySourceItem {
  return {
    id: 'decode:dec_1',
    sourceRecordId: 'sr_mem_1',
    sourceKind: 'decode',
    sourceId: 'dec_1',
    sourceTable: 'email_decodes',
    sourceRowId: 'dec_1',
    title: 'Decode 判断',
    currentJudgment: '客户预算仍在，但审批人发生变化。',
    risk: '审批链不清晰。',
    nextAction: '确认新审批人。',
    confidence: 0.71,
    uncertainty: 'CFO 是否仍参与未知。',
    provisional: true,
    evidenceRefs: [{ sourceId: 'dec_1', sourceKind: 'email_decode', title: '邮件解读' }],
    updatedAt: '2026-05-01T10:00:00.000Z',
    traceStatus: 'persisted',
    ...overrides,
  };
}

function feedbackRecord(overrides: Partial<JudgmentFeedbackRevisionRecord> = {}): JudgmentFeedbackRevisionRecord {
  return {
    feedback: {
      id: 'fb_1',
      orgId: 'org_1',
      accountId,
      targetType: 'judgment',
      targetId: 'judgment_1',
      kind: 'stale',
      feedbackType: 'stale',
      content: 'CFO 已离职。',
      scope: 'account_only',
      status: 'active',
      evidenceRefs: [],
      createdBy: 'user_1',
      createdAt: '2026-05-01T11:00:00.000Z',
    },
    revisedPreview: {
      previousSummary: 'CFO 仍阻塞审批。',
      userCorrection: 'CFO 已离职。',
      revisedSummary: '账户综合判断已过期，需要刷新 CFO 事实。',
      whyChanged: '用户指出原判断依赖事实过期。',
      confidenceDelta: -0.1,
      preservedClaims: [],
      replacedClaims: ['CFO 仍阻塞审批'],
      provisional: true,
    },
    revisionStatus: 'ready',
    ...overrides,
  };
}

function winLossCalibration(overrides: Partial<WinLossCalibrationItem> = {}): WinLossCalibrationItem {
  return {
    id: 'cal_1',
    orgId: 'org_1',
    accountId,
    opportunityId: 'opp_1',
    outcome: 'lost',
    outcomeAt: '2026-05-01T12:00:00.000Z',
    notes: '低估采购阻力。',
    previousJudgment: 'Champion 可以推动采购。',
    previousRisk: '采购路径未确认。',
    previousNextAction: '提前验证采购路径。',
    validatedSignals: [],
    disprovenSignals: ['Champion 强度过度乐观'],
    overOptimistic: true,
    overConservative: undefined,
    lessons: ['下次必须提前验证采购路径'],
    evidenceRefs: [{ sourceId: 'opp_1', sourceKind: 'source_record', title: '商机' }],
    createdBy: 'user_1',
    createdAt: '2026-05-01T12:00:00.000Z',
    ...overrides,
  };
}


function taskOutcome(overrides: Partial<TaskOutcomeItem> = {}): TaskOutcomeItem {
  return {
    id: 'sr_task_outcome_1',
    orgId: 'org_1',
    accountId,
    opportunityId: 'opp_1',
    contactId: 'con_1',
    taskId: 'task_1',
    outcome: 'blocked',
    outcomeNote: '采购没批，任务卡住了。',
    reason: '采购没批。',
    judgmentImpact: '暴露采购阻力，需要重新判断推进路径',
    previousTaskStatus: 'todo',
    newTaskStatus: undefined,
    evidenceRefs: [],
    createdBy: 'user_1',
    createdAt: '2026-05-01T13:00:00.000Z',
    outcomeAt: '2026-05-01T13:00:00.000Z',
    ...overrides,
  };
}

function intervention(overrides: Partial<JudgmentInterventionItem> = {}): JudgmentInterventionItem {
  return {
    id: 'int_1',
    sourceRecordId: 'sr_intervention_1',
    orgId: 'org_1',
    accountId,
    opportunityId: 'opp_1',
    signalId: 'exec:opp_1',
    type: 'executive_intervention',
    action: 'assign_sponsor',
    status: 'planned',
    role: 'executive',
    reason: '高价值机会已有高层影响路径。',
    recommendedAction: '指派 Executive sponsor 校准决策路径。',
    outcomeNote: 'CRO 将在周五介入 sponsor call。',
    evidenceRefs: [],
    createdBy: 'user_1',
    createdAt: '2026-05-01T14:00:00.000Z',
    ...overrides,
  };
}

function interventionOutcome(overrides: Partial<InterventionOutcomeItem> = {}): InterventionOutcomeItem {
  return {
    id: 'out_1',
    orgId: 'org_1',
    accountId,
    opportunityId: 'opp_1',
    interventionId: 'int_1',
    sourceRecordId: 'sr_intervention_1',
    role: 'manager',
    reason: '证据不足，先核验。',
    outcome: 'effective',
    impact: 'evidence_improved',
    confidence: 0.8,
    outcomeNote: 'AE 补回一手采购 owner 证据。',
    learningSummary: '先核验证据比直接升级更有效。',
    evidenceRefs: [],
    createdBy: 'user_1',
    createdAt: '2026-05-01T15:00:00.000Z',
    ...overrides,
  };
}

describe('buildJudgmentTimeline', () => {
  it('maps judgment memory to a timeline item', () => {
    const [item] = buildJudgmentTimeline({ accountId, judgmentMemories: [judgmentMemory()] });

    expect(item).toMatchObject({
      id: 'judgment_memory:decode:dec_1',
      accountId,
      kind: 'judgment_memory',
      sourceKind: 'decode',
      sourceId: 'dec_1',
      title: 'Decode 判断',
      summary: '客户预算仍在，但审批人发生变化。',
      risk: '审批链不清晰。',
      nextAction: '确认新审批人。',
      occurredAt: '2026-05-01T10:00:00.000Z',
      traceStatus: 'persisted',
    });
  });

  it('maps feedback revision record to a timeline item', () => {
    const [item] = buildJudgmentTimeline({ accountId, feedbackRevisionRecords: [feedbackRecord()] });

    expect(item).toMatchObject({
      id: 'feedback:fb_1',
      accountId,
      kind: 'feedback',
      sourceKind: 'judgment',
      sourceId: 'judgment_1',
      title: '用户反馈 · 综合判断 · 已过期',
      summary: '账户综合判断已过期，需要刷新 CFO 事实。',
      signal: 'CFO 已离职。',
      occurredAt: '2026-05-01T11:00:00.000Z',
      traceStatus: 'persisted',
      meta: expect.objectContaining({ revisionStatus: 'ready', feedbackType: 'stale' }),
    });
  });

  it('maps win/loss calibration to a timeline item', () => {
    const [item] = buildJudgmentTimeline({ accountId, winLossCalibrations: [winLossCalibration()] });

    expect(item).toMatchObject({
      id: 'win_loss_calibration:cal_1',
      accountId,
      kind: 'win_loss_calibration',
      sourceKind: 'lost',
      sourceId: 'opp_1',
      sourceTable: 'opportunities',
      title: 'Win/Loss calibration · 丢单',
      summary: '丢单校准：下次必须提前验证采购路径',
      signal: 'Champion 强度过度乐观',
      risk: '采购路径未确认。',
      nextAction: '提前验证采购路径。',
      occurredAt: '2026-05-01T12:00:00.000Z',
      traceStatus: 'persisted',
    });
  });



  it('maps task outcome feedback to a timeline item', () => {
    const [item] = buildJudgmentTimeline({ accountId, taskOutcomes: [taskOutcome()] });

    expect(item).toMatchObject({
      id: 'task_outcome:sr_task_outcome_1',
      accountId,
      kind: 'task_outcome',
      sourceKind: 'task_outcome',
      sourceId: 'sr_task_outcome_1',
      sourceTable: 'source_records',
      sourceRowId: 'sr_task_outcome_1',
      title: '任务执行反馈 · 受阻',
      summary: '受阻：采购没批。',
      signal: '采购没批，任务卡住了。',
      risk: '采购没批。',
      nextAction: '暴露采购阻力，需要重新判断推进路径',
      occurredAt: '2026-05-01T13:00:00.000Z',
      traceStatus: 'persisted',
    });
  });

  it('maps manager/executive interventions to timeline items', () => {
    const [item] = buildJudgmentTimeline({ accountId, interventions: [intervention()] });

    expect(item).toMatchObject({
      id: 'intervention:int_1',
      accountId,
      kind: 'intervention',
      sourceKind: 'executive_intervention',
      sourceTable: 'source_records',
      title: '高层介入 · 指派 Sponsor',
      summary: '计划中：CRO 将在周五介入 sponsor call。',
      signal: '高价值机会已有高层影响路径。',
      nextAction: '指派 Executive sponsor 校准决策路径。',
      occurredAt: '2026-05-01T14:00:00.000Z',
      traceStatus: 'persisted',
      meta: expect.objectContaining({ action: 'assign_sponsor', opportunityId: 'opp_1', signalId: 'exec:opp_1' }),
    });
  });

  it('maps intervention outcomes to learning timeline items', () => {
    const [item] = buildJudgmentTimeline({ accountId, interventionOutcomes: [interventionOutcome()] });

    expect(item).toMatchObject({
      id: 'intervention_outcome:out_1',
      accountId,
      kind: 'intervention_outcome',
      sourceKind: 'intervention_outcome',
      sourceTable: 'source_records',
      sourceRowId: 'sr_intervention_1',
      title: '介入结果/学习结论 · 有效',
      summary: '有效 · 证据改善：先核验证据比直接升级更有效。',
      signal: 'AE 补回一手采购 owner 证据。',
      nextAction: '先核验证据比直接升级更有效。',
      occurredAt: '2026-05-01T15:00:00.000Z',
      traceStatus: 'persisted',
      meta: expect.objectContaining({ interventionId: 'int_1', sourceRecordId: 'sr_intervention_1', outcome: 'effective', impact: 'evidence_improved' }),
    });
  });

  it('keeps multiple task outcome history items for the same task', () => {
    const items = buildJudgmentTimeline({
      accountId,
      taskOutcomes: [
        taskOutcome({ id: 'sr_task_outcome_delayed', outcome: 'delayed', outcomeAt: '2026-05-01T13:00:00.000Z' }),
        taskOutcome({ id: 'sr_task_outcome_completed', outcome: 'completed', outcomeAt: '2026-05-01T14:00:00.000Z' }),
      ],
    });

    expect(items.map((item) => item.id)).toEqual([
      'task_outcome:sr_task_outcome_completed',
      'task_outcome:sr_task_outcome_delayed',
    ]);
    expect(items.map((item) => item.meta?.taskId)).toEqual(['task_1', 'task_1']);
  });

  it('sorts by occurredAt descending and applies limit', () => {
    const items = buildJudgmentTimeline({
      accountId,
      judgmentMemories: [judgmentMemory({ id: 'decode:old', sourceId: 'old', updatedAt: '2026-05-01T09:00:00.000Z' })],
      feedbackRevisionRecords: [feedbackRecord()],
      winLossCalibrations: [winLossCalibration()],
      taskOutcomes: [taskOutcome()],
      interventions: [intervention()],
      interventionOutcomes: [interventionOutcome()],
      limit: 2,
    });

    expect(items.map((item) => item.kind)).toEqual(['intervention_outcome', 'intervention']);
    expect(items).toHaveLength(2);
  });

  it('returns [] for empty inputs', () => {
    expect(buildJudgmentTimeline({ accountId })).toEqual([]);
    expect(buildJudgmentTimeline({ accountId, judgmentMemories: [], feedbackRevisionRecords: [], winLossCalibrations: [], taskOutcomes: [], interventions: [], interventionOutcomes: [] })).toEqual([]);
  });
});
