import type {
  CompatiblePlayStepStatus,
  PlayAssumption,
  PlayStep,
  StrategicPlay,
} from '@/lib/babel-engine/types';
import type {
  EvidenceTraceRef,
  FieldEvidenceAttribution,
  FieldEvidenceClassification,
} from '@/lib/evidence-provenance';
import type {
  ConfidenceProfile,
  RouteFeedback,
  RouteFeedbackOutcome,
  RouteImpact,
  RouteJudgment,
  RouteMove,
  RouteVersion,
  SituationLayer,
  SituationLayerKey,
  StrategicPlayRoutePlan,
  WinGap,
} from './types';

const LAYER_LABEL: Record<SituationLayerKey, string> = {
  business: '商业局势',
  people: '人物局势',
  process: '流程局势',
  competition: '竞争局势',
  evidence: '证据局势',
  progress: '推进局势',
};

type StoredRoutePlanFields = Partial<Pick<
  StrategicPlayRoutePlan,
  'situationLayers' | 'winGaps' | 'whatChanged'
>> & {
  confidenceProfile?: ConfidenceProfile;
  nextVerificationPoint?: string;
};

export type StrategicPlayRoutePlanInput = StrategicPlay & {
  situationLayers?: unknown;
  situation_layers?: unknown;
  confidenceProfile?: unknown;
  confidence_profile?: unknown;
  winGaps?: unknown;
  win_gaps?: unknown;
  nextVerificationPoint?: unknown;
  next_verification_point?: unknown;
  playVersions?: unknown;
  play_versions?: unknown;
};

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function clampConfidence(value: unknown, fallback = 0.35): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  const normalized = number > 1 ? number / 100 : number;
  return Math.max(0, Math.min(1, normalized));
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    : [];
}

function evidenceRefs(value: unknown): EvidenceTraceRef[] {
  return records(value)
    .map((item) => {
      const sourceId = cleanText(item.sourceId) || cleanText(item.evidenceId);
      if (!sourceId) return null;
      return {
        ...(cleanText(item.evidenceId) ? { evidenceId: cleanText(item.evidenceId) } : {}),
        sourceId,
        sourceType: cleanText(item.sourceType) || cleanText(item.sourceKind) || cleanText(item.sourceTable) || 'unknown',
        ...(cleanText(item.sourceKind) ? { sourceKind: cleanText(item.sourceKind) as EvidenceTraceRef['sourceKind'] } : {}),
        ...(cleanText(item.sourceTable) ? { sourceTable: cleanText(item.sourceTable) } : {}),
        ...(cleanText(item.sourceRowId) ? { sourceRowId: cleanText(item.sourceRowId) } : {}),
        ...(cleanText(item.title) ? { title: cleanText(item.title) } : {}),
        ...(cleanText(item.excerpt) ? { excerpt: cleanText(item.excerpt) } : {}),
        ...(cleanText(item.occurredAt) ? { occurredAt: cleanText(item.occurredAt) } : {}),
        ...(typeof item.weight === 'number' ? { weight: item.weight } : {}),
      } satisfies EvidenceTraceRef;
    })
    .filter((item): item is EvidenceTraceRef => item !== null);
}

function textList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  const text = cleanText(value);
  return text ? [text] : [];
}

function attributions(play: StrategicPlayRoutePlanInput): FieldEvidenceAttribution[] {
  return Array.isArray(play.fieldEvidenceAttributions)
    ? play.fieldEvidenceAttributions as FieldEvidenceAttribution[]
    : [];
}

function refsForField(field: string, fieldAttributions: FieldEvidenceAttribution[]): EvidenceTraceRef[] {
  return fieldAttributions
    .filter((item) => item.field === field || item.field.startsWith(field + '.'))
    .flatMap((item) => item.evidenceRefs ?? []);
}

function gapsForField(field: string, fieldAttributions: FieldEvidenceAttribution[]): string[] {
  return fieldAttributions
    .filter((item) => item.field === field || item.field.startsWith(field + '.'))
    .flatMap((item) => item.gaps ?? [])
    .map(cleanText)
    .filter(Boolean);
}

