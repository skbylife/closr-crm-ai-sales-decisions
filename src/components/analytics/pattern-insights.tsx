'use client';

import { useState } from 'react';
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Loader2,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/lib/i18n';

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

interface PatternData {
  patterns: SuccessPattern[];
  recommendations: string;
  meta?: {
    wonDealsAnalyzed: number;
    industriesCovered: string[];
  };
}

// ─── Component ──────────────────────────────────────────────────────

export function PatternInsights() {
  const router = useRouter();
  const { locale } = useLocale();
  const en = locale === 'en';
  const [data, setData] = useState<PatternData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  async function analyze() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/pattern-recognition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputLocale: locale }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || (en ? 'Analysis failed' : '分析失败'));
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : (en ? 'Request failed' : '请求失败'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-bold text-foreground">{en ? 'Cross-Account Pattern Recognition' : '跨客户模式识别'}</h2>
          <span className="text-[12px] text-muted">{en ? 'Successful play transfer' : '成功策略迁移'}</span>
        </div>
        <button
          onClick={analyze}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          {loading ? (en ? 'Analyzing...' : '分析中…') : data ? (en ? 'Analyze again' : '重新分析') : (en ? 'Start analysis' : '开始分析')}
        </button>
      </div>

      {error && (
        <p className="text-xs text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Empty state */}
      {!data && !loading && !error && (
        <div className="text-center py-8">
          <Brain className="h-8 w-8 text-muted mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted">{en ? 'Click Start analysis to identify successful cross-account patterns' : '点击「开始分析」识别跨客户成功模式'}</p>
        <p className="text-xs text-muted mt-1">{en ? 'Based on strategies, plays, and sales-method data from won opportunities' : '基于所有已赢单商机的策略、谋局和销售方法论数据'}</p>
        </div>
      )}

      {/* Meta */}
      {data?.meta && (
        <div className="flex gap-4 text-xs text-muted border-b border-border pb-3">
          <span>{en ? 'Won deals analyzed' : '分析赢单'}: <strong className="text-foreground">{data.meta.wonDealsAnalyzed}</strong>{en ? '' : ' 个'}</span>
          <span>{en ? 'Industries covered' : '覆盖行业'}: <strong className="text-foreground">{data.meta.industriesCovered.join(en ? ', ' : '、') || '—'}</strong></span>
        </div>
      )}

      {/* Pattern cards */}
      {data?.patterns && data.patterns.length > 0 && (
        <div className="space-y-3">
          {data.patterns.map((pattern, idx) => {
            const expanded = expandedIdx === idx;
            return (
              <div
                key={idx}
                className="rounded-lg border border-border bg-sidebar overflow-hidden"
              >
                {/* Card header */}
                <button
                  onClick={() => setExpandedIdx(expanded ? null : idx)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-background/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Target className="h-4 w-4 text-accent shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{pattern.patternName}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[12px] text-positive font-medium flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          {pattern.successRate}
                        </span>
                        <span className="text-[12px] text-muted">
                          {pattern.applicableDeals.length} {en ? 'cases' : '个案例'}
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

                {/* Expanded detail */}
                {expanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border">
                    {/* Description */}
                    <p className="text-xs text-secondary leading-relaxed pt-3">{pattern.description}</p>

                    {/* Key actions */}
                    <div>
                      <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5">关键动作</h4>
                      <ul className="space-y-1">
                        {pattern.keyActions.map((action, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                            <span className="text-accent mt-0.5 shrink-0">→</span>
                            {action}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Applicable deals */}
                    <div>
                      <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5">适用案例</h4>
                      <div className="flex flex-wrap gap-2">
                        {pattern.applicableDeals.map((deal, i) => (
                          <span
                            key={i}
                            className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent"
                          >
                            {deal.name}（{deal.industry}・¥{(deal.value / 10000).toFixed(0)}万）
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Apply button */}
                    <button
                      onClick={() => router.push('/accounts?tab=plays')}
                      className="flex items-center gap-1.5 rounded-lg border border-accent text-accent px-3 py-1.5 text-xs font-medium hover:bg-accent/10 transition-colors"
                    >
                      <Zap className="h-3 w-3" />
                      应用此模式 → 谋局
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Recommendations */}
      {data?.recommendations && (
        <div className="rounded-lg bg-accent/5 border border-accent/20 p-4">
          <h4 className="text-xs font-semibold text-accent mb-2">智能策略建议</h4>
          <p className="text-xs text-secondary leading-relaxed whitespace-pre-line">{data.recommendations}</p>
        </div>
      )}
    </section>
  );
}
