import { describe, expect, it } from 'vitest';
import type { JudgmentEvidenceRef } from '@/lib/babel-engine/types';
import type { JudgmentActionPanelModel } from '@/lib/judgment/action-panel';
import type { DecodeStabilityTimelineItem } from '@/lib/judgment/decode-stability';
import type { AccountMomentumSnapshot } from '@/lib/judgment/momentum';
import type { JudgmentMemorySourceItem } from '@/lib/judgment/memory-sources';
import type { AccountOpenQuestion } from '@/lib/judgment/open-questions';
import type { JudgmentTimelineItem } from '@/lib/judgment/timeline';
import { buildRoleView, buildRoleViewsForCore, parseRoleViewRole, roleViewRoleFromJobLevel } from './role-view';

const accountId = 'acc_1';
const sharedEvidenceRef: JudgmentEvidenceRef = {
  sourceId: 'email_1',
  sourceKind: 'email_decode',
  sourceTable: 'email_decodes',
  sourceRowId: 'email_1',
  title: 'CFO 邮件',
};

function memory(overrides: Partial<JudgmentMemorySourceItem> = {}): JudgmentMemorySourceItem {
  return {
    id: 'decode:email_1',
    sourceRecordId: 'sr_1',
    sourceKind: 'decode',
    sourceId: 'email_1',
    sourceTable: 'email_decodes',
    sourceRowId: 'email_1',
    title: 'CFO 回复预算确认',
    currentJudgment: 'CFO 已进入预算讨论，机会仍有推进窗口。',
    risk: '采购法务还没有确认，可能拖慢签约。',
    nextAction: '请 champion 在下一封邮件里确认法务时间线。',
    confidence: 0.74,
    provisional: false,
    evidenceRefs: [sharedEvidenceRef],
    updatedAt: '2026-05-02T13:00:00.000Z',
    traceStatus: 'persisted',
    ...overrides,
  };
}

function accountMomentum(overrides: Partial<AccountMomentumSnapshot> = {}): AccountMomentumSnapshot {
  return {
    status: 'risk_rising',
    confidence: 0.72,
    currentJudgment: '客户仍愿意推进，但采购节奏开始放慢。',
    whyChanged: '最近一次回复把法务时间线往后推。',
    biggestTension: '预算口头认可，但采购和法务没有给明确 SLA。',
    nextAction: '让 champion 带出采购负责人和法务审批时间。',
    evidenceRefs: [sharedEvidenceRef],
    provisional: false,
    updatedAt: '2026-05-02T14:00:00.000Z',
    ...overrides,
  };
}

function openQuestion(overrides: Partial<AccountOpenQuestion> = {}): AccountOpenQuestion {
  return {
    id: 'open_question:procurement-path',
    question: '采购负责人是否已经确认审批路径？',
    priority: 'high',
    whyItMatters: '如果采购路径不清楚，本季度预测需要打折。',
    whoToAsk: { name: 'Mina', title: 'Champion' },
    blockedJudgment: 'risk',
    nextVerificationAction: '请 Mina 在下次回复中明确采购负责人和审批步骤。',
    evidenceRefs: [sharedEvidenceRef],
    confidence: 0.68,
    provisional: true,
    updatedAt: '2026-05-02T14:05:00.000Z',
    ...overrides,
  };
}

function timeline(overrides: Partial<JudgmentTimelineItem> = {}): JudgmentTimelineItem {
  return {
    id: 'judgment_memory:decode:email_1',
    accountId,
    kind: 'judgment_memory',
    sourceKind: 'decode',
    sourceId: 'email_1',
    sourceTable: 'email_decodes',
    sourceRowId: 'email_1',
    title: 'Decode 判断更新',
    summary: '采购法务时间线变成主要风险。',
    risk: '审批可能拖慢签约。',
    nextAction: '确认采购负责人。',
    occurredAt: '2026-05-02T14:10:00.000Z',
    traceStatus: 'persisted',
    evidenceRefs: [sharedEvidenceRef],
    ...overrides,
  };
}

function decodeStability(overrides: Partial<DecodeStabilityTimelineItem> = {}): DecodeStabilityTimelineItem {
  return {
    id: 'decode_stability:email_1',
    sourceId: 'email_1',
    sourceRecordId: 'sr_1',
    occurredAt: '2026-05-02T14:00:00.000Z',
    title: 'CFO 邮件',
    inputSummary: 'CFO 讨论预算。',
    status: 'unstable',
    statusLabel: '同一背景下有变化',
    confidence: 0.7,
    changedFields: ['risk'],
    changedFieldLabels: ['风险等级'],
    hasSnapshot: true,
    currentJudgment: '风险从中等升为高。',
    correctionCta: {
      visible: true,
      buttonLabel: '修正 Decode 判断',
      helperText: '判断变化较大，建议确认。',
      targetType: 'decode',
      targetId: 'email_1',
    },
    ...overrides,
  };
}