function classificationCount(fieldAttributions: FieldEvidenceAttribution[], classification: FieldEvidenceClassification): number {
  return fieldAttributions.filter((item) => item.classification === classification).length;
}

function inferImpact(value: string, fallback: RouteImpact = 'high'): RouteImpact {
  const text = value.toLowerCase();
  if (/critical|致命|关键|阻断|blocked|高管|经济买家|采购|法务|安全|竞品|no-decision/.test(text)) return 'critical';
  if (/high|高|风险|缺口|反证|预算|决策/.test(text)) return 'high';
  if (/medium|中|待验证|不确定/.test(text)) return 'medium';
  return fallback;
}

function routeDimensionFromText(value: string): WinGap['dimension'] {
  if (/采购|预算|价格|roi|商务|合同|commercial/i.test(value)) return 'commercial';
  if (/竞品|竞争|替代|imaster|竞争者|competitor/i.test(value)) return 'competition';
  if (/关系|人物|champion|联系人|经济买家|stakeholder/i.test(value)) return 'relationship';
  if (/流程|审批|评审|poc|试点|验收|process/i.test(value)) return 'process';
  return 'process';
}

function normalizeStoredFields(play: StrategicPlayRoutePlanInput): StoredRoutePlanFields {
  return {
    situationLayers: normalizeStoredSituationLayers(play.situationLayers ?? play.situation_layers),
    winGaps: normalizeStoredWinGaps(play.winGaps ?? play.win_gaps),
    confidenceProfile: normalizeStoredConfidenceProfile(play.confidenceProfile ?? play.confidence_profile),
    nextVerificationPoint: cleanText(play.nextVerificationPoint ?? play.next_verification_point) || undefined,
    whatChanged: normalizeStoredVersions(play.playVersions ?? play.play_versions),
  };
}

function normalizeStoredSituationLayers(value: unknown): SituationLayer[] | undefined {
  const layers = records(value)
    .map((item) => {
      const key = cleanText(item.key) as SituationLayerKey;
      if (!Object.prototype.hasOwnProperty.call(LAYER_LABEL, key)) return null;
      return {
        key,
        label: cleanText(item.label) || LAYER_LABEL[key],
        summary: cleanText(item.summary) || '暂无明确局势摘要',
        confidence: clampConfidence(item.confidence),
        evidenceRefs: evidenceRefs(item.evidenceRefs),
        counterEvidenceRefs: evidenceRefs(item.counterEvidenceRefs),
        gaps: textList(item.gaps),
        updatedAt: cleanText(item.updatedAt) || new Date(0).toISOString(),
      } satisfies SituationLayer;
    })
    .filter((item): item is SituationLayer => item !== null);
  return layers.length > 0 ? layers : undefined;
}

function normalizeStoredConfidenceProfile(value: unknown): ConfidenceProfile | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return {
    overall: clampConfidence(record.overall),
    strongEvidenceCount: Math.max(0, Number(record.strongEvidenceCount ?? 0) || 0),
    mixedEvidenceCount: Math.max(0, Number(record.mixedEvidenceCount ?? 0) || 0),
    weakEvidenceCount: Math.max(0, Number(record.weakEvidenceCount ?? 0) || 0),
    counterEvidenceCount: Math.max(0, Number(record.counterEvidenceCount ?? 0) || 0),
    missingEvidenceCount: Math.max(0, Number(record.missingEvidenceCount ?? 0) || 0),
    summary: cleanText(record.summary) || '证据质量待补齐',
  };
}

function normalizeStoredWinGaps(value: unknown): WinGap[] | undefined {
  const gaps = records(value)
    .map((item, index) => {
      const currentState = cleanText(item.currentState);
      const desiredState = cleanText(item.desiredState);
      if (!currentState && !desiredState) return null;
      return {
        id: cleanText(item.id) || `win-gap-${index + 1}`,
        dimension: (cleanText(item.dimension) || 'progress') as WinGap['dimension'],
        currentState: currentState || '当前状态不清晰',
        desiredState: desiredState || '需要明确目标状态',
        impact: (cleanText(item.impact) || 'high') as WinGap['impact'],
        evidenceGap: cleanText(item.evidenceGap) || '缺少直接证据',
        ...(cleanText(item.ownerUserId) ? { ownerUserId: cleanText(item.ownerUserId) } : {}),
        linkedJudgmentIds: textList(item.linkedJudgmentIds),
        status: (cleanText(item.status) || 'open') as WinGap['status'],
      } satisfies WinGap;
    })
    .filter((item): item is WinGap => item !== null);
  return gaps.length > 0 ? gaps : undefined;
}

