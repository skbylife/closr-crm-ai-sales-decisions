import type { JudgmentEvidenceRef } from '@/lib/babel-engine/types';
import type { PortfolioJudgmentSignal } from '@/lib/judgment/portfolio-view';
import { INTERVENTION_ACTION_LABEL, INTERVENTION_TYPE_LABEL, type JudgmentInterventionItem } from '@/lib/judgment/intervention';
import { INTERVENTION_IMPACT_LABEL, INTERVENTION_OUTCOME_LABEL, type InterventionImpact, type InterventionOutcomeItem } from '@/lib/judgment/intervention-learning';

export type JudgmentPatternType = 'effective_intervention' | 'ineffective_intervention' | 'evidence_gap' | 'risk_reversal' | 'stakeholder_shift';

export interface JudgmentPatternAccountRef {
  accountId: string;
  sampleCount: number;
}

export interface JudgmentPatternEvidenceRef extends JudgmentEvidenceRef {
  confidence?: number;
  outcomeId?: string;
}

export interface JudgmentPattern {
  id: string;
  label: string;
  summary: string;
  patternType: JudgmentPatternType;
  confidence: number;
  sampleSize: number;
  evidenceRefs: JudgmentPatternEvidenceRef[];
  accounts: JudgmentPatternAccountRef[];
  interventionIds: string[];
  recommendedUse: string;
  caveat: string;
  updatedAt: string;
}

export interface BuildJudgmentPatternLibraryParams {
  interventions?: JudgmentInterventionItem[] | null;
  interventionOutcomes?: InterventionOutcomeItem[] | null;
  limit?: number;
}

export interface PatternSignalMatch {
  pattern: JudgmentPattern;
  score: number;
  rationale: string;
}

const DEFAULT_LIMIT = 8;
const MAX_EVIDENCE_REFS = 16;

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim() : '';
}

function safeDate(value: string | undefined): string {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : new Date(0).toISOString();
}

function timeValue(value: string | undefined): number {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(Number(limit))) return DEFAULT_LIMIT;
  return Math.max(0, Math.min(Math.floor(Number(limit)), 30));
}

function interventionActionLabel(intervention: JudgmentInterventionItem | undefined): string {
  if (!intervention) return '介入动作';
  const typeLabel = INTERVENTION_TYPE_LABEL[intervention.type] ?? intervention.type;
  const actionLabel = INTERVENTION_ACTION_LABEL[intervention.action] ?? intervention.action;
  return `${typeLabel} · ${actionLabel}`;
}

function patternTypeForOutcome(item: InterventionOutcomeItem): JudgmentPatternType {
  if (item.impact === 'stakeholder_shifted') return 'stakeholder_shift';
  if (item.outcome === 'inconclusive') return 'evidence_gap';
  if (item.outcome === 'ineffective' || item.impact === 'worsened') return 'ineffective_intervention';
  if (item.impact === 'risk_reduced') return 'risk_reversal';
  return 'effective_intervention';
}

function patternLabelForType(type: JudgmentPatternType, intervention: JudgmentInterventionItem | undefined, impact: InterventionImpact): string {
  const action = interventionActionLabel(intervention);
  if (type === 'evidence_gap') return `证据缺口 · ${action}`;
  if (type === 'ineffective_intervention') return `无效/噪音介入 · ${action}`;
  if (type === 'stakeholder_shift') return `关键人变化 · ${action}`;
  if (type === 'risk_reversal') return `风险反转 · ${action}`;
  return `${INTERVENTION_IMPACT_LABEL[impact] ?? '有效'} · ${action}`;
}

function stableKey(type: JudgmentPatternType, intervention: JudgmentInterventionItem | undefined, item: InterventionOutcomeItem): string {
  const action = intervention?.action ?? 'unknown_action';
  const role = intervention?.type ?? item.role ?? 'unknown_role';
  const impactBucket = type === 'stakeholder_shift' || type === 'risk_reversal' || type === 'evidence_gap' ? item.impact : item.outcome;
  return `${type}:${role}:${action}:${impactBucket}`;
}

