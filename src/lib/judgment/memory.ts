import type {
  DecodeOutput,
  EvidenceSourceKind,
  JudgmentEvidenceRef,
  JudgmentRevisionItem,
  RfpAnalysisRow,
  RfpJudgment,
  RfpRow,
  SavedDecode,
  StrategicPlay,
} from '@/lib/babel-engine/types';
import type { EvidenceRecord } from '@/lib/evidence-memory';
import { compactBriefSentence, normalizeBriefConfidence } from './brief';

export type JudgmentMemorySourceKind = 'decode' | 'rfp_analysis' | 'strategic_play';

export interface JudgmentMemoryInput {
  sourceKind: JudgmentMemorySourceKind;
  sourceId: string;
  accountId: string;
  currentJudgment: string;
  risk: string;
  nextAction: string;
  confidence: number;
  uncertainty: string;
  evidenceRefs: JudgmentEvidenceRef[];
  provisional: boolean;
  createdAt: string;
  title?: string;
  rationale?: string;
}

export interface JudgmentMemoryRevisionInput {
  previous?: JudgmentMemoryInput | null;
  current: JudgmentMemoryInput;
}

const SOURCE_TO_EVIDENCE_KIND: Record<JudgmentMemorySourceKind, EvidenceSourceKind> = {
  decode: 'email_decode',
  rfp_analysis: 'source_record',
  strategic_play: 'strategic_play',
};

const RFP_DECISION_LABEL: Record<RfpJudgment['decision'], string> = {
  bid: '建议投标',
  no_bid: '建议放弃',
  cautious_bid: '建议谨慎投标',
  need_more_intel: '先补情报',
};

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return '';
}

function confidence01(value?: number | null, fallback = 0.5): number {
  const normalized = normalizeBriefConfidence(value ?? fallback);
  return normalized ?? fallback;
}