function normalizeStoredVersions(value: unknown): RouteVersion[] | undefined {
  const versions: RouteVersion[] = [];
  records(value).forEach((item, index) => {
      const summary = cleanText(item.diffSummary);
      if (!summary) return;
      versions.push({
        version: Number(item.version) || index + 1,
        triggerSourceRef: evidenceRefs([item.triggerSourceRef])[0],
        triggerKind: (cleanText(item.triggerKind) || 'manual_edit') as RouteVersion['triggerKind'],
        changedJudgmentIds: textList(item.changedJudgmentIds),
        changedWinGapIds: textList(item.changedWinGapIds),
        changedMoveIds: textList(item.changedMoveIds ?? item.changedMoveIndexes),
        diffSummary: summary,
        ...(cleanText(item.createdBy) ? { createdBy: cleanText(item.createdBy) } : {}),
        createdAt: cleanText(item.createdAt) || new Date(0).toISOString(),
      });
    });
  return versions.length > 0 ? versions : undefined;
}

function buildConfidenceProfile(play: StrategicPlayRoutePlanInput, fieldAttributions: FieldEvidenceAttribution[], stored?: ConfidenceProfile): ConfidenceProfile {
  if (stored) return stored;
  const strongEvidenceCount = classificationCount(fieldAttributions, 'fact');
  const mixedEvidenceCount = classificationCount(fieldAttributions, 'mixed');
  const weakEvidenceCount = classificationCount(fieldAttributions, 'inference');
  const missingEvidenceCount = classificationCount(fieldAttributions, 'gap') + fieldAttributions.flatMap((item) => item.gaps ?? []).length + (play.knowledgeGaps?.length ?? 0);
  const counterEvidenceCount = textList(play.riskCounterEvidence).length;
  const overall = clampConfidence(play.confidence, 0.35);
  const summary = missingEvidenceCount > 0 || counterEvidenceCount > 0
    ? `当前路线置信度 ${Math.round(overall * 100)}%，存在 ${missingEvidenceCount} 个证据缺口和 ${counterEvidenceCount} 条反证/风险。`
    : `当前路线置信度 ${Math.round(overall * 100)}%，主要步骤已有基础证据支撑。`;

  return {
    overall,
    strongEvidenceCount,
    mixedEvidenceCount,
    weakEvidenceCount,
    counterEvidenceCount,
    missingEvidenceCount,
    summary,
  };
}

function buildJudgments(play: StrategicPlayRoutePlanInput, fieldAttributions: FieldEvidenceAttribution[]): RouteJudgment[] {
  const judgments: RouteJudgment[] = [];
  const confidence = clampConfidence(play.confidence, 0.35);
  const addJudgment = (params: Omit<RouteJudgment, 'confidence' | 'status'> & { confidence?: number; status?: RouteJudgment['status'] }) => {
    if (!params.answer) return;
    judgments.push({
      ...params,
      confidence: params.confidence ?? confidence,
      status: params.status ?? (params.counterEvidenceRefs.length > 0 || params.missingEvidence.length > 0 ? 'challenged' : 'accepted'),
    });
  };

  addJudgment({
    id: 'judgment-overall',
    dimension: 'overall',
    answer: cleanText(play.situationJudgment) || cleanText(play.goalDescription),
    impact: 'critical',
    rationale: '整体路线判断来自当前谋局目标、局势摘要与步骤安排。',
    supportEvidenceRefs: refsForField('situationJudgment', fieldAttributions),
    counterEvidenceRefs: refsForField('riskCounterEvidence', fieldAttributions),
    missingEvidence: gapsForField('situationJudgment', fieldAttributions),
  });

  addJudgment({
    id: 'judgment-execution',
    dimension: 'execution',
    answer: cleanText(play.strategicObjective) || cleanText(play.goalDescription),
    impact: 'high',
    rationale: '执行判断决定这条路线要达成的具体销售推进结果。',
    supportEvidenceRefs: refsForField('strategicObjective', fieldAttributions),
    counterEvidenceRefs: [],
    missingEvidence: gapsForField('strategicObjective', fieldAttributions),
  });

  const stakeholderGaps = gapsForField('stakeholderPath', fieldAttributions);
  const stakeholder = textList(play.stakeholderPath).join(' -> ') || (stakeholderGaps.length > 0 ? '关键人物路径尚未确认' : '');
  addJudgment({
    id: 'judgment-relationship',
    dimension: 'relationship',
    answer: stakeholder,
    impact: inferImpact(stakeholder, 'high'),
    rationale: '人物路径决定步骤优先找谁、绕开谁、由谁推动。',
    supportEvidenceRefs: refsForField('stakeholderPath', fieldAttributions),
    counterEvidenceRefs: [],
    missingEvidence: stakeholderGaps,
  });

  return judgments;
}

