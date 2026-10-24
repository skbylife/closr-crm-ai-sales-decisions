import { describe, expect, it } from 'vitest';
import { buildNextBestMoves } from './next-best-moves';
import type { CoverageAssignment, CoverageGap, RelationshipContact, RelationshipEdge, RelationshipTeamMember } from './types';

const contacts: RelationshipContact[] = [
  { id: 'contact_decision', name: '郭敏', email: null, title: '数字化负责人', role: 'decision_maker', department: '数字化办公室', lastContactedAt: null },
  { id: 'contact_procurement', name: '陆倩', email: null, title: '采购经理', role: 'procurement', department: '采购部', lastContactedAt: null },
  { id: 'contact_budget', name: '周岩', email: null, title: '财务总监', role: 'economic_buyer', department: '财务部', lastContactedAt: null },
];

const team: RelationshipTeamMember[] = [
  { userId: 'user_lan', displayName: '林岚', role: 'manager', teamId: 'team_a', isCoverageOwner: true },
  { userId: 'user_xu', displayName: '许洁', role: 'member', teamId: 'team_a', isCoverageOwner: true },
];

function assignment(overrides: Partial<CoverageAssignment>): CoverageAssignment {
  return {
    id: 'assignment_1',
    contactId: 'contact_decision',
    primaryUserId: 'user_lan',
    backupUserId: null,
    relationshipGoal: null,
    relationshipStatus: 'unknown',
    desiredRelationshipStatus: null,
    coverageHealth: 'unknown',
    cadenceDays: 30,
    lastTouchAt: null,
    nextTouchDueAt: null,
    confidence: 0,
    riskReasons: [],
    reviewedAt: null,
    ...overrides,
  };
}

function edge(overrides: Partial<RelationshipEdge>): RelationshipEdge {
  return {
    id: 'edge_1',
    orgId: 'org_1',
    accountId: 'acc_1',
    opportunityId: null,
    fromEntityType: 'user',
    fromUserId: 'user_lan',
    fromContactId: null,
    toContactId: 'contact_decision',
    edgeType: 'communication',
    relationshipStatus: 'trusted',
    strength: 75,
    trend: 'steady',
    confidence: 0.82,
    signalCount: 2,
    lastSignalAt: '2026-05-10T10:00:00.000Z',
    evidenceRefs: [{ sourceId: 'sr_1', sourceKind: 'meeting', sourceTable: 'source_records', sourceRowId: 'sr_1', title: '复盘会', summary: '认可', occurredAt: '2026-05-10T10:00:00.000Z' }],
    computedAt: '2026-05-13T10:00:00.000Z',
    staleAfter: null,
    statusFlags: [],
    metadata: {},
    ...overrides,
  };
}

describe('relationship next best moves', () => {
  it('generates concrete owner-target moves for coverage gaps and stale relationships', () => {
    const gaps: CoverageGap[] = [
      { contactId: 'contact_procurement', kind: 'no_owner', severity: 'high', summary: '陆倩 暂无明确关系负责人。', recommendedOwnerId: null, evidenceRefs: [] },
      { contactId: 'contact_budget', kind: 'unknown_relationship', severity: 'medium', summary: '周岩 有覆盖意图，但关系强度仍待确认。', recommendedOwnerId: 'user_xu', evidenceRefs: [] },
    ];

    const moves = buildNextBestMoves({
      contacts,
      assignments: [assignment({ contactId: 'contact_budget', primaryUserId: 'user_xu' })],
      edges: [edge({ toContactId: 'contact_decision' })],
      gaps,
      staleRelationships: [edge({ id: 'edge_stale', toContactId: 'contact_decision', trend: 'stale', statusFlags: ['stale'] })],
      ourTeam: team,
    });

    expect(moves).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'coverage_gap', priority: 'high', targetContactId: 'contact_procurement' }),
      expect.objectContaining({ kind: 'coverage_gap', ownerUserId: 'user_xu', targetContactId: 'contact_budget' }),
      expect.objectContaining({ kind: 'stale_relationship', targetContactId: 'contact_decision' }),
    ]));
    expect(moves[0]).toEqual(expect.objectContaining({ reason: expect.any(String), goal: expect.any(String), todo: expect.any(String) }));
  });

  it('adds missing key role move when no verified edge covers an economic buyer', () => {
    const moves = buildNextBestMoves({
      contacts,
      assignments: [assignment({ contactId: 'contact_decision' })],
      edges: [edge({ toContactId: 'contact_decision' })],
      gaps: [],
      staleRelationships: [],
      ourTeam: team,
    });

    expect(moves).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'missing_key_role', priority: 'high', targetContactId: 'contact_budget' }),
    ]));
  });
});
