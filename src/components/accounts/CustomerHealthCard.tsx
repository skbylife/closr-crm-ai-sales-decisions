"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { formatCurrency } from "@/lib/format-currency";
import {
  HeartPulse,
  CalendarClock,
  TrendingUp,
  CheckCircle2,
  Circle,
  AlertTriangle,
} from "lucide-react";

interface CustomerHealthCardProps {
  accountId: string;
}

function daysSince(dateStr: string): number {
  return Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function daysUntil(dateStr: string): number {
  return Math.floor(
    (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
}

export function CustomerHealthCard({ accountId }: CustomerHealthCardProps) {
  const { opportunities, tasks, intelItems, emailDecodes } = useStore();

  const wonOpps = useMemo(
    () =>
      opportunities.filter(
        (o) => o.accountId === accountId && o.stage === "closed_won"
      ),
    [opportunities, accountId]
  );

  const accountTasks = useMemo(
    () => tasks.filter((t) => t.accountId === accountId),
    [tasks, accountId]
  );

  // No won opportunities — don't show the card
  if (wonOpps.length === 0) return null;

  // ── Health Score Calculation ──
  const recentIntelCount = intelItems.filter(
    (i) =>
      i.accountId === accountId &&
      daysSince(i.date) <= 30
  ).length;

  const recentDecodeCount = emailDecodes.filter(
    (d) =>
      d.accountId === accountId &&
      daysSince(d.date) <= 30
  ).length;

  const interactionScore = Math.min(
    40,
    (recentIntelCount + recentDecodeCount) * 10
  );

  const totalTasks = accountTasks.length;
  const doneTasks = accountTasks.filter((t) => t.status === "done").length;
  const taskScore =
    totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 30) : 15;

  // Active opportunities health
  const activeOpps = opportunities.filter(
    (o) =>
      o.accountId === accountId &&
      o.stage !== "closed_won" &&
      o.stage !== "closed_lost"
  );
  const oppScore = wonOpps.length > 0 ? 20 : activeOpps.length > 0 ? 10 : 0;

  // Recency bonus
  const latestWon = wonOpps.reduce((latest, o) => {
    const d = o.wonDate || o.updatedAt;
    return d > latest ? d : latest;
  }, "");
  const daysSinceWon = latestWon ? daysSince(latestWon) : 999;
  const recencyScore = daysSinceWon <= 30 ? 10 : daysSinceWon <= 90 ? 5 : 0;

  const healthScore = Math.min(
    100,
    interactionScore + taskScore + oppScore + recencyScore
  );

  const healthLevel =
    healthScore >= 70 ? "healthy" : healthScore >= 40 ? "attention" : "at_risk";

  const healthConfig = {
    healthy: {
      label: "Healthy",
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      barColor: "bg-emerald-500",
    },
    attention: {
      label: "Needs Attention",
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-200",
      barColor: "bg-amber-500",
    },
    at_risk: {
      label: "At Risk",
      color: "text-red-600",
      bg: "bg-red-50",
      border: "border-red-200",
      barColor: "bg-red-500",
    },
  };

  const cfg = healthConfig[healthLevel];

  // ── Renewal calculation (wonDate + 365 days) ──
  const renewalInfo = wonOpps
    .filter((o) => o.wonDate)
    .map((o) => {
      const renewalDate = new Date(o.wonDate!);
      renewalDate.setFullYear(renewalDate.getFullYear() + 1);
      return {
        oppName: o.name,
        renewalDate: renewalDate.toISOString().split("T")[0],
        daysLeft: daysUntil(renewalDate.toISOString()),
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  // ── Delivery checklist progress ──
  const deliveryTasks = accountTasks.filter((t) =>
    t.labels?.includes("赢单交付")
  );
  const deliveryDone = deliveryTasks.filter((t) => t.status === "done").length;

  // ── Upsell signal ──
  const totalWonValue = wonOpps.reduce((sum, o) => sum + o.value, 0);

  return (
    <div
      className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 space-y-3`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HeartPulse className={`h-4 w-4 ${cfg.color}`} />
          <h3 className="text-sm font-semibold text-foreground">
            Customer Health
          </h3>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${cfg.color} ${cfg.border}`}
        >
          {healthScore} · {cfg.label}
        </span>
      </div>

      {/* Score bar */}
      <div className="h-2 w-full rounded-full bg-border">
        <div
          className={`h-2 rounded-full ${cfg.barColor} transition-all`}
          style={{ width: `${healthScore}%` }}
        />
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {/* Delivery progress */}
        {deliveryTasks.length > 0 && (
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Delivery</p>
              <p className="text-secondary">
                {deliveryDone}/{deliveryTasks.length} completed
              </p>
            </div>
          </div>
        )}

        {/* Renewal */}
        {renewalInfo.length > 0 && (
          <div className="flex items-start gap-2">
            <CalendarClock className="h-3.5 w-3.5 text-blue-500 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Renewal Date</p>
              {renewalInfo.slice(0, 2).map((r) => (
                <p key={r.oppName} className="text-secondary">
                  {r.renewalDate}
                  {r.daysLeft <= 60 && (
                    <span className="ml-1 text-amber-600 font-medium">
                      ({r.daysLeft}d left)
                    </span>
                  )}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Recent interactions */}
        <div className="flex items-start gap-2">
          <Circle className="h-3.5 w-3.5 text-blue-400 mt-0.5" />
          <div>
            <p className="font-medium text-foreground">Last 30d Activity</p>
            <p className="text-secondary">
              {recentIntelCount + recentDecodeCount} interactions
            </p>
          </div>
        </div>

        {/* Won deals value */}
        <div className="flex items-start gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-accent mt-0.5" />
          <div>
            <p className="font-medium text-foreground">Total Won</p>
            <p className="text-secondary font-mono">
              {formatCurrency(totalWonValue)}
            </p>
          </div>
        </div>
      </div>

      {/* Upsell suggestion */}
      {wonOpps.length >= 2 && (
        <div className="flex items-center gap-2 rounded-lg border border-accent/20 bg-card/50 px-3 py-2 text-xs">
          <TrendingUp className="h-3.5 w-3.5 text-accent" />
          <span className="text-foreground">
            This account has {wonOpps.length} closed-won deals.{' '}
            <span className="font-semibold text-accent">Consider evaluating upsell opportunities</span>
          </span>
        </div>
      )}

      {/* Renewal warning */}
      {renewalInfo.some((r) => r.daysLeft <= 60 && r.daysLeft > 0) && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-card/50 px-3 py-2 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-foreground">
            Contract renewal within 60 days.{' '}
            <span className="font-semibold text-amber-600">Start renewal preparation</span>
          </span>
        </div>
      )}
    </div>
  );
}
