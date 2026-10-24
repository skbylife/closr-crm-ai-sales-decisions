import { describe, expect, it } from 'vitest';

import { buildStrategicPlayRoutePlan, type StrategicPlayRoutePlanInput } from './view-model';

function basePlay(overrides: Partial<StrategicPlayRoutePlanInput> = {}): StrategicPlayRoutePlanInput {
  return {
    id: 'play_1',
    orgId: 'org_1',
    userId: 'user_1',
    accountId: 'acc_1',
    opportunityId: 'opp_1',
    goalType: 'build_executive_relationship',
    goalDescription: '获得经济买家对试点扩容的明确背书',
    steps: [
      {
        index: 0,
        title: '让 champion 复述 CFO 的真实顾虑',
        description: '约 20 分钟同步，确认 CFO 关心的是预算、风险还是优先级。',
        who: 'AE',
        target: 'Champion',
        action: '发起一次带具体问题的同步',
        timing: '本周',
        purpose: '确认经济买家阻塞点',
        expectedOutcome: 'Champion 能说出 CFO 的一个明确评估标准',
        risk: 'Champion 只给模糊积极反馈',
        fallback: '转向 coach 验证 CFO 的决策标准',
        status: 'planned',
      },
      {
        index: 1,
        title: '准备 CFO 关注的风险-收益材料',
        description: '围绕试点风险、ROI 和替代方案准备一页材料。',
        who: 'SE',
        target: 'CFO',
        action: '生成并交付一页材料',
        timing: '下周',
        purpose: '降低经济买家的决策风险',
        expectedOutcome: 'CFO 同意进入试点扩容评审',
        risk: '材料没有覆盖 CFO 的真实阻塞点',
        fallback: '先补一次内部评审问题清单',
        status: 'planned',
      },
    ],
    alternativePaths: [],
    confidence: 0.72,
    status: 'active',
    momentum: 'active',
    situationJudgment: '客户业务方想推进，但经济买家背书尚未形成。',
    strategicObjective: '先验证 CFO 的决策标准，再用风险-收益材料推动扩容评审。',
    stakeholderPath: ['Champion', 'CFO'],
    evidenceBasis: ['Champion 在会议中提到预算审批需要 CFO 点头。'],
    riskCounterEvidence: [],
    fieldEvidenceAttributions: [
      {
        field: 'strategicObjective',
        classification: 'fact',
        evidenceRefs: [{ sourceId: 'src_1', sourceType: 'meeting', sourceKind: 'meeting_prep', title: '5/30 会议纪要' }],
        gaps: [],
        rationale: '会议纪要直接支持该目标。',
      },
      {
        field: 'steps[0].expectedOutcome',
        classification: 'inference',
        evidenceRefs: [{ sourceId: 'src_1', sourceType: 'meeting', sourceKind: 'meeting_prep' }],
        gaps: ['还没有 CFO 原话证据'],
        rationale: '第一步用于验证经济买家标准。',
      },
    ],
    knowledgeGaps: ['缺少 CFO 本人对试点扩容的直接反馈'],
    assumptions: [
      {
        id: 'assumption_1',
        text: 'CFO 真正关心的是试点扩容风险，而不是价格本身。',
        status: 'pending',
        createdAt: '2026-06-06T12:00:00.000Z',
      },
    ],
    learnings: [],
    daysSinceProgress: 3,
    createdAt: '2026-06-06T12:00:00.000Z',
    updatedAt: '2026-06-06T13:00:00.000Z',
    ...overrides,
  };
}

