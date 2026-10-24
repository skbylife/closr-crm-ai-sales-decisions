import type { JudgmentEvidenceRef } from '@/lib/babel-engine/types';
import type { JudgmentPattern, JudgmentPatternType } from '@/lib/judgment/pattern-library';
import type { PortfolioAccountInput, PortfolioJudgmentSignal, PortfolioJudgmentView, PortfolioOpportunityInput } from '@/lib/judgment/portfolio-view';
import { visibleBusinessText } from '@/lib/visible-business-text';

export type PatternAwarePortfolioSignalType =
  | 'historical_failure_risk'
  | 'successful_recovery_pattern'
  | 'evidence_gap_pattern'
  | 'intervention_opportunity'
  | 'overconfidence_warning';

export type PatternAwarePortfolioSignalSeverity = 'critical' | 'warning' | 'focus' | 'positive';

export interface PatternAwarePortfolioSignal {
  id: string;
  signalType: PatternAwarePortfolioSignalType;
  accountId: string;
  accountName: string;
  opportunityId?: string;
  opportunityName?: string;
  severity: PatternAwarePortfolioSignalSeverity;
  confidence: number;
  patternId: string;
  patternTitle: string;
  patternType: JudgmentPatternType;
  whySimilar: string;
  recommendedAction: string;
  caveat: string;
  evidenceRefs: JudgmentEvidenceRef[];
  drilldownHref: string;
}

export interface PatternAwareSignalSummary {
  status: 'ready' | 'insufficient_patterns' | 'no_current_portfolio' | 'no_match';
  totalPatterns: number;
  eligiblePatterns: number;
  emittedSignals: number;
  matchedAccounts: number;
  accountCount: number;
  opportunityCount: number;
  gapReason?: string;
  calibrationNote: string;
}

export interface BuildPatternAwarePortfolioSignalsParams {
  accounts?: PortfolioAccountInput[] | null;
  opportunities?: PortfolioOpportunityInput[] | null;
  patterns?: JudgmentPattern[] | null;
  portfolioJudgment?: PortfolioJudgmentView | null;
  limit?: number;
}

interface CandidateContext {
  account: PortfolioAccountInput;
  opportunity: PortfolioOpportunityInput;
  meddiccScore: number;
  evidenceHealth: 'sufficient' | 'thin' | 'missing';
  risky: boolean;
  overconfident: boolean;
  strategic: boolean;
  stage: string;
  signals: PortfolioJudgmentSignal[];
  tokens: Set<string>;
}

interface CandidateMatch {
  signal: PatternAwarePortfolioSignal;
  score: number;
}

const CLOSED_STAGES = new Set(['closed_won', 'closed_lost']);
const LATE_STAGES = new Set(['proposal_sent', 'negotiation', 'contract_review']);
const MAX_EVIDENCE_REFS = 8;

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim() : '';
}

function numeric(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function accountDrilldown(accountId: string): string {
  return `/accounts/${encodeURIComponent(accountId)}?tab=overview`;
}

function meddiccScore(opp: PortfolioOpportunityInput): number {
  return clamp(numeric(opp.meddicc?.overallScore, 0), 0, 100);
}

function evidenceIndicatorCount(opp: PortfolioOpportunityInput): number {
  let count = 0;
  if (opp.meddicc?.metrics?.status === 'confirmed' || opp.meddicc?.metrics?.status === 'partial') count += 1;
  if (cleanText(opp.meddicc?.metrics?.evidence)) count += 1;
  if (opp.meddicc?.economicBuyer?.status && opp.meddicc.economicBuyer.status !== 'unknown') count += 1;
  if ((opp.meddicc?.decisionCriteria?.length ?? 0) > 0) count += 1;
  if ((opp.meddicc?.decisionProcess?.length ?? 0) > 0) count += 1;
  if ((opp.meddicc?.identifiedPain?.length ?? 0) > 0) count += 1;
  if (numeric(opp.meddicc?.champion?.strength, 0) >= 3) count += 1;
  return count;
}

function evidenceHealth(opp: PortfolioOpportunityInput): CandidateContext['evidenceHealth'] {
  const indicators = evidenceIndicatorCount(opp);
  const score = meddiccScore(opp);
  if (indicators >= 4 || score >= 65) return 'sufficient';
  if (indicators >= 2 || score >= 35) return 'thin';
  return 'missing';
}

function isOpenOpportunity(opp: PortfolioOpportunityInput): boolean {
  return !CLOSED_STAGES.has(cleanText(opp.stage).toLowerCase());
}

function tokenize(value: string): Set<string> {
  return new Set(cleanText(value).toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/).filter((token) => token.length >= 2));
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return clamp(overlap / Math.max(4, Math.min(a.size, b.size)), 0, 1);
}

