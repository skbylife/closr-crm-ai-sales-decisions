import { aggregateRelationshipEdges } from './edge-aggregator';
import { buildCoverageGaps } from './coverage-health';
import { buildNextBestMoves } from './next-best-moves';
import {
  extractRelationshipSignalsFromActivityLogs,
  extractRelationshipSignalsFromEmailDecodes,
  extractRelationshipSignalsFromIntegrationEmails,
  extractRelationshipSignalsFromMeetingPreps,
} from './signal-extractor';
import {
  mapContact,
  mapCoverageAssignment,
  mapRelationshipEdge,
  mapRelationshipSignal,
  mapTeamMember,
} from './mappers';
import type {
  AccountRow,
  ActivityLogRow,
  ContactCoverageAssignmentRow,
  ContactRow,
  EmailDecodeRow,
  IntegrationEmailRow,
  MeetingPrepRow,
  OrgMemberRow,
  RelationshipAdminClient,
  RelationshipEdgeRow,
  RelationshipIntelligencePayload,
  RelationshipSignal,
  RelationshipSignalRow,
  SourceRecordRow,
} from './types';

function isMissingTable(error: unknown): boolean {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : String(error ?? '');
  return /does not exist|schema cache|relationship_signals|relationship_edges|contact_coverage_assignments|integration_emails|activity_logs|meeting_preps/i.test(message);
}

async function loadContacts(admin: RelationshipAdminClient, orgId: string, accountId: string): Promise<ContactRow[]> {
  const { data, error } = await admin
    .from('contacts')
    .select('id, org_id, account_id, name, email, title, role, department, last_contacted_at, updated_at')
    .eq('org_id', orgId)
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ContactRow[];
}

async function loadOrgMembers(admin: RelationshipAdminClient, orgId: string): Promise<OrgMemberRow[]> {
  const { data, error } = await admin
    .from('org_memberships')
    .select('user_id, org_id, team_id, role, display_name')
    .eq('org_id', orgId);
  if (error) throw new Error(error.message);
  return (data ?? []) as OrgMemberRow[];
}

