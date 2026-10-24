"use client";

import { TrendingUp, Award, Clock, Target } from "lucide-react";
import { formatCurrency } from "@/lib/format-currency";
import { StatCard } from "@/components/ui/stat-card";
import { useStore } from "@/lib/store";

export interface SummaryStatsRowProps {
  activePipelineValue: number;
  wonThisMonthValue: number;
  wonThisMonthCount: number;
  avgSalesCycle: number | null;
  conversionRate: number | null;
  pipelineVelocity: number | null;
}

export function SummaryStatsRow({
  activePipelineValue,
  wonThisMonthValue,
  wonThisMonthCount,
  avgSalesCycle,
  conversionRate,
  pipelineVelocity,
}: SummaryStatsRowProps) {
  const currency = useStore((s) => s.currencyCode);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="stat-card">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-secondary">活跃管线</p>
              <p className="mt-2 text-xl sm:text-[1.9rem] font-semibold leading-none tabular-nums text-foreground truncate">
                {formatCurrency(activePipelineValue, currency)}
              </p>
              {pipelineVelocity !== null && (
                <p className="mt-2 text-[13px] font-medium text-muted">
                  管线流速: {formatCurrency(Math.round(pipelineVelocity), currency)}/月
                </p>
              )}
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border-subtle bg-positive/10">
              <TrendingUp className="h-5 w-5 text-positive" />
            </div>
          </div>
        </div>
        <StatCard
          label="本月赢单"
          value={wonThisMonthCount > 0 ? formatCurrency(wonThisMonthValue, currency) : '—'}
          icon={Award}
          iconBg="bg-warning/10"
          iconColor="text-warning"
          trend={wonThisMonthCount > 0 ? { value: `${wonThisMonthCount} 单`, positive: true } : undefined}
        />
        <StatCard
          label="平均销售周期"
          value={avgSalesCycle !== null ? `${avgSalesCycle} 天` : '—'}
          icon={Clock}
          iconBg="bg-blue-50"
          iconColor="text-blue-500"
        />
        <StatCard
          label="转化率"
          value={conversionRate !== null ? `${conversionRate}%` : '—'}
          icon={Target}
          iconBg="bg-accent/8"
          iconColor="text-accent"
        />
      </div>
    </div>
  );
}
