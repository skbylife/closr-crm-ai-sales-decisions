import { describe, expect, it, vi } from 'vitest';
import type { Account, Opportunity, SalesLead, SavedDecode, Task } from '@/lib/babel-engine/types';
import { buildSalesWorkbenchModel } from './sales-workbench';

const account: Account = {
  id: 'acc_1',
  name: 'Acme Retail',
  contacts: [{ id: 'con_1', name: 'Mia Chen', email: 'example-c7d28b4bac@example.invalid', role: 'contact' }],
};

const opportunity: Opportunity = {
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

const overdueTask: Task = {
  id: 'task_1',
  title: 'Send ROI proof',
  status: 'todo',
  priority: 'high',
  source: 'manual',
  aiGenerated: false,
  dueDate: '2026-06-01',
  opportunityId: 'opp_1',
  createdAt: '2026-05-30T00:00:00Z',
  updatedAt: '2026-05-30T00:00:00Z',
};

const decode: SavedDecode = {
  id: 'decode_1',
  emailText: 'We need to evaluate this quarter.',
  clientName: 'NewCo',
  originalSenderName: 'Nina',
  originalSenderEmail: 'example-4911215229@example.invalid',
  date: '2026-06-08T00:00:00Z',
  decode: {
    messages: [],
    threadAnalysis: {
      sentimentTrend: 'warming',
      riskLevel: 'high',
      buyerState: 'evaluating',
      keySignal: 'New evaluation opened.',
    },
  },
};

const persistedLead: SalesLead = {
  id: 'lead_1',
  companyName: 'Northstar Foods',
  contactName: 'Julia Chen',
  source: 'manual',
  need: 'Evaluate a regional rollout',
  estimatedValue: 300000,
  currency: 'USD',
  priority: 'high',
  status: 'qualified',
  createdAt: '2026-06-10T00:00:00Z',
  updatedAt: '2026-06-19T00:00:00Z',
};

describe('buildSalesWorkbenchModel', () => {
  it('combines overdue tasks, inspection risks, and lead intake into one action queue', () => {
    vi.setSystemTime(new Date('2026-06-20T00:00:00Z'));

    const model = buildSalesWorkbenchModel({
      accounts: [account],
      opportunities: [opportunity],
      tasks: [overdueTask],
      decodes: [decode],
    });

    expect(model.leadCount).toBe(1);
    expect(model.criticalDealCount).toBe(1);
    expect(model.overdueTaskCount).toBe(1);
    expect(model.actions.map((action) => action.type)).toEqual(expect.arrayContaining(['task', 'inspection', 'lead']));
    expect(model.actions[0]).toMatchObject({
      type: 'task',
      priority: 'critical',
      action: '处理逾期任务',
    });
  });

  it('uses persisted CRM leads as first-class workbench actions', () => {
    vi.setSystemTime(new Date('2026-06-20T00:00:00Z'));

    const model = buildSalesWorkbenchModel({
      accounts: [account],
      opportunities: [],
      leads: [persistedLead, { ...persistedLead, id: 'lead_done', status: 'converted' }],
      decodes: [decode],
    });

    expect(model.leadCount).toBe(2);
    expect(model.actions[0]).toMatchObject({
      id: 'lead:lead_1',
      type: 'lead',
      priority: 'high',
      href: '/leads',
      action: '转化为客户/联系人/商机',
    });
  });
});
