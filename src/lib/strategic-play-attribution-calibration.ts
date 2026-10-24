import type { EvidenceProvenance, EvidenceTraceRef, FieldEvidenceAttribution, FieldEvidenceCalibration, FieldEvidenceCalibrationClassification, FieldEvidenceClassification } from '@/lib/evidence-provenance';
import type { PlayStepExecutionStatus } from '@/lib/strategic-play-execution';

export const PLAY_EXECUTION_OUTCOME_ASSESSMENTS = [
  'matched_expected',
  'partially_matched',
  'missed_expected',
  'blocked',
  'invalidated',
  'unknown',
] as const;

export type PlayExecutionOutcomeAssessment = typeof PLAY_EXECUTION_OUTCOME_ASSESSMENTS[number];

export interface PlayExecutionCalibrationRequest {
  fields?: unknown;
  assumptionIds?: unknown;
}

export interface PlayExecutionSourceRefInput {
  sourceId: string;
  sourceType?: string;
  sourceKind?: EvidenceTraceRef['sourceKind'];
  sourceTable?: string;
  sourceRowId?: string;
  title?: string;
  excerpt?: string;
  occurredAt?: string;
  weight?: number;
}

export interface ApplyStrategicPlayAttributionCalibrationInput {
  evidenceProvenance?: unknown;
  stepIndex: number;
  executionStatus: PlayStepExecutionStatus;
  outcomeAssessment?: PlayExecutionOutcomeAssessment;
  sourceRef: EvidenceTraceRef;
  targetFields?: string[];
  note?: string;
  occurredAt: string;
  createdBy?: string;
}

export interface ApplyStrategicPlayAttributionCalibrationResult {
  provenance: EvidenceProvenance;
  attributions: FieldEvidenceAttribution[];
  targetFields: string[];
  sourceRef: EvidenceTraceRef;
  calibratedAt: string;
}

const FIELD_CLASSIFICATIONS: FieldEvidenceClassification[] = ['fact', 'inference', 'gap', 'mixed'];
const CALIBRATION_CLASSIFICATIONS: FieldEvidenceCalibrationClassification[] = ['fact', 'inference', 'gap', 'mixed', 'observed', 'verified', 'blocked', 'invalidated'];
const DEFAULT_RATIONALE = '该谋局暂无持久化证据归因说明。';

function cleanText(value: unknown, maxLength = 3000): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength).trim();
  return cleaned || undefined;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, 500)).filter((item): item is string => Boolean(item));
}

function isFieldClassification(value: unknown): value is FieldEvidenceClassification {
  return FIELD_CLASSIFICATIONS.includes(value as FieldEvidenceClassification);
}

function isCalibrationClassification(value: unknown): value is FieldEvidenceCalibrationClassification {
  return CALIBRATION_CLASSIFICATIONS.includes(value as FieldEvidenceCalibrationClassification);
}

function normalizeIso(value: unknown): string | undefined {
  const text = cleanText(value, 120);
  if (!text) return undefined;
  const time = new Date(text).getTime();
  if (Number.isNaN(time)) return undefined;
  return new Date(time).toISOString();
}

function normalizeEvidenceTraceRefs(value: unknown): EvidenceTraceRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string' && item.trim()) return { sourceId: item.trim(), sourceType: 'model_ref' } satisfies EvidenceTraceRef;
      const record = toRecord(item);
      if (!record) return null;
      const sourceId = cleanText(record.sourceId, 240) ?? cleanText(record.evidenceId, 240);
      if (!sourceId) return null;
      const sourceType = cleanText(record.sourceType, 120) ?? cleanText(record.sourceKind, 120) ?? cleanText(record.sourceTable, 120) ?? 'unknown';
      return {
        ...(cleanText(record.evidenceId, 240) ? { evidenceId: cleanText(record.evidenceId, 240)! } : {}),
        sourceId,
        sourceType,
        ...(cleanText(record.sourceKind, 120) ? { sourceKind: cleanText(record.sourceKind, 120)! as EvidenceTraceRef['sourceKind'] } : {}),
        ...(cleanText(record.sourceTable, 120) ? { sourceTable: cleanText(record.sourceTable, 120)! } : {}),
        ...(cleanText(record.sourceRowId, 240) ? { sourceRowId: cleanText(record.sourceRowId, 240)! } : {}),
        ...(cleanText(record.title, 240) ? { title: cleanText(record.title, 240)! } : {}),
        ...(cleanText(record.excerpt) ? { excerpt: cleanText(record.excerpt)! } : {}),
        ...(normalizeIso(record.occurredAt) ? { occurredAt: normalizeIso(record.occurredAt)! } : {}),
        ...(Number.isFinite(Number(record.weight)) ? { weight: Number(record.weight) } : {}),
      } satisfies EvidenceTraceRef;
    })
    .filter((ref): ref is EvidenceTraceRef => ref !== null);
}

