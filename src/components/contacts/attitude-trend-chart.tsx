"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { AttitudeTrendPoint } from "@/lib/babel-engine/types";

interface AttitudeTrendChartProps {
  attitudeTrend: AttitudeTrendPoint[];
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function formatFullDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

function scoreColor(score: number): string {
  if (score >= 7) return "#22c55e";
  if (score >= 4) return "#eab308";
  return "#ef4444";
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: AttitudeTrendPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-foreground">
        {d.score} 分 &middot;{" "}
        <span style={{ color: scoreColor(d.score) }}>{d.label}</span>
      </p>
      <p className="text-[11px] text-muted">{formatFullDate(d.date)}</p>
    </div>
  );
}

export function AttitudeTrendChart({ attitudeTrend }: AttitudeTrendChartProps) {
  if (!attitudeTrend || attitudeTrend.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted">暂无沟通情绪数据，积累中...</p>
      </div>
    );
  }

  const data = attitudeTrend.map((d) => ({
    ...d,
    shortDate: formatDate(d.date),
  }));

  const lastPoint = attitudeTrend[attitudeTrend.length - 1];
  const prevPoint =
    attitudeTrend.length >= 2 ? attitudeTrend[attitudeTrend.length - 2] : null;

  const trendDirection = prevPoint
    ? lastPoint.score > prevPoint.score
      ? "up"
      : lastPoint.score < prevPoint.score
        ? "down"
        : "flat"
    : "flat";

  const trendText =
    trendDirection === "up"
      ? "升温 \u2191"
      : trendDirection === "down"
        ? "降温 \u2193"
        : "稳定 \u2192";

  const trendColor =
    trendDirection === "up"
      ? "text-positive"
      : trendDirection === "down"
        ? "text-danger"
        : "text-secondary";

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-secondary">
        沟通情绪趋势
      </p>

      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
            <defs>
              <linearGradient id="attitudeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                <stop offset="50%" stopColor="#eab308" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.15} />
              </linearGradient>
              <linearGradient id="strokeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" />
                <stop offset="50%" stopColor="#eab308" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="shortDate"
              tick={{ fontSize: 11, fill: "var(--color-muted, #888)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[1, 10]}
              ticks={[1, 3, 5, 7, 10]}
              tick={{ fontSize: 11, fill: "var(--color-muted, #888)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "var(--color-border, #333)", strokeDasharray: "4 4" }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="url(#strokeGradient)"
              strokeWidth={2.5}
              fill="url(#attitudeGradient)"
              dot={{ r: 4, fill: "#fff", stroke: "#6366f1", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "#6366f1", stroke: "#fff", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Trend summary */}
      <div className="mt-3 flex items-center gap-2 text-sm">
        <span className="text-muted">近期态度：</span>
        <span className={`font-semibold ${trendColor}`}>{trendText}</span>
        <span className="text-xs text-muted">
          （最新 {lastPoint.score} 分 &middot; {lastPoint.label}）
        </span>
      </div>
    </div>
  );
}
