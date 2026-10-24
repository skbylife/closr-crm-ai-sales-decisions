'use client';

import { useState, useEffect } from 'react';
import { Brain, ChevronDown, ChevronUp, AlertTriangle, TrendingUp, TrendingDown, Minus, Loader2, Clock } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useLocale } from '@/lib/i18n';
import { RecommendationDisplayWithEvidence } from '@/components/recommendation/recommendation-display-with-evidence';
import { SaveToKnowledgeButton } from '@/components/shared/save-to-knowledge-button';
import { visibleBusinessText } from '@/lib/visible-business-text';

interface ForecastFactor {
  name: string;
  impact: 'positive' | 'negative' | 'neutral';
  detail: string;
}

interface ForecastResult {
  aiProbability: number;
  salesProbability: number;
  gap: number;
  factors: ForecastFactor[];
  recommendation: string;
  cachedAt?: string;
  generatedAt?: string;
  staleAfter?: string;
  stale?: boolean;
}

export function AIForecastPanel({ opportunityId }: { opportunityId: string }) {
  const opportunity = useStore((s) => s.opportunities.find((o) => o.id === opportunityId));
  const accountId = opportunity?.accountId;
  const { locale } = useLocale();
  const en = locale === 'en';
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  // Load cached forecast on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/ai-forecast?opportunityId=${encodeURIComponent(opportunityId)}&outputLocale=${locale}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data && data.aiProbability != null) {
          setResult(data);
        }
      } catch {
        // Silently ignore — user can still trigger manually
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [locale, opportunityId]);

  const runForecast = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ai-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId, forceRefresh: true, outputLocale: locale }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || (en ? 'AI forecast failed' : 'AI 预测失败'));
      }
      const data = await res.json();
      setResult(data);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : en ? 'Request failed' : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const impactIcon = (impact: string) => {
    if (impact === 'positive') return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
    if (impact === 'negative') return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
    return <Minus className="h-3.5 w-3.5 text-zinc-400" />;
  };

  const impactBg = (impact: string) => {
    if (impact === 'positive') return 'bg-emerald-500/10 border-emerald-500/20';
    if (impact === 'negative') return 'bg-red-500/10 border-red-500/20';
    return 'bg-zinc-500/10 border-zinc-500/20';
  };

  const formatCachedTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffH = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));
    if (diffH < 1) return en ? 'Just now' : '刚刚';
    if (diffH < 24) return en ? `${diffH}h ago` : `${diffH}小时前`;
    const days = Math.floor(diffH / 24);
    return en ? `${days}d ago` : `${days}天前`;
  };

  const hasCjk = (value?: string | null) => /[\u4e00-\u9fff]/.test(value ?? '');
  const safeText = (value: string | undefined | null, fallback: string) => {
    const cleaned = visibleBusinessText(value, locale);
    return en && hasCjk(cleaned) ? fallback : cleaned || fallback;
  };

  return (
    <div className="card-elevated rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-accent" />
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{en ? 'AI Probability Assessment' : 'AI 概率评估'}</h3>
            <p className="mt-0.5 text-[12px] text-muted">{en ? 'AI close-probability analysis independent from sales forecast' : '独立于销售预测的 AI 成交概率分析'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result?.cachedAt && (
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatCachedTime(result.cachedAt)}
              </span>
              {result.stale && (
                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-amber-500">{en ? 'Stale' : '已过期'}</span>
              )}
            </div>
          )}
          <button
            onClick={runForecast}
            disabled={loading}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
            {loading ? (en ? 'Analyzing...' : '分析中...') : result ? (en ? 'Reassess' : '重新评估') : (en ? 'AI Assess' : 'AI 评估')}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 text-xs text-red-500">{error}</div>
      )}

      {initialLoading && !result && (
        <div className="px-4 py-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      )}

      {result && (
        <div className="p-4 space-y-4">
          {/* Dual ring comparison */}
          <div className="flex items-center justify-center gap-8">
            <div className="flex flex-col items-center gap-1.5">
              <ProbabilityRing value={opportunity?.probability ?? result.salesProbability} label={en ? 'Sales Forecast' : '销售预测'} color="var(--accent-red)" />
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <ProbabilityRing value={result.aiProbability} label={en ? 'AI Forecast' : 'AI 预测'} color={result.aiProbability >= 60 ? 'var(--positive)' : result.aiProbability >= 30 ? 'var(--accent-amber)' : 'var(--accent-red)'} />
            </div>
          </div>

          {/* Gap warning */}
          {result.gap > 20 && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-amber-400">{en ? 'Probability Gap Warning' : '概率差距警告'}</p>
                <p className="text-[12px] text-amber-400/80 mt-0.5">
                  {en
                    ? `AI assessment differs from the sales forecast by ${result.gap}%. AI sees the actual probability as likely ${result.aiProbability < result.salesProbability ? 'lower' : 'higher'}.`
                    : `AI 评估与销售预测相差 ${result.gap}%，AI 认为实际概率可能${result.aiProbability < result.salesProbability ? '更低' : '更高'}`}
                </p>
              </div>
            </div>
          )}

          {/* Recommendation */}
          {result.recommendation && accountId && (
            <RecommendationDisplayWithEvidence
              sectionTitle={en ? 'Recommended Action' : '行动建议'}
              recommendationTitle={en ? 'AI Close Probability Recommendation' : 'AI 成交概率行动建议'}
              recommendationSummary={safeText(result.recommendation, en ? 'Reassess the deal evidence before committing the forecast.' : '重新核对商机证据后再确认预测。')}
              accountId={accountId}
              recommendationId={`ai-forecast:${opportunityId}`}
              confidence={result.aiProbability}
              panelTitle={en ? 'Evidence Panel · AI Forecast' : '证据面板 · AI 预测'}
            />
          )}

          {/* Expandable factors */}
          {result.factors.length > 0 && (
            <>
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between text-xs text-muted hover:text-foreground transition-colors"
              >
                <span className="font-medium">{en ? 'Influencing Factors' : '影响因素'} ({result.factors.length})</span>
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {expanded && (
                <div className="space-y-2">
                  {result.factors.map((f, idx) => (
                    <div key={idx} className={`rounded-lg border px-3 py-2.5 ${impactBg(f.impact)}`}>
                      <div className="flex items-center gap-2">
                        {impactIcon(f.impact)}
                        <span className="text-xs font-medium text-foreground">{safeText(f.name, en ? 'Deal signal' : '商机信号')}</span>
                      </div>
                      <p className="mt-1 text-[12px] text-secondary leading-relaxed pl-5.5">{safeText(f.detail, en ? 'No English detail available for this factor yet.' : '暂无该因素详情。')}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Save to Knowledge */}
          {accountId && (
            <div className="flex justify-end pt-2 border-t border-border">
              <SaveToKnowledgeButton
                accountId={accountId}
                title={en ? `AI forecast: ${opportunity?.name ?? 'Opportunity'} ${result.aiProbability}%` : `AI预测：${opportunity?.name ?? '商机'} ${result.aiProbability}%`}
                content={[
                  en ? `AI close probability: ${result.aiProbability}%` : `AI预测成交概率: ${result.aiProbability}%`,
                  en ? `Sales forecast: ${result.salesProbability}%` : `销售预测: ${result.salesProbability}%`,
                  en ? `Gap: ${result.gap}%` : `差距: ${result.gap}%`,
                  safeText(result.recommendation, en ? 'Reassess deal evidence.' : '重新核对商机证据。'),
                  ...result.factors.map((f) => `${safeText(f.name, en ? 'Deal signal' : '商机信号')}(${f.impact}): ${safeText(f.detail, en ? 'No English detail available.' : '暂无详情。')}`),
                ].filter(Boolean).join('\n')}
                category="deal_lesson"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Probability Ring ──────────────────────────────────────────────

function ProbabilityRing({ value, label, color }: { value: number; label: string; color: string }) {
  const size = 90;
  const sw = 8;
  const radius = (size - sw) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - value / 100);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={sw} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-500"
        />
        <text
          x={size / 2} y={size / 2}
          textAnchor="middle" dominantBaseline="central"
          className="fill-foreground font-bold"
          style={{ fontSize: '18px', transform: 'rotate(90deg)', transformOrigin: `${size / 2}px ${size / 2}px` }}
        >
          {value}%
        </text>
      </svg>
      <span className="text-[12px] font-medium text-muted">{label}</span>
    </div>
  );
}