function normalizeFieldEvidenceCalibrations(value: unknown): FieldEvidenceCalibration[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = toRecord(item);
      if (!record) return null;
      const id = cleanText(record.id, 240);
      const sourceRefRecord = toRecord(record.sourceRef);
      const sourceRef = sourceRefRecord ? normalizeEvidenceTraceRefs([sourceRefRecord])[0] : null;
      const executionStatus = cleanText(record.executionStatus, 80) as PlayStepExecutionStatus | undefined;
      const previousClassification = isCalibrationClassification(record.previousClassification) ? record.previousClassification : undefined;
      const calibratedClassification = isCalibrationClassification(record.calibratedClassification) ? record.calibratedClassification : undefined;
      const occurredAt = normalizeIso(record.occurredAt);
      if (!id || !sourceRef || !executionStatus || !previousClassification || !calibratedClassification || !occurredAt) return null;
      const outcomeAssessment = normalizeOutcomeAssessment(record.outcomeAssessment);
      const note = cleanText(record.note);
      const createdBy = cleanText(record.createdBy, 160);
      return {
        id,
        sourceRef,
        executionStatus,
        outcomeAssessment,
        previousClassification,
        calibratedClassification,
        ...(note ? { note } : {}),
        occurredAt,
        ...(createdBy ? { createdBy } : {}),
      } satisfies FieldEvidenceCalibration;
    })
    .filter((item): item is FieldEvidenceCalibration => item !== null);
}

export function normalizeFieldEvidenceAttributionsForCalibration(value: unknown): FieldEvidenceAttribution[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = toRecord(item);
      if (!record) return null;
      const field = cleanText(record.field, 240);
      if (!field) return null;
      const evidenceRefs = normalizeEvidenceTraceRefs(record.evidenceRefs);
      const gaps = toStringList(record.gaps);
      const classification: FieldEvidenceClassification = isFieldClassification(record.classification)
        ? record.classification
        : gaps.length > 0 && evidenceRefs.length > 0
          ? 'mixed'
          : gaps.length > 0
            ? 'gap'
            : evidenceRefs.length > 0
              ? 'inference'
              : 'gap';
      const rationale = cleanText(record.rationale);
      const calibrations = normalizeFieldEvidenceCalibrations(record.calibrations);
      return {
        field,
        classification,
        evidenceRefs,
        gaps,
        ...(rationale ? { rationale } : {}),
        ...(calibrations.length > 0 ? { calibrations } : {}),
      } satisfies FieldEvidenceAttribution;
    })
    .filter((item): item is FieldEvidenceAttribution => item !== null);
}

export function normalizeEvidenceProvenanceForCalibration(value: unknown, fallbackGeneratedAt = new Date().toISOString()): EvidenceProvenance {
  const record = toRecord(value);
  if (!record) {
    return {
      evidenceIds: [],
      sourceIds: [],
      sourceTypes: [],
      confidence: 0,
      contradictions: [],
      tensions: [],
      rationale: DEFAULT_RATIONALE,
      traces: [],
      fieldEvidenceAttributions: [],
      generatedAt: fallbackGeneratedAt,
    };
  }
  return {
    evidenceIds: toStringList(record.evidenceIds),
    sourceIds: toStringList(record.sourceIds),
    sourceTypes: toStringList(record.sourceTypes),
    confidence: Number.isFinite(Number(record.confidence)) ? Number(record.confidence) : 0,
    contradictions: Array.isArray(record.contradictions) ? record.contradictions as EvidenceProvenance['contradictions'] : [],
    tensions: toStringList(record.tensions),
    rationale: cleanText(record.rationale) ?? DEFAULT_RATIONALE,
    traces: normalizeEvidenceTraceRefs(record.traces),
    fieldEvidenceAttributions: normalizeFieldEvidenceAttributionsForCalibration(record.fieldEvidenceAttributions),
    generatedAt: cleanText(record.generatedAt, 120) ?? fallbackGeneratedAt,
  };
}