function actionPanel(overrides: Partial<JudgmentActionPanelModel> = {}): JudgmentActionPanelModel {
  return {
    empty: false,
    currentJudgment: 'CFO 已进入预算讨论，机会仍有推进窗口。',
    keyRisk: '采购法务还没有确认，可能拖慢签约。',
    nextAction: '请 champion 在下一封邮件里确认法务时间线。',
    evidence: {
      label: '证据较充分',
      description: '已关联 3 条可追踪来源。',
      tone: 'strong',
      sourceCount: 3,
      sourceLabels: ['Decode 解读'],
      updatedAt: '2026-05-02T14:00:00.000Z',
    },
    recentChanges: [],
    calibration: {
      feedbackCount: 0,
      winLossCount: 0,
      feedbackCategoryLabels: [],
      latestValidatedSignals: [],
      latestDisprovenSignals: [],
      loopSummary: '还没有校准样本。',
    },
    feedbackEvidenceRefs: [sharedEvidenceRef],
    ...overrides,
  };
}

describe('role-based judgment view', () => {
  it('builds distinct AE, Manager, and Executive projections from the same judgment core', () => {
    const views = buildRoleViewsForCore({
      judgmentMemories: [memory()],
      actionPanel: actionPanel(),
      accountMomentum: accountMomentum(),
      openQuestions: [openQuestion()],
      judgmentTimeline: [timeline()],
      decodeStabilityTimeline: [decodeStability()],
    });

    expect(views.ae.header.title).toContain('推进哪一步');
    expect(views.manager.header.title).toContain('团队卡在哪里');
    expect(views.executive.header.title).toContain('影响预测');
    expect(views.ae.emphasis.nextActionLabel).toBe('我的下一步动作');
    expect(views.manager.emphasis.nextActionLabel).toBe('建议的 coaching 动作');
    expect(views.executive.emphasis.nextActionLabel).toBe('资源/赞助动作');
    expect(views.ae.primaryFocus.text).toBe('请 champion 在下一封邮件里确认法务时间线。');
    expect(views.manager.primaryFocus.text).toContain('采购法务');
    expect(views.executive.suggestedActions[0].text).toContain('executive sponsor');
  });

  it('keeps core source refs and judgmentTimeline ids shared instead of splitting per role', () => {
    const views = buildRoleViewsForCore({
      judgmentMemories: [memory()],
      actionPanel: actionPanel(),
      accountMomentum: accountMomentum(),
      openQuestions: [openQuestion()],
      judgmentTimeline: [timeline()],
      decodeStabilityTimeline: [decodeStability()],
    });

    expect(views.ae.coreRefs).toBe(views.manager.coreRefs);
    expect(views.manager.coreRefs).toBe(views.executive.coreRefs);
    expect(views.ae.coreRefs.judgmentTimelineIds).toEqual(['judgment_memory:decode:email_1']);
    expect(views.ae.coreRefs.judgmentTimelineIds).toEqual(views.executive.coreRefs.judgmentTimelineIds);
    expect(views.ae.coreRefs.sourceIds).toEqual(['email_1']);
    expect(views.ae.coreRefs.sourceRefs).toHaveLength(1);
    expect(views.ae.coreRefs.sourceRefs[0]).toBe(sharedEvidenceRef);
    expect(views.ae.coreRefs.sourceRefs[0]).toMatchObject({ sourceId: 'email_1', sourceRowId: 'email_1' });
  });

  it('selects one role view and resolves job levels safely', () => {
    const view = buildRoleView({
      role: 'manager',
      judgmentMemories: [memory()],
      actionPanel: actionPanel(),
      accountMomentum: accountMomentum(),
      openQuestions: [openQuestion()],
      judgmentTimeline: [timeline()],
      decodeStabilityTimeline: [],
    });

    expect(view.role).toBe('manager');
    expect(roleViewRoleFromJobLevel(0)).toBe('ae');
    expect(roleViewRoleFromJobLevel(1)).toBe('manager');
    expect(roleViewRoleFromJobLevel(2)).toBe('executive');
    expect(parseRoleViewRole('Executive')).toBe('executive');
    expect(parseRoleViewRole('bad')).toBeNull();
  });
});
