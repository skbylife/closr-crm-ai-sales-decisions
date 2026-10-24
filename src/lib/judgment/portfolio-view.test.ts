import { describe, expect, it } from 'vitest';
import { buildPortfolioJudgmentView, type PortfolioAccountInput, type PortfolioOpportunityInput, type PortfolioTaskInput } from './portfolio-view';

const NOW = new Date('2026-05-04T12:00:00.000Z');

function account(overrides: Partial<PortfolioAccountInput> = {}): PortfolioAccountInput {
  return {
    id: 'acc_1',
    name: 'Acme',
    dealHealth: 'at_risk',
    lastActivity: '2026-05-01T12:00:00.000Z',
    ...overrides,
  };
}

function opportunity(overrides: Partial<PortfolioOpportunityInput> = {}): PortfolioOpportunityInput {
  return {
    id: 'opp_1',
    accountId: 'acc_1',
    name: 'Expansion',
    value: 250_000,
    stage: 'negotiation',
    probability: 80,
    updatedAt: '2026-05-01T12:00:00.000Z',
    meddicc: {
      overallScore: 55,
      metrics: { status: 'confirmed', evidence: 'CFO validated pain.' },
      economicBuyer: { status: 'engaged', accessLevel: 'executive' },
      decisionCriteria: [{ id: 'dc_1' }],
      decisionProcess: [{ status: 'in_progress', owner: 'CFO' }],
      identifiedPain: [{ id: 'pain_1' }],
      champion: { strength: 4, lastEngagement: '2026-05-01T12:00:00.000Z', notes: 'Active' },
    },
    mutualActionPlan: { confidence: 0.7, milestones: [] },
    ...overrides,
  };
}

