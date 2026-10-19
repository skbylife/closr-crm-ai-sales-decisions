// Data contracts only. No engine rules or implementation imports.
export const ENGINE_SCHEMA_VERSION = 'closr_judgment_engine_v1' as const;

export type EngineSourceType =
  | 'email'
  | 'meeting'
  | 'call'
  | 'chat'
  | 'rfp'
  | 'crm_note'
  | 'document'
  | 'news'
  | 'task'
  | 'outcome';

export type EngineAuthorSide = 'customer' | 'seller' | 'partner' | 'external' | 'unknown';
export type EngineRisk = 'low' | 'medium' | 'high' | 'critical';
export type EngineMomentum = 'warming' | 'stable' | 'cooling' | 'volatile';
export type EngineImpact = 'low' | 'medium' | 'high' | 'critical';

export interface EngineSourceRecord {
  id: string;
  orgId: string;
  sourceType: EngineSourceType;
  externalSourceId?: string;
  accountId?: string;
  opportunityId?: string;
  contactIds?: string[];
  occurredAt: string;
  author?: {
    side: EngineAuthorSide;
    name?: string;
    email?: string;
  };
  content?: string;
  contentHash?: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedEngineSourceRecord extends EngineSourceRecord {
  contentHash: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export interface EngineEvidenceRef {
  id: string;
  orgId: string;
  sourceRecordId: string;
  evidenceType: 'support' | 'counter' | 'missing' | 'context';
  quote: string;
  summary: string;
  qualityScore: number;
  freshnessScore: number;
}

export interface EngineJudgment {
  id: string;
  orgId: string;
  accountId: string;
  opportunityId?: string;
  dimension: 'commercial' | 'relationship' | 'process' | 'competition' | 'evidence' | 'progression' | 'finance' | 'security' | 'rfp';
  answer: string;
  status: 'proposed' | 'accepted' | 'challenged' | 'revised' | 'invalidated' | 'confirmed';
  confidence: number;
  impact: EngineImpact;
  supportEvidenceIds: string[];
  counterEvidenceIds: string[];
  missingEvidence: string[];
  rationale: string;
}

export interface EngineWinGap {
  id: string;
  orgId: string;
  accountId: string;
  opportunityId?: string;
  dimension: string;
  currentState: string;
  desiredState: string;
  impact: string;
  linkedJudgmentIds: string[];
  evidenceGap: string;
  status: 'open' | 'addressed' | 'invalidated' | 'accepted_risk';
}

export interface EngineMove {
  id: string;
  orgId: string;
  accountId: string;
  opportunityId?: string;
  winGapId: string;
  intent: string;
  targetPerson: string;
  ask: string;
  expectedJudgmentDelta: string;
  successTest: string;
  failureTest: string;
  status: 'proposed' | 'approved' | 'in_progress' | 'done' | 'failed' | 'skipped';
  approvalRequired: boolean;
}

export interface EngineJudgmentSnapshotInput {
  orgId: string;
  accountId: string;
  opportunityId?: string;
  sources: EngineSourceRecord[];
}

export interface EngineJudgmentSnapshot {
  schemaVersion: typeof ENGINE_SCHEMA_VERSION;
  orgId: string;
  accountId: string;
  opportunityId?: string;
  judgmentSummary: {
    health: 'healthy' | 'at_risk' | 'critical';
    momentum: EngineMomentum;
    primaryRisk: string;
    confidence: number;
    evidenceQuality: 'low' | 'medium' | 'high';
  };
  sources: NormalizedEngineSourceRecord[];
  evidenceRefs: EngineEvidenceRef[];
  judgments: EngineJudgment[];
  winGaps: EngineWinGap[];
  moves: EngineMove[];
  writebackPolicy: {
    mode: 'proposal_only';
    prohibitedFields: string[];
  };
  crmFieldUpdates: [];
}

// ── Decode API types ──────────────────────────────────────
export interface EngineDecodeResult {
  schemaVersion: typeof ENGINE_SCHEMA_VERSION;
  orgId: string;
  accountId: string;
  opportunityId?: string;
  sources: NormalizedEngineSourceRecord[];
  evidenceRefs: EngineEvidenceRef[];
  signalProfile: {
    primaryRisk: string;
    patterns: string[];
    signalStrength: 'strong' | 'weak';
  };
}

// ── Strategic Play API types ──────────────────────────────
export interface EngineStrategicPlayInput {
  orgId: string;
  accountId: string;
  opportunityId?: string;
  playGoal?: string;
  judgments: EngineJudgment[];
  winGaps: EngineWinGap[];
}

export interface EngineStrategicPlayResult {
  schemaVersion: typeof ENGINE_SCHEMA_VERSION;
  orgId: string;
  accountId: string;
  opportunityId?: string;
  judgments: EngineJudgment[];
  winGaps: EngineWinGap[];
  moves: EngineMove[];
}

