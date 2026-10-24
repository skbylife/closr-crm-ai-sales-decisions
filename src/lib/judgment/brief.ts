import { normalizePlayStepExecutionStatus } from '@/lib/strategic-play-execution';
import type { ProductLocale } from '@/lib/locale-contract';
import { buildEvidenceHref } from './evidence-trace-links';
import type { JudgmentFeedbackTarget } from './feedback';
import type {
  DecodeOutput,
  EvidenceSourceKind,
  Judgment,
  JudgmentEvidenceRef,
  RfpJudgment,
  RfpJudgmentDecision,
  RfpJudgmentSignal,
  StrategicPlay,
} from '@/lib/babel-engine/types';

export type JudgmentBriefTone = 'neutral' | 'positive' | 'warning' | 'danger' | 'accent';

export interface JudgmentBriefEvidenceChip {
  label: string;
  description?: string;
  sourceLabel?: string;
  href?: string;
  tone?: JudgmentBriefTone;
}

export type JudgmentEvidenceStrength = 'strong' | 'moderate' | 'thin' | 'missing';
export type JudgmentQualityRisk = 'low' | 'medium' | 'high';
export type JudgmentFreshness = 'fresh' | 'aging' | 'stale' | 'unknown';

export interface JudgmentQualityFlag {
  label: string;
  detail?: string;
  tone?: JudgmentBriefTone;
}

export interface JudgmentQualityLayer {
  evidenceStrength?: JudgmentEvidenceStrength;
  qualityRisk?: JudgmentQualityRisk;
  freshness?: JudgmentFreshness;
  provisionalLabel?: string;
  flags?: JudgmentQualityFlag[];
}

export type JudgmentChangeType = 'improved' | 'declined' | 'shifted' | 'new' | 'unchanged';

export interface JudgmentEvolution {
  previousJudgment?: string;
  currentJudgment: string;
  changeType: JudgmentChangeType;
  whyChanged: string;
  changedSignals: string[];
  changedAt?: string | number | Date | null;
  summary: string;
}

export interface JudgmentBriefData {
  title?: string;
  contextLabel?: string;
  currentJudgment: string;
  biggestRisk: string;
  nextAction: string;
  reasons?: string[];
  evidenceChips?: JudgmentBriefEvidenceChip[];
  confidence?: number | null;
  updatedAt?: string | number | Date | null;
  statusLabel?: string;
  quality?: JudgmentQualityLayer;
  evolution?: JudgmentEvolution;
}

const SOURCE_KIND_LABEL: Record<EvidenceSourceKind, string> = {
  intel_item: '情报',
  email_decode: '沟通解读',
  integration_email: '邮件',
  meeting_prep: '会议',
  activity_log: '活动',
  strategic_play: '谋局',
  source_record: '记录',
};

export interface RfpAnalysisBrief {
  id?: string;
  rfpId?: string;
  opportunityId?: string;
  analysisType?: string;
  winProbability: number | null;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  competitorAnalysis: string | null;
  judgment?: RfpJudgment | null;
  aiModel?: string | null;
  createdAt?: string;
}


export interface RfpJudgmentBriefOptions {
  opportunityId?: string | null;
  rfpId?: string | null;
  analysisId?: string | null;
  signalIndex?: number | null;
}

export interface RfpJudgmentFeedbackTarget {
  accountId: string;
  targetType: Extract<JudgmentFeedbackTarget, 'rfp'>;
  targetId: string;
  previousSummary?: string;
}

function cleanRfpIdentifier(value?: string | null): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function buildRfpEvidenceHref(options: RfpJudgmentBriefOptions = {}): string | undefined {
  const opportunityId = cleanRfpIdentifier(options.opportunityId);
  const rfpId = cleanRfpIdentifier(options.rfpId);
  const analysisId = cleanRfpIdentifier(options.analysisId);
  if (!opportunityId || (!rfpId && !analysisId)) return undefined;

  const params = new URLSearchParams({ tab: 'rfp' });
  if (rfpId) params.set('rfpId', rfpId);
  if (analysisId) params.set('analysisId', analysisId);
  if (typeof options.signalIndex === 'number' && Number.isInteger(options.signalIndex) && options.signalIndex >= 0) {
    params.set('signalIndex', String(options.signalIndex));
  }
  return `/pipeline/${encodeURIComponent(opportunityId)}?${params.toString()}`;
}

export function buildRfpJudgmentFeedbackTarget(params: {
  analysis: RfpAnalysisBrief;
  accountId?: string | null;
  fallbackRfpId?: string | null;
  brief?: JudgmentBriefData | null;
}): RfpJudgmentFeedbackTarget | undefined {
  const accountId = cleanRfpIdentifier(params.accountId);
  const targetId = cleanRfpIdentifier(params.analysis.id)
    ?? cleanRfpIdentifier(params.analysis.rfpId)
    ?? cleanRfpIdentifier(params.fallbackRfpId);
  if (!accountId || !targetId) return undefined;

  return {
    accountId,
    targetType: 'rfp',
    targetId,
    previousSummary: params.brief?.currentJudgment,
  };
}

export const RFP_JUDGMENT_LABELS: Record<RfpJudgmentDecision, string> = {
  bid: '投标',
  no_bid: '放弃',
  cautious_bid: '谨慎投标',
  need_more_intel: '先补情报',
};

export const RFP_SIGNAL_SOURCE_LABELS: Record<RfpJudgmentSignal['source'], string> = {
  rfp: '招投标文件',
  competitor: '竞对',
  milestone: '里程碑',
  opportunity: '商机',
  account: '账户',
  knowledge: '知识库',
  ai_inference: 'AI 推断',
};

