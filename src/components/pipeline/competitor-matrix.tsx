'use client';

import { useEffect, useState } from 'react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import type { Opportunity } from '@/lib/babel-engine/types';
import { Clock, Loader2, Sparkles, Swords } from 'lucide-react';
import { useLocale } from '@/lib/i18n';

// ─── Types ──────────────────────────────────────────────────────────

interface CompetitorScores {
  name: string;
  scores: {
    price: number;
    tech: number;
    relationship: number;
    delivery: number;
    brand: number;
    support: number;
  };
}

interface MatrixAnalysis {
  competitors: CompetitorScores[];
  ourScores: CompetitorScores['scores'];
  responsePlan: string;
  cachedAt?: string;
  generatedAt?: string;
  stale?: boolean;
}

const DIMENSION_LABELS: Record<keyof CompetitorScores['scores'], string> = {
  price: '价格竞争力',
  tech: '技术契合',
  relationship: '客户关系',
  delivery: '交付能力',
  brand: '品牌信任',
  support: '售后支持',
};

const COMPETITOR_COLORS = [
  '#ef4444', // red
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
];

// ─── Main Component ─────────────────────────────────────────────────

export function CompetitorMatrix({ opportunity }: { opportunity: Opportunity }) {
  const { locale } = useLocale();
  const competitors = opportunity.meddicc?.competition ?? [];
  const [analysis, setAnalysis] = useState<MatrixAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (competitors.length === 0) {
      setInitialLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/competitive-analysis?opportunityId=' + encodeURIComponent(opportunity.id) + '&mode=matrix&outputLocale=' + locale);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.ourScores && data?.competitors) {
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

  async function runAnalysis() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/competitive-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId: opportunity.id, mode: 'matrix', forceRefresh: true, outputLocale: locale }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'AI 分析失败');
        return;
      }
      const data = await res.json();
      setAnalysis(data);
    } catch {
      setError('网络错误，请重试');
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

  // Build radar chart data from analysis
  const radarData = analysis
    ? (Object.keys(DIMENSION_LABELS) as (keyof CompetitorScores['scores'])[]).map((key) => {
        const point: Record<string, string | number> = {
          dimension: DIMENSION_LABELS[key],
          '我方': analysis.ourScores[key],
        };
        analysis.competitors.forEach((c) => {
          point[c.name] = c.scores[key];
        });
        return point;
      })
    : null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-bold text-foreground">竞品对比矩阵</h3>
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
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {loading ? '分析中...' : analysis ? '重新分析' : 'AI 分析竞品'}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {initialLoading && !analysis && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      )}

      {/* Radar Chart */}
      {radarData && (
        <div className="w-full" style={{ height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis
                dataKey="dimension"
                tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 10]}
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                tickCount={6}
              />
              {/* Our scores */}
              <Radar
                name="我方"
                dataKey="我方"
                stroke="#22c55e"
                fill="#22c55e"
                fillOpacity={0.15}
                strokeWidth={2}
              />
              {/* Competitor scores */}
              {analysis!.competitors.map((c, i) => (
                <Radar
                  key={c.name}
                  name={c.name}
                  dataKey={c.name}
                  stroke={COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]}
                  fill={COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]}
                  fillOpacity={0.08}
                  strokeWidth={1.5}
                />
              ))}
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(20,20,30,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Score Table */}
      {analysis && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <div
            className="grid min-w-[500px]"
            style={{ gridTemplateColumns: `140px repeat(${1 + analysis.competitors.length}, 1fr)` }}
          >
            {/* Header */}
            <div className="bg-card px-3 py-2 text-[11px] font-semibold text-muted uppercase tracking-wider border-b border-border">
              维度
            </div>
            <div className="bg-emerald-500/10 px-3 py-2 text-[11px] font-bold text-emerald-400 uppercase tracking-wider border-b border-border text-center">
              我方
            </div>
            {analysis.competitors.map((c, i) => (
              <div
                key={c.name}
                className="bg-card px-3 py-2 text-[11px] font-semibold uppercase tracking-wider border-b border-border text-center truncate"
                style={{ color: COMPETITOR_COLORS[i % COMPETITOR_COLORS.length] }}
              >
                {c.name}
              </div>
            ))}

            {/* Rows */}
            {(Object.keys(DIMENSION_LABELS) as (keyof CompetitorScores['scores'])[]).map((key, rowIdx, arr) => {
              const isLast = rowIdx === arr.length - 1;
              const ourScore = analysis.ourScores[key];
              return (
                <div key={key} className="contents">
                  <div className={`px-3 py-2 text-xs text-secondary font-medium ${!isLast ? 'border-b border-border' : ''}`}>
                    {DIMENSION_LABELS[key]}
                  </div>
                  <div className={`px-3 py-2 text-center ${!isLast ? 'border-b border-border' : ''}`}>
                    <ScoreBar score={ourScore} color="#22c55e" />
                  </div>
                  {analysis.competitors.map((c, i) => (
                    <div key={c.name} className={`px-3 py-2 text-center ${!isLast ? 'border-b border-border' : ''}`}>
                      <ScoreBar score={c.scores[key]} color={COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Competitive response plan */}
      {analysis?.responsePlan && (
        <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
          <p className="text-[11px] font-semibold text-accent uppercase tracking-wider mb-2">
            针对性打法建议
          </p>
          <p className="text-sm text-secondary leading-relaxed whitespace-pre-line">
            {analysis.responsePlan}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Score Bar ───────────────────────────────────────────────────────

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${(score / 10) * 100}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>
        {score}
      </span>
    </div>
  );
}
