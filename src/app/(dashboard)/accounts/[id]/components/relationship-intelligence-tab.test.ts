import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { bestEdgeForContact, RelationshipIntelligenceTab } from './relationship-intelligence-tab';

describe('RelationshipIntelligenceTab', () => {
  it('renders a stable loading shell before client-side data arrives', () => {
    const html = renderToStaticMarkup(createElement(RelationshipIntelligenceTab, { accountId: 'acc_1' }));

    expect(html).toContain('正在加载关系智能');
  });
});


it('keeps explicit no-relationship distinct from unknown when choosing the contact status', () => {
  const edgeBase = {
    id: 'edge_unknown',
    orgId: 'org_1',
    accountId: 'acc_1',
    opportunityId: null,
    fromEntityType: 'user' as const,
    fromUserId: 'user_1',
    fromContactId: null,
    toContactId: 'contact_1',
    edgeType: 'communication' as const,
    relationshipStatus: 'unknown' as const,
    strength: 0,
    trend: 'unknown' as const,
    confidence: 0,
    signalCount: 0,
    lastSignalAt: null,
    evidenceRefs: [],
    computedAt: '2026-05-14T00:00:00.000Z',
    staleAfter: null,
    statusFlags: ['evidence_missing'],
    metadata: {},
  };

  expect(bestEdgeForContact([
    edgeBase,
    { ...edgeBase, id: 'edge_none', relationshipStatus: 'none' as const },
  ], 'contact_1')?.relationshipStatus).toBe('none');
});