function slug(value: string): string {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'pattern';
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampConfidence(value: number, sampleSize: number, type: JudgmentPatternType): number {
  const uncertaintyPenalty = type === 'evidence_gap' ? 0.12 : 0;
  const samplePenalty = sampleSize === 1 ? 0.22 : sampleSize === 2 ? 0.08 : 0;
  const capped = sampleSize === 1 ? Math.min(value - uncertaintyPenalty - samplePenalty, 0.59) : value - uncertaintyPenalty - samplePenalty;
  return Math.max(0.05, Math.min(0.95, Number(capped.toFixed(2))));
}

function addEvidenceRef(refs: JudgmentPatternEvidenceRef[], ref: JudgmentPatternEvidenceRef | null | undefined, seen: Set<string>) {
  if (!ref || refs.length >= MAX_EVIDENCE_REFS) return;
  const sourceId = cleanText(ref.sourceId);
  const sourceKind = cleanText(ref.sourceKind);
  if (!sourceId || !sourceKind) return;
  const key = `${sourceKind}:${ref.sourceTable ?? ''}:${ref.sourceRowId ?? sourceId}`;
  if (seen.has(key)) return;
  seen.add(key);
  refs.push({
    sourceId,
    sourceKind: ref.sourceKind,
    title: cleanText(ref.title) || undefined,
    sourceTable: cleanText(ref.sourceTable) || undefined,
    sourceRowId: cleanText(ref.sourceRowId) || undefined,
    confidence: typeof ref.confidence === 'number' ? Math.max(0, Math.min(1, ref.confidence)) : undefined,
    outcomeId: cleanText(ref.outcomeId) || undefined,
  });
}

function buildSummary(type: JudgmentPatternType, sampleSize: number, outcomes: InterventionOutcomeItem[], label: string): string {
  const latest = outcomes[0];
  const outcomeLabel = INTERVENTION_OUTCOME_LABEL[latest.outcome] ?? latest.outcome;
  const impactLabel = INTERVENTION_IMPACT_LABEL[latest.impact] ?? latest.impact;
  const samplePhrase = sampleSize === 1 ? '1 个账户样本' : `${sampleSize} 个账户样本`;
  if (type === 'evidence_gap') {
    return `${label} 在 ${samplePhrase} 中仍证据不足。最近样本：${outcomeLabel} · ${impactLabel}，${latest.learningSummary}`;
  }
  if (type === 'ineffective_intervention') {
    return `${label} 在 ${samplePhrase} 中出现无效、噪音或恶化信号。最近样本：${outcomeLabel} · ${impactLabel}，${latest.learningSummary}`;
  }
  if (type === 'stakeholder_shift') {
    return `${label} 在 ${samplePhrase} 中与关键人变化有关。最近样本：${outcomeLabel} · ${impactLabel}，${latest.learningSummary}`;
  }
  if (type === 'risk_reversal') {
    return `${label} 在 ${samplePhrase} 中帮助降低或反转风险。最近样本：${outcomeLabel} · ${impactLabel}，${latest.learningSummary}`;
  }
  return `${label} 在 ${samplePhrase} 中产生可复盘的正向校准信号。最近样本：${outcomeLabel} · ${impactLabel}，${latest.learningSummary}`;
}

function recommendedUseFor(type: JudgmentPatternType): string {
  if (type === 'evidence_gap') return '遇到相似信号时，先补一手证据和背景解释，再决定是否升级。';
  if (type === 'ineffective_intervention') return '遇到相似信号时，把它当作反例提醒，先检查是否只是活动噪音或错误升级。';
  if (type === 'stakeholder_shift') return '遇到关键人变化时，用该样本校准 sponsor / economic buyer 解读，并保留证据链。';
  if (type === 'risk_reversal') return '遇到同类风险时，可作为降低风险的历史样本，但仍需账户上下文验证。';
  return '遇到相似账户信号时，可作为历史校准样本参考；先比较背景和证据，不直接套用。';
}

function caveatFor(type: JudgmentPatternType, sampleSize: number, accountCount: number): string {
  if (sampleSize === 1) return '仅单一账户样本；这是可追踪的校准线索，不是组织级规则或自动真理。';
  const base = `基于 ${sampleSize} 条介入结果 / ${accountCount} 个账户；这是组织级 judgment memory，需要继续用新证据校正。`;
  if (type === 'evidence_gap') return `${base} 当前模式表达的是证据缺口，不代表介入无效。`;
  return base;
}

export function buildJudgmentPatternLibrary(params: BuildJudgmentPatternLibraryParams): JudgmentPattern[] {
  const limit = normalizeLimit(params.limit);
  if (limit === 0) return [];

  const interventionById = new Map((params.interventions ?? []).map((item) => [item.id, item]));
  const outcomes = [...(params.interventionOutcomes ?? [])]
    .filter((item) => cleanText(item.id) && cleanText(item.accountId) && cleanText(item.interventionId))
    .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));

  const groups = new Map<string, { type: JudgmentPatternType; label: string; outcomes: InterventionOutcomeItem[]; interventions: JudgmentInterventionItem[] }>();

  for (const outcome of outcomes) {
    const intervention = interventionById.get(outcome.interventionId);
    const type = patternTypeForOutcome(outcome);
    const key = stableKey(type, intervention, outcome);
    const label = patternLabelForType(type, intervention, outcome.impact);
    const existing = groups.get(key);
    if (existing) {
      existing.outcomes.push(outcome);
      if (intervention && !existing.interventions.some((item) => item.id === intervention.id)) existing.interventions.push(intervention);
    } else {
      groups.set(key, { type, label, outcomes: [outcome], interventions: intervention ? [intervention] : [] });
    }
  }

  const patterns: JudgmentPattern[] = [];

  for (const [key, group] of groups) {
    const sortedOutcomes = group.outcomes.sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
    const accountCounts = new Map<string, number>();
    const interventionIds = new Set<string>();
    const evidenceRefs: JudgmentPatternEvidenceRef[] = [];
    const seenEvidence = new Set<string>();

    for (const outcome of sortedOutcomes) {
      accountCounts.set(outcome.accountId, (accountCounts.get(outcome.accountId) ?? 0) + 1);
      interventionIds.add(outcome.interventionId);
      addEvidenceRef(evidenceRefs, {
        sourceKind: 'source_record',
        sourceId: outcome.sourceRecordId,
        sourceTable: 'source_records',
        sourceRowId: outcome.sourceRecordId,
        title: '原介入记录',
        confidence: outcome.confidence,
        outcomeId: outcome.id,
      }, seenEvidence);
      for (const ref of outcome.evidenceRefs) addEvidenceRef(evidenceRefs, { ...ref, confidence: outcome.confidence, outcomeId: outcome.id }, seenEvidence);
    }

    for (const intervention of group.interventions) {
      if (intervention.sourceRecordId) {
        addEvidenceRef(evidenceRefs, {
          sourceKind: 'source_record',
          sourceId: intervention.sourceRecordId,
          sourceTable: 'source_records',
          sourceRowId: intervention.sourceRecordId,
          title: '介入 source_record',
        }, seenEvidence);
      }
      for (const ref of intervention.evidenceRefs) addEvidenceRef(evidenceRefs, ref, seenEvidence);
    }

    const sampleSize = sortedOutcomes.length;
    const accounts = [...accountCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([accountId, sampleCount]) => ({ accountId, sampleCount }));
    const confidence = clampConfidence(average(sortedOutcomes.map((item) => item.confidence)), sampleSize, group.type);
    const updatedAt = safeDate(sortedOutcomes[0]?.createdAt);

    patterns.push({
      id: `judgment-pattern:${slug(key)}`,
      label: group.label,
      summary: buildSummary(group.type, sampleSize, sortedOutcomes, group.label),
      patternType: group.type,
      confidence,
      sampleSize,
      evidenceRefs,
      accounts,
      interventionIds: [...interventionIds].sort(),
      recommendedUse: recommendedUseFor(group.type),
      caveat: caveatFor(group.type, sampleSize, accounts.length),
      updatedAt,
    });
  }

  return patterns
    .sort((a, b) => b.sampleSize - a.sampleSize || b.confidence - a.confidence || timeValue(b.updatedAt) - timeValue(a.updatedAt))
    .slice(0, limit);
}

