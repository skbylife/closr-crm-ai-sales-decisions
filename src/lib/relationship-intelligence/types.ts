import type { requireAdmin, requireAuth } from '@/lib/api-guard';

export type RelationshipAuthContext = Awaited<ReturnType<typeof requireAuth>>;
export type RelationshipAdminClient = ReturnType<typeof requireAdmin>;

export type RelationshipSignalKind =
  | 'forwarded_email_decode'
  | 'email_interaction'
  | 'meeting'
  | 'manual_note'
  | 'coverage_update'
  | 'profile_hint';

export type RelationshipValence = 'positive' | 'neutral' | 'negative' | 'mixed' | 'unknown';
export type RelationshipStatus = 'unknown' | 'none' | 'introduced' | 'engaged' | 'familiar' | 'trusted' | 'can_introduce' | 'risk';
export type RelationshipTrend = 'rising' | 'steady' | 'cooling' | 'stale' | 'unknown';
export type RelationshipEdgeType = 'communication' | 'trust' | 'influence' | 'coverage' | 'risk';
export type CoverageHealth = 'unknown' | 'healthy' | 'thin' | 'stale' | 'gap' | 'risk' | 'needs_review';

export type JsonObject = Record<string, unknown>;

export type AccountRow = {
  id: string;
  org_id: string;
  name: string;
  business_team_id?: string | null;
};

export type ContactRow = {
  id: string;
  org_id: string;
  account_id: string | null;
  name: string;
  email: string | null;
  title: string | null;
  role: string | null;
  department: string | null;
  last_contacted_at?: string | null;
  updated_at?: string | null;
};

export type OrgMemberRow = {
  user_id: string;
  org_id: string;
  team_id: string | null;
  role: string;
  display_name: string | null;
};

