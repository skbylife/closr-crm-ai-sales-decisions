import { describe, expect, it, vi } from 'vitest';
import type { Account, Opportunity, Task } from '@/lib/babel-engine/types';
import { buildManagerInspectionQueue } from './manager-inspection';

const baseOpportunity: Opportunity = {
  id: 'opp_1',
  accountId: 'acc_1',
  name: 'Expansion',
  value: 100000,
  currency: 'USD',
  stage: 'proposal_sent',
  probability: 35,
  expectedCloseDate: '2026-06-15',
  owner: 'AE',
  source: 'manual',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  meddicc: {
    metrics: { notes: '', status: 'partial', evidence: '' },
    economicBuyer: { status: 'unknown', accessLevel: '' },
    decisionCriteria: [],
    decisionProcess: [],
    identifiedPain: [],
    champion: { strength: 1, lastEngagement: '', notes: '' },
    competition: [],
    overallScore: 0,
  },
  mutualActionPlan: { targetSignDate: '2026-06-15', confidence: 30, milestones: [] },
  competitorIds: [],
  notes: '',
};

const account: Account = {
  id: 'acc_1',
  name: 'Acme Retail',
  contacts: [{ id: 'con_1', name: 'Mia Chen', email: 'example-c7d28b4bac@example.invalid', role: 'contact' }],
};

describe('buildManagerInspectionQueue', () => {
  it('prioritizes opportunities with missing roles and no next step', () => {
    vi.setSystemTime(new Date('2026-06-20T00:00:00Z'));

    const queue = buildManagerInspectionQueue({
      accounts: [account],
      opportunities: [baseOpportunity],
      tasks: [],
    });

    expect(queue[0]).toMatchObject({
      opportunityId: 'opp_1',
      priority: 'critical',
      primaryAction: '确认 champion 或 coach',
    });
    expect(queue[0].risks.map((risk) => risk.id)).toEqual(expect.arrayContaining([
      'missing_champion',
      'missing_economic_buyer',
      'missing_next_step',
      'past_close_date',
    ]));
  });

  it('keeps covered opportunities below critical inspection priority', () => {
    vi.setSystemTime(new Date('2026-06-08T00:00:00Z'));
    const coveredAccount: Account = {
      ...account,
      contacts: [
        { id: 'con_1', name: 'Mia Chen', email: 'example-c7d28b4bac@example.invalid', role: 'champion', lastContactedAt: '2026-06-07T00:00:00Z' },
        { id: 'con_2', name: 'Cal Rao', email: 'example-3579069f49@example.invalid', role: 'economic_buyer', lastContactedAt: '2026-06-07T00:00:00Z' },
        { id: 'con_3', name: 'Pam Li', email: 'example-d6e0ab4f7b@example.invalid', role: 'procurement', lastContactedAt: '2026-06-07T00:00:00Z' },
      ],
    };
    const task: Task = {
      id: 'task_1',
      title: 'Confirm signature path',
      status: 'todo',
      priority: 'medium',
      source: 'manual',
      aiGenerated: false,
      dueDate: '2026-06-10',
      opportunityId: 'opp_1',
      createdAt: '2026-06-07T00:00:00Z',
      updatedAt: '2026-06-07T00:00:00Z',
    };

    const queue = buildManagerInspectionQueue({
      accounts: [coveredAccount],
      opportunities: [{ ...baseOpportunity, expectedCloseDate: '2026-07-30', probability: 70 }],
      tasks: [task],
      intelItems: [{
        id: 'intel_1',
        accountId: 'acc_1',
        accountName: 'Acme Retail',
        opportunityId: 'opp_1',
        type: 'manual',
        source: 'meeting',
        title: 'Procurement joined',
        content: 'Procurement joined the review.',
        summary: 'Procurement joined the review.',
        credibility: 'high',
        urgency: 'low',
        relevance: 'deal',
        date: '2026-06-07T00:00:00Z',
        relatedContactIds: ['con_3'],
      }],
    });

    expect(queue[0].priority).toBe('watch');
    expect(queue[0].risks.map((risk) => risk.id)).toEqual(['stage_aging']);
    expect(queue[0].primaryAction).toBe('复核阶段证据');
  });
});
