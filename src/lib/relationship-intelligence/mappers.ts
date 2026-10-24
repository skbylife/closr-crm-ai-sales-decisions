import type {
  ContactCoverageAssignmentRow,
  ContactRow,
  CoverageAssignment,
  JsonObject,
  OrgMemberRow,
  RelationshipContact,
  RelationshipEdge,
  RelationshipEdgeRow,
  RelationshipEvidenceRef,
  RelationshipSignal,
  RelationshipSignalRow,
  RelationshipTeamMember,
} from './types';

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function normalizeEvidenceRefs(value: unknown): RelationshipEvidenceRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => item != null && typeof item === 'object')
    .map((item) => ({
      sourceId: String(item.sourceId ?? item.source_id ?? item.id ?? ''),
      sourceKind: String(item.sourceKind ?? item.source_kind ?? 'unknown'),
      sourceTable: typeof item.sourceTable === 'string' ? item.sourceTable : typeof item.source_table === 'string' ? item.source_table : null,
      sourceRowId: typeof item.sourceRowId === 'string' ? item.sourceRowId : typeof item.source_row_id === 'string' ? item.source_row_id : null,
      title: typeof item.title === 'string' ? item.title : null,
      summary: typeof item.summary === 'string' ? item.summary : null,
      occurredAt: typeof item.occurredAt === 'string' ? item.occurredAt : typeof item.occurred_at === 'string' ? item.occurred_at : null,
    }))
    .filter((item) => item.sourceId.length > 0);
}

export function mapRelationshipSignal(row: RelationshipSignalRow): RelationshipSignal {
  const sourceId = row.source_record_id ?? row.source_row_id ?? row.id;
  return {
    id: row.id,
    orgId: row.org_id,
    accountId: row.account_id,
    opportunityId: row.opportunity_id,
    contactId: row.contact_id,
    actorUserId: row.actor_user_id,
    kind: row.signal_kind,
    valence: row.valence,
    strength: row.strength,
    confidence: Number(row.confidence ?? 0),
    summary: row.summary,
    quoteText: row.quote_text,
    evidence: row.source_table || row.source_record_id || row.source_row_id
      ? {
          sourceId,
          sourceKind: row.signal_kind,
          sourceTable: row.source_table,
          sourceRowId: row.source_row_id,
          summary: row.summary,
          occurredAt: row.occurred_at,
        }
      : null,
    occurredAt: row.occurred_at,
    metadata: asObject(row.metadata),
  };
}

export function mapRelationshipEdge(row: RelationshipEdgeRow): RelationshipEdge {
  return {
    id: row.id,
    orgId: row.org_id,
    accountId: row.account_id,
    opportunityId: row.opportunity_id,
    fromEntityType: row.from_entity_type,
    fromUserId: row.from_user_id,
    fromContactId: row.from_contact_id,
    toContactId: row.to_contact_id,
    edgeType: row.edge_type,
    relationshipStatus: row.relationship_status,
    strength: row.strength,
    trend: row.trend,
    confidence: Number(row.confidence ?? 0),
    signalCount: row.signal_count,
    lastSignalAt: row.last_signal_at,
    evidenceRefs: normalizeEvidenceRefs(row.evidence_refs),
    computedAt: row.computed_at,
    staleAfter: row.stale_after,
    statusFlags: row.status_flags ?? [],
    metadata: asObject(row.metadata),
  };
}

export function mapContact(row: ContactRow): RelationshipContact {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    title: row.title,
    role: row.role,
    department: row.department,
    lastContactedAt: row.last_contacted_at ?? null,
  };
}

export function mapCoverageAssignment(row: ContactCoverageAssignmentRow): CoverageAssignment {
  return {
    id: row.id,
    contactId: row.contact_id,
    primaryUserId: row.primary_user_id,
    backupUserId: row.backup_user_id,
    relationshipGoal: row.relationship_goal,
    relationshipStatus: row.relationship_status ?? 'unknown',
    desiredRelationshipStatus: row.desired_relationship_status ?? null,
    coverageHealth: row.coverage_health ?? 'unknown',
    cadenceDays: row.cadence_days ?? null,
    lastTouchAt: row.last_touch_at ?? null,
    nextTouchDueAt: row.next_touch_due_at ?? null,
    confidence: Number(row.confidence ?? 0),
    riskReasons: asStringArray(row.risk_reasons),
    reviewedAt: row.reviewed_at ?? null,
  };
}

export function mapTeamMember(row: OrgMemberRow, coverageOwnerIds: Set<string>): RelationshipTeamMember {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role,
    teamId: row.team_id,
    isCoverageOwner: coverageOwnerIds.has(row.user_id),
  };
}