function buildSituationLayers(play: StrategicPlayRoutePlanInput, fieldAttributions: FieldEvidenceAttribution[], stored?: SituationLayer[]): SituationLayer[] {
  if (stored) return stored;
  const now = play.updatedAt || new Date(0).toISOString();
  const confidence = clampConfidence(play.confidence, 0.35);
  const layer = (key: SituationLayerKey, summary: string, fields: string[], gaps: string[] = []): SituationLayer => ({
    key,
    label: LAYER_LABEL[key],
    summary: summary || '暂无明确局势摘要',
    confidence,
    evidenceRefs: fields.flatMap((field) => refsForField(field, fieldAttributions)),
    counterEvidenceRefs: key === 'evidence' ? refsForField('riskCounterEvidence', fieldAttributions) : [],
    gaps: [...fields.flatMap((field) => gapsForField(field, fieldAttributions)), ...gaps].filter(Boolean),
    updatedAt: now,
  });

  return [
    layer('business', cleanText(play.strategicObjective) || cleanText(play.goalDescription), ['strategicObjective']),
    layer('people', textList(play.stakeholderPath).join(' -> '), ['stakeholderPath'], textList(play.stakeholderPath).length === 0 ? ['缺少明确人物推进路径'] : []),
    layer('process', textList(play.assumptions).map((item) => typeof item === 'object' && item !== null ? cleanText((item as PlayAssumption).text) : '').filter(Boolean).join('；'), ['assumptions'], ['需要持续验证决策流程与 paper process']),
    layer('competition', textList(play.riskCounterEvidence).join('；') || '需要把竞品、内部替代方案和 no-decision 当作竞争项验证', ['riskCounterEvidence']),
    layer('evidence', textList(play.evidenceBasis).join('；') || '证据不足时，路线步骤必须先承担验证功能', ['evidenceBasis', 'riskCounterEvidence'], play.knowledgeGaps ?? []),
    layer('progress', `${play.steps.length} 个路线步骤，当前 momentum: ${play.momentum}`, ['steps']),
  ];
}