const RFP_SIGNAL_TONES: Record<RfpJudgmentSignal['valence'], JudgmentBriefTone> = {
  positive: 'positive',
  negative: 'danger',
  uncertain: 'warning',
};

export function compactBriefSentence(text?: string | null): string {
  if (!text) return '';
  const normalized = text.replace(/\s+/g, ' ').replace(/；/g, '，').trim();
  return normalized.split(/[。!?！？]/)[0] || normalized;
}

export function normalizeBriefConfidence(confidence?: number | null): number | null {
  if (confidence == null || !Number.isFinite(confidence)) return null;
  const normalized = confidence > 1 ? confidence / 100 : confidence;
  return Math.max(0, Math.min(1, normalized));
}

function uniqueQualityFlags(flags: JudgmentQualityFlag[]): JudgmentQualityFlag[] {
  const seen = new Set<string>();
  return flags.filter((flag) => {
    if (!flag.label || seen.has(flag.label)) return false;
    seen.add(flag.label);
    return true;
  }).slice(0, 4);
}

function asRfpRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asRfpStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function asRfpEvidenceSignals(value: unknown): RfpJudgmentSignal[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const record = asRfpRecord(item);
    if (!record) return [];
    const label = typeof record.label === 'string' && record.label.trim() ? record.label.trim() : '';
    if (!label) return [];

    const source = record.source === 'rfp'
      || record.source === 'competitor'
      || record.source === 'milestone'
      || record.source === 'opportunity'
      || record.source === 'account'
      || record.source === 'knowledge'
      || record.source === 'ai_inference'
      ? record.source
      : 'ai_inference';
    const valence = record.valence === 'positive' || record.valence === 'negative' || record.valence === 'uncertain'
      ? record.valence
      : 'uncertain';

    return [{
      label,
      source,
      valence,
      evidence: typeof record.evidence === 'string' ? record.evidence : '',
    } satisfies RfpJudgmentSignal];
  });
}

function normalizeRfpJudgment(judgment?: RfpJudgment | null): RfpJudgment | null {
  if (!judgment) return null;
  return {
    ...judgment,
    keyRisks: asRfpStringArray(judgment.keyRisks),
    contradictions: asRfpStringArray(judgment.contradictions),
    tensions: asRfpStringArray(judgment.tensions),
    evidenceSignals: asRfpEvidenceSignals(judgment.evidenceSignals),
  };
}

export function normalizeRfpWinPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
}

function pickRfpNextAction(analysis: RfpAnalysisBrief, decision: RfpJudgmentDecision): string {
  const recommendations = asRfpStringArray(analysis.recommendations);
  if (recommendations[0]) return compactBriefSentence(recommendations[0]);
  switch (decision) {
    case 'bid':
      return '进入正式响应，但先把成功标准、时间表和关键决策人锁定。';
    case 'no_bid':
      return '暂停投入投标资源，向客户确认放弃原因并保留后续关系入口。';
    case 'cautious_bid':
      return '先处理最大风险，再决定是否提交最终投标承诺。';
    case 'need_more_intel':
      return '先补齐采购标准、竞对位置和决策人态度，再做投标/放弃决定。';
    default:
      return '先补充关键情报，再决定下一步动作。';
  }
}

function rfpEvidenceStrength(params: { signalCount: number; fallbackEvidenceCount: number; confidence?: number | null }): JudgmentQualityLayer['evidenceStrength'] {
  const confidence = params.confidence == null ? null : normalizeBriefConfidence(params.confidence);
  const totalSignals = params.signalCount + params.fallbackEvidenceCount;
  if (params.signalCount >= 3 && (confidence == null || confidence >= 0.65)) return 'strong';
  if (totalSignals >= 2 && (confidence == null || confidence >= 0.45)) return 'moderate';
  if (totalSignals > 0) return 'thin';
  return 'missing';
}

function rfpFreshness(createdAt?: string): JudgmentFreshness {
  return freshnessFromUpdatedAt(createdAt);
}

function buildRfpQualityLayer(analysis: RfpAnalysisBrief): JudgmentQualityLayer {
  const judgment = normalizeRfpJudgment(analysis.judgment);
  const evidenceSignals = judgment?.evidenceSignals ?? [];
  const contradictions = judgment?.contradictions ?? [];
  const tensions = judgment?.tensions ?? [];
  const strengths = asRfpStringArray(analysis.strengths);
  const weaknesses = asRfpStringArray(analysis.weaknesses);
  const recommendations = asRfpStringArray(analysis.recommendations);
  const contradictionCount = contradictions.length;
  const tensionCount = tensions.length;
  const fallbackEvidenceCount = strengths.length + weaknesses.length + recommendations.length;
  const confidence = judgment ? normalizeBriefConfidence(judgment.confidence) : null;
  const flags: JudgmentQualityFlag[] = [];

  if (evidenceSignals.length === 0 && fallbackEvidenceCount === 0) {
    flags.push({ label: '缺少投标证据', detail: '没有结构化证据信号，也没有可用的优势、劣势或建议。', tone: 'danger' });
  } else if (evidenceSignals.length === 0) {
    flags.push({ label: '缺少结构化证据', detail: '当前依赖基础分析结果，缺少逐条证据信号。', tone: 'warning' });
  }
  if (contradictionCount > 0) {
    flags.push({ label: '存在证据矛盾', detail: `${contradictionCount} 条矛盾证据需要解释。`, tone: contradictionCount >= 3 ? 'danger' : 'warning' });
  }
  if (tensionCount > 0) {
    flags.push({ label: '存在判断张力', detail: `${tensionCount} 条判断张力需要复核。`, tone: 'warning' });
  }
  if (judgment?.uncertainty) {
    flags.push({ label: '不确定性未消除', detail: compactBriefSentence(judgment.uncertainty), tone: 'warning' });
  }
  if (judgment && confidence != null && confidence < 0.45) {
    flags.push({ label: '判断可信度偏低', detail: `判断可信度约 ${Math.round(confidence * 100)}%。`, tone: 'danger' });
  }
  if (recommendations.length === 0) {
    flags.push({ label: '缺少行动建议', detail: '没有明确行动建议，系统将使用兜底策略。', tone: 'warning' });
  }
  if (!judgment && weaknesses.length === 0) {
    flags.push({ label: '风险面不足', detail: '基础分析未给出劣势项，需人工确认是否漏判风险。', tone: 'warning' });
  }

  return {
    evidenceStrength: rfpEvidenceStrength({
      signalCount: evidenceSignals.length,
      fallbackEvidenceCount,
      confidence: judgment?.confidence ?? null,
    }),
    qualityRisk: contradictionCount >= 3 ? 'high' : contradictionCount > 0 || tensionCount > 0 || Boolean(judgment?.uncertainty) || flags.length > 0 ? 'medium' : 'low',
    freshness: rfpFreshness(analysis.createdAt),
    provisionalLabel: flags.length > 0 || !judgment ? '待补齐投标证据' : undefined,
    flags: uniqueQualityFlags(flags),
  };
}

