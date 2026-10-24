import type { CoverageAssignment, CoverageGap, RelationshipContact, RelationshipEdge } from './types';

const DEFAULT_STALE_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / DAY_MS);
}

export function staleAfterFor(lastSignalAt: string | null, cadenceDays?: number | null): string | null {
  if (!lastSignalAt) return null;
  const parsed = new Date(lastSignalAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return addDays(parsed, cadenceDays ?? DEFAULT_STALE_DAYS).toISOString();
}

export function isStale(lastSignalAt: string | null, now = new Date(), cadenceDays?: number | null): boolean {
  const staleAfter = staleAfterFor(lastSignalAt, cadenceDays);
  if (!staleAfter) return false;
  return new Date(staleAfter).getTime() < now.getTime();
}

export function deriveRelationshipStatus(strength: number, signalCount: number): RelationshipEdge['relationshipStatus'] {
  if (signalCount <= 0) return 'unknown';
  if (strength >= 82) return 'can_introduce';
  if (strength >= 68) return 'trusted';
  if (strength >= 52) return 'familiar';
  if (strength >= 28) return 'engaged';
  return 'introduced';
}

export function calculateCoverageHealth(params: {
  assignment?: CoverageAssignment | null;
  edge?: RelationshipEdge | null;
  now?: Date;
}): CoverageAssignment['coverageHealth'] {
  const now = params.now ?? new Date();
  const edge = params.edge ?? null;
  const assignment = params.assignment ?? null;

  if (assignment?.riskReasons.length) return 'risk';
  if (!assignment?.primaryUserId && !assignment?.backupUserId) return 'gap';
  if (!edge) return 'unknown';
  if (edge.relationshipStatus === 'none') return 'gap';
  if (edge.relationshipStatus === 'unknown') return 'unknown';
  if (isStale(edge.lastSignalAt, now, assignment?.cadenceDays)) return 'stale';
  if (edge.signalCount < 2 || edge.confidence < 0.45) return 'thin';
  return 'healthy';
}

export function buildCoverageGaps(params: {
  contacts: RelationshipContact[];
  assignments: CoverageAssignment[];
  edges: RelationshipEdge[];
  now?: Date;
}): CoverageGap[] {
  const now = params.now ?? new Date();
  const assignmentsByContact = new Map(params.assignments.map((assignment) => [assignment.contactId, assignment]));
  const edgesByContact = new Map<string, RelationshipEdge[]>();
  for (const edge of params.edges) {
    const list = edgesByContact.get(edge.toContactId) ?? [];
    list.push(edge);
    edgesByContact.set(edge.toContactId, list);
  }

  const gaps: CoverageGap[] = [];
  for (const contact of params.contacts) {
    const assignment = assignmentsByContact.get(contact.id) ?? null;
    const edges = edgesByContact.get(contact.id) ?? [];
    const bestEdge = edges.sort((a, b) => b.strength - a.strength)[0] ?? null;

    if (!assignment?.primaryUserId && !assignment?.backupUserId) {
      gaps.push({
        contactId: contact.id,
        kind: 'no_owner',
        severity: 'high',
        summary: `${contact.name} 暂无明确关系负责人。`,
        recommendedOwnerId: null,
        evidenceRefs: [],
      });
      continue;
    }

    if (!bestEdge || bestEdge.relationshipStatus === 'unknown') {
      gaps.push({
        contactId: contact.id,
        kind: 'unknown_relationship',
        severity: 'medium',
        summary: `${contact.name} 有覆盖意图，但关系强度仍待确认。`,
        recommendedOwnerId: assignment.primaryUserId ?? assignment.backupUserId,
        evidenceRefs: bestEdge?.evidenceRefs ?? [],
      });
      continue;
    }

    if (isStale(bestEdge.lastSignalAt, now, assignment.cadenceDays)) {
      gaps.push({
        contactId: contact.id,
        kind: 'stale_relationship',
        severity: 'medium',
        summary: `${contact.name} 已有关系证据，但最近证据已过期。`,
        recommendedOwnerId: bestEdge.fromUserId ?? assignment.primaryUserId ?? assignment.backupUserId,
        evidenceRefs: bestEdge.evidenceRefs,
      });
    } else if (bestEdge.signalCount < 2 || bestEdge.confidence < 0.45) {
      gaps.push({
        contactId: contact.id,
        kind: 'thin_evidence',
        severity: 'low',
        summary: `${contact.name} 关系证据较少，依赖前需要复核。`,
        recommendedOwnerId: bestEdge.fromUserId ?? assignment.primaryUserId ?? assignment.backupUserId,
        evidenceRefs: bestEdge.evidenceRefs,
      });
    }
  }

  return gaps;
}
