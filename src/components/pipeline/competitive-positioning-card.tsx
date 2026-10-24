'use client';

import { useEffect, useState } from 'react';
import type { Opportunity, Competitor } from '@/lib/babel-engine/types';
import { RecommendationDisplayWithEvidence } from '@/components/recommendation/recommendation-display-with-evidence';
import { ChevronDown, ChevronUp, Clock, Loader2, Sparkles } from 'lucide-react';
import { SaveToKnowledgeButton } from '@/components/shared/save-to-knowledge-button';
import { useLocale } from '@/lib/i18n';

// ─── Types ──────────────────────────────────────────────────────────

interface DimensionScore {
  name: string;
  our: number; // 1-5
  competitors: { name: string; score: number }[];
}

interface CompetitiveAnalysis {
  dimensions: DimensionScore[];
  strategy: string;
  cachedAt?: string;
  generatedAt?: string;
  stale?: boolean;
}

// ─── Threat Badge ───────────────────────────────────────────────────

const THREAT_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: '低威胁', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  medium: { label: '中威胁', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  high: { label: '高威胁', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  critical: { label: '极高威胁', color: 'bg-red-600/20 text-red-300 border-red-500/40' },
};

function getOverallThreat(competitors: Competitor[]): string {
  if (competitors.length === 0) return 'low';
  const hasHigh = competitors.some((c) => c.threatLevel === 'high');
  const mediumCount = competitors.filter((c) => c.threatLevel === 'medium').length;
  if (hasHigh && mediumCount >= 1) return 'critical';
  if (hasHigh) return 'high';
  if (mediumCount >= 2) return 'high';
  if (mediumCount >= 1) return 'medium';
  return 'low';
}

// ─── Star Rating ────────────────────────────────────────────────────

function StarRating({ score }: { score: number }) {
  return (
    <span className="text-sm tracking-wide">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < score ? 'text-amber-400' : 'text-white/15'}>
          {i < score ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function CompetitivePositioningCard({ opportunity }: { opportunity: Opportunity }) {
  const { locale } = useLocale();
  const competitors = opportunity.meddicc?.competition ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<CompetitiveAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    if (competitors.length === 0) {
      setInitialLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/competitive-analysis?opportunityId=' + encodeURIComponent(opportunity.id) + '&outputLocale=' + locale);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.dimensions) {
          setAnalysis(data);
        }
      } catch {
        // 用户仍可手动触发分析
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [competitors.length, locale, opportunity.id]);

  if (competitors.length === 0) return null;

  const overallThreat = getOverallThreat(competitors);
  const threatInfo = THREAT_CONFIG[overallThreat];

  async function runAnalysis() {
    setLoading(true);
    try {
      const res = await fetch('/api/competitive-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId: opportunity.id, forceRefresh: true, outputLocale: locale }),
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysis(data);
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }

  const formatCachedTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffH = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));
    if (diffH < 1) return '刚刚保存';
    if (diffH < 24) return String(diffH) + '小时前保存';
    return String(Math.floor(diffH / 24)) + '天前保存';
  };

  return (
    <div className="space-y-4">
      {/* Header: Threat Level */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-foreground">竞品态势图</h3>
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${threatInfo.color}`}>
            {threatInfo.label}
          </span>
          <span className="text-xs text-muted">{competitors.length} 个竞品</span>
        </div>
        <div className="flex items-center gap-2">
          {analysis?.cachedAt && (
            <span className="flex items-center gap-1 text-[11px] text-muted">
              <Clock className="h-3 w-3" />
              {formatCachedTime(analysis.cachedAt)}
            </span>
          )}
          {analysis?.stale && (
            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-500">可更新</span>
          )}
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {loading ? '分析中...' : analysis ? '重新分析' : 'AI 分析竞争格局'}
          </button>
        </div>
      </div>

      {initialLoading && !analysis && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      )}

      {/* Comparison Matrix */}
      {analysis && analysis.dimensions.length > 0 ? (
        <AnalysisMatrix dimensions={analysis.dimensions} />
      ) : (
        <BasicMatrix competitors={competitors} />
      )}

      {/* Competitor Detail Cards */}
      <div className="space-y-2">
        {competitors.map((comp) => {
          const isExpanded = expandedId === comp.id;
          const tConfig = THREAT_CONFIG[comp.threatLevel] ?? THREAT_CONFIG.medium;
          return (
            <div key={comp.id} className="rounded-xl border border-border bg-card">
              <button
                onClick={() => setExpandedId(isExpanded ? null : comp.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground">{comp.name}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${tConfig.color}`}>
                    {tConfig.label}
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted" />
                )}
              </button>
              {isExpanded && (
                <div className="border-t border-border px-4 py-3 space-y-3">
                  {comp.strengths && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1">对方优势</p>
                      <p className="text-sm text-secondary leading-relaxed">{comp.strengths}</p>
                    </div>
                  )}
                  {comp.ourAdvantage && (
                    <div>
                      <p className="text-[11px] font-semibold text-accent uppercase tracking-wider mb-1">我方对策</p>
                      <p className="text-sm text-secondary leading-relaxed">{comp.ourAdvantage}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* AI Strategy */}
      {analysis?.strategy && (
        <RecommendationDisplayWithEvidence
          sectionTitle="AI 竞争策略建议"
          recommendationTitle={`${opportunity.name} 竞争策略建议`}
          recommendationSummary={analysis.strategy}
          accountId={opportunity.accountId}
          recommendationId={`competitive-positioning:${opportunity.id}`}
          confidence={78}
          panelTitle="证据面板 · 竞争策略"
        />
      )}

      {/* Save analysis to KB */}
      {analysis && (
        <div className="flex justify-end">
          <SaveToKnowledgeButton
            accountId={opportunity.accountId}
            title={`竞争分析：${opportunity.name}`}
            content={[
              analysis.strategy,
              ...analysis.dimensions.map((d) => `${d.name}: 我方${d.our}/5, ${d.competitors.map((c) => `${c.name}${c.score}/5`).join(' ')}`),
            ].filter(Boolean).join('\n')}
            category="competitor"
          />
        </div>
      )}
    </div>
  );
}

// ─── Basic Matrix (no AI analysis) ──────────────────────────────────

const DEFAULT_DIMENSIONS = ['价格竞争力', '技术能力', '客户关系', '交付能力', '品牌影响力'];

type StatusLabel = '优' | '中' | '劣';

function getStatusFromThreat(threatLevel: string, dimension: string): StatusLabel {
  // Heuristic: invert threat for our advantage estimation
  if (dimension === '价格竞争力') {
    return threatLevel === 'high' ? '劣' : threatLevel === 'medium' ? '中' : '优';
  }
  // Default: higher threat = stronger competitor
  return threatLevel === 'high' ? '优' : threatLevel === 'medium' ? '中' : '劣';
}

const STATUS_STYLE: Record<StatusLabel, string> = {
  '优': 'bg-emerald-500/15 text-emerald-400',
  '中': 'bg-amber-500/15 text-amber-400',
  '劣': 'bg-red-500/15 text-red-400',
};

function BasicMatrix({ competitors }: { competitors: Competitor[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <div
        className="grid min-w-[500px]"
        style={{ gridTemplateColumns: `160px repeat(${1 + competitors.length}, 1fr)` }}
      >
        {/* Header Row */}
        <div className="bg-card px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wider border-b border-border">
          对比维度
        </div>
        <div className="bg-accent/10 px-3 py-2.5 text-[11px] font-bold text-accent uppercase tracking-wider border-b border-border text-center">
          我方
        </div>
        {competitors.map((c) => (
          <div key={c.id} className="bg-card px-3 py-2.5 text-[11px] font-semibold text-secondary uppercase tracking-wider border-b border-border text-center truncate">
            {c.name}
          </div>
        ))}

        {/* Dimension Rows */}
        {DEFAULT_DIMENSIONS.map((dim, rowIdx) => (
          <div key={dim} className="contents">
            <div className={`px-3 py-2.5 text-xs text-secondary font-medium ${rowIdx < DEFAULT_DIMENSIONS.length - 1 ? 'border-b border-border' : ''}`}>
              {dim}
            </div>
            <div className={`px-3 py-2.5 text-center ${rowIdx < DEFAULT_DIMENSIONS.length - 1 ? 'border-b border-border' : ''}`}>
              <span className="inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                优
              </span>
            </div>
            {competitors.map((c) => {
              const status = getStatusFromThreat(c.threatLevel, dim);
              return (
                <div key={c.id} className={`px-3 py-2.5 text-center ${rowIdx < DEFAULT_DIMENSIONS.length - 1 ? 'border-b border-border' : ''}`}>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status]}`}>
                    {status}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AI Analysis Matrix (with scores) ───────────────────────────────

function AnalysisMatrix({ dimensions }: { dimensions: DimensionScore[] }) {
  if (dimensions.length === 0) return null;

  const competitorNames = dimensions[0]?.competitors.map((c) => c.name) ?? [];

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <div
        className="grid min-w-[500px]"
        style={{ gridTemplateColumns: `160px repeat(${1 + competitorNames.length}, 1fr)` }}
      >
        {/* Header Row */}
        <div className="bg-card px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wider border-b border-border">
          对比维度
        </div>
        <div className="bg-accent/10 px-3 py-2.5 text-[11px] font-bold text-accent uppercase tracking-wider border-b border-border text-center">
          我方
        </div>
        {competitorNames.map((name) => (
          <div key={name} className="bg-card px-3 py-2.5 text-[11px] font-semibold text-secondary uppercase tracking-wider border-b border-border text-center truncate">
            {name}
          </div>
        ))}

        {/* Dimension Rows */}
        {dimensions.map((dim, rowIdx) => (
          <div key={dim.name} className="contents">
            <div className={`px-3 py-2.5 text-xs text-secondary font-medium ${rowIdx < dimensions.length - 1 ? 'border-b border-border' : ''}`}>
              {dim.name}
            </div>
            <div className={`px-3 py-2.5 flex justify-center ${rowIdx < dimensions.length - 1 ? 'border-b border-border' : ''}`}>
              <StarRating score={dim.our} />
            </div>
            {dim.competitors.map((c) => (
              <div key={c.name} className={`px-3 py-2.5 flex justify-center ${rowIdx < dimensions.length - 1 ? 'border-b border-border' : ''}`}>
                <StarRating score={c.score} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
