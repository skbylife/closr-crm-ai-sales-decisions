import type { PlayStep } from '@/lib/babel-engine/types';
import type { EvidenceProvenance, EvidenceTraceRef, FieldEvidenceAttribution, FieldEvidenceCalibration, FieldEvidenceCalibrationClassification, FieldEvidenceClassification } from '@/lib/evidence-provenance';
import type { KnowledgeTrace } from '@/lib/knowledge-grounding';
import { buildStrategicPlayRoutePlan, type StrategicPlayRoutePlanInput } from '@/lib/strategic-play-v2/view-model';

export type StrategicPlayV1Fields = {
  situationJudgment: string;
  strategicObjective: string;
  stakeholderPath: string[];
  evidenceBasis: string[];
  riskCounterEvidence: string[];
  actionPlan: PlayStep[];
  successCriteria: string | null;
};

export type StrategicPlayEvidenceTraceResponse = {
  knowledgeTraces: KnowledgeTrace[];
  knowledgeGaps: string[];
  provenance: EvidenceProvenance | null;
  fieldEvidenceRefs: Record<keyof StrategicPlayV1Fields, EvidenceTraceRef[]>;
  fieldEvidenceAttributions: FieldEvidenceAttribution[];
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean);
  }
  const text = nonEmptyString(value);
  return text ? [text] : [];
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function normalizeKnowledgeTraces(value: unknown): KnowledgeTrace[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = toRecord(item);
      if (!record) return null;
      const id = nonEmptyString(record.id);
      const title = nonEmptyString(record.title);
      if (!id || !title) return null;
      const source = nonEmptyString(record.source);
      const sourceType = nonEmptyString(record.sourceType);
      return {
        id,
        title,
        category: nonEmptyString(record.category) ?? 'unknown',
        ...(source ? { source } : {}),
        ...(sourceType ? { sourceType } : {}),
        relevanceReason: nonEmptyString(record.relevanceReason) ?? '',
        contentSnippet: nonEmptyString(record.contentSnippet) ?? '',
      } satisfies KnowledgeTrace;
    })
    .filter((trace): trace is KnowledgeTrace => trace !== null);
}

export function normalizeEvidenceTraceRefs(value: unknown): EvidenceTraceRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string' && item.trim()) {
        return { sourceId: item.trim(), sourceType: 'model_ref' } satisfies EvidenceTraceRef;
      }
      const record = toRecord(item);
      if (!record) return null;
      const sourceId = nonEmptyString(record.sourceId) ?? nonEmptyString(record.evidenceId);
      if (!sourceId) return null;
      const sourceType = nonEmptyString(record.sourceType) ?? nonEmptyString(record.sourceKind) ?? nonEmptyString(record.sourceTable) ?? 'unknown';
      return {
        ...(nonEmptyString(record.evidenceId) ? { evidenceId: nonEmptyString(record.evidenceId)! } : {}),
        sourceId,
        sourceType,
        ...(nonEmptyString(record.sourceKind) ? { sourceKind: nonEmptyString(record.sourceKind)! as EvidenceTraceRef['sourceKind'] } : {}),
        ...(nonEmptyString(record.sourceTable) ? { sourceTable: nonEmptyString(record.sourceTable)! } : {}),
        ...(nonEmptyString(record.sourceRowId) ? { sourceRowId: nonEmptyString(record.sourceRowId)! } : {}),
        ...(nonEmptyString(record.title) ? { title: nonEmptyString(record.title)! } : {}),
        ...(nonEmptyString(record.excerpt) ? { excerpt: nonEmptyString(record.excerpt)! } : {}),
        ...(nonEmptyString(record.occurredAt) ? { occurredAt: nonEmptyString(record.occurredAt)! } : {}),
        ...(Number.isFinite(Number(record.weight)) ? { weight: Number(record.weight) } : {}),
      } satisfies EvidenceTraceRef;
    })
    .filter((ref): ref is EvidenceTraceRef => ref !== null);
}

function isFieldEvidenceClassification(value: unknown): value is FieldEvidenceClassification {
  return value === 'fact' || value === 'inference' || value === 'gap' || value === 'mixed';
}

