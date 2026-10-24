"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  TrendingUp,
  Lightbulb,
  Zap,
  ShieldAlert,
  Target,
  Clock,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { Account } from "@/lib/babel-engine/types";
import { formatCurrency } from "@/lib/format-currency";
import { MOMENTUM_CONFIG } from "@/lib/permissions";
import type { PlayMomentum, StrategicPlay, OpportunityStage } from "@/lib/babel-engine/types";

// ─── Stage probabilities for weighted pipeline ──────────────────────
const STAGE_PROBABILITY: Record<OpportunityStage, number> = {
  lead_identified: 5,
  discovery: 15,
  solution_presented: 30,
  proposal_sent: 40,
  negotiation: 60,
  contract_review: 80,
  closed_won: 100,
  closed_lost: 0,
};

// ─── Types ──────────────────────────────────────────────────────────
interface AttentionItem {
  severity: "blocked" | "slowing" | "assumption" | "no_play";
  accountName: string;
  playName?: string;
  problem: string;
  daysSinceProgress?: number;
  suggestedAction: string;
  playId?: string;
  accountId: string;
}

interface PortfolioInsight {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  severity: "danger" | "warning" | "info" | "positive";
}

// ─── Helpers ────────────────────────────────────────────────────────
function getAccountName(accounts: Account[], accountId: string): string {
  return accounts.find((a) => a.id === accountId)?.name || "未知客户";
}

function isActivePipeline(stage: OpportunityStage): boolean {
  return stage !== "closed_won" && stage !== "closed_lost";
}

