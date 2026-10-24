import type { EvidenceTraceRef } from '@/lib/evidence-provenance';
import type { CompatiblePlayStepStatus } from '@/lib/babel-engine/types';

export type SituationLayerKey =
  | 'business'
  | 'people'
  | 'process'
  | 'competition'
  | 'evidence'
  | 'progress';

export type RouteJudgmentDimension =
  | SituationLayerKey
  | 'overall'
  | 'relationship'
  | 'commercial'
  | 'execution';

export type RouteImpact = 'low' | 'medium' | 'high' | 'critical';

export type RouteJudgmentStatus =
  | 'proposed'
  | 'accepted'
  | 'challenged'
  | 'revised'
  | 'invalidated'
  | 'confirmed';

export type RouteFeedbackOutcome =
  | 'matched_expected'
  | 'partially_matched'
  | 'missed_expected'
  | 'blocked'
  | 'invalidated'
  | 'unknown';

export type RouteVersionTriggerKind =
  | 'manual_edit'
  | 'decode_signal'
  | 'rfp_analysis'
  | 'meeting'
  | 'execution_outcome'
  | 'seed';

export interface SituationLayer {
  key: SituationLayerKey;
  label: string;
  summary: string;
  confidence: number;
  evidenceRefs: EvidenceTraceRef[];
  counterEvidenceRefs: EvidenceTraceRef[];
  gaps: string[];
  updatedAt: string;
}

export interface ConfidenceProfile {
  overall: number;
  strongEvidenceCount: number;
  mixedEvidenceCount: number;
  weakEvidenceCount: number;
  counterEvidenceCount: number;
  missingEvidenceCount: number;
  summary: string;
}

export interface RouteJudgment {
  id: string;
  dimension: RouteJudgmentDimension;
  answer: string;
  confidence: number;
  impact: RouteImpact;
  rationale: string;
  status: RouteJudgmentStatus;
  supportEvidenceRefs: EvidenceTraceRef[];
  counterEvidenceRefs: EvidenceTraceRef[];
  missingEvidence: string[];
  expiresAt?: string;
}

export interface WinGap {
  id: string;
  dimension: SituationLayerKey | 'relationship' | 'commercial' | 'process' | 'competition';
  currentState: string;
  desiredState: string;
  impact: Exclude<RouteImpact, 'low'>;
  evidenceGap: string;
  ownerUserId?: string;
  linkedJudgmentIds: string[];
  status: 'open' | 'in_progress' | 'closed' | 'invalidated';
}

export interface RouteMove {
  id: string;
  stepIndex: number;
  title: string;
  action: string;
  target: string;
  owner: string;
  timing: string;
  purpose: string;
  status: CompatiblePlayStepStatus;
  winGapId?: string;
  expectedJudgmentDelta: string;
  successTest: string;
  failureTest: string;
  fallbackRoute: string;
  evidenceRefs: EvidenceTraceRef[];
  resourceRequest?: string;
  risk: string;
}

export interface RouteVersion {
  version: number;
  triggerSourceRef?: EvidenceTraceRef;
  triggerKind: RouteVersionTriggerKind;
  changedJudgmentIds: string[];
  changedWinGapIds: string[];
  changedMoveIds: string[];
  diffSummary: string;
  createdBy?: string;
  createdAt: string;
}

export interface RouteFeedback {
  moveId: string;
  stepIndex: number;
  status: CompatiblePlayStepStatus;
  actualOutcome?: string;
  nextAction?: string;
  outcomeAssessment: RouteFeedbackOutcome;
  calibrationNote?: string;
  occurredAt?: string;
}

export interface StrategicPlayRoutePlan {
  schemaVersion: 'strategic_play_route_plan_v1';
  playId: string;
  accountId: string;
  opportunityId?: string;
  goal: {
    type: string;
    description: string;
    status: string;
    confidence: number;
    momentum: string;
  };
  routeThesis: string;
  currentCriticalMove?: RouteMove;
  moves: RouteMove[];
  winGaps: WinGap[];
  situationLayers: SituationLayer[];
  routeRationale: {
    judgments: RouteJudgment[];
    confidenceProfile: ConfidenceProfile;
    nextVerificationPoint: string;
  };
  whatChanged: RouteVersion[];
  feedback: RouteFeedback[];
  openQuestions: string[];
  generatedAt: string;
  updatedAt: string;
}