function averageConfidence(output: DecodeOutput): number {
  const values = output.messages
    .map((message) => message.decode?.confidence)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (values.length === 0) return 0.5;
  return confidence01(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function riskFromDecode(output: DecodeOutput): string {
  const analysis = output.threadAnalysis;
  const level = analysis.riskLevel;
  if (level === 'high') return firstNonEmpty(analysis.keySignal, '当前沟通暴露高风险，需要先确认阻碍来源。');
  if (level === 'medium') return firstNonEmpty(analysis.keySignal, '存在中等风险，需要补充证据后再升级承诺。');
  return firstNonEmpty(analysis.keySignal, '当前未发现高强度风险，但仍需持续验证。');
}

export function buildJudgmentMemoryFromDecode(params: {
  savedDecode: Pick<SavedDecode, 'id' | 'accountId' | 'decode' | 'date' | 'clientName' | 'accountName'>;
  createdAt?: string;
}): JudgmentMemoryInput | null {
  const { savedDecode } = params;
  if (!savedDecode.accountId) return null;

  const output = savedDecode.decode;
  const firstMessage = output.messages[0];
  const confidence = averageConfidence(output);
  const keySignal = output.threadAnalysis?.keySignal;
  const currentJudgment = firstNonEmpty(
    keySignal,
    firstMessage?.decode?.meaning,
    '已形成一条新的客户沟通判断。',
  );
  const nextAction = firstNonEmpty(
    output.actionItems?.[0]?.title,
    output.actionItems?.[0]?.reasoning,
    keySignal
      ? '围绕这条客户信号确认真实阻碍、下一步责任人和完成时间。'
      : '先补充客户互动或会议记录，再判断下一步责任人和时间。',
  );

  return {
    sourceKind: 'decode',
    sourceId: savedDecode.id,
    accountId: savedDecode.accountId,
    title: savedDecode.clientName ? `Decode · ${savedDecode.clientName}` : 'Decode 判断',
    currentJudgment: compactBriefSentence(currentJudgment) || currentJudgment,
    risk: compactBriefSentence(riskFromDecode(output)) || riskFromDecode(output),
    nextAction: compactBriefSentence(nextAction) || nextAction,
    confidence,
    uncertainty: output.threadAnalysis?.riskLevel === 'low'
      ? '仍需用后续互动确认该信号是否会持续转化为推进动作。'
      : '需要确认风险是否来自真实阻碍、采购流程还是短期沟通噪音。',
    evidenceRefs: [{
      sourceId: savedDecode.id,
      sourceKind: 'email_decode',
      title: savedDecode.accountName ?? savedDecode.clientName ?? '邮件解读',
      sourceTable: 'email_decodes',
      sourceRowId: savedDecode.id,
    }],
    provisional: confidence < 0.8 || output.threadAnalysis?.riskLevel !== 'low',
    createdAt: params.createdAt ?? savedDecode.date ?? new Date().toISOString(),
    rationale: firstNonEmpty(firstMessage?.decode?.meaning, keySignal),
  };
}

export function buildJudgmentMemoryFromRfpAnalysis(params: {
  rfp: Pick<RfpRow, 'id' | 'account_id' | 'title' | 'due_date'>;
  analysis: Pick<RfpAnalysisRow, 'id' | 'created_at'>;
  judgment: RfpJudgment;
  recommendations?: string[];
  weaknesses?: string[];
  winProbability?: number | null;
}): JudgmentMemoryInput {
  const { rfp, analysis, judgment } = params;
  const keyRisks = Array.isArray(judgment.keyRisks) ? judgment.keyRisks : [];
  const tensions = Array.isArray(judgment.tensions) ? judgment.tensions : [];
  const contradictions = Array.isArray(judgment.contradictions) ? judgment.contradictions : [];
  const confidence = confidence01(judgment.confidence, 50);
  const decisionLabel = RFP_DECISION_LABEL[judgment.decision] ?? '先补情报';
  const risk = firstNonEmpty(
    keyRisks[0],
    tensions[0],
    contradictions[0],
    params.weaknesses?.[0],
    judgment.uncertainty,
    '当前未发现明确高强度 RFP 风险。',
  );
  const nextAction = firstNonEmpty(
    params.recommendations?.[0],
    judgment.narrativeChange,
    judgment.decision === 'need_more_intel'
      ? '先补齐采购标准、竞对位置和决策人态度，再决定是否投标。'
      : '围绕最大风险补证据，再确认是否进入下一阶段承诺。',
  );

  const evidenceRefs: JudgmentEvidenceRef[] = [
    {
      sourceId: analysis.id,
      sourceKind: 'source_record',
      title: `RFP分析：${rfp.title}`,
      sourceTable: 'rfp_ai_analyses',
      sourceRowId: analysis.id,
    },
    {
      sourceId: rfp.id,
      sourceKind: 'source_record',
      title: rfp.title,
      sourceTable: 'rfps',
      sourceRowId: rfp.id,
    },
  ];

  return {
    sourceKind: 'rfp_analysis',
    sourceId: analysis.id,
    accountId: rfp.account_id,
    title: `RFP判断 · ${rfp.title}`,
    currentJudgment: compactBriefSentence(`${decisionLabel}：${judgment.rationale}`) || decisionLabel,
    risk: compactBriefSentence(risk) || risk,
    nextAction: compactBriefSentence(nextAction) || nextAction,
    confidence,
    uncertainty: firstNonEmpty(judgment.uncertainty, '仍需验证评分规则、关键决策人倾向、竞对报价和预算弹性。'),
    evidenceRefs,
    provisional: confidence < 0.8 || contradictions.length > 0 || judgment.decision === 'need_more_intel',
    createdAt: analysis.created_at,
    rationale: judgment.rationale,
  };
}

export function buildJudgmentMemoryFromStrategicPlay(play: Pick<StrategicPlay, 'id' | 'accountId' | 'goalDescription' | 'steps' | 'confidence' | 'assumptions' | 'updatedAt' | 'createdAt'> & Pick<Partial<StrategicPlay>, 'fieldEvidenceAttributions'>): JudgmentMemoryInput {
  const firstStep = play.steps[0];
  const invalidated = play.assumptions.filter((assumption) => assumption.status === 'invalidated');
  const pending = play.assumptions.filter((assumption) => assumption.status === 'pending');
  const confidence = confidence01(play.confidence);
  const latestCalibration = (play.fieldEvidenceAttributions ?? [])
    .flatMap((attribution) => (attribution.calibrations ?? []).map((calibration) => ({ field: attribution.field, calibration })))
    .sort((a, b) => new Date(b.calibration.occurredAt).getTime() - new Date(a.calibration.occurredAt).getTime())[0];
  const risk = firstNonEmpty(
    invalidated[0]?.text,
    pending[0]?.text,
    '当前谋局假设尚未全部验证，需要持续用客户反馈校准。',
  );

  return {
    sourceKind: 'strategic_play',
    sourceId: play.id,
    accountId: play.accountId,
    title: '谋局判断',
    currentJudgment: compactBriefSentence(play.goalDescription) || '已有谋局判断。',
    risk: compactBriefSentence(risk) || risk,
    nextAction: firstNonEmpty(firstStep?.title, firstStep?.description, '执行下一步谋局动作，并记录客户反馈。'),
    confidence,
    uncertainty: latestCalibration
      ? `最近执行校准：${latestCalibration.field} → ${latestCalibration.calibration.calibratedClassification}（${latestCalibration.calibration.outcomeAssessment}）。`
      : pending.length > 0
        ? `仍有 ${pending.length} 个假设待验证。`
        : '需要用执行结果持续校准当前谋局。',
    evidenceRefs: [
      {
        sourceId: play.id,
        sourceKind: 'strategic_play',
        title: play.goalDescription,
        sourceTable: 'strategic_plays',
        sourceRowId: play.id,
      },
      ...(latestCalibration ? [{
        sourceId: latestCalibration.calibration.sourceRef.sourceId,
        sourceKind: latestCalibration.calibration.sourceRef.sourceKind ?? 'source_record',
        title: latestCalibration.calibration.sourceRef.title ?? `谋局执行校准：${latestCalibration.field}`,
        sourceTable: latestCalibration.calibration.sourceRef.sourceTable,
        sourceRowId: latestCalibration.calibration.sourceRef.sourceRowId,
      }] : []),
    ],
    provisional: confidence < 0.8 || pending.length > 0 || invalidated.length > 0,
    createdAt: play.updatedAt ?? play.createdAt,
    rationale: firstNonEmpty(latestCalibration?.calibration.note, latestCalibration?.calibration.sourceRef.excerpt, firstStep?.description),
  };
}

export function buildJudgmentMemoryEvidenceRecord(input: JudgmentMemoryInput): EvidenceRecord {
  const sourceKind = SOURCE_TO_EVIDENCE_KIND[input.sourceKind];
  const signal = /风险|放弃|不足|阻碍|缺少|不确定|no_bid|need_more_intel/i.test(`${input.currentJudgment} ${input.risk}`)
    ? 'risk'
    : /建议|推进|投标|确认|支持|进入|bid/i.test(`${input.currentJudgment} ${input.nextAction}`)
      ? 'positive'
      : 'neutral';

  return {
    sourceId: input.sourceId,
    sourceKind,
    sourceLabel: input.title,
    sourceTable: input.sourceKind === 'rfp_analysis' ? 'rfp_ai_analyses' : undefined,
    sourceRowId: input.sourceId,
    occurredAt: input.createdAt,
    title: input.title ?? '判断记忆',
    summary: [
      `当前判断：${input.currentJudgment}`,
      `最大风险：${input.risk}`,
      `下一步：${input.nextAction}`,
      input.uncertainty ? `不确定性：${input.uncertainty}` : null,
    ].filter(Boolean).join('\n'),
    signal,
    weight: Math.max(0.55, Math.min(0.95, input.confidence)),
  };
}

export interface JudgmentMemorySourceRecordRow {
  org_id: string;
  account_id: string;
  source_kind: EvidenceSourceKind;
  source_table: string;
  source_row_id: string;
  title: string;
  summary: string;
  occurred_at: string;
  metadata: Record<string, unknown>;
}

export function buildJudgmentMemorySourceRecord(params: {
  orgId: string;
  judgmentMemory: JudgmentMemoryInput;
  sourceTable: string;
  extraMetadata?: Record<string, unknown>;
}): JudgmentMemorySourceRecordRow {
  const { orgId, judgmentMemory, sourceTable, extraMetadata } = params;
  const evidenceRecord = buildJudgmentMemoryEvidenceRecord(judgmentMemory);

  return {
    org_id: orgId,
    account_id: judgmentMemory.accountId,
    source_kind: evidenceRecord.sourceKind,
    source_table: sourceTable,
    source_row_id: evidenceRecord.sourceRowId ?? judgmentMemory.sourceId,
    title: evidenceRecord.title,
    summary: evidenceRecord.summary,
    occurred_at: evidenceRecord.occurredAt,
    metadata: {
      ...extraMetadata,
      sourceKind: judgmentMemory.sourceKind,
      judgmentMemory,
      evidenceRefs: judgmentMemory.evidenceRefs,
    },
  };
}

export function buildJudgmentMemoryRevisionItem({ previous, current }: JudgmentMemoryRevisionInput): JudgmentRevisionItem {
  const changed: string[] = [];
  if (!previous) {
    changed.push('首次形成可追踪判断');
  } else {
    if (previous.currentJudgment !== current.currentJudgment) changed.push(`当前判断由“${previous.currentJudgment}”更新为“${current.currentJudgment}”`);
    if (previous.risk !== current.risk) changed.push(`最大风险由“${previous.risk}”更新为“${current.risk}”`);
    if (previous.nextAction !== current.nextAction) changed.push(`下一步动作由“${previous.nextAction}”更新为“${current.nextAction}”`);
    if (Math.abs(previous.confidence - current.confidence) >= 0.1) changed.push(`置信度由 ${Math.round(previous.confidence * 100)}% 变为 ${Math.round(current.confidence * 100)}%`);
  }

  const whyChanged = [
    changed.length > 0 ? changed.join('；') : '判断本身未明显变化，但证据链已更新',
    current.uncertainty ? `仍需确认：${current.uncertainty}` : null,
  ].filter(Boolean).join('；');

  return {
    id: `${current.sourceKind}:${current.sourceId}:revision`,
    title: current.title ?? '判断变化',
    summary: current.currentJudgment,
    changedAt: current.createdAt,
    whyChanged,
    evidenceRefs: current.evidenceRefs,
  };
}
