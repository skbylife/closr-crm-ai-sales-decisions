import { describe, expect, it, vi } from 'vitest';
import type { Contact, Opportunity, SavedDecode, Task } from '@/lib/babel-engine/types';
import { buildContactOpportunityCoverage, buildUnifiedTimeline } from './opportunity-workbench';

vi.setSystemTime(new Date('2026-06-08T12:00:00Z'));

const baseOpportunity: Opportunity = {
  id: 'opp_1',
  accountId: 'acc_1',
  name: 'Platform renewal',
  value: 500000,
  currency: 'USD',
  stage: 'negotiation',
  probability: 60,
  expectedCloseDate: '2026-07-15',
  owner: 'AE',
  source: 'manual',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  meddicc: {
    metrics: { notes: '', status: 'partial', evidence: '' },
    economicBuyer: { status: 'identified', accessLevel: '' },
    decisionCriteria: [],
    decisionProcess: [],
    identifiedPain: [],
    champion: { strength: 3, lastEngagement: '2026-05-20', notes: '' },
    competition: [],
    overallScore: 40,
  },
  mutualActionPlan: { targetSignDate: '2026-07-15', confidence: 60, milestones: [] },
  competitorIds: [],
  notes: 'Close path needs confirmation.',
};

function contact(overrides: Partial<Contact>): Contact {
  return {
    id: overrides.id ?? 'contact_1',
    name: overrides.name ?? 'Ada',
    email: overrides.email ?? 'ada@example.com',
    ...overrides,
  };
}

describe('buildContactOpportunityCoverage', () => {
  it('surfaces opportunity-level relationship gaps from account contacts', () => {
    const model = buildContactOpportunityCoverage({
      opportunity: baseOpportunity,
      contacts: [
        contact({ id: 'c1', name: 'Champion', role: 'champion', lastContactedAt: '2026-06-01T00:00:00Z' }),
        contact({ id: 'c2', name: 'Evaluator', role: 'technical_evaluator', lastContactedAt: '2026-05-10T00:00:00Z' }),
      ],
    });

    expect(model.roles.map((role) => role.roleType)).toEqual(['champion', 'technical_evaluator']);
    expect(model.gaps.map((gap) => gap.id)).toEqual(['missing_economic_buyer', 'missing_process_gate', 'single_threaded']);
    expect(model.status).toBe('thin');
  });

  it('marks stale contact coverage as needing touch without hiding the role', () => {
    const model = buildContactOpportunityCoverage({
      opportunity: baseOpportunity,
      contacts: [contact({ role: 'economic_buyer', lastContactedAt: '2026-04-01T00:00:00Z' })],
    });

    expect(model.roles[0]).toMatchObject({
      roleType: 'economic_buyer',
      coverageStatus: 'needs_touch',
      nextAction: '重新触达并确认立场',
    });
  });

  it('prefers persisted opportunity roles over inferred account contact roles', () => {
    const model = buildContactOpportunityCoverage({
      opportunity: baseOpportunity,
      contacts: [
        contact({ id: 'c1', name: 'Old Profile Role', role: 'technical_evaluator', lastContactedAt: '2026-06-01T00:00:00Z' }),
      ],
      persistedRoles: [
        {
          contactId: 'c1',
          contactName: 'Ada Confirmed',
          roleType: 'economic_buyer',
          influence: 'high',
          stance: 'supportive',
          coverageStatus: 'covered',
          lastEngagedAt: '2026-06-07T00:00:00Z',
          confidence: 0.9,
        },
      ],
    });

    expect(model.roles).toHaveLength(1);
    expect(model.roles[0]).toMatchObject({
      contactName: 'Ada Confirmed',
      roleType: 'economic_buyer',
      influence: 'high',
      source: 'persisted',
      confidence: 0.9,
    });
    expect(model.gaps.map((gap) => gap.id)).toContain('missing_champion');
  });
});

describe('buildUnifiedTimeline', () => {
  it('combines opportunity facts, decodes, and tasks into one ordered timeline', () => {
    const decode: SavedDecode = {
      id: 'decode_1',
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      emailText: 'Customer asked for procurement path.',
      signalSource: 'email',
      decode: {
        messages: [],
        threadAnalysis: {
          sentimentTrend: 'stable',
          riskLevel: 'high',
          buyerState: 'evaluating',
          keySignal: 'Procurement path is now active.',
        },
      },
      date: '2026-06-07T00:00:00Z',
    };
    const task: Task = {
      id: 'task_1',
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      title: 'Confirm economic buyer',
      status: 'todo',
      priority: 'high',
      source: 'manual',
      aiGenerated: false,
      createdAt: '2026-06-06T00:00:00Z',
      updatedAt: '2026-06-06T00:00:00Z',
    };

    const model = buildUnifiedTimeline({
      opportunity: baseOpportunity,
      accountId: 'acc_1',
      decodes: [decode],
      tasks: [task],
    });

    expect(model.events.map((event) => event.id)).toContain('decode-decode_1');
    expect(model.events.map((event) => event.id)).toContain('task-task_1');
    expect(model.events[0].occurredAt).toBe('2026-06-07T00:00:00.000Z');
    expect(model.stale).toBe(false);
  });

  it('uses persisted timeline events as the primary fact source when present', () => {
    const model = buildUnifiedTimeline({
      opportunity: baseOpportunity,
      accountId: 'acc_1',
      persistedEvents: [
        {
          id: 'timeline-event-1',
          type: 'meeting',
          occurredAt: '2026-06-08T00:00:00Z',
          title: 'Confirmed budget owner',
          relatedContactIds: ['c1'],
          relatedOpportunityId: 'opp_1',
          relatedAccountId: 'acc_1',
        },
      ],
      tasks: [
        {
          id: 'task_ignored',
          accountId: 'acc_1',
          opportunityId: 'opp_1',
          title: 'Dynamic fallback task',
          status: 'todo',
          priority: 'high',
          source: 'manual',
          aiGenerated: false,
          createdAt: '2026-06-06T00:00:00Z',
          updatedAt: '2026-06-06T00:00:00Z',
        },
      ],
    });

    expect(model.events.map((event) => event.id)).toEqual(['timeline-event-1']);
    expect(model.events[0].source).toBe('persisted');
    expect(model.stale).toBe(false);
  });
});