export type ContactCoverageAssignmentRow = {
  id: string;
  org_id: string;
  pursuit_team_id: string;
  account_id: string;
  contact_id: string;
  primary_user_id: string | null;
  backup_user_id: string | null;
  relationship_goal: string | null;
  relationship_status: string | null;
  notes: string | null;
  coverage_health?: CoverageHealth | null;
  desired_relationship_status?: string | null;
  cadence_days?: number | null;
  last_touch_at?: string | null;
  next_touch_due_at?: string | null;
  last_signal_id?: string | null;
  confidence?: number | null;
  risk_reasons?: unknown;
  reviewed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type RelationshipSignalRow = {
  id: string;
  org_id: string;
  account_id: string;
  opportunity_id: string | null;
  contact_id: string | null;
  actor_user_id: string | null;
  signal_kind: RelationshipSignalKind;
  valence: RelationshipValence;
  strength: number;
  confidence: number;
  summary: string;
  quote_text: string | null;
  source_record_id: string | null;
  source_table: string | null;
  source_row_id: string | null;
  occurred_at: string;
  metadata?: unknown;
  created_at?: string | null;
};

export type RelationshipEdgeRow = {
  id: string;
  org_id: string;
  account_id: string;
  opportunity_id: string | null;
  from_entity_type: 'user' | 'contact' | 'team' | 'unknown';
  from_user_id: string | null;
  from_contact_id: string | null;
  to_contact_id: string;
  edge_type: RelationshipEdgeType;
  relationship_status: RelationshipStatus;
  strength: number;
  trend: RelationshipTrend;
  confidence: number;
  signal_count: number;
  last_signal_at: string | null;
  evidence_refs: unknown;
  computed_at: string;
  stale_after: string | null;
  status_flags: string[] | null;
  metadata?: unknown;
};

export type EmailDecodeRow = {
  id: string;
  org_id: string | null;
  account_id: string | null;
  opportunity_id: string | null;
  user_id: string | null;
  email_text: string | null;
  decode: unknown;
  date: string | null;
  created_at: string | null;
  original_sender_email: string | null;
  original_sender_name: string | null;
  matched_contact_id: string | null;
  matched_account_id: string | null;
  matched_account_name: string | null;
  direction?: string | null;
  signal_source?: string | null;
};

export type SourceRecordRow = {
  id: string;
  org_id: string | null;
  account_id: string | null;
  source_kind: string;
  source_table: string | null;
  source_row_id: string;
  title: string | null;
  summary: string | null;
  occurred_at: string | null;
  metadata: unknown;
  created_at: string | null;
};

export type IntegrationEmailRow = {
  id: string;
  org_id: string | null;
  account_id: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  sender: string | null;
  subject: string | null;
  summary: string | null;
  sentiment: string | null;
  intent: string | null;
  key_info?: unknown;
  visible_to?: string[] | null;
  received_at: string | null;
  created_at: string | null;
};

export type ActivityLogRow = {
  id: string;
  org_id: string | null;
  account_id: string | null;
  contact_id: string | null;
  contact_name: string | null;
  opportunity_id: string | null;
  user_id: string | null;
  action_type: string | null;
  summary: string | null;
  metadata?: unknown;
  created_at: string | null;
};

export type MeetingPrepRow = {
  id: string;
  org_id: string | null;
  account_id: string | null;
  user_id: string | null;
  input: unknown;
  result: unknown;
  created_at: string | null;
};

export type RelationshipEvidenceRef = {
  sourceId: string;
  sourceKind: string;
  sourceTable: string | null;
  sourceRowId: string | null;
  title?: string | null;
  summary?: string | null;
  occurredAt?: string | null;
};

export type RelationshipSignal = {
  id: string;
  orgId: string;
  accountId: string;
  opportunityId: string | null;
  contactId: string | null;
  actorUserId: string | null;
  kind: RelationshipSignalKind;
  valence: RelationshipValence;
  strength: number;
  confidence: number;
  summary: string;
  quoteText: string | null;
  evidence: RelationshipEvidenceRef | null;
  occurredAt: string;
  metadata: JsonObject;
};

export type RelationshipEdge = {
  id: string;
  orgId: string;
  accountId: string;
  opportunityId: string | null;
  fromEntityType: 'user' | 'contact' | 'team' | 'unknown';
  fromUserId: string | null;
  fromContactId: string | null;
  toContactId: string;
  edgeType: RelationshipEdgeType;
  relationshipStatus: RelationshipStatus;
  strength: number;
  trend: RelationshipTrend;
  confidence: number;
  signalCount: number;
  lastSignalAt: string | null;
  evidenceRefs: RelationshipEvidenceRef[];
  computedAt: string;
  staleAfter: string | null;
  statusFlags: string[];
  metadata: JsonObject;
};

export type RelationshipContact = {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  role: string | null;
  department: string | null;
  lastContactedAt: string | null;
};

export type RelationshipTeamMember = {
  userId: string;
  displayName: string | null;
  role: string | null;
  teamId: string | null;
  isCoverageOwner: boolean;
};

export type CoverageAssignment = {
  id: string;
  contactId: string;
  primaryUserId: string | null;
  backupUserId: string | null;
  relationshipGoal: string | null;
  relationshipStatus: string;
  desiredRelationshipStatus: string | null;
  coverageHealth: CoverageHealth;
  cadenceDays: number | null;
  lastTouchAt: string | null;
  nextTouchDueAt: string | null;
  confidence: number;
  riskReasons: string[];
  reviewedAt: string | null;
};

export type CoverageGap = {
  contactId: string;
  kind: 'unknown_relationship' | 'no_owner' | 'stale_relationship' | 'thin_evidence' | 'risk';
  severity: 'low' | 'medium' | 'high';
  summary: string;
  recommendedOwnerId: string | null;
  evidenceRefs: RelationshipEvidenceRef[];
};

export type NextBestMove = {
  id: string;
  kind: 'coverage_gap' | 'stale_relationship' | 'missing_key_role' | 'thin_evidence';
  priority: 'low' | 'medium' | 'high';
  ownerUserId: string | null;
  targetContactId: string | null;
  reason: string;
  evidenceRefs: RelationshipEvidenceRef[];
  goal: string;
  todo: string;
};

export type RelationshipIntelligencePayload = {
  accountId: string;
  accountName: string;
  orgId: string;
  ourTeam: RelationshipTeamMember[];
  contacts: RelationshipContact[];
  edges: RelationshipEdge[];
  coverage: {
    assignments: CoverageAssignment[];
    gaps: CoverageGap[];
    staleRelationships: RelationshipEdge[];
  };
  nextBestMoves: NextBestMove[];
  recentSignals: RelationshipSignal[];
  evidenceSummary: {
    signalCount: number;
    edgeCount: number;
    contactsWithKnownRelationship: number;
    contactsWithUnknownRelationship: number;
    staleEdgeCount: number;
    sourceTables: Record<string, number>;
  };
};
