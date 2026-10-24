import { describe, expect, it } from 'vitest';
import { buildAccountCommandViewModel, getAccountRelationshipCoverageState } from './account-command-view';
import type { Account } from '@/lib/babel-engine/types';
import type { RoleBasedJudgmentView } from '@/lib/judgment/role-view';

const baseAccount: Pick<Account, 'contacts'> = {
  contacts: [
    { id: 'c1', name: '李明', email: 'li@example.com', role: 'champion', lastContactedAt: '2026-05-21' },
    { id: 'c2', name: '王总', email: 'wang@example.com', role: 'economic_buyer' },
    { id: 'c3', name: '赵经理', email: 'zhao@example.com', role: 'procurement' },
  ],
};

describe('account command view model', () => {
  it('scores relationship coverage from key buying roles and recent touch', () => {
    expect(getAccountRelationshipCoverageState(baseAccount)).toMatchObject({
      score: 100,
      label: '覆盖充分',
      gaps: [],
    });
  });

  it('keeps fallback judgment visible while memory is refreshing', () => {
    const model = buildAccountCommandViewModel({
      account: { contacts: [] },
      roleView: null,
      fallbackJudgment: '当前机会仍可推进，但预算路径需要确认。',
      fallbackRisk: '预算负责人还没有直接回应。',
      fallbackNextAction: '请 champion 确认预算审批人。',
      ownerName: 'Demo User',
      evidenceCount: 3,
      openQuestionCount: 1,
      activeOpportunityCount: 1,
      nextTaskTitle: '准备 focused note',
      latestFeedbackSummary: '用户反馈：预算路径已经更新。',
      loading: true,
    });

    expect(model.cards[0]).toMatchObject({
      label: '关键判断',
      value: '当前机会仍可推进，但预算路径需要确认。',
    });
    expect(model.cards.map((card) => card.label)).toEqual(['关键判断', '关键风险', '下一步动作', '关系覆盖']);
    expect(model.cards.map((card) => card.feedbackTargetId)).toEqual(['key_judgment', 'key_risk', 'next_action', 'relationship_coverage']);
    expect(model.evidenceSummary).toBe('证据痕迹：3 条');
    expect(model.visibilitySummary).toBe('当前视角：账户 · 负责人 Demo User · 1 个活跃商机纳入判断');
    expect(model.latestFeedbackSummary).toBe('用户反馈：预算路径已经更新。');
    expect(model.isRefreshing).toBe(true);
  });

  it('keeps a decision queue when role view has multiple focus items and actions', () => {
    const roleView: RoleBasedJudgmentView = {
      schemaVersion: 1,
      generatedFrom: 'judgment_core',
      role: 'manager',
      roleLabel: 'Manager',
      header: { eyebrow: 'Manager 判断投影', title: '多个判断需要处理', subtitle: '测试多判断队列' },
      emphasis: {
        currentJudgmentLabel: '当前判断',
        keyRiskLabel: '关键风险',
        nextActionLabel: '下一步',
      },
      primaryFocus: { label: '辅导焦点', text: '预算路径需要校准。', tone: 'warning' },
      focusItems: [
        { id: 'risk', label: '需要辅导的卡点', text: '预算 owner 不清晰。', tone: 'warning' },
        { id: 'current-read', label: '团队当前判断', text: '机会仍可推进。', tone: 'muted' },
        { id: 'recent-change', label: '最近变化', text: 'Champion 回应变慢。', tone: 'accent' },
      ],
      suggestedActions: [
        { id: 'coach', text: '和 AE 复盘预算链。', reason: '避免预测过度乐观。' },
        { id: 'ask', text: '请 Champion 确认审批口径。', reason: '把不确定性转成可验证问题。' },
      ],
      coreRefs: {
        judgmentMemoryIds: [],
        openQuestionIds: [],
        judgmentTimelineIds: [],
        decodeStabilityTimelineIds: [],
        sourceIds: [],
        sourceRefs: [],
      },
    };

    const model = buildAccountCommandViewModel({
      account: baseAccount,
      roleView,
      fallbackJudgment: '',
      fallbackRisk: '',
      fallbackNextAction: '',
      ownerName: '林岚',
      evidenceCount: 8,
      openQuestionCount: 2,
      activeOpportunityCount: 2,
      loading: false,
    });

    expect(model.decisionQueue.map((item) => item.text)).toEqual([
      '预算 owner 不清晰。',
      '机会仍可推进。',
      'Champion 回应变慢。',
      '和 AE 复盘预算链。',
      '请 Champion 确认审批口径。',
    ]);
    expect(model.decisionQueue[3]).toMatchObject({
      label: '建议动作',
      reason: '避免预测过度乐观。',
      feedbackTargetId: 'action:coach',
    });
  });
});