export function buildRfpJudgmentBrief(analysis: RfpAnalysisBrief, options: RfpJudgmentBriefOptions = {}): JudgmentBriefData | null {
  const judgment = normalizeRfpJudgment(analysis.judgment);
  const strengths = asRfpStringArray(analysis.strengths);
  const weaknesses = asRfpStringArray(analysis.weaknesses);
  const recommendations = asRfpStringArray(analysis.recommendations);
  const winPercent = normalizeRfpWinPercent(analysis.winProbability);
  const rfpEvidenceHref = buildRfpEvidenceHref({
    opportunityId: options.opportunityId ?? analysis.opportunityId,
    rfpId: options.rfpId ?? analysis.rfpId,
    analysisId: options.analysisId ?? analysis.id,
  });
  if (!judgment) {
    if (winPercent == null && recommendations.length === 0 && weaknesses.length === 0) return null;
    const winJudgment = winPercent == null
      ? '已有分析结果，但尚未形成明确投标判断。'
      : winPercent >= 60
        ? '当前胜率偏高，可以进入响应准备。'
        : winPercent >= 30
          ? '当前胜率中等，需要先补强风险项。'
          : '当前胜率偏低，不宜盲目投入投标资源。';
    return {
      contextLabel: '投标判断',
      title: '先看是否该投，再看证据',
      currentJudgment: winJudgment,
      biggestRisk: compactBriefSentence(weaknesses[0]) || '当前缺少结构化风险判断。',
      nextAction: compactBriefSentence(recommendations[0]) || '先补齐关键采购标准和竞对位置，再决定投标动作。',
      updatedAt: analysis.createdAt,
      reasons: [...strengths.slice(0, 1), ...weaknesses.slice(0, 2)].map(compactBriefSentence).filter(Boolean).slice(0, 3),
      quality: buildRfpQualityLayer(analysis),
    };
  }

  const currentJudgment: Record<RfpJudgmentDecision, string> = {
    bid: '建议投标：当前信号支持进入正式响应。',
    no_bid: '建议放弃：当前胜算或适配度不足。',
    cautious_bid: '建议谨慎投标：可以推进，但必须先处理关键风险。',
    need_more_intel: '先补情报：证据不足，暂不做投标承诺。',
  };

  const biggestRisk =
    judgment.keyRisks[0] ??
    judgment.tensions[0] ??
    judgment.contradictions[0] ??
    judgment.uncertainty ??
    weaknesses[0] ??
    '当前未发现明确高强度投标风险。';

  const reasons = [
    judgment.rationale,
    judgment.tensions[0],
    judgment.narrativeChange,
  ].map(compactBriefSentence).filter(Boolean).slice(0, 3);

  const evidenceChips = judgment.evidenceSignals.slice(0, 3).map((signal, signalIndex) => ({
    label: signal.label,
    description: signal.evidence,
    sourceLabel: RFP_SIGNAL_SOURCE_LABELS[signal.source],
    href: buildRfpEvidenceHref({
      opportunityId: options.opportunityId ?? analysis.opportunityId,
      rfpId: options.rfpId ?? analysis.rfpId,
      analysisId: options.analysisId ?? analysis.id,
      signalIndex,
    }) ?? rfpEvidenceHref,
    tone: RFP_SIGNAL_TONES[signal.valence],
  }));

  return {
    contextLabel: '投标判断',
    title: '先看是否该投，再看证据',
    statusLabel: RFP_JUDGMENT_LABELS[judgment.decision],
    currentJudgment: currentJudgment[judgment.decision],
    biggestRisk: compactBriefSentence(biggestRisk) || biggestRisk,
    nextAction: pickRfpNextAction(analysis, judgment.decision),
    confidence: judgment.confidence,
    updatedAt: analysis.createdAt,
    reasons,
    evidenceChips,
    quality: buildRfpQualityLayer(analysis),
  };
}