function task(overrides: Partial<PortfolioTaskInput> = {}): PortfolioTaskInput {
  return {
    id: 'task_1',
    accountId: 'acc_1',
    opportunityId: 'opp_1',
    title: 'Follow up',
    status: 'todo',
    priority: 'high',
    dueDate: '2026-05-01',
    updatedAt: '2026-05-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('buildPortfolioJudgmentView', () => {
  it('separates manager stuck/coaching output from executive intervention candidates', () => {
    const view = buildPortfolioJudgmentView({
      accounts: [account()],
      opportunities: [opportunity()],
      tasks: [task()],
      now: NOW,
    });

    expect(view.manager.stuckDeals[0]).toMatchObject({ accountId: 'acc_1', kind: 'stuck_deal' });
    expect(view.manager.coachingCandidates.length).toBeGreaterThan(0);
    expect(view.executive.executiveInterventionCandidates?.[0]).toMatchObject({
      accountId: 'acc_1',
      kind: 'executive_intervention',
      evidenceHealth: 'sufficient',
    });
    expect(view.executive.coachingCandidates).toHaveLength(0);
  });

  it('keeps management queue judgment distinct from business impact', () => {
    const view = buildPortfolioJudgmentView({
      accounts: [account()],
      opportunities: [opportunity()],
      tasks: [task()],
      now: NOW,
    });

    const queueItem = view.managementQueue.find((item) => item.queueType === 'intervene');
    expect(queueItem?.currentJudgment).toBe('Expansion 需要管理层判断。当前已满足高层介入候选条件。');
    expect(queueItem?.whyThisMatters).toContain('关键动作已逾期');
    expect(queueItem?.currentJudgment).not.toBe(queueItem?.whyThisMatters);
  });

  it('downgrades thin evidence to Manager verify instead of executive intervention', () => {
    const view = buildPortfolioJudgmentView({
      accounts: [account({ id: 'acc_thin', name: 'ThinCo', dealHealth: 'critical', lastActivity: null })],
      opportunities: [opportunity({
        id: 'opp_thin',
        accountId: 'acc_thin',
        value: 500_000,
        meddicc: {
          overallScore: 20,
          economicBuyer: { status: 'identified', accessLevel: 'executive' },
          champion: { strength: 1, notes: '' },
          decisionCriteria: [],
          decisionProcess: [],
          identifiedPain: [],
          metrics: { status: 'unconfirmed', evidence: '' },
        },
      })],
      tasks: [],
      now: NOW,
    });

    expect(view.executive.executiveInterventionCandidates).toHaveLength(0);
    expect(view.manager.verifyBeforeEscalate[0]).toMatchObject({
      accountId: 'acc_thin',
      kind: 'manager_verify',
      evidenceHealth: 'thin',
    });
    expect(view.manager.verifyBeforeEscalate[0].recommendedAction).toContain('经理核验');
  });

  it('keeps drilldown refs on every emitted signal', () => {
    const view = buildPortfolioJudgmentView({
      accounts: [account()],
      opportunities: [opportunity()],
      tasks: [task(), task({ id: 'task_2' }), task({ id: 'task_3' })],
      conflicts: [{ id: 'conflict_1', accountId: 'acc_1', summary: 'Forecast says commit, evidence says risk.', kind: 'forecast', severity: 'high' }],
      now: NOW,
    });

    const signals = [
      ...view.manager.stuckDeals,
      ...view.manager.coachingCandidates,
      ...view.manager.verifyBeforeEscalate,
      ...view.manager.forecastContradictions,
      ...view.manager.falseActivity,
      ...view.manager.evidenceHealth,
      ...(view.executive.executiveInterventionCandidates ?? []),
      ...(view.executive.nonInterventionCandidates ?? []),
    ];

    expect(signals.length).toBeGreaterThan(0);
    for (const signal of signals) {
      expect(signal.accountId).toBeTruthy();
      expect(signal.reason).toBeTruthy();
      expect(signal.recommendedAction).toBeTruthy();
      expect(signal.drilldownHref).toBe(`/accounts/${signal.accountId}?tab=overview`);
      expect(signal.evidenceHealth || signal.confidence).toBeTruthy();
    }
  });

  it('excludes closed_won and closed_lost opportunities from candidates', () => {
    const view = buildPortfolioJudgmentView({
      accounts: [account()],
      opportunities: [
        opportunity({ id: 'won', stage: 'closed_won' }),
        opportunity({ id: 'lost', stage: 'closed_lost' }),
      ],
      tasks: [task({ opportunityId: 'won' }), task({ id: 'task_lost', opportunityId: 'lost' })],
      now: NOW,
    });

    expect(view.summary.openOpportunities).toBe(0);
    expect(view.manager.stuckDeals).toHaveLength(0);
    expect(view.executive.executiveInterventionCandidates).toHaveLength(0);
  });

  it('surfaces read-only ownership gaps for strategic opportunities without assigning an owner', () => {
    const view = buildPortfolioJudgmentView({
      accounts: [account({
        ownerId: null,
        userId: null,
        businessTeamId: null,
        dealHealth: 'at_risk',
      })],
      opportunities: [opportunity({
        value: 320_000,
        stage: 'negotiation',
        meddicc: {
          overallScore: 45,
          metrics: { status: 'partial', evidence: '' },
          economicBuyer: { status: 'identified', accessLevel: 'director' },
          decisionCriteria: [],
          decisionProcess: [],
          identifiedPain: [],
          champion: { strength: 2, notes: '' },
        },
      })],
      pursuitTeams: [],
      now: NOW,
    });

    expect(view.summary.ownershipGaps).toBe(1);
    expect(view.managementQueue[0]).toMatchObject({
      queueType: 'ownership_gap',
      accountId: 'acc_1',
      drilldownHref: '/accounts/acc_1?tab=team',
      ownerSummary: { status: 'gap' },
    });
    expect(view.managementQueue[0].recommendedAction).toContain('不自动指派 owner');
  });

  it('uses pursuit team lead only as a recommended judgment owner', () => {
    const view = buildPortfolioJudgmentView({
      accounts: [account({
        ownerId: null,
        userId: null,
        businessTeamId: 'team_1',
      })],
      opportunities: [opportunity({ value: 320_000 })],
      pursuitTeams: [{
        id: 'pt_1',
        accountId: 'acc_1',
        opportunityId: 'opp_1',
        name: 'Expansion team',
        status: 'active',
        leadUserId: 'user_lead',
        leadName: '李明',
        memberCount: 2,
        responsibilityLabels: ['采购流程推进'],
      }],
      now: NOW,
    });

    const gap = view.managementQueue.find((item) => item.queueType === 'ownership_gap');
    expect(gap?.ownerSummary).toMatchObject({
      status: 'recommended',
      ownerUserId: 'user_lead',
      ownerName: '李明',
    });
    expect(gap?.recommendedAction).toContain('建议由李明先核验');
  });
});