export function normalizeOutcomeAssessment(value: unknown): PlayExecutionOutcomeAssessment {
  return PLAY_EXECUTION_OUTCOME_ASSESSMENTS.includes(value as PlayExecutionOutcomeAssessment)
    ? value as PlayExecutionOutcomeAssessment
    : 'unknown';
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function normalizeCalibrationTargetFields(params: { stepIndex: number; fields?: unknown }): string[] {
  const defaults = [`steps[${params.stepIndex}].expectedOutcome`];
  const rawFields = Array.isArray(params.fields) ? params.fields : [];
  const normalized = rawFields
    .map((value) => cleanText(value, 240))
    .filter((value): value is string => Boolean(value))
    .map((field) => {
      if (field === 'expectedOutcome' || field === 'risk' || field === 'fallback') return `steps[${params.stepIndex}].${field}`;
      return field;
    })
    .filter((field) => {
      if (/^steps\[\d+\]\.(expectedOutcome|risk|fallback)$/.test(field)) return true;
      if (/^actionPlan\[\d+\]\.(expectedOutcome|risk|fallback)$/.test(field)) return true;
      return false;
    });
  return uniqueStrings([...defaults, ...normalized]).slice(0, 20);
}

export function normalizeCalibrationAssumptionIds(value: unknown): string[] {
  return uniqueStrings(Array.isArray(value) ? value.map((item) => cleanText(item, 160) ?? '') : []).slice(0, 20);
}

export function buildExecutionSourceRef(input: PlayExecutionSourceRefInput): EvidenceTraceRef {
  return {
    sourceId: input.sourceId,
    sourceType: input.sourceType ?? 'play_execution_event',
    ...(input.sourceKind ? { sourceKind: input.sourceKind } : {}),
    ...(input.sourceTable ? { sourceTable: input.sourceTable } : {}),
    ...(input.sourceRowId ? { sourceRowId: input.sourceRowId } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(input.excerpt ? { excerpt: input.excerpt } : {}),
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    ...(Number.isFinite(input.weight) ? { weight: input.weight } : {}),
  };
}

function sourceRefKey(ref: EvidenceTraceRef): string {
  return `${ref.sourceId}:${ref.sourceTable ?? ''}:${ref.sourceRowId ?? ''}`;
}

function decideCalibration(params: {
  previous: FieldEvidenceClassification;
  executionStatus: PlayStepExecutionStatus;
  outcomeAssessment: PlayExecutionOutcomeAssessment;
}): { fieldClassification: FieldEvidenceClassification; calibratedClassification: FieldEvidenceCalibrationClassification; gap?: string; rationale: string } {
  const { previous, executionStatus, outcomeAssessment } = params;
  if (executionStatus === 'blocked' || outcomeAssessment === 'blocked') {
    return {
      fieldClassification: previous === 'gap' ? 'gap' : 'mixed',
      calibratedClassification: 'blocked',
      gap: '执行结果显示该字段仍受阻，需要补充 blockerReason 之外的验证证据。',
      rationale: '执行事件证明当前路径受阻；保守标记为 blocked calibration，不把阻碍自动改写成事实。',
    };
  }

  if (executionStatus === 'invalidated' || outcomeAssessment === 'invalidated' || outcomeAssessment === 'missed_expected') {
    return {
      fieldClassification: 'gap',
      calibratedClassification: 'invalidated',
      gap: '执行结果推翻或未命中原预期，该字段需要重新取证/重新谋局。',
      rationale: '执行事件使原字段判断失效；保守降级为 gap，并保留 invalidated calibration history。',
    };
  }

  if (executionStatus === 'done' && outcomeAssessment === 'matched_expected') {
    return {
      fieldClassification: 'fact',
      calibratedClassification: 'verified',
      rationale: '执行结果由用户显式标记为 matched_expected；该字段预期获得验证，保守升级为 fact/verified。',
    };
  }

  if (executionStatus === 'done' && outcomeAssessment === 'partially_matched') {
    return {
      fieldClassification: previous === 'gap' ? 'mixed' : 'mixed',
      calibratedClassification: 'observed',
      gap: '执行结果仅部分命中预期，仍需补充证据确认哪些部分成立。',
      rationale: '执行结果仅部分匹配；记录为 observed calibration，不自动升级为 fact。',
    };
  }

  if (executionStatus === 'done') {
    return {
      fieldClassification: previous === 'gap' ? 'mixed' : previous === 'fact' ? 'fact' : 'mixed',
      calibratedClassification: 'observed',
      gap: outcomeAssessment === 'unknown' ? '执行结果已观察到，但未显式评估是否命中原预期。' : undefined,
      rationale: '执行已完成但未显式 matched_expected；只记录 observed calibration，不自动声明为事实。',
    };
  }

  return {
    fieldClassification: previous,
    calibratedClassification: 'observed',
    rationale: '执行状态产生观察记录，但不改变原字段归因分类。',
  };
}

function calibrationId(params: { sourceId: string; field: string; occurredAt: string; status: string }): string {
  return `cal_${[params.sourceId, params.field, params.status, params.occurredAt].join('_').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180)}`;
}

function mergeUniqueRefs(existing: EvidenceTraceRef[], sourceRef: EvidenceTraceRef): EvidenceTraceRef[] {
  const keys = new Set(existing.map(sourceRefKey));
  if (keys.has(sourceRefKey(sourceRef))) return existing;
  return [...existing, sourceRef];
}

function mergeUniqueGap(existing: string[], gap?: string): string[] {
  if (!gap) return existing;
  return existing.includes(gap) ? existing : [...existing, gap];
}

export function applyStrategicPlayAttributionCalibration(input: ApplyStrategicPlayAttributionCalibrationInput): ApplyStrategicPlayAttributionCalibrationResult {
  const outcomeAssessment = normalizeOutcomeAssessment(input.outcomeAssessment);
  const provenance = normalizeEvidenceProvenanceForCalibration(input.evidenceProvenance, input.occurredAt);
  const targetFields = normalizeCalibrationTargetFields({ stepIndex: input.stepIndex, fields: input.targetFields });
  const byField = new Map((provenance.fieldEvidenceAttributions ?? []).map((item) => [item.field, item]));

  const calibrated = targetFields.map((field) => {
    const existing = byField.get(field);
    const previous = existing?.classification ?? 'gap';
    const decision = decideCalibration({ previous, executionStatus: input.executionStatus, outcomeAssessment });
    const calibration: FieldEvidenceCalibration = {
      id: calibrationId({ sourceId: input.sourceRef.sourceId, field, status: input.executionStatus, occurredAt: input.occurredAt }),
      sourceRef: input.sourceRef,
      executionStatus: input.executionStatus,
      outcomeAssessment,
      previousClassification: previous,
      calibratedClassification: decision.calibratedClassification,
      ...(input.note ? { note: input.note } : {}),
      occurredAt: input.occurredAt,
      ...(input.createdBy ? { createdBy: input.createdBy } : {}),
    };

    const priorCalibrations = existing?.calibrations ?? [];
    const nextCalibrations = priorCalibrations.some((item) => item.id === calibration.id)
      ? priorCalibrations
      : [...priorCalibrations, calibration].slice(-20);

    return {
      field,
      classification: decision.fieldClassification,
      evidenceRefs: mergeUniqueRefs(existing?.evidenceRefs ?? [], input.sourceRef),
      gaps: mergeUniqueGap(existing?.gaps ?? [], decision.gap),
      rationale: decision.rationale,
      calibrations: nextCalibrations,
    } satisfies FieldEvidenceAttribution;
  });

  for (const item of calibrated) byField.set(item.field, item);
  const attributions = Array.from(byField.values());
  const traces = mergeUniqueRefs(provenance.traces ?? [], input.sourceRef);
  const sourceIds = uniqueStrings([...(provenance.sourceIds ?? []), input.sourceRef.sourceId]);
  const sourceTypes = uniqueStrings([...(provenance.sourceTypes ?? []), input.sourceRef.sourceType]);
  const evidenceIds = uniqueStrings([...(provenance.evidenceIds ?? []), input.sourceRef.evidenceId ?? input.sourceRef.sourceId]);

  return {
    provenance: {
      ...provenance,
      evidenceIds,
      sourceIds,
      sourceTypes,
      traces,
      fieldEvidenceAttributions: attributions,
      generatedAt: provenance.generatedAt || input.occurredAt,
    },
    attributions,
    targetFields,
    sourceRef: input.sourceRef,
    calibratedAt: input.occurredAt,
  };
}