function tokenize(value: string): Set<string> {
  const tokens = cleanText(value).toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/).filter((token) => token.length >= 2);
  return new Set(tokens);
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.max(3, Math.min(a.size, b.size));
}

function typeSignalScore(signal: PortfolioJudgmentSignal, pattern: JudgmentPattern): number {
  if ((signal.kind === 'manager_verify' || signal.kind === 'evidence_health') && pattern.patternType === 'evidence_gap') return 0.35;
  if (signal.kind === 'manager_verify' && (pattern.patternType === 'effective_intervention' || pattern.patternType === 'risk_reversal' || pattern.patternType === 'stakeholder_shift')) return 0.12;
  if (signal.kind === 'executive_intervention' && (pattern.patternType === 'effective_intervention' || pattern.patternType === 'risk_reversal' || pattern.patternType === 'stakeholder_shift')) return 0.28;
  if ((signal.kind === 'forecast_contradiction' || signal.kind === 'false_activity') && pattern.patternType === 'ineffective_intervention') return 0.25;
  if (signal.evidenceHealth === 'missing' && pattern.patternType === 'evidence_gap') return 0.2;
  if (signal.tone === 'critical' && pattern.patternType === 'risk_reversal') return 0.15;
  return 0;
}

export function matchSignalToPatterns(signal: PortfolioJudgmentSignal, patterns: JudgmentPattern[], limit = 3): PatternSignalMatch[] {
  const signalText = [signal.kind, signal.reason, signal.recommendedAction, signal.accountName, signal.opportunityName, ...(signal.tags ?? [])].join(' ');
  const signalTokens = tokenize(signalText);

  return patterns
    .map((pattern) => {
      const patternText = [pattern.label, pattern.summary, pattern.recommendedUse, pattern.patternType].join(' ');
      const keywordScore = overlapScore(signalTokens, tokenize(patternText));
      const score = Math.max(0, Math.min(1, Number((typeSignalScore(signal, pattern) + keywordScore * 0.45 + pattern.confidence * 0.2).toFixed(2))));
      return {
        pattern,
        score,
        rationale: score > 0
          ? `匹配到 ${pattern.label}：基于信号类型、关键词和 ${pattern.sampleSize} 条历史样本。`
          : `未匹配到 ${pattern.label} 的可用相似证据。`,
      };
    })
    .filter((match) => match.score >= 0.2)
    .sort((a, b) => b.score - a.score || b.pattern.sampleSize - a.pattern.sampleSize)
    .slice(0, Math.max(0, Math.floor(limit)));
}
