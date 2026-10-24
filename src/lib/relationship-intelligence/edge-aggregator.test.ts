import { describe, expect, it } from 'vitest';
import { aggregateRelationshipEdges } from './edge-aggregator';
import type { CoverageAssignment, RelationshipSignal } from './types';

function signal(overrides: Partial<RelationshipSignal>): RelationshipSignal {
  return {
    id: 'sig_1',
    orgId: 'org_1',
    accountId: 'acc_1',
    opportunityId: null,
    contactId: 'contact_1',
    actorUserId: 'user_1',
    kind: 'forwarded_email_decode',
    valence: 'neutral',
    strength: 35,
    confidence: 0.55,
    summary: 'Forwarded email decode indicates communication.',
    quoteText: null,
    evidence: { sourceId: 'decode_1', sourceKind: 'email_decode', sourceTable: 'email_decodes', sourceRowId: 'decode_1' },
    occurredAt: '2026-05-10T12:00:00.000Z',
    metadata: {},
    ...overrides,
  };
}

function assignment(overrides: Partial<CoverageAssignment>): CoverageAssignment {
  return {
    id: 'assignment_1',
    contactId: 'contact_1',
    primaryUserId: 'user_1',
    backupUserId: null,
    relationshipGoal: null,
    relationshipStatus: 'unknown',
    desiredRelationshipStatus: null,
    coverageHealth: 'unknown',
    cadenceDays: 60,
    lastTouchAt: null,
    nextTouchDueAt: null,
    confidence: 0,
    riskReasons: [],
    reviewedAt: null,
    ...overrides,
  };
}

describe('relationship edge aggregation', () => {
  it('supports multiple internal members covering the same customer contact independently', () => {
    const edges = aggregateRelationshipEdges({
      orgId: 'org_1',
      accountId: 'acc_1',
      signals: [
        signal({ id: 'sig_a', actorUserId: 'user_a', contactId: 'contact_1' }),
        signal({ id: 'sig_b', actorUserId: 'user_b', contactId: 'contact_1', strength: 55 }),
      ],
      now: new Date('2026-05-13T12:00:00.000Z'),
    });

    expect(edges).toHaveLength(2);
    expect(new Set(edges.map((edge) => edge.toContactId))).toEqual(new Set(['contact_1']));
    expect(new Set(edges.map((edge) => edge.fromUserId))).toEqual(new Set(['user_a', 'user_b']));
  });

  it('keeps Unknown distinct from No Relationship when there is coverage intent but no evidence', () => {
    const edges = aggregateRelationshipEdges({
      orgId: 'org_1',
      accountId: 'acc_1',
      signals: [],
      assignments: [assignment({ primaryUserId: 'user_1', contactId: 'contact_1' })],
      now: new Date('2026-05-13T12:00:00.000Z'),
    });

    expect(edges).toHaveLength(1);
    expect(edges[0].relationshipStatus).toBe('unknown');
    expect(edges[0].relationshipStatus).not.toBe('none');
    expect(edges[0].statusFlags).toContain('evidence_missing');
  });

  it('preserves explicit No Relationship from coverage assignments without treating it as missing evidence', () => {
    const edges = aggregateRelationshipEdges({
      orgId: 'org_1',
      accountId: 'acc_1',
      signals: [],
      assignments: [assignment({ primaryUserId: 'user_1', contactId: 'contact_1', relationshipStatus: 'none' })],
      now: new Date('2026-05-13T12:00:00.000Z'),
    });

    expect(edges).toHaveLength(1);
    expect(edges[0].relationshipStatus).toBe('none');
    expect(edges[0].statusFlags).not.toContain('evidence_missing');
    expect(edges[0].strength).toBe(0);
  });

  it('marks stale relationships and discounts strength when evidence is older than cadence', () => {
    const edges = aggregateRelationshipEdges({
      orgId: 'org_1',
      accountId: 'acc_1',
      signals: [signal({ strength: 70, occurredAt: '2026-01-01T12:00:00.000Z' })],
      assignments: [assignment({ cadenceDays: 30 })],
      now: new Date('2026-05-13T12:00:00.000Z'),
    });

    expect(edges[0].trend).toBe('stale');
    expect(edges[0].statusFlags).toContain('stale');
    expect(edges[0].strength).toBeLessThan(70);
    expect(edges[0].staleAfter).toBe('2026-01-31T12:00:00.000Z');
  });
});
