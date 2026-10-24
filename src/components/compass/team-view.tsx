"use client";

import { useState, useEffect, useMemo } from "react";
import { Users, AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { useEffectiveJobLevel } from "@/hooks/use-effective-job-level";
import { formatCurrency, type CurrencyCode } from "@/lib/format-currency";
import { MOMENTUM_CONFIG } from "@/lib/permissions";
import type {
  StrategicPlay,
  OpportunityStage,
  OrgMember,
  Account,
} from "@/lib/babel-engine/types";
import { getOpportunityOwnerUserId } from "@/lib/opportunity-ownership";

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

function isActivePipeline(stage: OpportunityStage): boolean {
  return stage !== "closed_won" && stage !== "closed_lost";
}

function isActivePlay(p: StrategicPlay): boolean {
  return p.status === "active" || p.status === "in_progress";
}

function getMemberDisplayName(m: OrgMember): string {
  if (m.displayName) return m.displayName;
  if (m.email)
    return m.email
      .split("@")[0]
      .replace(/[._-]/g, " ")
      .split(" ")
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  return m.userId.slice(0, 8);
}

function getRoleLabel(m: OrgMember): string {
  const level = m.jobLevel ?? 0;
  if (level >= 3) return "VP";
  if (level === 2) return "Director";
  if (level === 1) return "Manager";
  return "AE";
}

function getAccountName(accounts: Account[], accountId: string): string {
  return accounts.find((a) => a.id === accountId)?.name || "未知客户";
}

// ─── Member Card ────────────────────────────────────────────────────

interface MemberStats {
  member: OrgMember;
  activePlays: StrategicPlay[];
  avgConfidence: number;
  pipeline: number;
  weighted: number;
  topPlays: StrategicPlay[];
  stalledPlays: StrategicPlay[];
}

function MemberCard({
  stats,
  accounts,
  currency,
}: {
  stats: MemberStats;
  accounts: Account[];
  currency: CurrencyCode;
}) {
  const { member, activePlays, avgConfidence, pipeline, weighted, topPlays, stalledPlays } = stats;

  return (
    <div className="card-elevated overflow-hidden rounded-2xl border border-border-subtle bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-subtle bg-background/85">
          <Users className="h-4 w-4 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            {getMemberDisplayName(member)}
            <span className="ml-2 text-[13px] font-normal text-secondary">（{getRoleLabel(member)}）</span>
          </h3>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-secondary">活跃谋局</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{activePlays.length}</p>
          </div>
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-secondary">平均信心</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{avgConfidence}%</p>
          </div>
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-secondary">管线</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatCurrency(pipeline, currency)}</p>
          </div>
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-secondary">加权</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatCurrency(weighted, currency)}</p>
          </div>
        </div>

        {/* Top plays */}
        {topPlays.length > 0 && (
          <div className="space-y-2">
            {topPlays.map((play) => {
              const mc = MOMENTUM_CONFIG[play.momentum];
              const completedSteps = play.steps?.filter((s) => s.status === "completed").length ?? 0;
              const totalSteps = play.steps?.length ?? 0;
              const stalledDays = play.daysSinceProgress >= 14 ? play.daysSinceProgress : 0;
              return (
                <div
                  key={play.id}
                  className="flex items-center gap-3 rounded-xl border border-border-subtle bg-background/50 px-4 py-2.5"
                >
                  <div className={`h-2 w-2 shrink-0 rounded-full ${mc?.dotColor || "bg-accent"}`} />
                  <div className="min-w-0 flex-1">
                    <span className="text-[15px] font-semibold text-foreground">
                      {getAccountName(accounts, play.accountId)}
                    </span>
                    <span className="mx-1.5 text-[14px] text-secondary">·</span>
                    <span className="text-[14px] text-secondary truncate">{play.goalDescription}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[13px] font-semibold ${mc?.color || "text-accent"}`}>
                      {play.confidence}%
                    </span>
                    <span className="text-[13px] text-secondary">
                      {completedSteps}/{totalSteps} 步
                    </span>
                    {stalledDays > 0 && (
                      <span className="text-[13px] font-semibold text-orange-500">
                        停滞 {stalledDays} 天
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activePlays.length === 0 && (
          <p className="text-sm text-secondary">暂无活跃谋局。</p>
        )}

        {/* Coaching hint for stalled plays */}
        {stalledPlays.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl bg-warning/5 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="text-[14px] font-semibold text-foreground">需要关注</p>
              {stalledPlays.map((p) => (
                <p key={p.id} className="mt-0.5 text-[14px] text-secondary">
                  {getAccountName(accounts, p.accountId)} 谋局已停滞 {p.daysSinceProgress} 天，建议 coaching
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function TeamView() {
  const { accounts, opportunities } = useStore();
  const currency = useStore((s) => s.currencyCode);
  const { orgMembers, user } = useAuth();
  const jobLevel = useEffectiveJobLevel();
  const [plays, setPlays] = useState<StrategicPlay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/strategic-play")
      .then((r) => r.json())
      .then((d) => setPlays(d.plays ?? []))
      .catch(() => setPlays([]))
      .finally(() => setLoading(false));
  }, []);

  // Build per-member stats — 按 jobLevel/team 过滤可见成员（与 performance 页口径一致）
  // 注意：TeamView 是管理者 coaching 视图，故排除自己只展示下属；
  // Performance 页是排行榜视图，包含自己。两者 visibleMembers 逻辑一致，仅是否含自己不同。
  const memberStats = useMemo(() => {
    let visibleMembers: OrgMember[];
    if (jobLevel >= 2) {
      visibleMembers = orgMembers;
    } else {
      const me = orgMembers.find((m) => m.userId === user?.id);
      if (jobLevel === 1 && me?.teamId) {
        visibleMembers = orgMembers.filter((m) => m.teamId === me.teamId);
      } else {
        visibleMembers = me ? [me] : [];
      }
    }
    // 排除自己 — coaching 视图只展示下属
    const members = visibleMembers.filter((m) => m.userId !== user?.id);
    if (members.length === 0) return [];

    return members.map((member): MemberStats => {
      const memberPlays = plays.filter((p) => p.userId === member.userId);
      const active = memberPlays.filter(isActivePlay);
      const avgConf = active.length > 0
        ? Math.round(active.reduce((s, p) => s + p.confidence, 0) / active.length)
        : 0;

      // Pipeline for this member's opportunities
      const memberOpps = opportunities.filter(
        (o) => getOpportunityOwnerUserId(o) === member.userId && isActivePipeline(o.stage)
      );
      const pipe = memberOpps.reduce((s, o) => s + o.value, 0);
      const weight = memberOpps.reduce(
        (s, o) => s + o.value * (STAGE_PROBABILITY[o.stage] / 100),
        0
      );

      // Top plays (up to 5, sorted by confidence desc)
      const top = [...active]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5);

      // Stalled plays (14+ days)
      const stalled = active.filter((p) => p.daysSinceProgress >= 14);

      return {
        member,
        activePlays: active,
        avgConfidence: avgConf,
        pipeline: pipe,
        weighted: weight,
        topPlays: top,
        stalledPlays: stalled,
      };
    });
  }, [orgMembers, plays, opportunities, user?.id, jobLevel]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (memberStats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Users className="mb-3 h-8 w-8 text-secondary" />
        <p className="text-sm text-secondary">暂无团队成员数据。</p>
      </div>
    );
  }

  // Team-level summary
  const totalActivePlays = memberStats.reduce((s, m) => s + m.activePlays.length, 0);
  const totalPipeline = memberStats.reduce((s, m) => s + m.pipeline, 0);
  const totalWeighted = memberStats.reduce((s, m) => s + m.weighted, 0);
  const totalStalled = memberStats.reduce((s, m) => s + m.stalledPlays.length, 0);

  return (
    <div className="space-y-5">
      {/* Team summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="stat-card">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-secondary">下属成员</p>
          <p className="mt-2 text-[1.9rem] font-semibold leading-none tabular-nums text-foreground">{memberStats.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-secondary">活跃谋局</p>
          <p className="mt-2 text-[1.9rem] font-semibold leading-none tabular-nums text-foreground">{totalActivePlays}</p>
        </div>
        <div className="stat-card">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-secondary">团队管线</p>
          <p className="mt-2 text-[1.9rem] font-semibold leading-none tabular-nums text-foreground">{formatCurrency(totalPipeline, currency)}</p>
          <p className="mt-2 text-[13px] text-secondary">加权: {formatCurrency(totalWeighted, currency)}</p>
        </div>
        <div className="stat-card">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-secondary">需关注</p>
          <p className="mt-2 text-[1.9rem] font-semibold leading-none tabular-nums text-foreground">{totalStalled}</p>
          <p className="mt-2 text-[13px] text-secondary">停滞 14+ 天的谋局</p>
        </div>
      </div>

      {/* Per-member cards */}
      <div className="space-y-4">
        {memberStats.map((stats) => (
          <MemberCard
            key={stats.member.id}
            stats={stats}
            accounts={accounts}
            currency={currency}
          />
        ))}
      </div>
    </div>
  );
}