function buildWinGaps(play: StrategicPlayRoutePlanInput, judgments: RouteJudgment[], stored?: WinGap[]): WinGap[] {
  if (stored) return stored;
  const gaps: WinGap[] = [];
  play.steps.forEach((step, index) => {
    const stepRecord = step as PlayStep & Record<string, unknown>;
    const id = cleanText(stepRecord.winGapId);
    if (!id || gaps.some((gap) => gap.id === id)) return;
    const currentState = cleanText(stepRecord.failureTest)
      || cleanText(step.blockerReason)
      || cleanText(step.risk)
      || cleanText(step.assumptionBeingTested)
      || '第 ' + (index + 1) + ' 步仍有待验证阻力';
    const desiredState = cleanText(stepRecord.successTest)
      || cleanText(step.successSignal)
      || cleanText(step.expectedOutcome)
      || '第 ' + (index + 1) + ' 步达成明确推进信号';
    gaps.push({
      id,
      dimension: routeDimensionFromText(currentState + ' ' + desiredState),
      currentState,
      desiredState,
      impact: inferImpact(currentState + ' ' + desiredState, step.status === 'blocked' ? 'critical' : 'high') as WinGap['impact'],
      evidenceGap: cleanText(step.risk) || cleanText(step.assumptionBeingTested) || '需要通过下一步动作验证该缺口是否关闭',
      linkedJudgmentIds: judgments.map((judgment) => judgment.id),
      status: step.status === 'blocked' || step.status === 'in_progress' || step.status === 'pending' ? 'open' : 'in_progress',
    });
  });

  const missingRelationship = judgments.find((judgment) => judgment.dimension === 'relationship' && judgment.missingEvidence.length > 0);
  const evidenceGaps = [...(play.knowledgeGaps ?? []), ...judgments.flatMap((judgment) => judgment.missingEvidence)].map(cleanText).filter(Boolean);
  const risk = textList(play.riskCounterEvidence)[0];

  if (missingRelationship) {
    gaps.push({
      id: 'win-gap-relationship-coverage',
      dimension: 'relationship',
      currentState: '关键人物路径仍有证据缺口',
      desiredState: '确认能推动目标的人物路径和真实权力结构',
      impact: 'high',
      evidenceGap: missingRelationship.missingEvidence[0] ?? '缺少人物关系证据',
      linkedJudgmentIds: [missingRelationship.id],
      status: 'open',
    });
  }

  if (risk) {
    gaps.push({
      id: 'win-gap-counter-evidence',
      dimension: 'competition',
      currentState: risk,
      desiredState: '反证或竞争风险被解释、验证或解除',
      impact: inferImpact(risk, 'high') === 'medium' ? 'high' : inferImpact(risk, 'high') as WinGap['impact'],
      evidenceGap: '需要直接验证反证是否会阻断目标',
      linkedJudgmentIds: judgments.map((judgment) => judgment.id),
      status: 'open',
    });
  }

  if (evidenceGaps.length > 0) {
    gaps.push({
      id: 'win-gap-evidence-quality',
      dimension: 'evidence',
      currentState: evidenceGaps[0],
      desiredState: '关键步骤有足够证据支撑，可以推进而不只是猜测',
      impact: 'high',
      evidenceGap: evidenceGaps[0],
      linkedJudgmentIds: judgments.map((judgment) => judgment.id),
      status: 'open',
    });
  }

  if (gaps.length === 0) {
    gaps.push({
      id: 'win-gap-next-verification',
      dimension: 'progress',
      currentState: '路线已生成，但下一步验证点需要明确',
      desiredState: '通过下一步动作验证路线是否仍然成立',
      impact: 'medium',
      evidenceGap: '需要执行反馈校准路线',
      linkedJudgmentIds: judgments.map((judgment) => judgment.id),
      status: 'open',
    });
  }

  return gaps;
}

function defaultSuccessTest(step: PlayStep): string {
  return cleanText(step.expectedOutcome)
    || cleanText(step.successSignal)
    || `目标对象完成或明确回应：${cleanText(step.purpose) || cleanText(step.title)}`;
}

function defaultFailureTest(step: PlayStep): string {
  return cleanText(step.blockerReason)
    || `目标对象无回应、拒绝推进，或实际结果与预期产出不符。`;
}

