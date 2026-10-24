"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Target,
  ChevronRight,
  ChevronDown,
  Clock,
  AlertTriangle,
  MessageSquarePlus,
  CheckCircle2,
  BookOpen,
} from "lucide-react";

import { SpotlightTour, type TourStep } from "@/components/onboarding/SpotlightTour";
import { useLocale } from "@/lib/i18n";
import { visibleBusinessText } from "@/lib/visible-business-text";

const PLAYS_TOUR_STEPS: TourStep[] = [
  {
    target: "body",
    title: "谋局 — 策略指挥中心",
    content: "为每个客户制定推进策略。拆解步骤、设定假设、追踪进展。AI 自动分析哪些局需要关注。选一个最重要的客户，创建你的第一个谋局方案。",
    position: "bottom",
  },
  {
    target: "[data-tour='plays-hero']",
    title: "谋局指挥中心",
    content: "这里展示所有活跃的推进策略。每个谋局都有目标、步骤和进度追踪。",
    position: "bottom",
  },
  {
    target: "[data-tour='plays-tabs']",
    title: "两种视角",
    content: "按客户分组查看，或按动量排序——快速发现哪些局需要推进、哪些已停滞。",
    position: "bottom",
  },
  {
    target: "[data-tour='plays-list']",
    title: "谋局卡片",
    content: "每个谋局默认展示完整步骤、假设、进度条和风险预警，方便直接进入推进判断。",
    position: "top",
  },
];
const PLAYS_TOUR_STEPS_EN: TourStep[] = [
  { target: "body", title: "Account Plans", content: "Create account advancement plans, break them into steps, define assumptions, and track progress.", position: "bottom" },
  { target: "[data-tour='plays-hero']", title: "Account Plan Center", content: "This board shows every active account plan, including goals, steps, and progress tracking.", position: "bottom" },
  { target: "[data-tour='plays-tabs']", title: "Two views", content: "Group by account or sort by momentum to quickly find plans that need action or have stalled.", position: "bottom" },
  { target: "[data-tour='plays-list']", title: "Plan cards", content: "Each plan shows steps, assumptions, progress, and risk alerts so you can move directly into execution review.", position: "top" },
];
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { MOMENTUM_CONFIG } from "@/lib/permissions";
import { StrategicPlayJudgmentBriefCard } from "@/components/judgment/strategic-play-judgment-brief-card";
import { JudgmentTraceBanner } from "@/components/judgment/judgment-trace-banner";
import { StrategicPlayActionBoard } from "@/components/pallas/StrategicPlayActionBoard";
import { buildPlaysTraceNarrative } from "@/lib/judgment/trace-narrative";
import { normalizePlayStepExecutionStatus } from "@/lib/strategic-play-execution";
import {
  buildStrategicPlayActionBoardData,
  isPallasActionBoardPreviewEnabled,
} from "@/lib/pallas/strategic-play-action-board";
import type { PallasActionProposal } from "@/lib/pallas/types";
import type { OrgMember } from "@/lib/babel-engine/types";
import type {
  StrategicPlay,
  PlayMomentum,
  PlayRelationship,
  PlayStep,
} from "@/lib/babel-engine/types";

// ─── Types ──────────────────────────────────────────────────────────

type PlaysTab = "by-account" | "by-momentum";

const MOMENTUM_ORDER: PlayMomentum[] = [
  "blocked",
  "stalled",
  "slowing",
  "active",
  "progressing",
];

const RELATIONSHIP_LABELS: Record<string, string> = {
  supports: "支撑",
  depends_on: "依赖",
  conflicts: "冲突",
};
const RELATIONSHIP_LABELS_EN: Record<string, string> = {
  supports: "Supports",
  depends_on: "Depends on",
  conflicts: "Conflicts",
};

function momentumLabel(momentum: PlayMomentum, fallback: string, en: boolean): string {
  if (!en) return fallback;
  return {
    progressing: "Progressing",
    active: "Active",
    slowing: "Slowing",
    stalled: "Stalled",
    blocked: "Blocked",
  }[momentum] ?? momentum;
}

// ─── Page ───────────────────────────────────────────────────────────