async function loadCoverageAssignments(admin: RelationshipAdminClient, orgId: string, accountId: string): Promise<ContactCoverageAssignmentRow[]> {
  try {
    const { data, error } = await admin
      .from('contact_coverage_assignments')
      .select('id, org_id, pursuit_team_id, account_id, contact_id, primary_user_id, backup_user_id, relationship_goal, relationship_status, notes, coverage_health, desired_relationship_status, cadence_days, last_touch_at, next_touch_due_at, last_signal_id, confidence, risk_reasons, reviewed_at, created_at, updated_at')
      .eq('org_id', orgId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ContactCoverageAssignmentRow[];
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

async function loadPersistedSignals(admin: RelationshipAdminClient, orgId: string, accountId: string): Promise<RelationshipSignal[]> {
  try {
    const { data, error } = await admin
      .from('relationship_signals')
      .select('id, org_id, account_id, opportunity_id, contact_id, actor_user_id, signal_kind, valence, strength, confidence, summary, quote_text, source_record_id, source_table, source_row_id, occurred_at, metadata, created_at')
      .eq('org_id', orgId)
      .eq('account_id', accountId)
      .order('occurred_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return ((data ?? []) as RelationshipSignalRow[]).map(mapRelationshipSignal);
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

async function loadPersistedEdges(admin: RelationshipAdminClient, orgId: string, accountId: string) {
  try {
    const { data, error } = await admin
      .from('relationship_edges')
      .select('id, org_id, account_id, opportunity_id, from_entity_type, from_user_id, from_contact_id, to_contact_id, edge_type, relationship_status, strength, trend, confidence, signal_count, last_signal_at, evidence_refs, computed_at, stale_after, status_flags, metadata')
      .eq('org_id', orgId)
      .eq('account_id', accountId)
      .order('computed_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return ((data ?? []) as RelationshipEdgeRow[]).map(mapRelationshipEdge);
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

async function loadRecentEmailDecodes(admin: RelationshipAdminClient, orgId: string, accountId: string): Promise<EmailDecodeRow[]> {
  const baseSelect = 'id, org_id, account_id, opportunity_id, user_id, email_text, decode, date, created_at, original_sender_email, original_sender_name, matched_contact_id, matched_account_id, matched_account_name, direction';
  const withSignalSource = `${baseSelect}, signal_source`;

  const run = async (select: string) => admin
    .from('email_decodes')
    .select(select)
    .eq('org_id', orgId)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(50);

  const { data, error } = await run(withSignalSource);
  if (!error) return (data ?? []) as unknown as EmailDecodeRow[];

  // Older reset/deploy schemas may not have signal_source yet. Forwarded-email
  // evidence is still detectable from fwd_* ids, original_sender fields, decode
  // metadata, and source_records, so fall back instead of breaking the endpoint.
  if (/signal_source|column .* does not exist/i.test(error.message ?? '')) {
    const fallback = await run(baseSelect);
    if (fallback.error) throw new Error(fallback.error.message);
    return (fallback.data ?? []) as unknown as EmailDecodeRow[];
  }

  throw new Error(error.message);
}

async function loadSourceRecords(admin: RelationshipAdminClient, orgId: string, accountId: string): Promise<SourceRecordRow[]> {
  try {
    const { data, error } = await admin
      .from('source_records')
      .select('id, org_id, account_id, source_kind, source_table, source_row_id, title, summary, occurred_at, metadata, created_at')
      .eq('org_id', orgId)
      .eq('account_id', accountId)
      .order('occurred_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as SourceRecordRow[];
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

async function loadIntegrationEmails(admin: RelationshipAdminClient, orgId: string, accountId: string): Promise<IntegrationEmailRow[]> {
  try {
    const { data, error } = await admin
      .from('integration_emails')
      .select('id, org_id, account_id, contact_id, opportunity_id, sender, subject, summary, sentiment, intent, key_info, visible_to, received_at, created_at')
      .eq('org_id', orgId)
      .eq('account_id', accountId)
      .order('received_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as IntegrationEmailRow[];
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

async function loadActivityLogs(admin: RelationshipAdminClient, orgId: string, accountId: string): Promise<ActivityLogRow[]> {
  try {
    const { data, error } = await admin
      .from('activity_logs')
      .select('id, org_id, account_id, contact_id, contact_name, opportunity_id, user_id, action_type, summary, metadata, created_at')
      .eq('org_id', orgId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as ActivityLogRow[];
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

async function loadMeetingPreps(admin: RelationshipAdminClient, orgId: string, accountId: string): Promise<MeetingPrepRow[]> {
  try {
    const { data, error } = await admin
      .from('meeting_preps')
      .select('id, org_id, account_id, user_id, input, result, created_at')
      .eq('org_id', orgId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return (data ?? []) as MeetingPrepRow[];
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

function dedupeSignals(signals: RelationshipSignal[]): RelationshipSignal[] {
  const seen = new Set<string>();
  const result: RelationshipSignal[] = [];
  for (const signal of signals) {
    const evidenceKey = signal.evidence ? `${signal.evidence.sourceTable ?? ''}:${signal.evidence.sourceRowId ?? signal.evidence.sourceId}` : signal.id;
    const key = `${signal.kind}:${signal.contactId ?? ''}:${signal.actorUserId ?? ''}:${evidenceKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(signal);
  }
  return result.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

function semanticEdgeKey(edge: { accountId: string; fromUserId: string | null; fromContactId: string | null; toContactId: string; edgeType: string }): string {
  return [
    edge.accountId,
    edge.fromUserId ? `user:${edge.fromUserId}` : edge.fromContactId ? `contact:${edge.fromContactId}` : 'unknown',
    edge.toContactId,
    edge.edgeType,
  ].join(':');
}

function enforceEvidenceFirst(edge: ReturnType<typeof mapRelationshipEdge>): ReturnType<typeof mapRelationshipEdge> {
  if (edge.evidenceRefs.length > 0 || edge.signalCount > 0 || edge.relationshipStatus === 'none') return edge;
  return {
    ...edge,
    relationshipStatus: 'unknown',
    strength: 0,
    trend: 'unknown',
    confidence: 0,
    statusFlags: Array.from(new Set([...edge.statusFlags, 'evidence_missing'])),
  };
}

function mergeEdgesBySemanticKey(edges: ReturnType<typeof mapRelationshipEdge>[]): ReturnType<typeof mapRelationshipEdge>[] {
  const byKey = new Map<string, ReturnType<typeof mapRelationshipEdge>>();
  for (const edge of edges) {
    const normalized = enforceEvidenceFirst(edge);
    const key = semanticEdgeKey(normalized);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, normalized);
      continue;
    }

    const currentEvidence = current.evidenceRefs.length + current.signalCount;
    const nextEvidence = normalized.evidenceRefs.length + normalized.signalCount;
    const currentIsEvidenceMissingUnknown = current.relationshipStatus === 'unknown' && current.statusFlags.includes('evidence_missing');
    const nextIsExplicitNone = normalized.relationshipStatus === 'none';
    if (
      nextIsExplicitNone && currentIsEvidenceMissingUnknown
      || nextEvidence > currentEvidence
      || (nextEvidence === currentEvidence && normalized.strength > current.strength)
    ) {
      byKey.set(key, normalized);
    }
  }
  return [...byKey.values()];
}

export async function buildRelationshipIntelligencePayload(params: {
  admin: RelationshipAdminClient;
  account: AccountRow;
  now?: Date;
}): Promise<RelationshipIntelligencePayload> {
  const { admin, account } = params;
  const [contactsRows, assignmentRows, orgMemberRows, persistedSignals, persistedEdges, emailDecodes, sourceRecords, integrationEmails, activityLogs, meetingPreps] = await Promise.all([
    loadContacts(admin, account.org_id, account.id),
    loadCoverageAssignments(admin, account.org_id, account.id),
    loadOrgMembers(admin, account.org_id),
    loadPersistedSignals(admin, account.org_id, account.id),
    loadPersistedEdges(admin, account.org_id, account.id),
    loadRecentEmailDecodes(admin, account.org_id, account.id),
    loadSourceRecords(admin, account.org_id, account.id),
    loadIntegrationEmails(admin, account.org_id, account.id),
    loadActivityLogs(admin, account.org_id, account.id),
    loadMeetingPreps(admin, account.org_id, account.id),
  ]);

  const contacts = contactsRows.map(mapContact);
  const assignments = assignmentRows.map(mapCoverageAssignment);
  const extractedSignals = [
    ...extractRelationshipSignalsFromEmailDecodes(emailDecodes, sourceRecords),
    ...extractRelationshipSignalsFromIntegrationEmails(integrationEmails, sourceRecords),
    ...extractRelationshipSignalsFromActivityLogs(activityLogs, sourceRecords),
    ...extractRelationshipSignalsFromMeetingPreps(meetingPreps, sourceRecords),
  ];
  const signals = dedupeSignals([...persistedSignals, ...extractedSignals]);
  const derivedEdges = aggregateRelationshipEdges({
    orgId: account.org_id,
    accountId: account.id,
    signals,
    assignments,
    now: params.now,
  });
  const edges = mergeEdgesBySemanticKey([...persistedEdges, ...derivedEdges]).sort((a, b) => b.strength - a.strength);
  const gaps = buildCoverageGaps({ contacts, assignments, edges, now: params.now });
  const staleRelationships = edges.filter((edge) => edge.trend === 'stale' || edge.statusFlags.includes('stale'));
  const coverageOwnerIds = new Set(assignments.flatMap((assignment) => [assignment.primaryUserId, assignment.backupUserId]).filter((id): id is string => Boolean(id)));
  const ourTeam = orgMemberRows
    .filter((member) => coverageOwnerIds.size === 0 || coverageOwnerIds.has(member.user_id) || member.team_id === account.business_team_id)
    .map((member) => mapTeamMember(member, coverageOwnerIds));
  const nextBestMoves = buildNextBestMoves({ contacts, assignments, edges, gaps, staleRelationships, ourTeam });
  const contactsWithKnownRelationship = new Set(edges.filter((edge) => edge.relationshipStatus !== 'unknown' && edge.relationshipStatus !== 'none').map((edge) => edge.toContactId)).size;
  const sourceTables: Record<string, number> = {};
  for (const signal of signals) {
    const table = signal.evidence?.sourceTable ?? 'unknown';
    sourceTables[table] = (sourceTables[table] ?? 0) + 1;
  }

  return {
    accountId: account.id,
    accountName: account.name,
    orgId: account.org_id,
    ourTeam,
    contacts,
    edges,
    coverage: {
      assignments,
      gaps,
      staleRelationships,
    },
    nextBestMoves,
    recentSignals: signals.slice(0, 25),
    evidenceSummary: {
      signalCount: signals.length,
      edgeCount: edges.length,
      contactsWithKnownRelationship,
      contactsWithUnknownRelationship: Math.max(0, contacts.length - contactsWithKnownRelationship),
      staleEdgeCount: staleRelationships.length,
      sourceTables,
    },
  };
}
