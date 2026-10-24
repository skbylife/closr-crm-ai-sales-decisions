import { calculateCoverageHealth, deriveRelationshipStatus, isStale, staleAfterFor } from './coverage-health';
import type { CoverageAssignment, RelationshipEdge, RelationshipEvidenceRef, RelationshipSignal } from './types';

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function uniqEvidence(refs: Array<RelationshipEvidenceRef | null>): RelationshipEvidenceRef[] {
  const seen = new Set<string>();
  const result: RelationshipEvidenceRef[] = [];
  for (const ref of refs) {
    if (!ref) continue;
    const key = `${ref.sourceTable ?? ''}:${ref.sourceRowId ?? ref.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result.slice(0, 8);
}

function latestIso(values: string[]): string | null {
  let latest: Date | null = null;
  for (const value of values) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    if (!latest || date.getTime() > latest.getTime()) latest = date;
  }
  return latest?.toISOString() ?? null;
}

function edgeKey(params: { accountId: string; contactId: string; userId: string | null; edgeType?: string }): string {
  return `${params.accountId}:${params.userId ?? 'unknown'}:${params.contactId}:${params.edgeType ?? 'communication'}`;
}

export function aggregateRelationshipEdges(params: {
  orgId: string;
  accountId: string;
  signals: RelationshipSignal[];
  assignments?: CoverageAssignment[];
  now?: Date;
}): RelationshipEdge[] {
  const now = params.now ?? new Date();
  const byEdge = new Map<string, RelationshipSignal[]>();

  for (const signal of params.signals) {
    if (signal.orgId !== params.orgId || signal.accountId !== params.accountId) continue;
    if (!signal.contactId || !signal.actorUserId) continue;
    const key = edgeKey({ accountId: signal.accountId, contactId: signal.contactId, userId: signal.actorUserId });
    const list = byEdge.get(key) ?? [];
    list.push(signal);
    byEdge.set(key, list);
  }

  const assignmentByPair = new Map<string, CoverageAssignment>();
  for (const assignment of params.assignments ?? []) {
    for (const userId of [assignment.primaryUserId, assignment.backupUserId]) {
      if (!userId) continue;
      assignmentByPair.set(edgeKey({ accountId: params.accountId, contactId: assignment.contactId, userId }), assignment);
      if (!byEdge.has(edgeKey({ accountId: params.accountId, contactId: assignment.contactId, userId }))) {
        byEdge.set(edgeKey({ accountId: params.accountId, contactId: assignment.contactId, userId }), []);
      }
    }
  }

  const edges: RelationshipEdge[] = [];
  for (const [key, signals] of byEdge) {
    const [, userIdRaw, contactId] = key.split(':');
    const userId = userIdRaw === 'unknown' ? null : userIdRaw;
    const assignment = assignmentByPair.get(key) ?? null;
    const lastSignalAt = latestIso(signals.map((signal) => signal.occurredAt));
    const stale = isStale(lastSignalAt, now, assignment?.cadenceDays);
    const explicitNoRelationship = signals.length === 0 && assignment?.relationshipStatus === 'none';
    const rawStrength = signals.length > 0
      ? average(signals.map((signal) => signal.strength)) + Math.min(20, signals.length * 5)
      : 0;
    const strength = explicitNoRelationship ? 0 : stale ? clamp(rawStrength - 25) : clamp(rawStrength);
    const signalCount = signals.length;
    const status = explicitNoRelationship ? 'none' : deriveRelationshipStatus(strength, signalCount);
    const staleAfter = staleAfterFor(lastSignalAt, assignment?.cadenceDays);
    const confidence = signals.length > 0
      ? Math.min(0.95, Math.max(0, average(signals.map((signal) => signal.confidence)) + Math.min(0.2, signals.length * 0.04)))
      : 0;
    const statusFlags = [
      stale ? 'stale' : null,
      signalCount === 0 && !explicitNoRelationship ? 'evidence_missing' : null,
      assignment?.relationshipStatus === 'risk' ? 'risk' : null,
    ].filter((flag): flag is string => Boolean(flag));

    const edge: RelationshipEdge = {
      id: `derived:${params.accountId}:${userId ?? 'unknown'}:${contactId}:communication`,
      orgId: params.orgId,
      accountId: params.accountId,
      opportunityId: signals.find((signal) => signal.opportunityId)?.opportunityId ?? null,
      fromEntityType: userId ? 'user' : 'unknown',
      fromUserId: userId,
      fromContactId: null,
      toContactId: contactId,
      edgeType: 'communication',
      relationshipStatus: status,
      strength,
      trend: signalCount === 0 ? 'unknown' : stale ? 'stale' : 'steady',
      confidence,
      signalCount,
      lastSignalAt,
      evidenceRefs: uniqEvidence(signals.map((signal) => signal.evidence)),
      computedAt: now.toISOString(),
      staleAfter,
      statusFlags,
      metadata: {
        derivedBy: 'relationship-intelligence-foundation',
        coverageHealth: calculateCoverageHealth({ assignment, edge: null, now }),
        assignmentId: assignment?.id ?? null,
      },
    };
    edge.metadata.coverageHealth = calculateCoverageHealth({ assignment, edge, now });
    edges.push(edge);
  }

  return edges.sort((a, b) => b.strength - a.strength || a.toContactId.localeCompare(b.toContactId));
}