function uniqueEvidenceRefs(refs: JudgmentEvidenceRef[]): JudgmentEvidenceRef[] {
  const result: JudgmentEvidenceRef[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const sourceId = cleanText(ref.sourceId);
    const sourceKind = cleanText(ref.sourceKind) as JudgmentEvidenceRef['sourceKind'];
    if (!sourceId || !sourceKind) continue;
    const key = `${sourceKind}:${cleanText(ref.sourceTable)}:${cleanText(ref.sourceRowId) || sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      sourceId,
      sourceKind,
      title: cleanText(ref.title) || undefined,
      sourceTable: cleanText(ref.sourceTable) || undefined,
      sourceRowId: cleanText(ref.sourceRowId) || undefined,
    });
    if (result.length >= MAX_EVIDENCE_REFS) break;
  }
  return result;
}

function portfolioSignals(view: PortfolioJudgmentView | null | undefined): PortfolioJudgmentSignal[] {
  if (!view) return [];
  const buckets = [
    view.manager.stuckDeals,
    view.manager.coachingCandidates,
    view.manager.verifyBeforeEscalate,
    view.manager.forecastContradictions,
    view.manager.falseActivity,
    view.manager.evidenceHealth,
    view.executive.resourceAllocationCandidates ?? [],
    view.executive.nonInterventionCandidates ?? [],
  ];
  const result: PortfolioJudgmentSignal[] = [];
  const seen = new Set<string>();
  for (const signal of buckets.flat()) {
    if (seen.has(signal.id)) continue;
    seen.add(signal.id);
    result.push(signal);
  }
  return result;
}

function buildCandidates(params: BuildPatternAwarePortfolioSignalsParams): CandidateContext[] {
  const accounts = new Map((params.accounts ?? []).map((account) => [account.id, account]));
  const signals = portfolioSignals(params.portfolioJudgment);
  const opportunities = (params.opportunities ?? []).filter(isOpenOpportunity);

  return opportunities.flatMap((opportunity) => {
    const account = accounts.get(opportunity.accountId);
    if (!account) return [];
    const score = meddiccScore(opportunity);
    const stage = cleanText(opportunity.stage).toLowerCase();
    const health = evidenceHealth(opportunity);
    const accountHealth = cleanText(account.dealHealth).toLowerCase();
    const accountSignals = signals.filter((signal) => signal.accountId === account.id && (!signal.opportunityId || signal.opportunityId === opportunity.id));
    const blockedMap = (opportunity.mutualActionPlan?.milestones ?? []).some((milestone) => milestone.status === 'blocked' || milestone.status === 'at_risk');
    const risky = accountHealth === 'critical'
      || accountHealth === 'at_risk'
      || score < 55
      || blockedMap
      || accountSignals.some((signal) => signal.kind === 'stuck_deal' || signal.kind === 'forecast_contradiction' || signal.tone === 'critical');
    const overconfident = numeric(opportunity.probability, 0) >= 70 && (score < 60 || health !== 'sufficient' || accountHealth === 'critical' || accountHealth === 'at_risk');
    const strategic = Math.max(numeric(opportunity.value, 0), numeric(account.dealValue, 0)) >= 100_000 || LATE_STAGES.has(stage);
    const signalText = accountSignals.map((signal) => [signal.kind, signal.reason, signal.recommendedAction, signal.tags.join(' ')].join(' ')).join(' ');
    const tokens = tokenize([
      account.name,
      account.dealHealth,
      opportunity.name,
      opportunity.stage,
      `meddicc-${score}`,
      `evidence-${health}`,
      opportunity.meddicc?.metrics?.status,
      opportunity.meddicc?.economicBuyer?.status,
      opportunity.meddicc?.champion?.notes,
      signalText,
    ].join(' '));

    return [{ account, opportunity, meddiccScore: score, evidenceHealth: health, risky, overconfident, strategic, stage, signals: accountSignals, tokens }];
  });
}

function patternTokens(pattern: JudgmentPattern): Set<string> {
  return tokenize([pattern.label, pattern.summary, pattern.patternType, pattern.recommendedUse].join(' '));
}

function eligiblePatterns(patterns: JudgmentPattern[]): JudgmentPattern[] {
  return patterns.filter((pattern) => cleanText(pattern.id) && pattern.confidence >= 0.2 && pattern.evidenceRefs.length > 0);
}

function typeFit(candidate: CandidateContext, pattern: JudgmentPattern): { fit: number; signalType: PatternAwarePortfolioSignalType; reason: string } {
  const kinds = new Set(candidate.signals.map((signal) => signal.kind));
  const hasManagerVerify = kinds.has('manager_verify') || kinds.has('evidence_health');
  const hasInterventionGate = kinds.has('executive_intervention') || kinds.has('stuck_deal') || kinds.has('forecast_contradiction');
  const hasFalseActivity = kinds.has('false_activity');
  const evidenceGap = candidate.evidenceHealth !== 'sufficient' || candidate.meddiccScore < 50 || hasManagerVerify;

  if (pattern.patternType === 'evidence_gap') {
    return {
      fit: evidenceGap ? 0.44 + (candidate.evidenceHealth === 'missing' ? 0.18 : 0) + (hasManagerVerify ? 0.1 : 0) : 0.05,
      signalType: 'evidence_gap_pattern',
      reason: candidate.evidenceHealth === 'missing' ? '当前机会缺少关键判断证据' : '当前机会证据偏薄，需要先校准再升级',
    };
  }

  if (pattern.patternType === 'ineffective_intervention') {
    return {
      fit: candidate.overconfident || hasFalseActivity ? 0.52 : candidate.risky ? 0.34 : 0.08,
      signalType: candidate.overconfident ? 'overconfidence_warning' : 'historical_failure_risk',
      reason: candidate.overconfident ? '当前预测/概率高于证据支撑' : '当前风险形态接近历史无效或噪音介入样本',
    };
  }

  if (pattern.patternType === 'risk_reversal') {
    return {
      fit: candidate.risky || hasInterventionGate ? 0.42 + (candidate.strategic ? 0.08 : 0) : 0.12,
      signalType: 'successful_recovery_pattern',
      reason: '当前账户存在可与历史风险反转样本比较的风险信号',
    };
  }

  if (pattern.patternType === 'stakeholder_shift') {
    const stakeholderUnclear = candidate.opportunity.meddicc?.economicBuyer?.status === 'unknown' || numeric(candidate.opportunity.meddicc?.champion?.strength, 0) <= 2;
    return {
      fit: stakeholderUnclear || hasManagerVerify ? 0.38 + (candidate.risky ? 0.06 : 0) : 0.1,
      signalType: 'intervention_opportunity',
      reason: '当前关键人/采购路径仍需与历史关键人变化样本校准',
    };
  }

  return {
    fit: candidate.risky || hasInterventionGate ? 0.36 + (candidate.strategic ? 0.08 : 0) : hasManagerVerify ? 0.24 : 0.08,
    signalType: 'intervention_opportunity',
    reason: '当前机会存在可参考的历史有效介入样本',
  };
}

function sampleFactor(sampleSize: number): number {
  if (sampleSize <= 1) return -0.06;
  if (sampleSize === 2) return 0.07;
  if (sampleSize === 3) return 0.11;
  return 0.15;
}

function confidenceFor(score: number, pattern: JudgmentPattern): number {
  const sampleDiscount = pattern.sampleSize <= 1 ? 0.78 : pattern.sampleSize === 2 ? 0.9 : 1;
  const value = score * (0.72 + pattern.confidence * 0.28) * sampleDiscount;
  return Number(clamp(value, 0.18, pattern.sampleSize <= 1 ? 0.52 : 0.88).toFixed(2));
}

function severityFor(candidate: CandidateContext, signalType: PatternAwarePortfolioSignalType): PatternAwarePortfolioSignalSeverity {
  if (signalType === 'overconfidence_warning') return 'critical';
  if (signalType === 'historical_failure_risk') return candidate.risky || candidate.strategic ? 'critical' : 'warning';
  if (signalType === 'evidence_gap_pattern') return candidate.evidenceHealth === 'missing' ? 'warning' : 'focus';
  if (signalType === 'successful_recovery_pattern') return candidate.risky ? 'focus' : 'positive';
  return candidate.strategic ? 'focus' : 'positive';
}


function visibleText(value: string): string {
  return visibleBusinessText(cleanText(value));
}

function recommendedActionFor(candidate: CandidateContext, pattern: JudgmentPattern, signalType: PatternAwarePortfolioSignalType): string {
  const currentAction = candidate.signals[0]?.recommendedAction ? visibleText(candidate.signals[0].recommendedAction) : undefined;
  const recommendedUse = visibleText(pattern.recommendedUse);
  if (signalType === 'overconfidence_warning') {
    return `先降级校准预测：${recommendedUse}${currentAction ? ` 当前组合信号建议：${currentAction}` : ''}`;
  }
  if (signalType === 'evidence_gap_pattern') {
    return `先补证据，不直接升级：${recommendedUse}${currentAction ? ` 当前组合信号建议：${currentAction}` : ''}`;
  }
  return `${recommendedUse}${currentAction ? ` 当前组合信号建议：${currentAction}` : ''}`;
}

function caveatFor(pattern: JudgmentPattern, score: number): string {
  const singleSample = pattern.sampleSize <= 1 ? '仅单一历史样本，已降权；' : '';
  return `${singleSample}${visibleText(pattern.caveat)} 当前相似度 ${Math.round(score * 100)}%，只能作为校准线索，不是自动结论，也不自动证明当前机会会复现历史结果。`;
}

function evidenceRefsFor(candidate: CandidateContext, pattern: JudgmentPattern): JudgmentEvidenceRef[] {
  return uniqueEvidenceRefs([
    ...pattern.evidenceRefs,
    {
      sourceId: candidate.opportunity.id,
      sourceKind: 'source_record',
      sourceTable: 'opportunities',
      sourceRowId: candidate.opportunity.id,
      title: candidate.opportunity.name,
    },
  ]);
}

function buildMatch(candidate: CandidateContext, pattern: JudgmentPattern): CandidateMatch | null {
  const type = typeFit(candidate, pattern);
  const keyword = overlapScore(candidate.tokens, patternTokens(pattern));
  const score = clamp(type.fit + keyword * 0.22 + pattern.confidence * 0.18 + sampleFactor(pattern.sampleSize), 0, 1);
  const threshold = pattern.sampleSize <= 1 ? 0.48 : 0.42;
  if (score < threshold) return null;

  const signalType = type.signalType;
  const confidence = confidenceFor(score, pattern);
  const whyBits = [
    visibleText(type.reason),
    `历史模式为「${visibleText(pattern.label)}」`,
    `样本数=${pattern.sampleSize}`,
    candidate.signals.length > 0 ? `当前组合信号：${candidate.signals.slice(0, 2).map((signal) => signal.kind).join(' / ')}` : `当前资格评分 ${candidate.meddiccScore}，证据 ${candidate.evidenceHealth}`,
  ];

  return {
    score,
    signal: {
      id: `pattern-aware:${candidate.opportunity.id}:${pattern.id}`,
      signalType,
      accountId: candidate.account.id,
      accountName: candidate.account.name,
      opportunityId: candidate.opportunity.id,
      opportunityName: candidate.opportunity.name,
      severity: severityFor(candidate, signalType),
      confidence,
      patternId: pattern.id,
      patternTitle: visibleText(pattern.label),
      patternType: pattern.patternType,
      whySimilar: whyBits.join('；'),
      recommendedAction: recommendedActionFor(candidate, pattern, signalType),
      caveat: caveatFor(pattern, score),
      evidenceRefs: evidenceRefsFor(candidate, pattern),
      drilldownHref: accountDrilldown(candidate.account.id),
    },
  };
}

function buildSummary(args: {
  status: PatternAwareSignalSummary['status'];
  totalPatterns: number;
  eligiblePatterns: number;
  emittedSignals: number;
  matchedAccounts: number;
  accountCount: number;
  opportunityCount: number;
  gapReason?: string;
}): PatternAwareSignalSummary {
  const calibrationNote = args.status === 'ready'
    ? '历史模式信号只把当前组合信号与历史判断样本做保守相似性校准；不是自动结论。'
    : args.gapReason ?? '暂无足够历史模式证据；系统不会为了填满卡片而编造历史相似性。';
  return { ...args, calibrationNote };
}

export function buildPatternAwarePortfolioSignals(params: BuildPatternAwarePortfolioSignalsParams): {
  signals: PatternAwarePortfolioSignal[];
  summary: PatternAwareSignalSummary;
} {
  const totalPatterns = params.patterns?.length ?? 0;
  const patterns = eligiblePatterns(params.patterns ?? []);
  const candidates = buildCandidates(params);
  const accountCount = params.accounts?.length ?? 0;
  const opportunityCount = candidates.length;
  const limit = Math.max(0, Math.min(Math.floor(Number(params.limit ?? 6)), 12));

  if (candidates.length === 0) {
    return {
      signals: [],
      summary: buildSummary({
        status: 'no_current_portfolio',
        totalPatterns,
        eligiblePatterns: patterns.length,
        emittedSignals: 0,
        matchedAccounts: 0,
        accountCount,
        opportunityCount,
        gapReason: '当前没有可评估的开放机会。',
      }),
    };
  }

  if (patterns.length === 0) {
    return {
      signals: [],
      summary: buildSummary({
        status: 'insufficient_patterns',
        totalPatterns,
        eligiblePatterns: 0,
        emittedSignals: 0,
        matchedAccounts: 0,
        accountCount,
        opportunityCount,
        gapReason: totalPatterns === 0 ? '暂无历史判断模式。' : '历史模式缺少可追踪证据或置信度过低。',
      }),
    };
  }

  const matches: CandidateMatch[] = [];
  for (const candidate of candidates) {
    for (const pattern of patterns) {
      const match = buildMatch(candidate, pattern);
      if (match) matches.push(match);
    }
  }

  const selected: PatternAwarePortfolioSignal[] = [];
  const seen = new Set<string>();
  for (const match of matches.sort((a, b) => b.score - a.score || b.signal.confidence - a.signal.confidence)) {
    const key = `${match.signal.accountId}:${match.signal.opportunityId ?? ''}:${match.signal.signalType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(match.signal);
    if (selected.length >= limit) break;
  }

  const matchedAccounts = new Set(selected.map((signal) => signal.accountId)).size;
  const status: PatternAwareSignalSummary['status'] = selected.length > 0 ? 'ready' : 'no_match';

  return {
    signals: selected,
    summary: buildSummary({
      status,
      totalPatterns,
      eligiblePatterns: patterns.length,
      emittedSignals: selected.length,
      matchedAccounts,
      accountCount,
      opportunityCount,
      gapReason: selected.length > 0 ? undefined : '已有历史模式，但当前组合没有达到保守匹配阈值的相似信号。',
    }),
  };
}