function freshnessFromUpdatedAt(updatedAt?: string | number | Date | null): JudgmentFreshness {
  if (!updatedAt) return 'unknown';
  const time = new Date(updatedAt).getTime();
  if (!Number.isFinite(time)) return 'unknown';
  const ageDays = (Date.now() - time) / (1000 * 60 * 60 * 24);
  if (ageDays <= 14) return 'fresh';
  if (ageDays <= 45) return 'aging';
  return 'stale';
}

function isValidBriefDate(value?: string | number | Date | null): boolean {
  if (!value) return false;
  return Number.isFinite(new Date(value).getTime());
}

function uniqueCompactTexts(values: Array<string | null | undefined>, limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = compactBriefSentence(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function inferJudgmentChangeType(judgment: Judgment, previousJudgment?: string): JudgmentChangeType {
  const current = compactBriefSentence(judgment.summary) || judgment.title;
  const previous = compactBriefSentence(previousJudgment);
  if (!previous) return 'new';
  if (previous === current) return 'unchanged';

  const whyChanged = judgment.whyChanged ?? '';
  if (/维持|没有变化|未变化|unchanged/i.test(whyChanged)) return 'unchanged';
  if (/改善|好转|增强|上升|加速|支持者.*增加|风险.*降低|张力.*减少|improv/i.test(whyChanged)) return 'improved';
  if (/恶化|下降|减弱|停滞|受阻|新增.*风险|风险.*升|张力.*增加|阻碍方.*增加|declin/i.test(whyChanged)) return 'declined';

  return 'shifted';
}

function getChangeTypeLabel(changeType: JudgmentChangeType): string {
  switch (changeType) {
    case 'improved': return '判断向好';
    case 'declined': return '判断转弱';
    case 'shifted': return '判断转向';
    case 'unchanged': return '判断维持';
    case 'new': return '首次形成判断';
    default: return '判断更新';
  }
}

export function buildJudgmentEvolution(judgment?: Judgment | null): JudgmentEvolution | undefined {
  if (!judgment) return undefined;

  const currentJudgment = compactBriefSentence(judgment.summary) || compactBriefSentence(judgment.title) || '暂无稳定判断';
  const previousJudgment = compactBriefSentence(judgment.previousSummary) || undefined;
  const changeType = inferJudgmentChangeType(judgment, previousJudgment);
  const changedSignals = uniqueCompactTexts([
    ...(Array.isArray(judgment.changeEvidenceRefs) ? judgment.changeEvidenceRefs : []).map((ref) => ref.title || ref.sourceRowId || ref.sourceId),
    ...(Array.isArray(judgment.evidenceRefs) ? judgment.evidenceRefs : []).map((ref) => ref.title || ref.sourceRowId || ref.sourceId),
  ], 3);
  const changedAt = isValidBriefDate(judgment.updatedAt) ? judgment.updatedAt : undefined;
  const whyChanged = compactBriefSentence(judgment.whyChanged)
    || (changeType === 'new'
      ? '首次形成判断；等下一次客户信号进入后再校准。'
      : changedSignals[0]
        ? `主要由“${changedSignals[0]}”等新信号触发。`
        : '依据已更新，但仍需要下一次客户反馈校准。');
  const summary = changeType === 'new'
    ? '首次形成判断，等下一次信号校准。'
    : `${getChangeTypeLabel(changeType)}：${whyChanged}`;

  return {
    previousJudgment,
    currentJudgment,
    changeType,
    whyChanged,
    changedSignals,
    changedAt,
    summary,
  };
}

function buildDecodeQualityLayer(output: DecodeOutput, updatedAt?: string | number | Date | null): JudgmentQualityLayer {
  const messages = getDecodeMessages(output);
  const confidence = averageDecodeConfidence(output);
  const actionCount = output.actionItems?.length ?? 0;
  const riskLevel = output.threadAnalysis?.riskLevel;
  const flags: JudgmentQualityFlag[] = [];

  if (messages.length === 0 && !output.threadAnalysis?.keySignal) {
    flags.push({ label: '缺少原始沟通信号', detail: '没有可解释的消息或主信号，当前判断只能作为占位。', tone: 'danger' });
  }
  if (confidence == null) {
    flags.push({ label: '缺少可信度', detail: '解读结果没有返回逐条可信度，需要人工复核。', tone: 'warning' });
  } else if (confidence < 0.45) {
    flags.push({ label: '低置信度', detail: `平均置信度约 ${Math.round(confidence * 100)}%。`, tone: 'danger' });
  }
  if (actionCount === 0) {
    flags.push({ label: '没有明确下一步', detail: '系统使用了兜底行动建议，建议补一条可执行承诺。', tone: 'warning' });
  }
  if (riskLevel === 'critical' || riskLevel === 'high') {
    flags.push({ label: '高风险判断需验证', detail: '风险等级较高，推进前应确认阻碍来源是否真实。', tone: 'danger' });
  }

  const evidenceStrength: JudgmentEvidenceStrength = messages.length >= 3 && (confidence ?? 0) >= 0.65
    ? 'strong'
    : messages.length >= 1 && (confidence == null || confidence >= 0.45)
      ? 'moderate'
      : messages.length > 0 || output.threadAnalysis?.keySignal
        ? 'thin'
        : 'missing';

  return {
    evidenceStrength,
    qualityRisk: riskLevel === 'critical' || riskLevel === 'high' || flags.length > 0 ? 'medium' : 'low',
    freshness: freshnessFromUpdatedAt(updatedAt),
    provisionalLabel: evidenceStrength === 'strong' && flags.length === 0 ? undefined : '待验证',
    flags: uniqueQualityFlags(flags),
  };
}

function localizedPlayText(locale: ProductLocale | undefined, zh: string, en: string): string {
  return locale === 'en' ? en : zh;
}

function buildStrategicPlayQualityLayer(play: StrategicPlay, locale?: ProductLocale): JudgmentQualityLayer {
  const assumptions = getPlayAssumptions(play);
  const steps = getPlaySteps(play);
  const pendingAssumptions = assumptions.filter((assumption) => assumption.status === 'pending');
  const verifiedAssumptions = assumptions.filter((assumption) => assumption.status === 'verified');
  const invalidatedAssumptions = assumptions.filter((assumption) => assumption.status === 'invalidated');
  const learnings = getPlayLearnings(play);
  const activeStep = firstCurrentOrNextStep(play);
  const confidence = normalizeBriefConfidence(play.confidence);
  const flags: JudgmentQualityFlag[] = [];

  if (play.momentum === 'blocked') {
    flags.push({
      label: localizedPlayText(locale, '谋局受阻', 'Play blocked'),
      detail: localizedPlayText(locale, '当前推进受阻，需要先找替代路径。', 'Progress is blocked; confirm an alternative path before moving forward.'),
      tone: 'danger',
    });
  } else if (play.momentum === 'stalled' || play.daysSinceProgress >= 14) {
    flags.push({
      label: localizedPlayText(locale, '推进停滞', 'Progress stalled'),
      detail: play.daysSinceProgress > 0
        ? localizedPlayText(locale, `已 ${play.daysSinceProgress} 天没有进展。`, `No progress for ${play.daysSinceProgress} days.`)
        : localizedPlayText(locale, '当前推进停滞。', 'Current progress is stalled.'),
      tone: 'warning',
    });
  }
  if (pendingAssumptions.length > 0 && verifiedAssumptions.length === 0) {
    flags.push({
      label: localizedPlayText(locale, '假设未验证', 'Assumptions unverified'),
      detail: localizedPlayText(locale, `${pendingAssumptions.length} 条假设仍待验证。`, `${pendingAssumptions.length} assumptions still need validation.`),
      tone: 'warning',
    });
  }
  if (steps.length === 0 || !activeStep) {
    flags.push({
      label: localizedPlayText(locale, '没有当前步骤', 'No active step'),
      detail: localizedPlayText(locale, '缺少可执行步骤，下一步动作会使用兜底建议。', 'No executable step is available, so the next action uses a fallback recommendation.'),
      tone: 'danger',
    });
  }
  if ((confidence ?? 0) < 0.45) {
    flags.push({
      label: localizedPlayText(locale, '谋局可信度偏低', 'Low play confidence'),
      detail: confidence == null
        ? localizedPlayText(locale, '缺少可信度。', 'Confidence is missing.')
        : localizedPlayText(locale, `可信度约 ${Math.round(confidence * 100)}%。`, `Confidence is about ${Math.round(confidence * 100)}%.`),
      tone: 'warning',
    });
  }
  if (learnings.length === 0) {
    flags.push({
      label: localizedPlayText(locale, '缺少学习反馈', 'Missing feedback loop'),
      detail: localizedPlayText(locale, '尚未记录客户反馈或新信号，路径可信度有限。', 'No customer feedback or new signal has been recorded yet, so path confidence is limited.'),
      tone: 'warning',
    });
  }
  if (invalidatedAssumptions.length > 0) {
    flags.push({
      label: localizedPlayText(locale, '存在被推翻假设', 'Invalidated assumptions'),
      detail: localizedPlayText(locale, `${invalidatedAssumptions.length} 条假设已被否定。`, `${invalidatedAssumptions.length} assumptions have been invalidated.`),
      tone: 'danger',
    });
  }

  const evidenceStrength: JudgmentEvidenceStrength = verifiedAssumptions.length > 0 && learnings.length > 0 && steps.length > 0
    ? 'strong'
    : assumptions.length > 0 && steps.length > 0
      ? 'moderate'
      : assumptions.length > 0 || steps.length > 0 || learnings.length > 0
        ? 'thin'
        : 'missing';
  const qualityRisk: JudgmentQualityRisk = invalidatedAssumptions.length > 0 || play.momentum === 'blocked'
    ? 'high'
    : pendingAssumptions.length > verifiedAssumptions.length || play.momentum === 'stalled' || flags.length > 0
      ? 'medium'
      : 'low';

  return {
    evidenceStrength,
    qualityRisk,
    freshness: freshnessFromUpdatedAt(play.updatedAt || play.lastStepAt),
    provisionalLabel: flags.length > 0 || pendingAssumptions.length > 0
      ? localizedPlayText(locale, '需用客户反馈验证', 'Validate with customer feedback')
      : undefined,
    flags: uniqueQualityFlags(flags),
  };
}

export function buildAccountEvidenceHref(ref: JudgmentEvidenceRef, accountId: string): string | undefined {
  return buildEvidenceHref(ref, accountId);
}

function filterAccountJudgments(judgments: Judgment[], accountId: string): Judgment[] {
  return (Array.isArray(judgments) ? judgments : [])
    .filter((item): item is Judgment => Boolean(item) && item.accountId === accountId);
}

function pickAccountNextAction(judgments: Judgment[]): string {
  const risk = judgments.find((item) => item.kind === 'deal_risk');
  const champion = judgments.find((item) => item.kind === 'champion_strength');
  const alignment = judgments.find((item) => item.kind === 'internal_alignment');
  const urgency = judgments.find((item) => item.kind === 'buying_urgency');
  const momentum = judgments.find((item) => item.kind === 'momentum');

  if (risk?.value === 'high' || risk?.value === 'very_high') {
    return '先确认最大阻碍点，把风险拆成可回应的问题清单。';
  }
  if (!champion || champion.value === 'low' || champion.value === 'very_low') {
    return '先锁定一位愿意内部推动的关键人，并明确对方下一步动作。';
  }
  if (alignment?.value === 'low' || alignment?.value === 'very_low') {
    return '先补一轮内部对齐，统一业务、技术和采购关切。';
  }
  if (urgency?.value === 'low' || urgency?.value === 'very_low') {
    return '推动一个带日期的下一步承诺，例如评审会、Demo 或报价确认。';
  }
  if (momentum?.value === 'high' || momentum?.value === 'very_high' || momentum?.value === 'medium') {
    return '趁窗口期推进下一次明确承诺，敲定时间、参与人和预期产出。';
  }
  return '先补充一条最新客户沟通信号，再决定是否调整推进动作。';
}

function collectAccountEvidenceChips(judgments: Judgment[], accountId: string): JudgmentBriefEvidenceChip[] {
  const seen = new Set<string>();
  return (Array.isArray(judgments) ? judgments : [])
    .flatMap((judgment) => (Array.isArray(judgment.evidenceRefs) ? judgment.evidenceRefs : []).map((ref) => ({ ...ref, judgmentTitle: judgment.title })))
    .filter((ref) => {
      const key = `${ref.sourceKind}:${ref.sourceId}:${ref.sourceRowId ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3)
    .map((ref) => ({
      label: ref.title || ref.judgmentTitle || ref.sourceId,
      sourceLabel: SOURCE_KIND_LABEL[ref.sourceKind] ?? '记录',
      href: buildAccountEvidenceHref(ref, accountId),
      tone: 'neutral' as const,
    }));
}

function buildAccountQualityLayer(judgments: Judgment[], updatedAt?: string | number | Date | null): JudgmentQualityLayer {
  const evidenceCount = judgments.reduce((count, judgment) => count + (Array.isArray(judgment.evidenceRefs) ? judgment.evidenceRefs.length : 0), 0);
  const confidenceValues = judgments
    .map((judgment) => normalizeBriefConfidence(judgment.confidence))
    .filter((confidence): confidence is number => typeof confidence === 'number' && Number.isFinite(confidence));
  const avgConfidence = confidenceValues.length > 0
    ? confidenceValues.reduce((sum, confidence) => sum + confidence, 0) / confidenceValues.length
    : null;
  const provisionalCount = judgments.filter((judgment) => judgment.status === 'provisional').length;
  const riskJudgment = judgments.find((judgment) => judgment.kind === 'deal_risk');
  const flags: JudgmentQualityFlag[] = [];

  if (evidenceCount === 0) {
    flags.push({ label: '缺少账户证据', detail: '账户判断没有可追溯来源，需先补 Decode、活动或知识库记录。', tone: 'danger' });
  }
  if (provisionalCount > 0) {
    flags.push({ label: '存在暂定判断', detail: `${provisionalCount} 条账户判断仍需用新证据校准。`, tone: 'warning' });
  }
  if (avgConfidence == null) {
    flags.push({ label: '缺少可信度', detail: '账户判断缺少可量化置信度。', tone: 'warning' });
  } else if (avgConfidence < 0.45) {
    flags.push({ label: '账户判断可信度偏低', detail: `平均可信度约 ${Math.round(avgConfidence * 100)}%。`, tone: 'danger' });
  }
  if (riskJudgment && (riskJudgment.value === 'high' || riskJudgment.value === 'very_high')) {
    flags.push({ label: '高交易风险', detail: compactBriefSentence(riskJudgment.summary) || '当前账户存在高强度交易风险。', tone: 'danger' });
  }

  const evidenceStrength: JudgmentEvidenceStrength = evidenceCount >= 3 && (avgConfidence == null || avgConfidence >= 0.65)
    ? 'strong'
    : evidenceCount >= 1 && (avgConfidence == null || avgConfidence >= 0.45)
      ? 'moderate'
      : evidenceCount > 0
        ? 'thin'
        : 'missing';

  return {
    evidenceStrength,
    qualityRisk: evidenceCount === 0 || riskJudgment?.value === 'very_high' || (avgConfidence != null && avgConfidence < 0.45)
      ? 'high'
      : flags.length > 0 || riskJudgment?.value === 'high'
        ? 'medium'
        : 'low',
    freshness: freshnessFromUpdatedAt(updatedAt),
    provisionalLabel: flags.length > 0 ? '需复核账户判断' : undefined,
    flags: uniqueQualityFlags(flags),
  };
}

export function buildAccountJudgmentBrief(judgments: Judgment[], accountId: string): JudgmentBriefData | null {
  const safeJudgments = filterAccountJudgments(judgments, accountId);
  if (safeJudgments.length === 0) return null;

  const momentum = safeJudgments.find((item) => item.kind === 'momentum');
  const risk = safeJudgments.find((item) => item.kind === 'deal_risk');
  const lead = momentum ?? safeJudgments[0];
  const confidenceValues = safeJudgments
    .map((item) => item.confidence)
    .filter((confidence): confidence is number => typeof confidence === 'number' && Number.isFinite(confidence));
  const avgConfidence = confidenceValues.length > 0
    ? confidenceValues.reduce((acc, confidence) => acc + confidence, 0) / confidenceValues.length
    : null;
  const updatedAt = safeJudgments
    .map((item) => new Date(item.updatedAt).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => b - a)[0];
  const reasons = [lead, risk, ...safeJudgments]
    .filter((item): item is Judgment => Boolean(item))
    .map((item) => compactBriefSentence(item.rationale) || compactBriefSentence(item.summary) || item.title)
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, 3);

  return {
    contextLabel: '账户判断',
    title: '结论与证据',
    currentJudgment: lead ? compactBriefSentence(lead.summary) || lead.title : '暂无稳定判断',
    biggestRisk: risk ? compactBriefSentence(risk.summary) : '当前未发现高强度交易风险。',
    nextAction: pickAccountNextAction(safeJudgments),
    confidence: avgConfidence,
    updatedAt: updatedAt || undefined,
    reasons,
    evidenceChips: collectAccountEvidenceChips(safeJudgments, accountId),
    quality: buildAccountQualityLayer(safeJudgments, updatedAt || undefined),
    evolution: buildJudgmentEvolution(lead),
  };
}

function getDecodeMessages(output: DecodeOutput) {
  return Array.isArray(output.messages) ? output.messages : [];
}

function getPlaySteps(play: StrategicPlay) {
  return Array.isArray(play.steps) ? play.steps : [];
}

function getPlayAssumptions(play: StrategicPlay) {
  return Array.isArray(play.assumptions) ? play.assumptions : [];
}

function getPlayLearnings(play: StrategicPlay) {
  return Array.isArray(play.learnings) ? play.learnings : [];
}

function averageDecodeConfidence(output: DecodeOutput): number | null {
  const values = getDecodeMessages(output)
    .map((message) => message.decode?.confidence)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (values.length === 0) return null;
  return normalizeBriefConfidence(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function decodeRiskLevelLabel(riskLevel?: string | null): string | undefined {
  switch (riskLevel) {
    case 'critical': return '严重';
    case 'high': return '高';
    case 'medium': return '中';
    case 'low': return '低';
    default: return undefined;
  }
}

function decodeRiskSentence(output: DecodeOutput): string {
  const signal = compactBriefSentence(output.threadAnalysis?.keySignal);
  switch (output.threadAnalysis?.riskLevel) {
    case 'critical':
      return signal ? `严重风险：${signal}` : '严重风险：需要立即确认真实阻碍和决策停滞来源。';
    case 'high':
      return signal ? `高风险：${signal}` : '高风险：需要先确认阻碍来源，再继续推进承诺。';
    case 'medium':
      return signal ? `中等风险：${signal}` : '中等风险：需要补充证据后再升级承诺。';
    case 'low':
      return '当前未发现高强度风险，但仍需用下一次互动验证信号是否持续。';
    default:
      return signal || '风险等级尚不明确，需要补充客户上下文。';
  }
}

export function buildDecodeJudgmentBrief(params: {
  decode: DecodeOutput;
  savedAccountId?: string;
  savedDecodeId?: string;
  clientName?: string;
  savedAccountName?: string;
  signalSourceLabel?: string;
  analysisGoalLabel?: string;
  updatedAt?: string | number | Date | null;
}): JudgmentBriefData | null {
  const { decode } = params;
  const messages = getDecodeMessages(decode);
  if (!decode.threadAnalysis && messages.length === 0) return null;

  const firstMessage = messages[0];
  const keySignal = compactBriefSentence(decode.threadAnalysis?.keySignal);
  const currentJudgment = keySignal || compactBriefSentence(firstMessage?.decode?.meaning) || '已形成一条新的客户沟通判断。';
  const leadAction = decode.actionItems?.[0];
  const nextAction = compactBriefSentence(leadAction?.title)
    || compactBriefSentence(leadAction?.reasoning)
    || (keySignal
      ? '围绕这条客户信号确认真实阻碍、下一步责任人和完成时间。'
      : '先补充客户互动或会议记录，再判断下一步责任人和时间。');
  const reasons = [
    firstMessage?.decode?.meaning,
    firstMessage?.decode?.emotion,
    leadAction?.reasoning,
  ].map(compactBriefSentence).filter(Boolean).slice(0, 3);

  const evidenceChips: JudgmentBriefEvidenceChip[] = [];
  if (params.signalSourceLabel) {
    evidenceChips.push({ label: params.signalSourceLabel, sourceLabel: '来源', tone: 'neutral' });
  }
  if (params.analysisGoalLabel) {
    evidenceChips.push({ label: params.analysisGoalLabel, sourceLabel: '目标', tone: 'accent' });
  }
  if (params.savedDecodeId && params.savedAccountId) {
    evidenceChips.push({
      label: params.clientName || params.savedAccountName || '本次沟通解读',
      sourceLabel: '沟通解读',
      href: `/accounts/${params.savedAccountId}?tab=activity&targetKind=email_decode&targetId=${encodeURIComponent(params.savedDecodeId)}`,
      tone: 'neutral',
    });
  }

  return {
    contextLabel: '沟通解读判断',
    title: '先看判断，再看逐条解读',
    statusLabel: decodeRiskLevelLabel(decode.threadAnalysis?.riskLevel) ? `风险 ${decodeRiskLevelLabel(decode.threadAnalysis?.riskLevel)}` : undefined,
    currentJudgment,
    biggestRisk: decodeRiskSentence(decode),
    nextAction,
    confidence: averageDecodeConfidence(decode),
    updatedAt: params.updatedAt,
    reasons,
    evidenceChips,
    quality: buildDecodeQualityLayer(decode, params.updatedAt),
  };
}

function firstCurrentOrNextStep(play: StrategicPlay) {
  const steps = getPlaySteps(play);
  return steps.find((step) => normalizePlayStepExecutionStatus(step.status) === 'in_progress')
    ?? [...steps].filter((step) => normalizePlayStepExecutionStatus(step.status) === 'planned').sort((a, b) => a.index - b.index)[0]
    ?? steps.find((step) => normalizePlayStepExecutionStatus(step.status) === 'blocked' || normalizePlayStepExecutionStatus(step.status) === 'invalidated')
    ?? steps[0];
}

function getPlayMomentumLabel(momentum: StrategicPlay['momentum'], locale?: ProductLocale): string {
  switch (momentum) {
    case 'progressing': return localizedPlayText(locale, '正在推进', 'Progressing');
    case 'active': return localizedPlayText(locale, '推进中', 'Active');
    case 'slowing': return localizedPlayText(locale, '放缓', 'Slowing');
    case 'stalled': return localizedPlayText(locale, '停滞', 'Stalled');
    case 'blocked': return localizedPlayText(locale, '受阻', 'Blocked');
    default: return localizedPlayText(locale, '待确认', 'Pending');
  }
}

function getPlayHref(play: StrategicPlay): string {
  return `/accounts/${play.accountId}?tab=plays&playId=${encodeURIComponent(play.id)}`;
}

function pickPlayRisk(play: StrategicPlay, locale?: ProductLocale): string {
  const assumptions = getPlayAssumptions(play);
  const invalidated = assumptions.find((assumption) => assumption.status === 'invalidated');
  const pending = assumptions.find((assumption) => assumption.status === 'pending');
  const step = firstCurrentOrNextStep(play);
  if (play.momentum === 'blocked') {
    return localizedPlayText(locale, '当前谋局受阻，需要先确认阻塞点和替代路径。', 'The play is blocked; confirm the blocker and the alternative path first.');
  }
  if (play.momentum === 'stalled') {
    return play.daysSinceProgress > 0
      ? localizedPlayText(locale, `谋局已停滞 ${play.daysSinceProgress} 天，需要重新验证客户承诺。`, `The play has been stalled for ${play.daysSinceProgress} days; revalidate the customer's commitment.`)
      : localizedPlayText(locale, '谋局已停滞，需要重新验证客户承诺。', 'The play is stalled; revalidate the customer commitment.');
  }
  if (invalidated) return compactBriefSentence(invalidated.impact || invalidated.text) || invalidated.text;
  if (step?.risk) return compactBriefSentence(step.risk) || step.risk;
  if (pending?.impact) return compactBriefSentence(pending.impact) || pending.impact;
  return localizedPlayText(locale, '当前谋局假设尚未全部验证，需要持续用客户反馈校准。', 'Not all play assumptions are verified yet; keep calibrating with customer feedback.');
}

export function buildStrategicPlayJudgmentBrief(play: StrategicPlay, locale?: ProductLocale): JudgmentBriefData {
  const assumptions = getPlayAssumptions(play);
  const pendingAssumption = assumptions.find((assumption) => assumption.status === 'pending');
  const verifiedAssumption = assumptions.find((assumption) => assumption.status === 'verified');
  const step = firstCurrentOrNextStep(play);
  const nextAction = compactBriefSentence(step?.action)
    || compactBriefSentence(step?.title)
    || localizedPlayText(locale, '执行下一步谋局动作，并记录客户反馈。', 'Execute the next play action and capture customer feedback.');
  const reasons = [
    pendingAssumption?.text || verifiedAssumption?.text || play.goalDescription,
    step?.purpose || step?.description,
    step?.assumptionBeingTested,
  ].map(compactBriefSentence).filter(Boolean).slice(0, 3);
  const evidenceChips: JudgmentBriefEvidenceChip[] = [];
  const playHref = getPlayHref(play);
  if (step) {
    const stepLabel = compactBriefSentence(step.title) || compactBriefSentence(step.description) || compactBriefSentence(step.action);
    if (stepLabel) {
      evidenceChips.push({ label: stepLabel, sourceLabel: localizedPlayText(locale, '当前步骤', 'Current Step'), description: compactBriefSentence(step.description), href: playHref, tone: 'accent' });
    }
  }
  if (pendingAssumption) {
    const assumptionLabel = compactBriefSentence(pendingAssumption.text) || compactBriefSentence(pendingAssumption.evidence);
    if (assumptionLabel) {
      evidenceChips.push({ label: assumptionLabel, sourceLabel: localizedPlayText(locale, '待验证假设', 'Unverified Assumption'), description: compactBriefSentence(pendingAssumption.evidence), href: playHref, tone: 'warning' });
    }
  }
  const learnings = getPlayLearnings(play);
  if (learnings[0]) {
    const learningLabel = compactBriefSentence(learnings[0].learning) || compactBriefSentence(learnings[0].newSignal);
    if (learningLabel) {
      evidenceChips.push({ label: learningLabel, sourceLabel: localizedPlayText(locale, '学习', 'Learning'), description: compactBriefSentence(learnings[0].newSignal), href: playHref, tone: 'neutral' });
    }
  }

  return {
    contextLabel: localizedPlayText(locale, '谋局判断', 'Play Judgment'),
    title: localizedPlayText(locale, '先看当前假设，再看完整路径', 'Review the current assumption before the full path'),
    statusLabel: getPlayMomentumLabel(play.momentum, locale),
    currentJudgment: compactBriefSentence(pendingAssumption?.text || verifiedAssumption?.text || play.goalDescription) || localizedPlayText(locale, '已有谋局假设。', 'A play assumption already exists.'),
    biggestRisk: pickPlayRisk(play, locale),
    nextAction,
    confidence: play.confidence,
    updatedAt: play.updatedAt,
    reasons,
    evidenceChips,
    quality: buildStrategicPlayQualityLayer(play, locale),
  };
}