function isFieldEvidenceCalibrationClassification(value: unknown): value is FieldEvidenceCalibrationClassification {
  return value === 'fact' || value === 'inference' || value === 'gap' || value === 'mixed' || value === 'observed' || value === 'verified' || value === 'blocked' || value === 'invalidated';
}

function normalizeFieldEvidenceCalibrations(value: unknown): FieldEvidenceCalibration[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = toRecord(item);
      if (!record) return null;
      const id = nonEmptyString(record.id);
      const sourceRefRecord = toRecord(record.sourceRef);
      const sourceRef = sourceRefRecord ? normalizeEvidenceTraceRefs([sourceRefRecord])[0] : null;
      const executionStatus = nonEmptyString(record.executionStatus) as FieldEvidenceCalibration['executionStatus'] | null;
      const outcomeAssessment = nonEmptyString(record.outcomeAssessment) as FieldEvidenceCalibration['outcomeAssessment'] | null;
      const previousClassification = isFieldEvidenceCalibrationClassification(record.previousClassification) ? record.previousClassification : null;
      const calibratedClassification = isFieldEvidenceCalibrationClassification(record.calibratedClassification) ? record.calibratedClassification : null;
      const occurredAt = nonEmptyString(record.occurredAt);
      if (!id || !sourceRef || !executionStatus || !outcomeAssessment || !previousClassification || !calibratedClassification || !occurredAt) return null;
      const note = nonEmptyString(record.note);
      const createdBy = nonEmptyString(record.createdBy);
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

export function normalizeFieldEvidenceAttributions(value: unknown): FieldEvidenceAttribution[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = toRecord(item);
      if (!record) return null;
      const field = nonEmptyString(record.field);
      if (!field) return null;
      const evidenceRefs = normalizeEvidenceTraceRefs(record.evidenceRefs);
      const gaps = toStringList(record.gaps);
      const rawClassification = isFieldEvidenceClassification(record.classification) ? record.classification : undefined;
      const classification: FieldEvidenceClassification = rawClassification ?? (gaps.length > 0 && evidenceRefs.length > 0 ? 'mixed' : gaps.length > 0 ? 'gap' : evidenceRefs.length > 0 ? 'inference' : 'gap');
      const rationale = nonEmptyString(record.rationale);
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

export function normalizeEvidenceProvenance(value: unknown): EvidenceProvenance | null {
  const record = toRecord(value);
  if (!record) return null;
  return {
    evidenceIds: toStringList(record.evidenceIds),
    sourceIds: toStringList(record.sourceIds),
    sourceTypes: toStringList(record.sourceTypes),
    confidence: Number.isFinite(Number(record.confidence)) ? Number(record.confidence) : 0,
    contradictions: Array.isArray(record.contradictions) ? record.contradictions as EvidenceProvenance['contradictions'] : [],
    tensions: toStringList(record.tensions),
    rationale: nonEmptyString(record.rationale) ?? '该谋局暂无持久化证据归因说明。',
    traces: normalizeEvidenceTraceRefs(record.traces),
    fieldEvidenceAttributions: normalizeFieldEvidenceAttributions(record.fieldEvidenceAttributions),
    generatedAt: nonEmptyString(record.generatedAt) ?? '',
  };
}

function knowledgeTraceToEvidenceRef(trace: KnowledgeTrace): EvidenceTraceRef {
  return {
    evidenceId: trace.id,
    sourceId: trace.id,
    sourceType: trace.sourceType ?? 'knowledge_base',
    sourceTable: trace.sourceType,
    title: trace.title,
    excerpt: trace.contentSnippet,
  };
}

export function buildFieldEvidenceRefs(params: { provenance?: EvidenceProvenance | null; knowledgeTraces?: KnowledgeTrace[]; fieldEvidenceAttributions?: FieldEvidenceAttribution[] }): Record<keyof StrategicPlayV1Fields, EvidenceTraceRef[]> {
  const globalRefs = (params.provenance?.traces?.length ?? 0) > 0
    ? params.provenance!.traces
    : (params.knowledgeTraces ?? []).map(knowledgeTraceToEvidenceRef);

  const refsFor = (field: keyof StrategicPlayV1Fields): EvidenceTraceRef[] => {
    const direct = (params.fieldEvidenceAttributions ?? []).filter((item) => item.field === field).flatMap((item) => item.evidenceRefs);
    if (direct.length > 0) return direct;
    if (field === 'actionPlan') {
      const stepRefs = (params.fieldEvidenceAttributions ?? [])
        .filter((item) => item.field.startsWith('steps[') || item.field.startsWith('actionPlan['))
        .flatMap((item) => item.evidenceRefs);
      if (stepRefs.length > 0) return stepRefs;
    }
    return globalRefs;
  };

  return {
    situationJudgment: refsFor('situationJudgment'),
    strategicObjective: refsFor('strategicObjective'),
    stakeholderPath: refsFor('stakeholderPath'),
    evidenceBasis: refsFor('evidenceBasis'),
    riskCounterEvidence: refsFor('riskCounterEvidence'),
    actionPlan: refsFor('actionPlan'),
    successCriteria: refsFor('successCriteria'),
  };
}

function emptyEvidenceProvenance(rationale: string): EvidenceProvenance {
  return {
    evidenceIds: [],
    sourceIds: [],
    sourceTypes: [],
    confidence: 0,
    contradictions: [],
    tensions: [],
    rationale,
    traces: [],
    fieldEvidenceAttributions: [],
    generatedAt: new Date().toISOString(),
  };
}

export function fallbackFieldEvidenceAttributions(params: {
  v1: StrategicPlayV1Fields;
  knowledgeTraces?: KnowledgeTrace[];
  knowledgeGaps?: string[];
  provenance?: EvidenceProvenance | null;
}): FieldEvidenceAttribution[] {
  const refs = (params.provenance?.traces?.length ?? 0) > 0
    ? params.provenance!.traces
    : (params.knowledgeTraces ?? []).map(knowledgeTraceToEvidenceRef);
  const baseGaps = toStringList(params.knowledgeGaps ?? []);
  const gaps = baseGaps.length > 0 ? baseGaps : (refs.length === 0 ? ['缺少可追踪的 source_records / knowledge trace；该字段应视为待验证判断。'] : []);
  const classificationFor = (field: string): FieldEvidenceClassification => {
    if (refs.length === 0) return 'gap';
    if (gaps.length > 0) return 'mixed';
    return field === 'evidenceBasis' ? 'fact' : 'inference';
  };
  const make = (field: string, rationale: string): FieldEvidenceAttribution => ({
    field,
    classification: classificationFor(field),
    evidenceRefs: refs,
    gaps,
    rationale,
  });

  const result: FieldEvidenceAttribution[] = [
    make('situationJudgment', '保守归因：局势判断是基于账户证据、知识线索和风险反证形成的综合推断。'),
    make('strategicObjective', '保守归因：战略目标来自用户目标与当前上下文，属于推进判断。'),
    make('stakeholderPath', '保守归因：关键人路径通常是关系图谱/上下文推断；无直接证据时必须标 gap。'),
    make('evidenceBasis', params.v1.evidenceBasis.length > 0 ? '保守归因：证据依据字段引用已保存 evidenceBasis 与可追踪来源。' : '保守归因：该谋局没有保存明确 evidenceBasis。'),
    make('riskCounterEvidence', params.v1.riskCounterEvidence.length > 0 ? '保守归因：风险/反证字段引用已保存 riskCounterEvidence 与知识缺口。' : '保守归因：该谋局没有保存明确风险反证。'),
    make('successCriteria', '保守归因：成功标准是验收口径设计，不是事实陈述。'),
  ];

  params.v1.actionPlan.forEach((step, index) => {
    result.push(make(`steps[${index}].expectedOutcome`, step.expectedOutcome ? '保守归因：expectedOutcome 是对步骤可验证产出的推断，执行后必须用真实 outcome 校准。' : '保守归因：该步骤缺少 expectedOutcome。'));
    result.push(make(`steps[${index}].risk`, '保守归因：步骤风险基于当前证据缺口/反证推断，需执行中验证。'));
    result.push(make(`steps[${index}].fallback`, '保守归因：fallback 是风险应对设计，不代表已有事实。'));
  });

  return result;
}

function mergeFieldEvidenceAttributionsIntoProvenance(params: {
  provenance?: EvidenceProvenance | null;
  fieldEvidenceAttributions: FieldEvidenceAttribution[];
  fallbackRationale: string;
}): EvidenceProvenance {
  const provenance = params.provenance ?? emptyEvidenceProvenance(params.fallbackRationale);
  return {
    ...provenance,
    fieldEvidenceAttributions: params.fieldEvidenceAttributions,
    generatedAt: provenance.generatedAt || new Date().toISOString(),
  };
}

export function strategicPlayEvidenceTraceDbPayload(params: { knowledgeTraces?: KnowledgeTrace[]; knowledgeGaps?: string[]; provenance?: EvidenceProvenance | null }, options?: { includeNullProvenance?: boolean }) {
  return {
    knowledge_traces: normalizeKnowledgeTraces(params.knowledgeTraces ?? []),
    knowledge_gaps: toStringList(params.knowledgeGaps ?? []),
    ...(params.provenance || options?.includeNullProvenance ? { evidence_provenance: params.provenance ?? null } : {}),
  };
}

export function strategicPlayEvidenceTraceResponse(row: Record<string, unknown>): StrategicPlayEvidenceTraceResponse {
  const knowledgeTraces = normalizeKnowledgeTraces(row.knowledge_traces);
  const knowledgeGaps = toStringList(row.knowledge_gaps);
  const provenance = normalizeEvidenceProvenance(row.evidence_provenance);
  const v1 = deriveStrategicPlayV1Fields(row);
  const persistedAttributions = normalizeFieldEvidenceAttributions(provenance?.fieldEvidenceAttributions);
  const fieldEvidenceAttributions = persistedAttributions.length > 0
    ? persistedAttributions
    : fallbackFieldEvidenceAttributions({ v1, knowledgeTraces, knowledgeGaps, provenance });
  return {
    knowledgeTraces,
    knowledgeGaps,
    provenance: provenance ? mergeFieldEvidenceAttributionsIntoProvenance({ provenance, fieldEvidenceAttributions, fallbackRationale: provenance.rationale }) : null,
    fieldEvidenceRefs: buildFieldEvidenceRefs({ provenance, knowledgeTraces, fieldEvidenceAttributions }),
    fieldEvidenceAttributions,
  };
}

export function generatedStrategicPlayEvidenceTraceResponse(params: {
  situationJudgment?: string;
  strategicObjective?: string;
  stakeholderPath?: string[];
  evidenceBasis?: string[];
  riskCounterEvidence?: string[];
  actionPlan?: PlayStep[];
  steps?: PlayStep[];
  successCriteria?: string | null;
  knowledgeTraces?: KnowledgeTrace[];
  knowledgeGaps?: string[];
  provenance?: EvidenceProvenance | null;
  fieldEvidenceAttributions?: FieldEvidenceAttribution[];
}): StrategicPlayEvidenceTraceResponse {
  const knowledgeTraces = normalizeKnowledgeTraces(params.knowledgeTraces ?? []);
  const knowledgeGaps = toStringList(params.knowledgeGaps ?? []);
  const provenance = normalizeEvidenceProvenance(params.provenance ?? null);
  const v1: StrategicPlayV1Fields = {
    situationJudgment: params.situationJudgment ?? '',
    strategicObjective: params.strategicObjective ?? '',
    stakeholderPath: params.stakeholderPath ?? [],
    evidenceBasis: params.evidenceBasis ?? [],
    riskCounterEvidence: params.riskCounterEvidence ?? [],
    actionPlan: params.actionPlan ?? params.steps ?? [],
    successCriteria: params.successCriteria ?? null,
  };
  const generatedAttributions = normalizeFieldEvidenceAttributions(params.fieldEvidenceAttributions);
  const fieldEvidenceAttributions = generatedAttributions.length > 0
    ? generatedAttributions
    : fallbackFieldEvidenceAttributions({ v1, knowledgeTraces, knowledgeGaps, provenance });
  const provenanceWithAttributions = mergeFieldEvidenceAttributionsIntoProvenance({
    provenance,
    fieldEvidenceAttributions,
    fallbackRationale: provenance?.rationale ?? '字段级证据归因；未能生成全局 evidence provenance，保守记录为 gap/mixed。',
  });
  return {
    knowledgeTraces,
    knowledgeGaps,
    provenance: provenanceWithAttributions,
    fieldEvidenceRefs: buildFieldEvidenceRefs({ provenance: provenanceWithAttributions, knowledgeTraces, fieldEvidenceAttributions }),
    fieldEvidenceAttributions,
  };
}

export function normalizeSteps(value: unknown): PlayStep[] {
  if (!Array.isArray(value)) return [];
  return value.map((step, i) => {
    const raw = (step ?? {}) as PlayStep & { expected_outcome?: unknown };
    return {
      ...raw,
      index: Number.isFinite(Number(raw.index)) ? Number(raw.index) : i + 1,
      expectedOutcome: nonEmptyString(raw.expectedOutcome) ?? nonEmptyString(raw.expected_outcome) ?? nonEmptyString(raw.successSignal) ?? undefined,
    } as PlayStep;
  });
}

export function deriveStrategicPlayV1Fields(row: Record<string, unknown>): StrategicPlayV1Fields {
  const goalDescription = nonEmptyString(row.goal_description) ?? '当前谋局目标';
  const steps = normalizeSteps(row.steps);
  const successCriteria = nonEmptyString(row.success_criteria);

  return {
    situationJudgment: nonEmptyString(row.situation_judgment) ?? `围绕「${goalDescription}」的局势判断尚未结构化；需在执行中补齐关键人、证据和反证。`,
    strategicObjective: nonEmptyString(row.strategic_objective) ?? goalDescription,
    stakeholderPath: toStringList(row.stakeholder_path).length > 0 ? toStringList(row.stakeholder_path) : ['待识别关键人路径'],
    evidenceBasis: toStringList(row.evidence_basis).length > 0 ? toStringList(row.evidence_basis) : ['历史谋局记录/用户目标/关系图谱'],
    riskCounterEvidence: toStringList(row.risk_counter_evidence).length > 0 ? toStringList(row.risk_counter_evidence) : ['旧数据未记录反证；执行中需持续验证。'],
    actionPlan: steps,
    successCriteria: successCriteria ?? null,
  };
}

export function strategicPlayV1DbPayload(result: {
  situationJudgment?: string;
  strategicObjective?: string;
  stakeholderPath?: string[];
  evidenceBasis?: string[];
  riskCounterEvidence?: string[];
  successCriteria?: string;
}) {
  return {
    situation_judgment: result.situationJudgment ?? null,
    strategic_objective: result.strategicObjective ?? null,
    stakeholder_path: result.stakeholderPath ?? [],
    evidence_basis: result.evidenceBasis ?? [],
    risk_counter_evidence: result.riskCounterEvidence ?? [],
    success_criteria: result.successCriteria ?? null,
  };
}

export function mapStrategicPlayRowToApiPlay(row: Record<string, unknown>) {
  const v1 = deriveStrategicPlayV1Fields(row);
  const evidenceTrace = strategicPlayEvidenceTraceResponse(row);
  const apiPlay = {
    id: row.id,
    orgId: row.org_id,
    accountId: row.account_id,
    opportunityId: row.opportunity_id,
    targetContactId: row.target_contact_id,
    goalType: row.goal_type,
    goalDescription: row.goal_description,
    situationJudgment: v1.situationJudgment,
    strategicObjective: v1.strategicObjective,
    stakeholderPath: v1.stakeholderPath,
    evidenceBasis: v1.evidenceBasis,
    riskCounterEvidence: v1.riskCounterEvidence,
    actionPlan: v1.actionPlan,
    steps: v1.actionPlan,
    alternativePaths: row.alternative_paths,
    confidence: Number(row.confidence),
    status: row.status,
    momentum: row.momentum ?? 'active',
    successCriteria: v1.successCriteria,
    deadline: row.deadline ?? null,
    assumptions: row.assumptions ?? [],
    learnings: row.learnings ?? [],
    review: row.review ?? null,
    lastStepAt: row.last_step_at ?? null,
    daysSinceProgress: row.days_since_progress ?? 0,
    knowledgeTraces: evidenceTrace.knowledgeTraces,
    knowledgeGaps: evidenceTrace.knowledgeGaps,
    provenance: evidenceTrace.provenance,
    fieldEvidenceAttributions: evidenceTrace.fieldEvidenceAttributions,
    evidenceTrace,
    createdAt: row.created_at,
    userId: row.user_id,
    updatedAt: row.updated_at,
  };
  return {
    ...apiPlay,
    v2: {
      routePlan: buildStrategicPlayRoutePlan(apiPlay as unknown as StrategicPlayRoutePlanInput),
    },
  };
}