// ─── Section wrapper (matches dashboard SectionCard) ────────────────
function SectionCard({
  title,
  icon: Icon,
  iconColor,
  badge,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  badge?: string | number;
  children: React.ReactNode;
}) {
  return (
    <div className="card-elevated overflow-hidden rounded-2xl border border-border-subtle bg-card">
      <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-subtle bg-background/85">
          <Icon className={`h-4 w-4 ${iconColor || "text-accent"}`} />
        </div>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {badge !== undefined && (
          <span className="ml-auto rounded-full border border-border-subtle bg-background/90 px-2.5 py-1 text-[13px] font-semibold text-secondary">
            {badge}
          </span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Stat card (matches dashboard StatCard) ─────────────────────────
function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-secondary">{label}</p>
      <p className="mt-2 text-[1.9rem] font-semibold leading-none tabular-nums text-foreground">{value}</p>
      {sub && <p className="mt-2 text-[13px] text-secondary">{sub}</p>}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────
export default function PortfolioOverview() {
  const { accounts, opportunities } = useStore();
  const currency = useStore((s) => s.currencyCode);
  const [plays, setPlays] = useState<StrategicPlay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/strategic-play")
      .then((r) => r.json())
      .then((d) => setPlays(d.plays ?? []))
      .catch(() => setPlays([]))
      .finally(() => setLoading(false));
  }, []);

  // ─── Derived data ───────────────────────────────────────────────
  const activePlays = useMemo(() => plays.filter((p) => p.status === "active" || p.status === "in_progress"), [plays]);

  const activeOpps = useMemo(() => opportunities.filter((o) => isActivePipeline(o.stage)), [opportunities]);

  const pipelineTotal = useMemo(() => activeOpps.reduce((sum, o) => sum + o.value, 0), [activeOpps]);

  const weightedPipeline = useMemo(
    () => activeOpps.reduce((sum, o) => sum + o.value * (STAGE_PROBABILITY[o.stage] / 100), 0),
    [activeOpps]
  );

  const avgConfidence = useMemo(() => {
    if (activePlays.length === 0) return 0;
    return Math.round(activePlays.reduce((sum, p) => sum + p.confidence, 0) / activePlays.length);
  }, [activePlays]);

  const momentumCounts = useMemo(() => {
    const counts: Record<PlayMomentum, number> = { progressing: 0, active: 0, slowing: 0, stalled: 0, blocked: 0 };
    activePlays.forEach((p) => {
      if (counts[p.momentum] !== undefined) counts[p.momentum]++;
    });
    return counts;
  }, [activePlays]);

  // ─── Section B: Attention Required ──────────────────────────────
  const attentionItems = useMemo(() => {
    const items: AttentionItem[] = [];

    // Blocked / Stalled plays (14+ days)
    activePlays
      .filter((p) => p.momentum === "blocked" || p.momentum === "stalled" || p.daysSinceProgress >= 14)
      .forEach((p) => {
        items.push({
          severity: "blocked",
          accountName: getAccountName(accounts, p.accountId),
          playName: p.goalDescription,
          problem: p.momentum === "blocked" ? "谋局受阻" : `已停滞 ${p.daysSinceProgress} 天`,
          daysSinceProgress: p.daysSinceProgress,
          suggestedAction: "检查阻碍因素，考虑替代路径",
          playId: p.id,
          accountId: p.accountId,
        });
      });

    // Slowing plays (7-14 days)
    activePlays
      .filter((p) => p.momentum === "slowing" || (p.daysSinceProgress >= 7 && p.daysSinceProgress < 14))
      .filter((p) => p.momentum !== "blocked" && p.momentum !== "stalled" && p.daysSinceProgress < 14)
      .forEach((p) => {
        items.push({
          severity: "slowing",
          accountName: getAccountName(accounts, p.accountId),
          playName: p.goalDescription,
          problem: `推进放缓，${p.daysSinceProgress} 天无进展`,
          daysSinceProgress: p.daysSinceProgress,
          suggestedAction: "安排跟进动作，推动下一步",
          playId: p.id,
          accountId: p.accountId,
        });
      });

    // Invalidated assumptions
    activePlays
      .filter((p) => p.assumptions?.some((a) => a.status === "invalidated"))
      .forEach((p) => {
        const invalidCount = p.assumptions.filter((a) => a.status === "invalidated").length;
        items.push({
          severity: "assumption",
          accountName: getAccountName(accounts, p.accountId),
          playName: p.goalDescription,
          problem: `${invalidCount} 个假设已被推翻`,
          daysSinceProgress: p.daysSinceProgress,
          suggestedAction: "重新评估谋局策略，调整路径",
          playId: p.id,
          accountId: p.accountId,
        });
      });

    // High-value deals without active plays
    const accountsWithPlays = new Set(activePlays.map((p) => p.accountId));
    activeOpps
      .filter((o) => o.value > 0 && !accountsWithPlays.has(o.accountId))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .forEach((o) => {
        items.push({
          severity: "no_play",
          accountName: getAccountName(accounts, o.accountId),
          problem: `${formatCurrency(o.value, currency)} 商机无谋局覆盖`,
          suggestedAction: "为该商机创建谋局，提升赢率",
          accountId: o.accountId,
        });
      });

    return items;
  }, [activePlays, activeOpps, accounts, currency]);

  // ─── Section C: High Momentum ───────────────────────────────────
  const highMomentumPlays = useMemo(() => {
    return activePlays
      .filter(
        (p) =>
          p.momentum === "progressing" ||
          p.confidence > 70 ||
          (p.daysSinceProgress < 3 && p.momentum !== "blocked" && p.momentum !== "stalled")
      )
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 6);
  }, [activePlays]);

  // ─── Section D: Portfolio Insights ──────────────────────────────
  const insights = useMemo(() => {
    const result: PortfolioInsight[] = [];

    // Concentration risk
    if (activeOpps.length >= 2 && weightedPipeline > 0) {
      const sorted = [...activeOpps].sort(
        (a, b) => b.value * (STAGE_PROBABILITY[b.stage] / 100) - a.value * (STAGE_PROBABILITY[a.stage] / 100)
      );
      const top2Weighted =
        sorted.slice(0, 2).reduce((s, o) => s + o.value * (STAGE_PROBABILITY[o.stage] / 100), 0);
      const pct = Math.round((top2Weighted / weightedPipeline) * 100);
      if (pct > 40) {
        result.push({
          icon: ShieldAlert,
          label: "集中度风险",
          description: `${pct}% 加权管线集中在 2 个商机，建议分散风险`,
          severity: pct > 60 ? "danger" : "warning",
        });
      }
    }

    // Coverage gap
    const accountsWithPlays = new Set(activePlays.map((p) => p.accountId));
    const uncoveredAccounts = [...new Set(activeOpps.map((o) => o.accountId))].filter(
      (id) => !accountsWithPlays.has(id)
    );
    if (uncoveredAccounts.length > 0) {
      result.push({
        icon: Target,
        label: "覆盖缺口",
        description: `${uncoveredAccounts.length} 个有活跃商机的客户没有谋局覆盖`,
        severity: uncoveredAccounts.length >= 3 ? "warning" : "info",
      });
    }

    // Velocity trend
    const closedWon = opportunities.filter((o) => o.stage === "closed_won" && o.wonDate && o.createdAt);
    if (closedWon.length >= 2) {
      const cycles = closedWon.map((o) => {
        const created = new Date(o.createdAt).getTime();
        const won = new Date(o.wonDate!).getTime();
        return Math.round((won - created) / (1000 * 60 * 60 * 24));
      });
      const avgCycle = Math.round(cycles.reduce((s, c) => s + c, 0) / cycles.length);
      result.push({
        icon: Clock,
        label: "成交周期",
        description: `平均成交周期 ${avgCycle} 天（基于 ${closedWon.length} 个已成交商机）`,
        severity: "info",
      });
    }

    // Play effect
    const wonOpps = opportunities.filter((o) => o.stage === "closed_won");
    const lostOpps = opportunities.filter((o) => o.stage === "closed_lost");
    const totalClosed = wonOpps.length + lostOpps.length;
    if (totalClosed >= 4) {
      const oppsWithPlays = new Set(plays.map((p) => p.opportunityId).filter(Boolean));
      const wonWithPlay = wonOpps.filter((o) => oppsWithPlays.has(o.id)).length;
      const totalWithPlay = [...wonOpps, ...lostOpps].filter((o) => oppsWithPlays.has(o.id)).length;
      const wonWithout = wonOpps.length - wonWithPlay;
      const totalWithout = totalClosed - totalWithPlay;

      if (totalWithPlay > 0 && totalWithout > 0) {
        const rateWith = wonWithPlay / totalWithPlay;
        const rateWithout = wonWithout / totalWithout;
        if (rateWithout > 0) {
          const multiplier = (rateWith / rateWithout).toFixed(1);
          result.push({
            icon: Zap,
            label: "谋局效果",
            description: `有谋局的商机转化率是无谋局的 ${multiplier}x`,
            severity: Number(multiplier) >= 1.5 ? "positive" : "info",
          });
        }
      }
    }

    return result;
  }, [activeOpps, activePlays, opportunities, plays, weightedPipeline]);

  // ─── Severity styling ───────────────────────────────────────────
  const severityStyle: Record<AttentionItem["severity"], { dot: string; bg: string }> = {
    blocked: { dot: "bg-danger", bg: "bg-danger/5" },
    slowing: { dot: "bg-warning", bg: "bg-warning/5" },
    assumption: { dot: "bg-orange-500", bg: "bg-orange-500/5" },
    no_play: { dot: "bg-secondary", bg: "bg-secondary/5" },
  };

  const insightSeverityColor: Record<string, string> = {
    danger: "text-danger",
    warning: "text-warning",
    info: "text-accent",
    positive: "text-positive",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Section A: Portfolio Health */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MiniStat label="总管线" value={formatCurrency(pipelineTotal, currency)} sub={`加权: ${formatCurrency(weightedPipeline, currency)}`} />
        <MiniStat label="活跃谋局" value={String(activePlays.length)} sub={`平均信心: ${avgConfidence}%`} />
        <MiniStat
          label="势头分布"
          value={`${momentumCounts.progressing + momentumCounts.active}`}
          sub={`推进 ${momentumCounts.progressing} · 活跃 ${momentumCounts.active}`}
        />
        <MiniStat
          label="需关注"
          value={`${momentumCounts.slowing + momentumCounts.stalled + momentumCounts.blocked}`}
          sub={`放缓 ${momentumCounts.slowing} · 停滞 ${momentumCounts.stalled} · 受阻 ${momentumCounts.blocked}`}
        />
      </div>

      {/* Section B: Attention Required */}
      <SectionCard title="需要关注" icon={AlertTriangle} iconColor="text-warning" badge={attentionItems.length}>
        {attentionItems.length === 0 ? (
          <p className="text-sm text-secondary">暂无需要关注的事项，一切顺利。</p>
        ) : (
          <div className="space-y-3">
            {attentionItems.slice(0, 8).map((item, i) => {
              const style = severityStyle[item.severity];
              return (
                <div key={i} className={`flex items-start gap-3 rounded-xl ${style.bg} px-4 py-3`}>
                  <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-foreground">{item.accountName}</span>
                      {item.playName && (
                        <span className="truncate text-[14px] text-secondary">· {item.playName}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[14px] text-secondary">{item.problem}</p>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-accent">
                      <ArrowRight className="h-3 w-3" />
                      <span>{item.suggestedAction}</span>
                    </div>
                  </div>
                  {item.daysSinceProgress !== undefined && (
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums text-secondary">
                      {item.daysSinceProgress}天
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Section C: High Momentum */}
      <SectionCard title="高势头谋局" icon={TrendingUp} iconColor="text-positive" badge={highMomentumPlays.length}>
        {highMomentumPlays.length === 0 ? (
          <p className="text-sm text-secondary">暂无高势头谋局。</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {highMomentumPlays.map((play) => {
              const mc = MOMENTUM_CONFIG[play.momentum];
              const verifiedCount = play.assumptions?.filter((a) => a.status === "verified").length ?? 0;
              return (
                <div
                  key={play.id}
                  className="flex items-start gap-3 rounded-xl border border-border-subtle bg-background/50 px-4 py-3"
                >
                  <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${mc?.dotColor || "bg-accent"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-foreground">
                        {getAccountName(accounts, play.accountId)}
                      </span>
                      <span className={`text-[13px] font-semibold ${mc?.color || "text-accent"}`}>
                        {mc?.label || play.momentum}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[14px] text-secondary">{play.goalDescription}</p>
                    <div className="mt-1.5 flex items-center gap-3 text-[13px] text-secondary">
                      <span>信心 {play.confidence}%</span>
                      {verifiedCount > 0 && (
                        <span className="flex items-center gap-1 text-positive">
                          <CheckCircle2 className="h-3 w-3" />
                          {verifiedCount} 已验证
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Section D: Portfolio Insights */}
      <SectionCard title="Portfolio 洞察" icon={Lightbulb} iconColor="text-accent" badge={insights.length}>
        {insights.length === 0 ? (
          <p className="text-sm text-secondary">数据不足，暂无洞察。当有更多商机和谋局数据时，系统将自动生成分析。</p>
        ) : (
          <div className="space-y-3">
            {insights.map((insight, i) => {
              const InsightIcon = insight.icon;
              const color = insightSeverityColor[insight.severity] || "text-accent";
              return (
                <div key={i} className="flex items-start gap-3 rounded-xl border border-border-subtle bg-background/50 px-4 py-3">
                  <InsightIcon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
                  <div>
                    <span className={`text-[15px] font-semibold ${color}`}>{insight.label}</span>
                    <span className="text-[15px] text-secondary"> — {insight.description}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