function buildMoves(play: StrategicPlayRoutePlanInput, fieldAttributions: FieldEvidenceAttribution[], winGaps: WinGap[]): RouteMove[] {
  const fallbackGapId = winGaps[0]?.id;
  return play.steps.map((step, index) => {
    const stepRecord = step as PlayStep & Record<string, unknown>;
    const explicitGapId = cleanText(stepRecord.winGapId);
    const evidence = refsForField(`steps[${index}]`, fieldAttributions);
    return {
      id: cleanText(stepRecord.id) || `move-${index + 1}`,
      stepIndex: Number.isInteger(step.index) ? step.index : index,
      title: cleanText(step.title) || `第 ${index + 1} 步`,
      action: cleanText(step.action) || cleanText(step.description),
      target: cleanText(step.target),
      owner: cleanText(step.owner) || cleanText(step.who),
      timing: cleanText(step.timing),
      purpose: cleanText(step.purpose),
      status: step.status,
      ...(explicitGapId || fallbackGapId ? { winGapId: explicitGapId || fallbackGapId } : {}),
      expectedJudgmentDelta: cleanText(stepRecord.expectedJudgmentDelta) || cleanText(step.assumptionBeingTested) || cleanText(step.expectedOutcome) || '验证该步骤是否能推动目标达成',
      successTest: cleanText(stepRecord.successTest) || defaultSuccessTest(step),
      failureTest: cleanText(stepRecord.failureTest) || defaultFailureTest(step),
      fallbackRoute: cleanText(stepRecord.fallbackRoute) || cleanText(step.fallback),
      evidenceRefs: evidence,
      ...(cleanText(stepRecord.resourceRequest) ? { resourceRequest: cleanText(stepRecord.resourceRequest) } : {}),
      risk: cleanText(step.risk),
    };
  });
}

function buildFeedback(play: StrategicPlayRoutePlanInput): RouteFeedback[] {
  return play.steps
    .map((step, index) => {
      const stepRecord = step as PlayStep & Record<string, unknown>;
      const actualOutcome = cleanText(step.actualOutcome) || cleanText(step.actualResult);
      const status = step.status as CompatiblePlayStepStatus;
      const isFeedbackStatus = ['done', 'blocked', 'invalidated', 'completed', 'skipped'].includes(status);
      if (!actualOutcome && !isFeedbackStatus) return null;
      return {
        moveId: cleanText(stepRecord.id) || `move-${index + 1}`,
        stepIndex: Number.isInteger(step.index) ? step.index : index,
        status,
        ...(actualOutcome ? { actualOutcome } : {}),
        ...(cleanText(step.nextAction) ? { nextAction: cleanText(step.nextAction) } : {}),
        outcomeAssessment: normalizeOutcomeAssessment(stepRecord.outcomeAssessment, status),
        ...(cleanText(stepRecord.calibrationNote) ? { calibrationNote: cleanText(stepRecord.calibrationNote) } : {}),
        ...(cleanText(step.completedAt) || cleanText(step.startedAt) ? { occurredAt: cleanText(step.completedAt) || cleanText(step.startedAt) } : {}),
      } satisfies RouteFeedback;
    })
    .filter((item): item is RouteFeedback => item !== null);
}

function normalizeOutcomeAssessment(value: unknown, status: CompatiblePlayStepStatus): RouteFeedbackOutcome {
  const text = cleanText(value);
  if (['matched_expected', 'partially_matched', 'missed_expected', 'blocked', 'invalidated', 'unknown'].includes(text)) return text as RouteFeedbackOutcome;
  if (status === 'blocked') return 'blocked';
  if (status === 'invalidated' || status === 'skipped') return 'invalidated';
  if (status === 'done' || status === 'completed') return 'unknown';
  return 'unknown';
}

function currentCriticalMove(moves: RouteMove[]): RouteMove | undefined {
  return moves.find((move) => move.status === 'in_progress')
    ?? moves.find((move) => move.status === 'planned' || move.status === 'pending')
    ?? moves.find((move) => move.status !== 'done' && move.status !== 'completed');
}

function buildOpenQuestions(play: StrategicPlayRoutePlanInput): string[] {
  return [
    ...(play.assumptions ?? [])
      .filter((item) => item.status === 'pending')
      .map((item) => cleanText(item.text)),
    ...(play.knowledgeGaps ?? []),
  ].map(cleanText).filter(Boolean);
}

function buildRouteThesis(play: StrategicPlayRoutePlanInput): string {
  return cleanText(play.strategicObjective)
    || cleanText(play.situationJudgment)
    || `为了达成「${cleanText(play.goalDescription)}」，当前路线应优先执行可验证的下一步动作。`;
}

function buildNextVerificationPoint(moves: RouteMove[], stored?: string): string {
  if (stored) return stored;
  const move = currentCriticalMove(moves);
  if (!move) return '需要先生成可执行路线步骤';
  return `${move.title}：${move.successTest}`;
}

