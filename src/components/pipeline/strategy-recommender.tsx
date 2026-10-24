'use client';

import { useState } from 'react';
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { RecommendationDisplayWithEvidence } from '@/components/recommendation/recommendation-display-with-evidence';
import { useLocale } from '@/lib/i18n';
import { visibleBusinessText } from '@/lib/visible-business-text';

// ─── Types ──────────────────────────────────────────────────────────

interface ApplicableDeal {
  name: string;
  value: number;
  industry: string;
}

interface SuccessPattern {
  patternName: string;
  description: string;
  successRate: string;
  applicableDeals: ApplicableDeal[];
  keyActions: string[];
}

interface RecommenderProps {
  opportunityId: string;
  accountId: string;
}

// ─── Component ──────────────────────────────────────────────────────

export function StrategyRecommender({ opportunityId, accountId }: RecommenderProps) {
  const router = useRouter();
  const { locale } = useLocale();
  const en = locale === 'en';
  const [patterns, setPatterns] = useState<SuccessPattern[]>([]);
  const [recommendations, setRecommendations] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function fetchRecommendations() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/pattern-recognition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId, accountId, outputLocale: locale }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || (en ? 'Failed to get strategy recommendations' : '获取策略推荐失败'));
      }
      const data = await res.json();
      setPatterns(data.patterns ?? []);
      setRecommendations(data.recommendations ?? '');
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : en ? 'Request failed' : '请求失败');
    } finally {
      setLoading(false);
    }
  }

  // Match quality indicator
  function matchBadge(dealCount: number) {
    if (dealCount >= 3) return { label: en ? 'High match' : '高匹配', cls: 'bg-positive/15 text-positive' };
    if (dealCount >= 2) return { label: en ? 'Medium match' : '中匹配', cls: 'bg-warning/15 text-warning' };
    return { label: en ? 'Reference' : '参考', cls: 'bg-sidebar text-muted' };
  }

  const hasCjk = (value?: string | null) => /[\u4e00-\u9fff]/.test(value ?? '');
  const safeText = (value: string | undefined | null, fallback: string) => {
    const cleaned = visibleBusinessText(value, locale);
    return en && hasCjk(cleaned) ? fallback : cleaned || fallback;
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-bold text-foreground">{en ? 'Historical Strategy Recommendations' : '历史策略推荐'}</h2>
          <span className="text-[12px] text-muted">{en ? 'Matched from won-deal patterns' : '基于赢单模式匹配'}</span>
        </div>
        <button
          onClick={fetchRecommendations}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
          {loading ? (en ? 'Matching...' : '匹配中…') : loaded ? (en ? 'Rematch' : '重新匹配') : (en ? 'Match Historical Strategies' : '匹配历史策略')}
        </button>
      </div>

      {error && (
        <p className="text-xs text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Empty state */}
      {!loaded && !loading && !error && (
        <div className="text-center py-6">
          <Sparkles className="h-7 w-7 text-muted mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted">{en ? 'Find strategies from historical won deals that fit this opportunity' : '从历史赢单中发现适用于当前商机的策略'}</p>
          <p className="text-xs text-muted mt-1">{en ? 'AI analyzes industry, customer structure, and play fit' : 'AI 分析行业、客户结构、谋局组合的匹配度'}</p>
        </div>
      )}

      {/* Pattern cards with match indicator */}
      {patterns.length > 0 && (
        <div className="space-y-3">
          {patterns.map((pattern, idx) => {
            const expanded = expandedIdx === idx;
            const badge = matchBadge(pattern.applicableDeals.length);
            return (
              <div
                key={idx}
                className="rounded-lg border border-border bg-sidebar overflow-hidden"
              >
                <button
                  onClick={() => setExpandedIdx(expanded ? null : idx)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-background/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Target className="h-4 w-4 text-accent shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{safeText(pattern.patternName, en ? 'Winning pattern' : '赢单模式')}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>
                          {badge.label}
                        </span>
                        <span className="text-[12px] text-positive font-medium flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          {pattern.successRate}
                        </span>
                      </div>
                    </div>
                  </div>
                  {expanded ? (
                    <ChevronUp className="h-4 w-4 text-muted shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted shrink-0" />
                  )}
                </button>

                {expanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border">
                    <p className="text-xs text-secondary leading-relaxed pt-3">{safeText(pattern.description, en ? 'Pattern detail is not available in English yet.' : '暂无模式详情。')}</p>

                    {/* Key actions */}
                    <div>
                      <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5">{en ? 'Reusable Actions' : '可复用动作'}</h4>
                      <ul className="space-y-1">
                        {pattern.keyActions.map((action, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                            <span className="text-accent mt-0.5 shrink-0">→</span>
                            {safeText(action, en ? 'Reusable action' : '可复用动作')}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Applicable deals */}
                    <div>
                      <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5">{en ? 'Won Cases' : '成功案例'}</h4>
                      <div className="flex flex-wrap gap-2">
                        {pattern.applicableDeals.map((deal, i) => (
                          <span
                            key={i}
                            className="rounded-full bg-positive/10 px-2.5 py-1 text-[11px] font-medium text-positive"
                          >
                            {safeText(deal.name, en ? 'Won deal' : '成功案例')} ({safeText(deal.industry, en ? 'Industry' : '行业')})
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => router.push(`/accounts/${accountId}?tab=plays`)}
                      className="flex items-center gap-1.5 rounded-lg border border-accent text-accent px-3 py-1.5 text-xs font-medium hover:bg-accent/10 transition-colors"
                    >
                      <Zap className="h-3 w-3" />
                      {en ? 'Create Play from This Pattern' : '基于此模式创建谋局'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Recommendations */}
      {recommendations && (
        <RecommendationDisplayWithEvidence
          sectionTitle={en ? 'Strategy Recommendations for This Opportunity' : '针对当前商机的策略建议'}
          recommendationTitle={en ? 'Historical Strategy Recommendation' : '历史策略推荐'}
          recommendationSummary={safeText(recommendations, en ? 'No English recommendation is available yet.' : '暂无策略建议。')}
          accountId={accountId}
          recommendationId={`strategy-recommender:${opportunityId}`}
          confidence={patterns.length >= 3 ? 78 : patterns.length === 2 ? 66 : 54}
          panelTitle={en ? 'Evidence Panel · Strategy Recommendation' : '证据面板 · 策略推荐'}
          recommendationBlockClassName="rounded-lg border border-accent/20 bg-accent/5 p-4"
          sectionTitleClassName="mb-2 text-xs font-semibold text-accent"
          summaryClassName="text-xs leading-relaxed text-secondary whitespace-pre-line"
        />
      )}
    </section>
  );
}
