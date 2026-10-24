'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Brain, Loader2, Sparkles, Target, CheckCircle2, ArrowRight, Link2, ChevronDown } from 'lucide-react';
import { toast } from '@/lib/toast-store';
import { useLocale } from '@/lib/i18n';
import { JudgmentBrief } from '@/components/judgment/judgment-brief';
import { visibleBusinessText } from '@/lib/visible-business-text';
import {
  buildRfpEvidenceHref,
  buildRfpJudgmentBrief,
  buildRfpJudgmentFeedbackTarget,
  normalizeRfpWinPercent,
  RFP_JUDGMENT_LABELS as JUDGMENT_LABELS,
  RFP_SIGNAL_SOURCE_LABELS as SIGNAL_SOURCE_LABELS,
  type RfpAnalysisBrief as RfpAnalysis,
} from '@/lib/judgment/brief';

export type { RfpAnalysisBrief as RfpAnalysis } from '@/lib/judgment/brief';

// ─── Types ──────────────────────────────────────────────────────────

interface PlayRecommendation {
  goalType: string;
  goalDescription: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

interface RfpAiPanelProps {
  rfpId: string;
  rfpTitle: string;
  accountId: string;
  opportunityId: string;
  latestAnalysis: RfpAnalysis | null;
  linkedPlayId: string | null;
  highlightedAnalysisId?: string | null;
  highlightedSignalIndex?: string | null;
  onRfpUpdate: () => void;
}

// ─── Priority colors ────────────────────────────────────────────────

const PRIORITY_COLORS = {
  high: 'bg-danger/10 text-danger',
  medium: 'bg-warning/10 text-warning',
  low: 'bg-positive/10 text-positive',
} as const;

const PRIORITY_LABELS = { high: '高', medium: '中', low: '低' } as const;

const GOAL_TYPE_LABELS: Record<string, string> = {
  win_deal: '赢单',
  build_champion: '培养内线',
  block_competitor: '阻击竞对',
  expand_scope: '扩展范围',
  accelerate_decision: '加速决策',
  relationship_deepening: '深化关系',
};

interface RfpStrategicImpactSummary {
  hiddenCriteria: string[];
  competitorTilt: string;
  winThemes: string[];
  riskEvidence: string[];
  affectedPlay: string;
  nextMove: string;
}

function compactImpactText(value?: string | null, maxLength = 110): string {
  if (!value) return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const sentence = normalized.split(/[。!?！？]/)[0] || normalized;
  return sentence.length > maxLength ? `${sentence.slice(0, maxLength - 1)}…` : sentence;
}

function uniqueImpactItems(values: Array<string | null | undefined>, limit: number): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const value of values) {
    const text = compactImpactText(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    items.push(text);
    if (items.length >= limit) break;
  }
  return items;
}

function buildRfpStrategicImpactSummary(analysis: RfpAnalysis, linkedPlayId: string | null, linkedPlayName?: string | null): RfpStrategicImpactSummary {
  const judgment = analysis.judgment;
  const evidenceSignals = judgment?.evidenceSignals ?? [];
  const criteriaSignals = evidenceSignals.filter((signal) => signal.source === 'rfp' || signal.source === 'knowledge' || signal.source === 'opportunity');
  const competitorSignals = evidenceSignals.filter((signal) => signal.source === 'competitor');
  const riskSignals = evidenceSignals.filter((signal) => signal.valence === 'negative' || signal.valence === 'uncertain');
  const hiddenCriteria = uniqueImpactItems([
    ...criteriaSignals.map((signal) => `${signal.label}：${signal.evidence}`),
    judgment?.rationale,
    analysis.recommendations[0],
  ], 2);
  const winThemes = uniqueImpactItems([
    judgment?.narrativeChange,
    ...analysis.strengths,
    ...analysis.recommendations,
  ], 2);
  const riskEvidence = uniqueImpactItems([
    ...(judgment?.keyRisks ?? []),
    ...riskSignals.map((signal) => `${signal.label}：${signal.evidence}`),
    ...analysis.weaknesses,
  ], 2);
  const competitorTilt = compactImpactText(
    competitorSignals[0]
      ? `${competitorSignals[0].label}：${competitorSignals[0].evidence}`
      : analysis.competitorAnalysis,
    120,
  ) || '当前分析未识别明确竞品倾向；下一步应补齐竞对报价、关系入口和差异化证据。';

  return {
    hiddenCriteria: hiddenCriteria.length > 0 ? hiddenCriteria : ['需要补齐真实评分规则、预算弹性、技术/安全门槛和决策权重。'],
    competitorTilt,
    winThemes: winThemes.length > 0 ? winThemes : ['把叙事聚焦到客户采购成功、风险可控和可验证业务结果。'],
    riskEvidence: riskEvidence.length > 0 ? riskEvidence : ['暂未形成强风险证据；仍需验证采购标准、竞对位置和关键人态度。'],
    affectedPlay: linkedPlayId
      ? `已关联谋局「${linkedPlayName || linkedPlayId.slice(0, 8)}」，建议先复核下一步优先级，不自动重写。`
      : '尚未关联谋局；可先用下方“谋局建议”生成候选打法。',
    nextMove: compactImpactText(judgment?.narrativeChange || analysis.recommendations[0] || judgment?.uncertainty, 140)
      || '先补齐采购标准、竞对位置和关键人态度，再决定是否调整下一步打法。',
  };
}