function buildDerivedVersions(play: StrategicPlayRoutePlanInput): RouteVersion[] {
  const versions: RouteVersion[] = [];
  (play.assumptions ?? []).forEach((assumption: PlayAssumption, index: number) => {
    const id = cleanText(assumption.id);
    const impact = cleanText(assumption.impact);
    if (!id.startsWith('sigloop_') && !impact) return;
    versions.push({
      version: versions.length + 1,
      triggerKind: 'decode_signal',
      triggerSourceRef: {
        sourceId: id.replace(/^sigloop_/, '') || 'signal-' + (index + 1),
        sourceType: 'decode_signal',
        title: cleanText(assumption.evidence) || cleanText(assumption.text) || '客户信号',
      },
      changedJudgmentIds: ['judgment-overall'],
      changedWinGapIds: [],
      changedMoveIds: [],
      diffSummary: impact || cleanText(assumption.text) || '新客户信号需要复核当前路线。',
      createdAt: cleanText(assumption.updatedAt) || cleanText(assumption.createdAt) || new Date(0).toISOString(),
    });
  });

  const reviewRecord = typeof play.review === 'object' && play.review !== null && !Array.isArray(play.review)
    ? play.review as unknown as Record<string, unknown>
    : null;
  const calibration = reviewRecord && typeof reviewRecord.calibration === 'object' && reviewRecord.calibration !== null && !Array.isArray(reviewRecord.calibration)
    ? reviewRecord.calibration as Record<string, unknown>
    : null;
  const revised = cleanText(calibration?.revisedJudgment);
  if (revised) {
    versions.push({
      version: versions.length + 1,
      triggerKind: 'execution_outcome',
      triggerSourceRef: {
        sourceId: cleanText(reviewRecord?.reviewedAt) || play.id,
        sourceType: 'strategic_play_review',
        title: '谋局复盘校准',
      },
      changedJudgmentIds: ['judgment-overall'],
      changedWinGapIds: [],
      changedMoveIds: [],
      diffSummary: revised,
      createdAt: cleanText(reviewRecord?.reviewedAt) || new Date(0).toISOString(),
    });
  }

  return versions.sort((left, right) => {
    const l = new Date(left.createdAt).getTime();
    const r = new Date(right.createdAt).getTime();
    return (Number.isNaN(r) ? 0 : r) - (Number.isNaN(l) ? 0 : l);
  }).map((version, index) => ({ ...version, version: index + 1 }));
}

export function buildStrategicPlayRoutePlan(play: StrategicPlayRoutePlanInput): StrategicPlayRoutePlan {
  const fieldAttributions = attributions(play);
  const stored = normalizeStoredFields(play);
  const judgments = buildJudgments(play, fieldAttributions);
  const winGaps = buildWinGaps(play, judgments, stored.winGaps);
  const moves = buildMoves(play, fieldAttributions, winGaps);
  const confidenceProfile = buildConfidenceProfile(play, fieldAttributions, stored.confidenceProfile);
  const situationLayers = buildSituationLayers(play, fieldAttributions, stored.situationLayers);
  const updatedAt = play.updatedAt || new Date(0).toISOString();

  return {
    schemaVersion: 'strategic_play_route_plan_v1',
    playId: play.id,
    accountId: play.accountId,
    ...(play.opportunityId ? { opportunityId: play.opportunityId } : {}),
    goal: {
      type: play.goalType,
      description: cleanText(play.goalDescription),
      status: play.status,
      confidence: clampConfidence(play.confidence, 0.35),
      momentum: play.momentum,
    },
    routeThesis: buildRouteThesis(play),
    currentCriticalMove: currentCriticalMove(moves),
    moves,
    winGaps,
    situationLayers,
    routeRationale: {
      judgments,
      confidenceProfile,
      nextVerificationPoint: buildNextVerificationPoint(moves, stored.nextVerificationPoint),
    },
    whatChanged: stored.whatChanged ?? buildDerivedVersions(play),
    feedback: buildFeedback(play),
    openQuestions: buildOpenQuestions(play),
    generatedAt: new Date().toISOString(),
    updatedAt,
  };
}