export default function PlaysPage() {
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const en = locale === "en";
  const [activeTab, setActiveTab] = useState<PlaysTab>("by-account");
  const [plays, setPlays] = useState<StrategicPlay[]>([]);
  const [relationships, setRelationships] = useState<PlayRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const showPallasActionBoard = isPallasActionBoardPreviewEnabled(searchParams);

  // 从情报信号跳转过来时，保留 query 读取入口；创建谋局表单接入后再消费。
  searchParams?.get("intelSignal");
  const { orgMembers } = useAuth();
  const accounts = useStore((s) => s.accounts);
  const opportunities = useStore((s) => s.opportunities);

  // Account name lookup
  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts) map.set(a.id, a.name);
    return map;
  }, [accounts]);

  // Opportunity name lookup
  const oppMap = useMemo(() => {
    const map = new Map<string, { name: string; value: number }>();
    for (const o of opportunities) map.set(o.id, { name: o.name, value: o.value });
    return map;
  }, [opportunities]);

  // Fetch plays
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/strategic-play");
        if (!res.ok) {
          console.error(`[plays] Fetch failed: ${res.status}`);
          return;
        }
        const data = (await res.json()) as { plays: StrategicPlay[] };
        if (cancelled) return;

        const activePlays = (data.plays ?? []).filter(
          (p) => p.status === "active" || p.status === "in_progress"
        );
        setPlays(activePlays);

        // Fetch relationships for all plays in parallel
        const playIds = activePlays.map((p) => p.id);
        if (playIds.length > 0) {
          const relResults = await Promise.all(
            playIds.map((id) =>
              fetch(`/api/play-relationships?sourcePlayId=${id}`)
                .then((r) => r.json())
                .then((d: { relationships?: PlayRelationship[] }) => d.relationships ?? [])
                .catch(() => [] as PlayRelationship[])
            )
          );
          if (!cancelled) {
            const seen = new Set<string>();
            const allRels: PlayRelationship[] = [];
            for (const batch of relResults) {
              for (const r of batch) {
                if (!seen.has(r.id)) {
                  seen.add(r.id);
                  allRels.push(r);
                }
              }
            }
            setRelationships(allRels);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Play → relationships map
  const playRelMap = useMemo(() => {
    const map = new Map<string, { rel: PlayRelationship; targetPlay: StrategicPlay | null }[]>();
    const playById = new Map(plays.map((p) => [p.id, p]));
    for (const r of relationships) {
      const arr = map.get(r.sourcePlayId) ?? [];
      arr.push({ rel: r, targetPlay: playById.get(r.targetPlayId) ?? null });
      map.set(r.sourcePlayId, arr);
    }
    return map;
  }, [plays, relationships]);

  // Group by account
  const byAccount = useMemo(() => {
    const accountIds = new Set<string>();
    for (const a of accounts) accountIds.add(a.id);
    for (const p of plays) accountIds.add(p.accountId);

    const groups: {
      accountId: string;
      accountName: string;
      accountPlays: StrategicPlay[];
      opportunityPlays: StrategicPlay[];
    }[] = [];

    for (const accountId of accountIds) {
      const accountPlays = plays.filter(
        (p) => p.accountId === accountId && !p.opportunityId
      );
      const opportunityPlays = plays.filter(
        (p) => p.accountId === accountId && !!p.opportunityId
      );
      if (accountPlays.length === 0 && opportunityPlays.length === 0) {
        groups.push({
          accountId,
          accountName: accountMap.get(accountId) ?? accountId,
          accountPlays: [],
          opportunityPlays: [],
        });
      } else {
        groups.push({
          accountId,
          accountName: accountMap.get(accountId) ?? accountId,
          accountPlays,
          opportunityPlays,
        });
      }
    }

    groups.sort((a, b) => {
      const aHas = a.accountPlays.length + a.opportunityPlays.length > 0 ? 0 : 1;
      const bHas = b.accountPlays.length + b.opportunityPlays.length > 0 ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      return a.accountName.localeCompare(b.accountName);
    });

    return groups;
  }, [accounts, plays, accountMap]);

  // Sort by momentum
  const byMomentum = useMemo(() => {
    return [...plays].sort((a, b) => {
      const ai = MOMENTUM_ORDER.indexOf(a.momentum);
      const bi = MOMENTUM_ORDER.indexOf(b.momentum);
      return ai - bi;
    });
  }, [plays]);

  const playsTraceNarrative = useMemo(() => buildPlaysTraceNarrative({
    activePlayCount: plays.length,
    blockedOrStalledCount: plays.filter((play) => ['blocked', 'stalled', 'slowing'].includes(play.momentum)).length,
    relationshipConflictCount: relationships.filter((item) => item.relationship === 'conflicts').length,
    uncoveredAccountCount: byAccount.filter((group) => group.accountPlays.length + group.opportunityPlays.length === 0).length,
    locale,
  }), [byAccount, locale, plays, relationships]);

  return (
    <div className="page-shell">
      <SpotlightTour tourKey="plays" steps={en ? PLAYS_TOUR_STEPS_EN : PLAYS_TOUR_STEPS} />
      <div className="page-hero" data-tour="plays-hero">
        <div className="page-hero-row">
          <div>
            <div className="page-kicker">{en ? "Account Plans" : "谋局"}</div>
            <h1 className="page-title">{en ? "Account Plans" : "谋局"}</h1>
            <p className="page-subtitle">
              {en ? "Review every active account plan across the workspace, grouped by account or sorted by momentum." : "全局视角查看所有活跃谋局的推进状态，按客户分组或按动量排序。"}
            </p>
          </div>
          <div className="page-meta">
            {en ? plays.length + " active plans" : plays.length + " 个活跃谋局"}
          </div>
        </div>

        <div className="module-tabs" data-tour="plays-tabs">
          <button
            onClick={() => setActiveTab("by-account")}
            className={`module-tab ${activeTab === "by-account" ? "module-tab-active" : ""}`}
          >
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">{en ? "By account" : "按客户"}</span>
          </button>
          <button
            onClick={() => setActiveTab("by-momentum")}
            className={`module-tab ${activeTab === "by-momentum" ? "module-tab-active" : ""}`}
          >
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">{en ? "By momentum" : "按动量"}</span>
          </button>
        </div>
      </div>

      <JudgmentTraceBanner model={playsTraceNarrative} compact defaultCollapsed locale={locale} />

      {/* Loading skeleton */}
      {loading && (
        <div className="mx-auto max-w-7xl space-y-4 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 space-y-3"
            >
              <div className="h-4 w-48 rounded bg-muted/20" />
              <div className="h-3 w-full rounded bg-muted/15" />
              <div className="h-3 w-3/4 rounded bg-muted/10" />
            </div>
          ))}
        </div>
      )}

      {/* By Account view */}
      {!loading && activeTab === "by-account" && (
        <div className="space-y-5" data-tour="plays-list">
          {byAccount.map((group) => (
            <div
              key={group.accountId}
              className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="h-4 w-4 text-secondary" />
                <Link
                  href={`/accounts/${group.accountId}?tab=plays`}
                  className="text-[17px] font-semibold text-foreground hover:underline"
                >
                  {group.accountName}
                </Link>
              </div>

              {group.accountPlays.length === 0 &&
                group.opportunityPlays.length === 0 && (
                  <p className="text-[15px] text-secondary italic">
                    {en ? "No active plans" : "暂无活跃谋局"}
                  </p>
                )}

              {group.accountPlays.length > 0 && (
                <div className="mb-3 rounded-xl border-l-2 border-accent/30 bg-accent/[0.03] pl-3 py-3 pr-1">
                  <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent/70 mb-2">
                    {en ? "Account strategy" : "客户战略"}
                  </div>
                  <div className="space-y-3">
                    {group.accountPlays.map((play) => (
                      <PlayCard
                        key={play.id}
                        play={play}
                        accountId={group.accountId}
                        relationships={playRelMap.get(play.id)}
                        orgMembers={orgMembers}
                        showPallasActionBoard={showPallasActionBoard}
                        en={en}
                      />
                    ))}
                  </div>
                </div>
              )}

              {group.opportunityPlays.length > 0 && (() => {
                const byOpp = new Map<string, StrategicPlay[]>();
                for (const p of group.opportunityPlays) {
                  const key = p.opportunityId || '_none';
                  byOpp.set(key, [...(byOpp.get(key) ?? []), p]);
                }
                return (
                  <div className="space-y-3">
                    {Array.from(byOpp.entries()).map(([oppId, oppPlays]) => {
                      const opp = oppMap.get(oppId);
                      return (
                        <div key={oppId}>
                          <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-secondary mb-2">
                            <Target className="h-3 w-3" />
                            {opp ? opp.name : (en ? "Opportunity plan" : "商机谋局")}
                            {opp && opp.value > 0 && (
                              <span className="text-[12px] font-normal normal-case text-muted">
                                {en ? "$" + (opp.value / 1000).toFixed(0) + "K" : "¥" + (opp.value / 10000).toFixed(0) + "万"}
                              </span>
                            )}
                          </div>
                          <div className="space-y-3">
                            {oppPlays.map((play) => (
                              <PlayCard
                                key={play.id}
                                play={play}
                                accountId={group.accountId}
                                relationships={playRelMap.get(play.id)}
                                showPallasActionBoard={showPallasActionBoard}
                                en={en}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      {/* By Momentum view */}
      {!loading && activeTab === "by-momentum" && (
        <div className="space-y-3" data-tour="plays-list">
          {byMomentum.length === 0 && (
            <p className="text-[15px] text-secondary italic px-1">
              {en ? "No active plans" : "暂无活跃谋局"}
            </p>
          )}
          {byMomentum.map((play) => (
            <PlayCard
              key={play.id}
              play={play}
              accountId={play.accountId}
              accountName={accountMap.get(play.accountId)}
              relationships={playRelMap.get(play.id)}
              orgMembers={orgMembers}
              showAccount
              showPallasActionBoard={showPallasActionBoard}
              en={en}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Current Step Detail ────────────────────────────────────────────

function CurrentStepCard({ step, en }: { step: PlayStep; en: boolean }) {
  return (
    <div className="rounded-lg border border-accent/20 bg-accent/[0.04] p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        <span className="text-[15px] font-medium text-foreground">{visibleBusinessText(step.title, en ? "en" : "zh")}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[14px] text-secondary pl-4">
        {step.action && (
          <div className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 text-muted flex-shrink-0" />
            <span className="truncate">{visibleBusinessText(step.action, en ? "en" : "zh")}</span>
          </div>
        )}
        {step.target && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted flex-shrink-0">👤</span>
            <span className="truncate">{visibleBusinessText(step.target, en ? "en" : "zh")}</span>
          </div>
        )}
        {step.timing && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted flex-shrink-0" />
            <span className="truncate">{visibleBusinessText(step.timing, en ? "en" : "zh")}</span>
          </div>
        )}
      </div>
      {step.actualResult && (
        <div className="rounded-md bg-positive/[0.06] border border-positive/15 px-2.5 py-1.5 ml-4 text-[14px] text-secondary">
          <span className="font-medium text-positive/80">{en ? "Feedback: " : "反馈: "}</span>{visibleBusinessText(step.actualResult, en ? "en" : "zh")}
        </div>
      )}
      {step.learning && (
        <div className="rounded-md bg-accent/[0.06] border border-accent/15 px-2.5 py-1.5 ml-4 text-[14px] text-secondary">
          <span className="font-medium text-accent/80">{en ? "Learning: " : "学习: "}</span>{visibleBusinessText(step.learning, en ? "en" : "zh")}
        </div>
      )}
    </div>
  );
}

// ─── Alerts Section ─────────────────────────────────────────────────

function PlayAlerts({
  play,
  relationships,
  en,
}: {
  play: StrategicPlay;
  relationships?: { rel: PlayRelationship; targetPlay: StrategicPlay | null }[];
  en: boolean;
}) {
  const alerts: { icon: React.ReactNode; text: string; level: "warning" | "danger" }[] = [];

  if (play.daysSinceProgress > 7) {
    alerts.push({
      icon: <Clock className="h-3.5 w-3.5 flex-shrink-0" />,
      text: en ? `${play.daysSinceProgress} days without progress` : `已 ${play.daysSinceProgress} 天无进展`,
      level: play.daysSinceProgress > 14 ? "danger" : "warning",
    });
  }

  if (play.momentum === "blocked") {
    alerts.push({
      icon: <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />,
      text: en ? "Plan is blocked and needs intervention" : "谋局受阻，需要干预",
      level: "danger",
    });
  }

  if (relationships) {
    for (const { rel, targetPlay } of relationships) {
      if (
        rel.relationship === "depends_on" &&
        targetPlay &&
        (targetPlay.momentum === "stalled" || targetPlay.momentum === "blocked")
      ) {
        alerts.push({
          icon: <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />,
          text: en ? `Upstream blocked: ${visibleBusinessText(targetPlay.goalDescription, "en")} (stalled ${targetPlay.daysSinceProgress} days)` : `上游阻塞: ${targetPlay.goalDescription} (停滞 ${targetPlay.daysSinceProgress} 天)`,
          level: "danger",
        });
      }
    }
  }

  // Check if current step has actualResult that may need attention
  const currentStep = play.steps.find((s) => normalizePlayStepExecutionStatus(s.status) === "in_progress");
  if (currentStep?.actualResult && !currentStep.learning) {
    alerts.push({
      icon: <MessageSquarePlus className="h-3.5 w-3.5 flex-shrink-0" />,
      text: en ? "Current step has feedback but no learning summary" : "当前步骤有反馈但缺少学习总结",
      level: "warning",
    });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {alerts.map((alert, i) => (
        <div
          key={i}
          className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[14px] font-medium ${
            alert.level === "danger"
              ? "border border-danger/25 bg-danger/[0.06] text-danger"
              : "border border-warning/25 bg-warning/[0.06] text-warning"
          }`}
        >
          {alert.icon}
          <span>{alert.text}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Expanded Timeline ──────────────────────────────────────────────

function StepTimeline({ steps, en }: { steps: PlayStep[]; en: boolean }) {
  return (
    <div className="relative space-y-3">
      {steps.map((step, i) => {
        const normalizedStatus = normalizePlayStepExecutionStatus(step.status);
        const isActive = normalizedStatus === "in_progress";
        const isCompleted = normalizedStatus === "done";
        const isBlocked = normalizedStatus === "blocked";
        const isInvalidated = normalizedStatus === "invalidated";
        const isSkipped = step.status === "skipped";
        const isLast = i === steps.length - 1;
        return (
          <div key={step.index} className="flex gap-3">
            {/* Left: node + line */}
            <div className="flex flex-col items-center flex-shrink-0 w-[18px]">
              <div className="mt-[10px]">
                {isCompleted ? (
                  <div className="h-[18px] w-[18px] rounded-full bg-positive/20 flex items-center justify-center">
                    <CheckCircle2 className="h-3 w-3 text-positive" />
                  </div>
                ) : isActive ? (
                  <div className="h-[18px] w-[18px] relative flex items-center justify-center">
                    <span className="absolute inset-0 rounded-full bg-accent/30 animate-ping" />
                    <span className="relative h-3.5 w-3.5 rounded-full bg-accent" />
                  </div>
                ) : isBlocked || isInvalidated ? (
                  <div className="h-[18px] w-[18px] rounded-full bg-danger/15 flex items-center justify-center">
                    <AlertTriangle className="h-3 w-3 text-danger" />
                  </div>
                ) : isSkipped ? (
                  <div className="h-[18px] w-[18px] rounded-full bg-muted/15 flex items-center justify-center">
                    <span className="block w-2.5 h-[1.5px] bg-muted/50 rotate-[-20deg]" />
                  </div>
                ) : (
                  <div className="h-[18px] w-[18px] rounded-full border-2 border-muted/30 bg-transparent" />
                )}
              </div>
              {!isLast && <div className="w-[2px] flex-1 min-h-[8px] bg-muted/15" />}
            </div>

            {/* Right: content */}
            <div
              className={`flex-1 min-w-0 rounded-lg p-2.5 transition-colors ${
                isActive
                  ? "bg-accent/[0.06] border border-accent/20"
                  : "bg-transparent"
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[15px] font-medium ${
                    isActive ? "text-foreground" : isCompleted ? "text-secondary" : isSkipped ? "text-muted line-through" : "text-muted"
                  }`}
                >
                  {step.index + 1}. {visibleBusinessText(step.title, en ? "en" : "zh")}
                </span>
                {isCompleted && step.completedAt && (
                  <span className="text-[13px] text-muted">
                    {new Date(step.completedAt).toLocaleDateString(en ? "en-US" : "zh-CN", { month: "short", day: "numeric" })}
                  </span>
                )}
                {isSkipped && (
                  <span className="text-[12px] text-muted bg-muted/10 px-1.5 py-0.5 rounded">{en ? "Skipped" : "已跳过"}</span>
                )}
                {isBlocked && (
                  <span className="text-[12px] text-warning bg-warning/10 px-1.5 py-0.5 rounded">{en ? "Blocked - adjust approach" : "受阻 · 需要调整打法"}</span>
                )}
                {isInvalidated && (
                  <span className="text-[12px] text-danger bg-danger/10 px-1.5 py-0.5 rounded">{en ? "Invalidated - rebuild plan" : "失效 · 需要重新谋局"}</span>
                )}
              </div>
              {(isActive || isCompleted) && (
                <div className="mt-1 text-[14px] text-secondary space-y-0.5">
                  {step.action && <div>{en ? "Action: " : "行动: "}{visibleBusinessText(step.action, en ? "en" : "zh")}</div>}
                  {(step.actualOutcome || step.actualResult) && (
                    <div className="text-positive/80">✓ {en ? "Result: " : "结果: "}{visibleBusinessText(step.actualOutcome ?? step.actualResult, en ? "en" : "zh")}</div>
                  )}
                  {step.blockerReason && (
                    <div className="text-warning">{en ? "Blocker: " : "阻塞: "}{visibleBusinessText(step.blockerReason, en ? "en" : "zh")}</div>
                  )}
                  {step.nextAction && (
                    <div className="text-accent/80">{en ? "Next: " : "下一步: "}{visibleBusinessText(step.nextAction, en ? "en" : "zh")}</div>
                  )}
                  {step.learning && (
                    <div className="text-accent/80">💡 {en ? "Learning: " : "学习: "}{visibleBusinessText(step.learning, en ? "en" : "zh")}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Play Card ──────────────────────────────────────────────────────

function PlayCard({
  play,
  accountId,
  accountName,
  relationships,
  orgMembers,
  showAccount,
  showPallasActionBoard = false,
  en = false,
}: {
  play: StrategicPlay;
  accountId: string;
  accountName?: string;
  relationships?: { rel: PlayRelationship; targetPlay: StrategicPlay | null }[];
  orgMembers?: OrgMember[];
  showAccount?: boolean;
  showPallasActionBoard?: boolean;
  en?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [pallasProposal, setPallasProposal] = useState<PallasActionProposal | null>(null);
  const [isCreatingPallasProposal, setIsCreatingPallasProposal] = useState(false);
  const [pallasProposalError, setPallasProposalError] = useState<string | null>(null);
  const [isUpdatingPallasProposalStatus, setIsUpdatingPallasProposalStatus] = useState(false);
  const [pallasProposalStatusAction, setPallasProposalStatusAction] = useState<'confirmed' | 'rejected' | 'expired' | null>(null);
  const [pallasProposalStatusError, setPallasProposalStatusError] = useState<string | null>(null);
  const [pallasProposalStatusMessage, setPallasProposalStatusMessage] = useState<string | null>(null);
  const [isExecutingPallasProposal, setIsExecutingPallasProposal] = useState(false);
  const [pallasProposalExecutionError, setPallasProposalExecutionError] = useState<string | null>(null);
  const [pallasProposalExecutionMessage, setPallasProposalExecutionMessage] = useState<string | null>(null);

  const mom = MOMENTUM_CONFIG[play.momentum] ?? MOMENTUM_CONFIG.active;
  const ownerMember = orgMembers?.find((m) => m.userId === play.userId);
  const ownerName = ownerMember?.displayName || ownerMember?.email?.split("@")[0] || null;
  const totalSteps = play.steps.length;
  const completedSteps = play.steps.filter((s) => normalizePlayStepExecutionStatus(s.status) === "done").length;
  const currentStep = play.steps.find((s) => normalizePlayStepExecutionStatus(s.status) === "in_progress");
  const nextStep = play.steps
    .filter((s) => normalizePlayStepExecutionStatus(s.status) === "planned")
    .sort((a, b) => a.index - b.index)[0];
  const sortedSteps = [...play.steps].sort((a, b) => a.index - b.index);
  const pallasActionBoardData = showPallasActionBoard
    ? buildStrategicPlayActionBoardData({ ...play, steps: sortedSteps })
    : null;

  async function fetchPersistedPallasProposal(proposalId: string) {
    const response = await fetch('/api/pallas/proposals/' + proposalId + '?pallas=strategic-play-action-board');
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof payload.error === 'string' ? payload.error : '读取 Pallas 持久化提案失败');
    }
    if (!payload.proposal) throw new Error('Pallas 未返回持久化提案详情');
    return payload.proposal as PallasActionProposal;
  }

  async function handleCreatePallasProposal() {
    if (!showPallasActionBoard) return;

    setIsCreatingPallasProposal(true);
    setPallasProposalError(null);
    setPallasProposalStatusError(null);
    setPallasProposalStatusMessage(null);
    setPallasProposalExecutionError(null);
    setPallasProposalExecutionMessage(null);

    try {
      const response = await fetch('/api/pallas/strategic-play-action-board/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playId: play.id,
          pallas: 'strategic-play-action-board',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : '生成 Pallas 持久化提案失败');
      }
      if (!payload.proposal?.id) throw new Error('Pallas 未返回持久化提案');
      const proposal = await fetchPersistedPallasProposal(String(payload.proposal.id));
      setPallasProposal(proposal);
      setPallasProposalStatusMessage(typeof payload.message === 'string'
        ? payload.message
        : payload.reused
          ? '已复用待确认草稿；没有创建任务，也没有重复写入新提案。'
          : '已生成待确认草稿；没有创建任务，也没有调用工具。');
    } catch (err) {
      setPallasProposal(null);
      setPallasProposalError(err instanceof Error ? err.message : '生成 Pallas 持久化提案失败');
    } finally {
      setIsCreatingPallasProposal(false);
    }
  }

  async function handleUpdatePallasProposalStatus(status: 'confirmed' | 'rejected' | 'expired') {
    if (!showPallasActionBoard || !pallasProposal) return;

    setIsUpdatingPallasProposalStatus(true);
    setPallasProposalStatusAction(status);
    setPallasProposalStatusError(null);
    setPallasProposalStatusMessage(null);
    setPallasProposalExecutionError(null);
    setPallasProposalExecutionMessage(null);

    try {
      const response = await fetch('/api/pallas/proposals/' + pallasProposal.id + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pallas: 'strategic-play-action-board',
          status,
          reason: status === 'confirmed'
            ? '用户在 Pallas 持久化详情 UI 中确认提案；仅记录确认意图，创建任务必须再走独立执行动作。'
            : status === 'rejected'
              ? '用户在 Pallas 持久化详情 UI 中拒绝提案；未创建任务，未调用工具。'
              : '用户在 Pallas 持久化详情 UI 中标记提案过期；未创建任务，未调用工具。',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : '更新 Pallas 提案状态失败');
      }
      if (!payload.proposal) throw new Error('Pallas 未返回更新后的提案');
      setPallasProposal(payload.proposal as PallasActionProposal);
      setPallasProposalStatusMessage(status === 'confirmed'
        ? '已确认：尚未创建任务；如需执行，请点击创建 Closr 任务。'
        : status === 'rejected'
          ? '已拒绝：没有创建任务，也没有调用工具。'
          : '已标记过期：没有创建任务，也没有调用工具。');
    } catch (err) {
      setPallasProposalStatusError(err instanceof Error ? err.message : '更新 Pallas 提案状态失败');
    } finally {
      setIsUpdatingPallasProposalStatus(false);
      setPallasProposalStatusAction(null);
    }
  }

  async function handleExecutePallasProposal() {
    if (!showPallasActionBoard || !pallasProposal) return;

    setIsExecutingPallasProposal(true);
    setPallasProposalStatusError(null);
    setPallasProposalStatusMessage(null);
    setPallasProposalExecutionError(null);
    setPallasProposalExecutionMessage(null);

    try {
      const response = await fetch('/api/pallas/proposals/' + pallasProposal.id + '/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pallas: 'strategic-play-action-board' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : '执行 Pallas 提案失败');
      }
      if (!payload.proposal) throw new Error('Pallas 未返回执行后的提案');
      setPallasProposal(payload.proposal as PallasActionProposal);
      const taskTitle = typeof payload.task?.title === 'string' ? payload.task.title : null;
      setPallasProposalExecutionMessage(typeof payload.message === 'string'
        ? taskTitle
          ? `${payload.message} 任务：${taskTitle}`
          : payload.message
        : taskTitle
          ? `已创建 Closr 内部任务：${taskTitle}`
          : '已创建 Closr 内部任务。');
    } catch (err) {
      setPallasProposalExecutionError(err instanceof Error ? err.message : '执行 Pallas 提案失败');
    } finally {
      setIsExecutingPallasProposal(false);
    }
  }

  return (
    <div
      className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] transition-colors hover:border-white/10 hover:bg-white/[0.02] overflow-hidden"
    >
      {/* Clickable header area */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full text-left p-4 pb-3 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 rounded-t-xl"
      >
        {/* Row 1: Title area */}
        <div className="flex items-start gap-3">
          <span
            className={`mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${mom.dotColor}`}
            title={mom.label}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[16px] font-medium text-foreground truncate max-w-[300px] sm:max-w-none">
                {visibleBusinessText(play.goalDescription, en ? "en" : "zh")}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[13px] font-semibold ${mom.color} border ${
                  play.momentum === "blocked" || play.momentum === "stalled"
                    ? "border-danger/25 bg-danger/[0.08]"
                    : play.momentum === "slowing"
                      ? "border-warning/25 bg-warning/[0.08]"
                      : "border-accent/20 bg-accent/[0.06]"
                }`}
              >
                {momentumLabel(play.momentum, mom.label, en)}
              </span>
              <span className="text-[14px] text-secondary font-medium tabular-nums">
                {play.confidence}%
              </span>
              {ownerName && (
                <span className="text-[14px] text-muted">
                  👤 {ownerName}
                </span>
              )}
            </div>

            {showAccount && accountName && (
              <div className="text-[14px] text-muted mt-0.5">
                {accountName}
              </div>
            )}
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted flex-shrink-0 mt-1 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>

        </button>

      {/* Judgment brief first: hypothesis / risk / next validation */}
      <div className="px-4 pb-2 ml-5 space-y-3">
        <StrategicPlayJudgmentBriefCard play={play} />

        {currentStep && <CurrentStepCard step={currentStep} en={en} />}

        {/* Next step preview */}
        {nextStep && nextStep !== currentStep && (
          <div className="flex items-center gap-2 text-[14px] text-muted pl-1">
            <span className="text-[12px] uppercase tracking-wider font-semibold text-secondary/60">{en ? "Next" : "下一步"}</span>
            <span className="text-secondary">{visibleBusinessText(nextStep.title, en ? "en" : "zh")}</span>
          </div>
        )}

        {/* Progress bar — simple, compact */}
        {totalSteps > 0 && (
          <div className="flex items-center gap-2 pl-1">
            <div className="flex-1 h-1.5 rounded-full bg-muted/10 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-400 ${
                  completedSteps === totalSteps ? 'bg-positive' : 'bg-accent'
                }`}
                style={{ width: `${Math.max(4, (completedSteps / totalSteps) * 100)}%` }}
              />
            </div>
            <span className="text-[13px] text-muted tabular-nums flex-shrink-0">
              {completedSteps}/{totalSteps}
            </span>
          </div>
        )}

        {/* Alerts */}
        <PlayAlerts play={play} relationships={relationships} en={en} />
      </div>

      {/* Relationship tags (always visible) */}
      {relationships && relationships.length > 0 && (
        <div className="px-4 pb-3 ml-5 mt-2">
          <div className="flex flex-wrap gap-2">
            {relationships.map(({ rel, targetPlay }) => {
              const label = (en ? RELATIONSHIP_LABELS_EN : RELATIONSHIP_LABELS)[rel.relationship] ?? rel.relationship;
              const targetName = targetPlay?.goalDescription ?? (en ? "Unknown play" : "未知谋局");
              const targetMom = targetPlay
                ? (MOMENTUM_CONFIG[targetPlay.momentum] ?? MOMENTUM_CONFIG.active)
                : null;
              const isWarning =
                rel.relationship === "depends_on" &&
                targetPlay &&
                (targetPlay.momentum === "stalled" || targetPlay.momentum === "blocked");
              const isSameAccount = targetPlay && targetPlay.accountId === play.accountId;
              const arrow = rel.relationship === "depends_on" ? "\u2B06" : rel.relationship === "supports" ? "\u2B07" : "\u2194";
              return (
                <span
                  key={rel.id}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[13px] ${
                    isWarning
                      ? "border-warning/30 bg-warning/5 text-warning"
                      : isSameAccount
                        ? "border-accent/20 bg-accent/5 text-accent/80"
                        : "border-[var(--card-border)] bg-background/50 text-secondary"
                  }`}
                >
                  <span>{arrow}</span>
                  <span className="font-medium">{label}{!targetPlay?.opportunityId ? (en ? " account strategy" : "客户战略") : ""}:</span>
                  {targetMom && (
                    <span className={`h-1.5 w-1.5 rounded-full ${targetMom.dotColor}`} />
                  )}
                  <span className="truncate max-w-[180px]">{visibleBusinessText(targetName, en ? "en" : "zh")}</span>
                  {targetPlay && (
                    <span className="text-[12px] opacity-70">
                      {targetPlay.confidence}%{isWarning ? " \u26A0\uFE0F" : ""}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-[var(--card-border)] px-4 py-4 space-y-4 bg-background/30">
          {/* Full step timeline */}
          <div>
            <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted mb-2">
              {en ? "Full Steps" : "完整步骤"}
            </div>
            <StepTimeline steps={sortedSteps} en={en} />
          </div>

          {pallasActionBoardData && (
            <StrategicPlayActionBoard
              data={pallasActionBoardData}
              proposal={pallasProposal}
              proposalError={pallasProposalError}
              isCreatingProposal={isCreatingPallasProposal}
              onCreateProposal={handleCreatePallasProposal}
              onConfirmProposal={() => handleUpdatePallasProposalStatus('confirmed')}
              onRejectProposal={() => handleUpdatePallasProposalStatus('rejected')}
              onExpireProposal={() => handleUpdatePallasProposalStatus('expired')}
              onExecuteProposal={handleExecutePallasProposal}
              isUpdatingProposalStatus={isUpdatingPallasProposalStatus}
              proposalStatusAction={pallasProposalStatusAction}
              proposalStatusError={pallasProposalStatusError}
              proposalStatusMessage={pallasProposalStatusMessage}
              isExecutingProposal={isExecutingPallasProposal}
              proposalExecutionError={pallasProposalExecutionError}
              proposalExecutionMessage={pallasProposalExecutionMessage}
            />
          )}

          {/* Assumptions */}
          {play.assumptions.length > 0 && (
            <div>
              <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted mb-2">
                {en ? "Assumptions" : "假设"}
              </div>
              <div className="space-y-1.5">
                {play.assumptions.map((a) => (
                  <div
                    key={a.id}
                    className={`flex items-start gap-2 text-[14px] rounded-md px-2.5 py-1.5 ${
                      a.status === "verified"
                        ? "bg-positive/[0.06] text-positive/90"
                        : a.status === "invalidated"
                          ? "bg-danger/[0.06] text-danger/90 line-through"
                          : "bg-muted/5 text-secondary"
                    }`}
                  >
                    <span className="flex-shrink-0 mt-0.5">
                      {a.status === "verified" ? "✓" : a.status === "invalidated" ? "✗" : "?"}
                    </span>
                    <span>{visibleBusinessText(a.text, en ? "en" : "zh")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Learnings */}
          {play.learnings.length > 0 && (
            <div>
              <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted mb-2 flex items-center gap-1.5">
                <BookOpen className="h-3 w-3" />
                {en ? "Learnings" : "学习"}
              </div>
              <div className="space-y-1.5">
                {play.learnings.filter(l => l.learning?.trim()).map((l, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-[14px] text-secondary rounded-md bg-accent/[0.04] px-2.5 py-1.5"
                  >
                    <span className="flex-shrink-0 text-accent/70">💡</span>
                    <div>
                      <span>{visibleBusinessText(l.learning, en ? "en" : "zh")}</span>
                      {l.newSignal && (
                        <span className="ml-1.5 text-[13px] text-accent/60">→ {visibleBusinessText(l.newSignal, en ? "en" : "zh")}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action: go to detail */}
          <div className="flex items-center gap-3 pt-1">
            <Link
              href={`/accounts/${accountId}?tab=plays&playId=${play.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/[0.08] px-3 py-1.5 text-[14px] font-medium text-accent hover:bg-accent/[0.14] transition-colors"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              {en ? "Add feedback" : "添加反馈"}
            </Link>
            <Link
              href={`/accounts/${accountId}?tab=plays&playId=${play.id}`}
              className="inline-flex items-center gap-1.5 text-[14px] text-secondary hover:text-foreground transition-colors"
            >
              {en ? "View details" : "查看详情"}
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      {/* Bottom padding when not expanded */}
      {!expanded && !currentStep && !(relationships && relationships.length > 0) && (
        <div className="h-1" />
      )}
    </div>
  );
}