describe('buildStrategicPlayRoutePlan', () => {
  it('keeps the formal 2.0 object centered on goal-to-steps route planning', () => {
    const plan = buildStrategicPlayRoutePlan(basePlay());

    expect(plan.schemaVersion).toBe('strategic_play_route_plan_v1');
    expect(plan.goal.description).toBe('获得经济买家对试点扩容的明确背书');
    expect(plan.routeThesis).toBe('先验证 CFO 的决策标准，再用风险-收益材料推动扩容评审。');
    expect(plan.moves).toHaveLength(2);
    expect(plan.currentCriticalMove?.title).toBe('让 champion 复述 CFO 的真实顾虑');
    expect(plan.moves[0]).toMatchObject({
      title: '让 champion 复述 CFO 的真实顾虑',
      expectedJudgmentDelta: 'Champion 能说出 CFO 的一个明确评估标准',
      successTest: 'Champion 能说出 CFO 的一个明确评估标准',
      failureTest: '目标对象无回应、拒绝推进，或实际结果与预期产出不符。',
      fallbackRoute: '转向 coach 验证 CFO 的决策标准',
    });
    expect(plan.moves[0].winGapId).toBeTruthy();
    expect(plan.routeRationale.judgments.map((judgment) => judgment.dimension)).toEqual(expect.arrayContaining(['overall', 'execution', 'relationship']));
  });

  it('turns weak or missing evidence into win gaps and open questions instead of hiding them', () => {
    const plan = buildStrategicPlayRoutePlan(basePlay({
      confidence: 0.38,
      stakeholderPath: [],
      evidenceBasis: [],
      fieldEvidenceAttributions: [
        {
          field: 'stakeholderPath',
          classification: 'gap',
          evidenceRefs: [],
          gaps: ['还不知道 CFO 是否真的是最终经济买家'],
          rationale: '关系路径缺少证据。',
        },
      ],
    }));

    expect(plan.routeRationale.confidenceProfile.missingEvidenceCount).toBeGreaterThan(0);
    expect(plan.winGaps.map((gap) => gap.id)).toContain('win-gap-relationship-coverage');
    expect(plan.situationLayers.find((layer) => layer.key === 'people')?.gaps).toContain('还不知道 CFO 是否真的是最终经济买家');
    expect(plan.openQuestions).toContain('缺少 CFO 本人对试点扩容的直接反馈');
  });

  it('keeps execution feedback connected to route revision signals', () => {
    const play = basePlay({
      steps: [
        {
          ...basePlay().steps[0],
          status: 'blocked',
          actualOutcome: 'Champion 不愿意引荐 CFO，只愿意继续内部沟通。',
          nextAction: '改为寻找 coach 验证 CFO 标准。',
          blockerReason: 'Champion 担心过早暴露预算争议。',
          outcomeAssessment: 'blocked',
          completedAt: '2026-06-06T14:00:00.000Z',
        } as unknown as StrategicPlayRoutePlanInput['steps'][number],
      ],
    });

    const plan = buildStrategicPlayRoutePlan(play);

    expect(plan.feedback).toEqual([
      expect.objectContaining({
        moveId: 'move-1',
        status: 'blocked',
        actualOutcome: 'Champion 不愿意引荐 CFO，只愿意继续内部沟通。',
        nextAction: '改为寻找 coach 验证 CFO 标准。',
        outcomeAssessment: 'blocked',
      }),
    ]);
    expect(plan.moves[0].failureTest).toBe('Champion 担心过早暴露预算争议。');
  });

  it('preserves stored route versions from signal-to-route updates', () => {
    const plan = buildStrategicPlayRoutePlan(basePlay({
      playVersions: [
        {
          version: 2,
          triggerKind: 'decode_signal',
          triggerSourceRef: { sourceId: 'decode_1', sourceType: 'email_decode', sourceKind: 'email_decode' },
          changedJudgmentIds: ['judgment-execution'],
          changedWinGapIds: ['win-gap-counter-evidence'],
          changedMoveIds: ['move-1'],
          diffSummary: '客户新邮件显示 CFO 更关心风险责任，第一步从争取背书改为验证评估标准。',
          createdAt: '2026-06-06T15:00:00.000Z',
        },
      ],
    }));

    expect(plan.whatChanged).toEqual([
      expect.objectContaining({
        version: 2,
        triggerKind: 'decode_signal',
        changedMoveIds: ['move-1'],
        diffSummary: '客户新邮件显示 CFO 更关心风险责任，第一步从争取背书改为验证评估标准。',
      }),
    ]);
  });
});
