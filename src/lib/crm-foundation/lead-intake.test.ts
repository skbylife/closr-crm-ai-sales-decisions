import { describe, expect, it } from 'vitest';
import type { Account, IntelItem, Opportunity, SavedDecode } from '@/lib/babel-engine/types';
import { buildLeadIntakeQueue } from './lead-intake';

const account: Account = {
  id: 'acc_1',
  name: 'Acme Retail',
  contacts: [{ id: 'con_1', name: 'Mia Chen', email: 'example-c7d28b4bac@example.invalid' }],
};

const opportunity: Opportunity = {
  id: 'opp_1',
  accountId: 'acc_1',
  name: 'Expansion',
  value: 100000,
  currency: 'USD',
  stage: 'discovery',
  probability: 30,
  expectedCloseDate: '2026-07-01',
  owner: 'AE',
  source: 'manual',
  createdAt: '2026-06-01T00:00:00Z',
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
  mutualActionPlan: { targetSignDate: '2026-07-01', confidence: 30, milestones: [] },
  competitorIds: [],
  notes: '',
};

function decode(overrides: Partial<SavedDecode>): SavedDecode {
  return {
    id: 'decode_1',
    emailText: 'We want to evaluate a rollout.',
    decode: {
      messages: [],
      threadAnalysis: {
        sentimentTrend: 'warming',
        riskLevel: 'high',
        buyerState: 'evaluating',
        keySignal: 'New rollout evaluation opened.',
      },
    },
    date: '2026-06-08T00:00:00Z',
    ...overrides,
  };
}

describe('buildLeadIntakeQueue', () => {
  it('matches an unlinked decode to account, contact, and open opportunity', () => {
    const queue = buildLeadIntakeQueue({
      accounts: [account],
      opportunities: [opportunity],
      decodes: [decode({ accountId: 'acc_1', originalSenderEmail: 'example-c7d28b4bac@example.invalid' })],
    });

    expect(queue[0]).toMatchObject({
      id: 'decode:decode_1',
      status: 'matched_opportunity',
      matchedAccountId: 'acc_1',
      matchedContactId: 'con_1',
      matchedOpportunityId: 'opp_1',
      nextAction: '挂入现有商机',
    });
  });

  it('surfaces new-company decodes as ready to convert', () => {
    const queue = buildLeadIntakeQueue({
      accounts: [account],
      opportunities: [],
      decodes: [decode({ id: 'decode_2', clientName: 'NewCo', originalSenderName: 'Nina' })],
    });

    expect(queue[0]).toMatchObject({
      id: 'decode:decode_2',
      companyName: 'NewCo',
      status: 'ready_to_convert',
      nextAction: '创建客户、联系人和商机',
    });
  });

  it('keeps account-level intel in the intake queue when no opportunity is linked', () => {
    const intel: IntelItem = {
      id: 'intel_1',
      accountId: 'acc_1',
      accountName: 'Acme Retail',
      type: 'manual',
      source: 'news',
      title: 'New buying committee',
      content: 'Procurement joined the review.',
      summary: 'Procurement joined the review.',
      credibility: 'high',
      urgency: 'medium',
      relevance: 'deal',
      date: '2026-06-07T00:00:00Z',
      relatedContactIds: [],
    };

    const queue = buildLeadIntakeQueue({
      accounts: [account],
      opportunities: [],
      intelItems: [intel],
    });

    expect(queue[0]).toMatchObject({
      id: 'intel:intel_1',
      source: 'intel',
      status: 'matched_account',
      nextAction: '补联系人并创建商机',
    });
  });
});
