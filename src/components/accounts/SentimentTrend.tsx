'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useStore } from '@/lib/store';

// ─── Types ──────────────────────────────────────────────────────────

interface SentimentDataPoint {
  date: string;
  sentiment: number; // -1 to 1
  label: string;
  buyerState: string;
}

const SENTIMENT_MAP: Record<string, number> = {
  warming: 0.7,
  stable: 0.3,
  cooling: -0.3,
  volatile: -0.1,
};

const BUYER_STATE_MAP: Record<string, number> = {
  ready_to_buy: 1.0,
  engaged: 0.6,
  evaluating: 0.2,
  stalling: -0.2,
  evaluator_to_ghost: -0.5,
  ghosting: -0.8,
};

const TREND_LABELS: Record<string, { text: string; color: string }> = {
  warming: { text: '升温', color: 'text-positive' },
  stable: { text: '平稳', color: 'text-foreground' },
  cooling: { text: '降温', color: 'text-danger' },
  volatile: { text: '波动', color: 'text-warning' },
};

const BUYER_STATE_LABELS: Record<string, string> = {
  ready_to_buy: '准备购买',
  engaged: '持续互动',
  evaluating: '评估中',
  stalling: '推进停滞',
  evaluator_to_ghost: '逐渐失联',
  ghosting: '已失联',
};

// ─── Component ──────────────────────────────────────────────────────

export function SentimentTrend({
  contactId,
  contactName,
}: {
  contactId: string;
  contactName?: string;
}) {
  const emailDecodes = useStore((s) => s.emailDecodes);

  const data = useMemo(() => {
    const contactDecodes = emailDecodes
      .filter(
        (d) =>
          d.matchedContactId === contactId ||
          d.originalSenderEmail === contactId,
      )
      .sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

    return contactDecodes
      .map((d): SentimentDataPoint | null => {
        const ta = d.decode?.threadAnalysis;
        if (!ta) return null;

        const sentimentScore = SENTIMENT_MAP[ta.sentimentTrend] ?? 0;
        const buyerScore = BUYER_STATE_MAP[ta.buyerState] ?? 0;
        // 综合得分：情绪 60% + 买方状态 40%
        const combined = sentimentScore * 0.6 + buyerScore * 0.4;

        return {
          date: new Date(d.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
          sentiment: Math.round(combined * 100) / 100,
          label: ta.sentimentTrend,
          buyerState: ta.buyerState,
        };
      })
      .filter((d): d is SentimentDataPoint => d !== null);
  }, [emailDecodes, contactId]);

  if (data.length < 2) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-center">
        <p className="text-xs text-muted">
          至少需要 2 条邮件解读记录才能显示趋势
        </p>
      </div>
    );
  }

  // 计算趋势方向
  const latest = data[data.length - 1];
  const previous = data[data.length - 2];
  const trend = latest.sentiment - previous.sentiment;
  const trendInfo = TREND_LABELS[latest.label] ?? TREND_LABELS.stable;

  return (
    <div className="rounded-xl border border-border bg-card card-elevated">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{contactName ? `${contactName} 的情绪趋势` : '情绪趋势'}</h3>
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ${trendInfo.color}`}
          >
            {trend > 0.1 ? (
              <TrendingUp className="h-3 w-3" />
            ) : trend < -0.1 ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {trendInfo.text}
          </span>
        </div>
        <span className="text-[12px] text-muted">{data.length} 次互动</span>
      </div>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={160}>
          <LineChart
            data={data}
            margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              opacity={0.5}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
              axisLine={{ stroke: 'var(--color-border)' }}
            />
            <YAxis
              domain={[-1, 1]}
              tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
              axisLine={{ stroke: 'var(--color-border)' }}
              tickFormatter={(v: number) =>
                v === 1 ? '高' : v === 0 ? '中' : v === -1 ? '低' : ''
              }
            />
            <ReferenceLine
              y={0}
              stroke="var(--color-border)"
              strokeDasharray="3 3"
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const p = payload[0].payload as SentimentDataPoint;
                return (
                  <div className="rounded-lg border border-border bg-card p-2 text-xs shadow-lg">
                    <p className="font-medium text-foreground">{p.date}</p>
                    <p className="text-muted">
                      情绪趋势：{TREND_LABELS[p.label]?.text ?? p.label}
                    </p>
                    <p className="text-muted">
                      当前状态：
                      {BUYER_STATE_LABELS[p.buyerState] ?? p.buyerState}
                    </p>
                    <p
                      className={`font-bold ${p.sentiment > 0 ? 'text-positive' : p.sentiment < 0 ? 'text-danger' : 'text-foreground'}`}
                    >
                      得分：{p.sentiment.toFixed(2)}
                    </p>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="sentiment"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'var(--color-accent)' }}
              activeDot={{ r: 5, fill: 'var(--color-accent)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
