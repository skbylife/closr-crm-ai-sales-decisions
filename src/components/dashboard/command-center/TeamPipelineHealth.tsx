"use client";

/**
 * TeamPipelineHealth — 管理者专属：团队商机健康概览
 *
 * 显示团队活跃 deal 总量、总金额、高危数、逾期任务数。
 * 数据来自 /api/daily-briefing?scope=team
 */

import { useState, useEffect } from "react";
import { Users, TrendingUp, AlertTriangle, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/format-currency";

interface TeamSummary {
  totalActiveDeals: number;
  totalPipelineValue: number;
  criticalDeals: number;
  atRiskDeals: number;
  dueTasksToday: number;
  overdueTasks: number;
}

export function TeamPipelineHealth() {
  const [summary, setSummary] = useState<TeamSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/daily-briefing?scope=team")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled) setSummary(data?.briefing?.summary ?? null);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1,2,3,4].map(i => <div key={i} className="h-14 rounded-lg skeleton" />)}
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <MiniKpi icon={Users} label="团队活跃商机" value={String(summary.totalActiveDeals)} />
      <MiniKpi icon={TrendingUp} label="商机总额" value={formatCurrency(summary.totalPipelineValue)} />
      <MiniKpi icon={AlertTriangle} label="高危/风险" value={`${summary.criticalDeals} / ${summary.atRiskDeals}`} danger={summary.criticalDeals > 0} />
      <MiniKpi icon={Clock} label="今日待办/逾期" value={`${summary.dueTasksToday} / ${summary.overdueTasks}`} danger={summary.overdueTasks > 0} />
    </div>
  );
}

function MiniKpi({ icon: Icon, label, value, danger = false }: { icon: typeof Users; label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${danger ? 'border-danger/30 bg-danger/[0.04]' : 'border-border bg-card'}`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className={`h-3 w-3 ${danger ? 'text-danger' : 'text-muted'}`} />
        <span className="text-[10px] text-muted">{label}</span>
      </div>
      <p className={`text-sm font-bold tabular-nums ${danger ? 'text-danger' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