// ─── Component ──────────────────────────────────────────────────────

export function RfpAiPanel({
  rfpId,
  rfpTitle,
  accountId,
  opportunityId,
  latestAnalysis,
  linkedPlayId,
  highlightedAnalysisId,
  highlightedSignalIndex,
  onRfpUpdate,
}: RfpAiPanelProps) {
  const { locale } = useLocale();
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<RfpAnalysis | null>(latestAnalysis);
  const [recommending, setRecommending] = useState(false);
  const [recommendations, setRecommendations] = useState<PlayRecommendation[]>([]);
  const [adoptedPlayId, setAdoptedPlayId] = useState<string | null>(linkedPlayId);
  const [linkedPlayName, setLinkedPlayName] = useState<string | null>(null);
  const [analysisDetailsOpen, setAnalysisDetailsOpen] = useState(false);

  useEffect(() => {
    if (linkedPlayId) setAdoptedPlayId(linkedPlayId);
  }, [linkedPlayId]);

  const effectiveLinkedPlayId = adoptedPlayId ?? linkedPlayId;
  const highlightedSignalNumber = highlightedSignalIndex != null ? Number(highlightedSignalIndex) : null;
  const shouldHighlightAnalysis = Boolean(analysis?.id && highlightedAnalysisId === analysis.id);
  const winPercent = normalizeRfpWinPercent(analysis?.winProbability ?? null);
  const rfpBrief = analysis ? buildRfpJudgmentBrief(analysis, {
    opportunityId,
    rfpId: analysis.rfpId ?? rfpId,
    analysisId: analysis.id,
  }) : null;
  const rfpFeedbackTarget = analysis ? buildRfpJudgmentFeedbackTarget({
    analysis,
    accountId,
    fallbackRfpId: rfpId,
    brief: rfpBrief,
  }) : undefined;
  const rfpEvidenceHref = analysis ? buildRfpEvidenceHref({
    opportunityId,
    rfpId: analysis.rfpId ?? rfpId,
    analysisId: analysis.id,
  }) : undefined;
  const impactSummary = analysis ? buildRfpStrategicImpactSummary(analysis, effectiveLinkedPlayId, linkedPlayName) : null;
  const linkedPlayHref = effectiveLinkedPlayId ? `/accounts/${encodeURIComponent(accountId)}?tab=plays&playId=${encodeURIComponent(effectiveLinkedPlayId)}` : undefined;

  useEffect(() => {
    if (shouldHighlightAnalysis) {
      setAnalysisDetailsOpen(true);
    }
  }, [shouldHighlightAnalysis]);

  useEffect(() => {
    let cancelled = false;
    if (!effectiveLinkedPlayId) {
      setLinkedPlayName(null);
      return;
    }
    fetch(`/api/strategic-play?accountId=${encodeURIComponent(accountId)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled) return;
        const plays = Array.isArray(payload?.plays) ? payload.plays : [];
        const match = plays.find((play: { id?: string; goalDescription?: string; title?: string; goalType?: string }) => play.id === effectiveLinkedPlayId);
        setLinkedPlayName(match?.goalDescription || match?.title || match?.goalType || null);
      })
      .catch(() => {
        if (!cancelled) setLinkedPlayName(null);
      });
    return () => { cancelled = true; };
  }, [accountId, effectiveLinkedPlayId]);

  // ─── AI Analysis ────────────────────────────────────────────────

  const runAnalysis = useCallback(async () => {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/rfps/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfpId, outputLocale: locale }),
      });
      if (!res.ok) {
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('application/json')) {
          toast('AI 分析超时，请稍后重试', 'error');
        } else {
          const err = await res.json();
          toast(err.error ?? 'AI 分析失败', 'error');
        }
        return;
      }
      const data = await res.json();
      setAnalysis(data.analysis);
      toast('AI 分析完成', 'success');
      onRfpUpdate();
    } catch {
      toast('AI 分析请求失败', 'error');
    } finally {
      setAnalyzing(false);
    }
  }, [rfpId, locale, onRfpUpdate]);

  // ─── Play Recommendations ──────────────────────────────────────

  const getRecommendations = useCallback(async () => {
    setRecommending(true);
    try {
      const res = await fetch('/api/rfps/play-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfpId, outputLocale: locale }),
      });
      if (!res.ok) {
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('application/json')) {
          toast('谋局建议超时，请稍后重试', 'error');
        } else {
          const err = await res.json();
          toast(err.error ?? '获取建议失败', 'error');
        }
        return;
      }
      const data = await res.json();
      setRecommendations(data.recommendations ?? []);
      if ((data.recommendations ?? []).length === 0) {
        toast('暂无谋局建议', 'warning');
      }
    } catch {
      toast('请求失败', 'error');
    } finally {
      setRecommending(false);
    }
  }, [rfpId, locale]);

  // ─── Open prefilled Strategic Play form ────────────────

  const openRecommendationForm = useCallback((rec: PlayRecommendation) => {
    const params = new URLSearchParams();
    params.set('tab', 'plays');
    params.set('newPlay', '1');
    params.set('goalType', rec.goalType);
    params.set('goalDescription', rec.goalDescription);
    params.set('opportunityId', opportunityId);
    params.set('rfpId', rfpId);
    params.set('rfpTitle', rfpTitle);
    params.set('recommendationReason', rec.reason);
    window.location.href = `/accounts/${encodeURIComponent(accountId)}?${params.toString()}`;
  }, [accountId, opportunityId, rfpId, rfpTitle]);

  return (
    <div className="space-y-3">
      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={runAnalysis}
          disabled={analyzing}
          className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
        >
          {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
          {analyzing ? '判断生成中...' : '生成判断'}
        </button>
        <button
          onClick={getRecommendations}
          disabled={recommending}
          className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
        >
          {recommending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {recommending ? '生成建议中...' : '谋局建议'}
        </button>
      </div>

      {/* Linked Play indicator */}
      {effectiveLinkedPlayId && (
        <div className="flex items-center gap-2 rounded-lg border border-positive/20 bg-positive/5 px-3 py-2">
          <Link2 className="h-3.5 w-3.5 text-positive" />
          <span className="text-xs text-positive font-medium">已关联谋局</span>
          <span className="text-[11px] text-muted">{linkedPlayName ? `「${linkedPlayName}」` : `编号：${effectiveLinkedPlayId.slice(0, 8)}...`}</span>
        </div>
      )}

      {/* AI Analysis results */}
      {analysis && (
        <div className="rounded-lg border border-accent/15 bg-accent/[0.02] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-accent flex items-center gap-1"><Brain className="h-3 w-3" /> 投标判断结果</p>
            {analysis.createdAt && (
              <span className="text-[11px] text-muted">{new Date(analysis.createdAt).toLocaleDateString('zh-CN')}</span>
            )}
          </div>

          <JudgmentBrief
            brief={rfpBrief}
            feedbackTarget={rfpFeedbackTarget}
          />

          {impactSummary ? (
            <div className="rounded-lg border border-warning/25 bg-warning/[0.04] p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-warning" />
                  影响当前谋局 / 客户判断
                </p>
                {linkedPlayHref ? (
                  <Link href={linkedPlayHref} className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-hover">
                    查看关联谋局
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                ) : null}
              </div>
              <div className="grid gap-2 text-[12px] leading-5 text-secondary md:grid-cols-2">
                <div className="rounded-md border border-border bg-card/70 px-2.5 py-2">
                  <p className="font-semibold text-foreground">隐含采购标准</p>
                  <ul className="mt-1 space-y-1">
                    {impactSummary.hiddenCriteria.map((item, i) => <li key={`criteria-${i}`}>• {visibleBusinessText(item, locale)}</li>)}
                  </ul>
                </div>
                <div className="rounded-md border border-border bg-card/70 px-2.5 py-2">
                  <p className="font-semibold text-foreground">竞品倾向</p>
                  <p className="mt-1">{visibleBusinessText(impactSummary.competitorTilt, locale)}</p>
                </div>
                <div className="rounded-md border border-border bg-card/70 px-2.5 py-2">
                  <p className="font-semibold text-foreground">赢单主题</p>
                  <ul className="mt-1 space-y-1">
                    {impactSummary.winThemes.map((item, i) => <li key={`theme-${i}`}>• {visibleBusinessText(item, locale)}</li>)}
                  </ul>
                </div>
                <div className="rounded-md border border-border bg-card/70 px-2.5 py-2">
                  <p className="font-semibold text-foreground">风险证据</p>
                  <ul className="mt-1 space-y-1">
                    {impactSummary.riskEvidence.map((item, i) => <li key={`risk-${i}`}>• {visibleBusinessText(item, locale)}</li>)}
                  </ul>
                </div>
                <div className="rounded-md border border-border bg-card/70 px-2.5 py-2 md:col-span-2">
                  <p className="font-semibold text-foreground">影响的谋局 / 下一步打法</p>
                  <p className="mt-1">{visibleBusinessText(impactSummary.affectedPlay, locale)}</p>
                  <p className="mt-1 text-foreground">{visibleBusinessText(impactSummary.nextMove, locale)}</p>
                </div>
              </div>
              <p className="text-[11px] text-muted">只展示影响摘要与证据入口；不会自动改写已有谋局。</p>
            </div>
          ) : null}

          {/* Win probability gauge */}
          {winPercent != null && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card/70 px-3 py-2">
              <span className="text-xs text-secondary">胜率预测</span>
              <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    winPercent >= 60 ? 'bg-positive' :
                    winPercent >= 30 ? 'bg-warning' : 'bg-danger'
                  }`}
                  style={{ width: `${winPercent}%` }}
                />
              </div>
              <span className={`text-sm font-bold ${
                winPercent >= 60 ? 'text-positive' :
                winPercent >= 30 ? 'text-warning' : 'text-danger'
              }`}>
                {Math.round(winPercent)}%
              </span>
            </div>
          )}

          <div className="rounded-lg border border-border bg-card/80">
            <button
              type="button"
              onClick={() => setAnalysisDetailsOpen((value) => !value)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
            >
              <div>
                <p className="text-xs font-semibold text-foreground">查看完整判断依据</p>
                <p className="text-[11px] text-muted">优势、劣势、策略建议和竞对分析默认折叠。</p>
              </div>
              <ChevronDown className={`h-4 w-4 shrink-0 text-secondary transition-transform ${analysisDetailsOpen ? 'rotate-180' : ''}`} />
            </button>

            {analysisDetailsOpen ? (
              <div className="space-y-3 border-t border-border px-3 py-3">
                {analysis.judgment ? (
                  <div className="rounded-lg border border-accent/15 bg-accent/[0.03] p-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground">完整投标判断</p>
                      <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-secondary">
                        {JUDGMENT_LABELS[analysis.judgment.decision]} · 判断信心 {analysis.judgment.confidence}%
                      </span>
                    </div>

                    {analysis.judgment.rationale ? (
                      <p className="rounded-md border border-border bg-card/70 px-2.5 py-2 text-[12px] leading-5 text-foreground">
                        {analysis.judgment.rationale}
                      </p>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-2">
                      {analysis.judgment.keyRisks.length > 0 ? (
                        <div>
                          <p className="text-[11px] text-secondary mb-1">关键风险</p>
                          <ul className="space-y-1">
                            {analysis.judgment.keyRisks.map((item, i) => (
                              <li key={`risk-${i}`} className="rounded-md border border-danger/15 bg-danger/5 px-2.5 py-2 text-[12px] text-danger">
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {analysis.judgment.tensions.length > 0 ? (
                        <div>
                          <p className="text-[11px] text-secondary mb-1">张力信号</p>
                          <ul className="space-y-1">
                            {analysis.judgment.tensions.map((item, i) => (
                              <li key={`tension-${i}`} className="rounded-md border border-warning/15 bg-warning/5 px-2.5 py-2 text-[12px] text-warning">
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {analysis.judgment.contradictions.length > 0 ? (
                        <div>
                          <p className="text-[11px] text-secondary mb-1">矛盾信号</p>
                          <ul className="space-y-1">
                            {analysis.judgment.contradictions.map((item, i) => (
                              <li key={`contradiction-${i}`} className="rounded-md border border-border bg-card/70 px-2.5 py-2 text-[12px] text-foreground">
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {analysis.judgment.uncertainty ? (
                        <div>
                          <p className="text-[11px] text-secondary mb-1">不确定性</p>
                          <p className="rounded-md border border-border bg-card/70 px-2.5 py-2 text-[12px] leading-5 text-muted">
                            {analysis.judgment.uncertainty}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {analysis.judgment.narrativeChange ? (
                      <div>
                        <p className="text-[11px] text-secondary mb-1">叙事变化</p>
                        <p className="rounded-md border border-border bg-card/70 px-2.5 py-2 text-[12px] leading-5 text-foreground">
                          {analysis.judgment.narrativeChange}
                        </p>
                      </div>
                    ) : null}

                    {analysis.judgment.evidenceSignals.length > 0 ? (
                      <div>
                        <p className="text-[11px] text-secondary mb-1">全部证据信号</p>
                        <div className="space-y-1.5">
                          {analysis.judgment.evidenceSignals.map((signal, i) => {
                            const signalHref = buildRfpEvidenceHref({
                              opportunityId,
                              rfpId: analysis.rfpId ?? rfpId,
                              analysisId: analysis.id,
                              signalIndex: i,
                            }) ?? rfpEvidenceHref;
                            const isHighlightedSignal = shouldHighlightAnalysis && highlightedSignalNumber === i;
                            const content = (
                              <div
                                id={`rfp-evidence-signal-${i}`}
                                className={`rounded-md border bg-card/70 px-2.5 py-2 text-[12px] hover:border-accent/30 hover:bg-accent/[0.03] ${isHighlightedSignal ? 'border-accent/70 ring-2 ring-accent/20' : 'border-border'}`}
                              >
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px] text-secondary">
                                    {SIGNAL_SOURCE_LABELS[signal.source]}
                                  </span>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                                    signal.valence === 'positive' ? 'bg-positive/10 text-positive' :
                                    signal.valence === 'negative' ? 'bg-danger/10 text-danger' :
                                    'bg-warning/10 text-warning'
                                  }`}>
                                    {signal.valence === 'positive' ? '正向' : signal.valence === 'negative' ? '负向' : '不确定'}
                                  </span>
                                  <span className="font-medium text-foreground">{signal.label}</span>
                                  {signalHref ? <span className="text-[10px] text-accent">可追溯</span> : <span className="text-[10px] text-muted">未绑定具体原始行</span>}
                                </div>
                                <p className="mt-1 text-[11px] leading-5 text-muted">{signal.evidence}</p>
                              </div>
                            );
                            return signalHref ? (
                              <Link key={`${signal.source}-${signal.label}-${i}`} href={signalHref} className="block">
                                {content}
                              </Link>
                            ) : (
                              <div key={`${signal.source}-${signal.label}-${i}`}>{content}</div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {analysis.strengths.length > 0 && (
                  <div>
                    <p className="text-[11px] text-secondary mb-1">我方优势</p>
                    <ul className="space-y-0.5">
                      {analysis.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[12px] text-positive">
                          <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0" /> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.weaknesses.length > 0 && (
                  <div>
                    <p className="text-[11px] text-secondary mb-1">风险劣势</p>
                    <ul className="space-y-0.5">
                      {analysis.weaknesses.map((w, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[12px] text-danger">
                          <Target className="h-3 w-3 mt-0.5 flex-shrink-0" /> {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.recommendations.length > 0 && (
                  <div>
                    <p className="text-[11px] text-secondary mb-1">策略建议</p>
                    <ul className="space-y-0.5">
                      {analysis.recommendations.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[12px] text-foreground">
                          <ArrowRight className="h-3 w-3 mt-0.5 flex-shrink-0 text-accent" /> {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.competitorAnalysis && (
                  <div>
                    <p className="text-[11px] text-secondary mb-1">竞对分析</p>
                    <p className="text-[12px] text-muted whitespace-pre-wrap">{analysis.competitorAnalysis}</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Play Recommendations */}
      {recommendations.length > 0 && (
        <div className="rounded-lg border border-purple-200/50 bg-purple-50/30 p-3 space-y-2">
          <p className="text-xs font-medium text-purple-600 flex items-center gap-1"><Sparkles className="h-3 w-3" /> 谋局建议</p>
          {recommendations.map((rec, idx) => (
            <div key={idx} className="rounded-md border border-border bg-card p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PRIORITY_COLORS[rec.priority]}`}>
                    {PRIORITY_LABELS[rec.priority]}优先
                  </span>
                  <span className="text-[11px] text-muted">{GOAL_TYPE_LABELS[rec.goalType] ?? rec.goalType}</span>
                </div>
                <button
                  onClick={() => openRecommendationForm(rec)}
                  title="进入新建谋局页面，并自动填入这条建议内容"
                  className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  <Sparkles className="h-3 w-3" />
                  新建谋局
                </button>
              </div>
              <p className="text-xs font-medium text-foreground">{visibleBusinessText(rec.goalDescription, locale)}</p>
              <p className="text-[12px] text-muted">{visibleBusinessText(rec.reason, locale)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
