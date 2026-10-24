import type {
  AccountMemoryConflict,
  AccountMemorySummary,
  EvidenceSourceKind,
  RecommendationEvidenceItem,
} from '@/lib/babel-engine/types';
import type { EvidenceRecord } from '@/lib/evidence-memory';

export interface EvidenceTraceRef {
  evidenceId?: string;
  sourceId: string;
  sourceType: string;
  sourceKind?: EvidenceSourceKind;
  sourceTable?: string;
  sourceRowId?: string;
  title?: string;
  excerpt?: string;
  occurredAt?: string;
  weight?: number;
}

export interface ProvenanceContradiction {
  id: string;
  summary: string;
  severity?: 'high' | 'medium' | 'low';
  kind?: string;
  sourceIds: string[];
}

export type FieldEvidenceClassification = 'fact' | 'inference' | 'gap' | 'mixed';
export type FieldEvidenceCalibrationClassification = FieldEvidenceClassification | 'observed' | 'verified' | 'blocked' | 'invalidated';
export type FieldEvidenceCalibrationOutcomeAssessment = 'matched_expected' | 'partially_matched' | 'missed_expected' | 'blocked' | 'invalidated' | 'unknown';

export interface FieldEvidenceCalibration {
  id: string;
  sourceRef: EvidenceTraceRef;
  executionStatus: 'planned' | 'in_progress' | 'done' | 'blocked' | 'invalidated';
  outcomeAssessment: FieldEvidenceCalibrationOutcomeAssessment;
  previousClassification: FieldEvidenceCalibrationClassification;
  calibratedClassification: FieldEvidenceCalibrationClassification;
  note?: string;
  occurredAt: string;
  createdBy?: string;
}

export interface FieldEvidenceAttribution {
  /** Dot/path field name in the Strategic Play response, e.g. situationJudgment or steps[0].expectedOutcome. */
  field: string;
  classification: FieldEvidenceClassification;
  evidenceRefs: EvidenceTraceRef[];
  gaps: string[];
  rationale?: string;
  calibrations?: FieldEvidenceCalibration[];
}

export interface EvidenceProvenance {
  /** Evidence/source ids that materially shaped this judgment. */
  evidenceIds: string[];
  sourceIds: string[];
  sourceTypes: string[];
  /** 0-1 confidence in the trace coverage, not a claim of objective truth. */
  confidence: number;
  /** Conflicts are first-class intelligence, not dirty data to hide. */
  contradictions: ProvenanceContradiction[];
  tensions: string[];
  /** Human-readable explanation of why these traces were attached. */
  rationale: string;
  traces: EvidenceTraceRef[];
  /** Field-level attribution for judgment transparency; stored in evidence_provenance JSONB. */
  fieldEvidenceAttributions?: FieldEvidenceAttribution[];
  generatedAt: string;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function clampConfidence(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = (value ?? 0) > 1 ? (value ?? 0) / 100 : (value ?? 0);
  return Math.max(0, Math.min(1, Math.round(normalized * 100) / 100));
}

function mapConflicts(conflicts: AccountMemoryConflict[] | undefined, sourceIds?: Set<string>): ProvenanceContradiction[] {
  return (conflicts ?? [])
    .filter((conflict) => !sourceIds || conflict.sourceIds.some((id) => sourceIds.has(id)))
    .slice(0, 5)
    .map((conflict) => ({
      id: conflict.id,
      summary: conflict.summary,
      severity: conflict.severity,
      kind: conflict.kind,
      sourceIds: conflict.sourceIds,
    }));
}

export function buildRecommendationProvenance(params: {
  evidenceItems: RecommendationEvidenceItem[];
  conflicts?: AccountMemoryConflict[];
  confidence?: number;
  rationale: string;
}): EvidenceProvenance {
  const traces: EvidenceTraceRef[] = params.evidenceItems.map((item) => ({
    evidenceId: item.sourceId,
    sourceId: item.sourceId,
    sourceType: item.sourceKind,
    sourceKind: item.sourceKind,
    sourceTable: item.sourceTable,
    sourceRowId: item.sourceRowId,
    title: item.title,
    excerpt: item.excerpt,
    occurredAt: item.occurredAt,
    weight: item.weight,
  }));
  const sourceIds = new Set(traces.map((trace) => trace.sourceId));

  return {
    evidenceIds: unique(traces.map((trace) => trace.evidenceId ?? trace.sourceId)),
    sourceIds: unique(traces.map((trace) => trace.sourceId)),
    sourceTypes: unique(traces.map((trace) => trace.sourceType)),
    confidence: clampConfidence(params.confidence),
    contradictions: mapConflicts(params.conflicts, sourceIds),
    tensions: [],
    rationale: params.rationale,
    traces,
    generatedAt: new Date().toISOString(),
  };
}

export function buildMemoryProvenance(params: {
  records: EvidenceRecord[];
  summary?: AccountMemorySummary;
  conflicts?: AccountMemoryConflict[];
  confidence?: number;
  rationale: string;
  maxTraces?: number;
}): EvidenceProvenance {
  const selected = params.records.slice(0, params.maxTraces ?? 8);
  const traces: EvidenceTraceRef[] = selected.map((record) => ({
    evidenceId: record.sourceId,
    sourceId: record.sourceId,
    sourceType: record.sourceKind,
    sourceKind: record.sourceKind,
    sourceTable: record.sourceTable,
    sourceRowId: record.sourceRowId,
    title: record.title,
    excerpt: record.summary,
    occurredAt: record.occurredAt,
    weight: record.weight,
  }));
  const sourceIds = new Set(traces.map((trace) => trace.sourceId));

  return {
    evidenceIds: unique(traces.map((trace) => trace.evidenceId ?? trace.sourceId)),
    sourceIds: unique(traces.map((trace) => trace.sourceId)),
    sourceTypes: unique(traces.map((trace) => trace.sourceType)),
    confidence: clampConfidence(params.confidence ?? params.summary?.confidence),
    contradictions: mapConflicts(params.conflicts, sourceIds),
    tensions: params.summary?.tensions?.slice(0, 5) ?? [],
    rationale: params.rationale,
    traces,
    generatedAt: new Date().toISOString(),
  };
}

export function emptyProvenance(rationale: string): EvidenceProvenance {
  return {
    evidenceIds: [],
    sourceIds: [],
    sourceTypes: [],
    confidence: 0,
    contradictions: [],
    tensions: [],
    rationale,
    traces: [],
    generatedAt: new Date().toISOString(),
  };
}
