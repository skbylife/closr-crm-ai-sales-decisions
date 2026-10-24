import { describe, expect, it } from 'vitest';
import { buildRepScorecards, sortRepScorecards } from './rep-scorecard';
import type { Account, Opportunity, OrgMember, Task } from '@/lib/babel-engine/types';

const NOW = new Date('2026-05-18T12:00:00.000Z');

function member(overrides: Partial<OrgMember> = {}): OrgMember {
  return {
    id: 'mem_1',
    userId: 'rep_1',
    orgId: 'org_1',
    role: 'member',
    jobTitle: 'ae',
    jobLevel: 0,
    displayName: 'Alice Chen',
    email: 'alice@example.com',
    joinedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc_1',
    name: 'Acme Retail',
    contacts: [
      { id: 'c_1', name: 'Buyer', role: 'decision_maker', email: 'buyer@example.com' },
      { id: 'c_2', name: 'Champion', role: 'champion', email: 'champion@example.com', lastContactedAt: '2026-05-17T00:00:00.000Z' },
    ],
    ...overrides,
  };
}

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'opp_1',
    userId: 'rep_1',
    assignedTo: 'rep_1',
    accountId: 'acc_1',
    name: 'Expansion',
    value: 500_000,
    currency: 'USD',
    stage: 'negotiation',
    probability: 75,
    expectedCloseDate: '2026-06-30',
    owner: 'Alice',
    source: 'manual',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
    meddicc: {
      overallScore: 72,
      metrics: { notes: 'validated', status: 'confirmed', evidence: 'CFO confirmed baseline.' },
      economicBuyer: { status: 'engaged', accessLevel: 'executive' },
      decisionCriteria: [{ id: 'dc_1', criterion: 'ROI', ourFit: 'strong', notes: '' }],
      decisionProcess: [{ id: 'dp_1', step: 'Security review', status: 'in_progress', owner: 'CISO', dueDate: '2026-05-25' }],
      identifiedPain: [{ id: 'pain_1', pain: 'Labor pressure', quantified: true, impactValue: '$1M', notes: '' }],
      champion: { strength: 4, lastEngagement: '2026-05-15', notes: 'active' },
      competition: [],
    },
    mutualActionPlan: { targetSignDate: '2026-06-30', confidence: 80, milestones: [] },
    competitorIds: [],
    notes: '',
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task_1',
    userId: 'rep_1',
    assignedTo: 'rep_1',
    accountId: 'acc_1',
    opportunityId: 'opp_1',
    title: 'Follow up',
    status: 'done',
    priority: 'high',
    dueDate: '2026-05-17',
    source: 'manual',
    aiGenerated: false,
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildRepScorecards', () => {
  it('builds a live rep judgment scorecard from CRM and judgment objects', () => {
    const [scorecard] = buildRepScorecards({
      members: [member()],
      accounts: [account()],
      opportunities: [opportunity()],
      tasks: [task()],
      decodes: [{ id: 'decode_1', userId: 'rep_1', emailText: 'hello', decode: {} as never, date: '2026-05-18T00:00:00.000Z' }],
      strategicPlays: [{
        id: 'play_1',
        orgId: 'org_1',
        userId: 'rep_1',
        accountId: 'acc_1',
        opportunityId: 'opp_1',
        goalType: 'reach_key_person',
        goalDescription: 'Reach buyer',
        steps: [{ index: 0, title: 'Prepare', status: 'completed' } as never],
        alternativePaths: [],
        confidence: 80,
        status: 'active',
        momentum: 'progressing',
        assumptions: [],
        learnings: [],
        daysSinceProgress: 1,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-17T00:00:00.000Z',
      }],
      quotas: [{ userId: 'rep_1', targetAmount: 1_000_000 }],
      now: NOW,
    });

    expect(scorecard).toMatchObject({
      userId: 'rep_1',
      activeDeals: 1,
      pipelineValue: 500_000,
      quota: 1_000_000,
      avgMeddicc: 72,
      strategicPlayCount: 1,
      strategicPlayStepCompletion: 100,
      forecastContradictions: 0,
      relationshipCoverageScore: 85,
      primaryCoachingFocus: '当前没有明显管理介入信号',
      hiddenSignalCount: 0,
    });
    expect(scorecard.reviewSignals).toEqual([]);
    expect(scorecard.overallScore).toBeGreaterThan(60);
  });

  it('flags optimistic forecast, missing evidence, weak coverage, and overdue execution', () => {
    const [scorecard] = buildRepScorecards({
      members: [member()],
      accounts: [account({ contacts: [{ id: 'c_1', name: 'Unknown', email: 'u@example.com' }] })],
      opportunities: [opportunity({
        probability: 90,
        meddicc: {
          overallScore: 25,
          metrics: { notes: '', status: 'unconfirmed', evidence: '' },
          economicBuyer: { status: 'unknown', accessLevel: '' },
          decisionCriteria: [],
          decisionProcess: [],
          identifiedPain: [],
          champion: { strength: 1, lastEngagement: '', notes: '' },
          competition: [],
        },
      })],
      tasks: [task({ status: 'todo', dueDate: '2026-05-01' })],
      decodes: [],
      now: NOW,
    });

    expect(scorecard.forecastContradictions).toBe(1);
    expect(scorecard.forecastRiskAmount).toBe(500_000);
    expect(scorecard.judgmentGaps).toBeGreaterThanOrEqual(4);
    expect(scorecard.coverageGaps).toBeGreaterThan(0);
    expect(scorecard.tasksOverdue).toBe(1);
    expect(scorecard.reviewSignals[0]?.label).toBe('预测校准');
    expect(scorecard.primaryCoachingFocus).toContain('销售概率高于证据支撑');
    expect(scorecard.hiddenSignalCount).toBeGreaterThan(0);
    expect(scorecard.reviewSignals.map((signal) => signal.id)).toEqual(['forecast', 'judgment', 'coverage', 'execution']);
  });

  it('sorts by selected management dimension', () => {
    const scorecards = buildRepScorecards({
      members: [
        member({ userId: 'rep_low', displayName: 'Low' }),
        member({ id: 'mem_2', userId: 'rep_high', displayName: 'High' }),
      ],
      accounts: [account()],
      opportunities: [
        opportunity({ id: 'opp_low', assignedTo: 'rep_low', userId: 'rep_low', probability: 90, meddicc: { ...opportunity().meddicc, overallScore: 20 } }),
        opportunity({ id: 'opp_high', assignedTo: 'rep_high', userId: 'rep_high', probability: 60 }),
      ],
      tasks: [],
      decodes: [],
      now: NOW,
    });

    expect(sortRepScorecards(scorecards, 'forecast')[0].userId).toBe('rep_high');
  });
});
