"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Globe2, Loader2, ShieldCheck, UserCheck, UsersRound } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import type { OrgMember } from "@/lib/babel-engine/types";
import type { PortfolioJudgmentSignal, PortfolioJudgmentView, PortfolioManagementQueueItem } from "@/lib/judgment/portfolio-view";
import type { PatternAwarePortfolioSignal, PatternAwareSignalSummary } from "@/lib/judgment/pattern-aware-portfolio-signals";
import type { PublicWebPortfolioSignal, PublicWebSignalSummary } from "@/lib/judgment/public-web-portfolio-signals";
import { getPortfolioInterventionActionOptions, type PortfolioInterventionActionOption } from "@/lib/judgment/portfolio-intervention-actions";
import { buildManagementQueueOwnershipAssignmentPayload } from "@/lib/judgment/ownership-assignment-ui";
import { JudgmentPatternLibraryPanel } from "@/components/dashboard/judgment-pattern-library-panel";

type PortfolioJudgmentRole = "manager" | "executive";
type PortfolioJudgmentSurface = "full" | "management-queue";

interface PlayExecutionPortfolioSignal {
  id: string;
  accountId: string;
  accountName: string;
  opportunityName?: string;
  status: "planned" | "in_progress" | "done" | "blocked" | "invalidated";
  severity: "critical" | "warning" | "focus" | "positive";
  title: string;
  summary: string;
  occurredAt: string;
  evidenceRefs: Array<{ sourceId: string }>;
  drilldownHref: string;
}

interface PortfolioSignalsResponse {
  portfolioJudgment?: PortfolioJudgmentView;
  patternAwareSignals?: PatternAwarePortfolioSignal[];
  patternSignalSummary?: PatternAwareSignalSummary;
  playExecutionSignals?: PlayExecutionPortfolioSignal[];
  playExecutionSignalSummary?: { status: "ready" | "no_events"; totalEvents: number; emittedSignals: number; blockedOrInvalidated: number; calibrationNote: string };
  publicWebSignals?: PublicWebPortfolioSignal[];
  publicWebSignalSummary?: PublicWebSignalSummary;
}

interface PortfolioJudgmentCommandProps {
  role: PortfolioJudgmentRole;
  refreshKey: number;
  surface?: PortfolioJudgmentSurface;
}

const EVIDENCE_LABELS: Record<PortfolioJudgmentSignal["evidenceHealth"], string> = {
  sufficient: "证据充分",
  thin: "证据偏薄",
  missing: "缺证据",
};

const TONE_CLASS: Record<PortfolioJudgmentSignal["tone"], string> = {
  critical: "border-danger/25 bg-danger/[0.05]",
  warning: "border-warning/25 bg-warning/[0.05]",
  focus: "border-accent/25 bg-accent/[0.05]",
  muted: "border-border bg-card/80",
  positive: "border-positive/25 bg-positive/[0.05]",
};

const MANAGEMENT_QUEUE_LABELS: Record<PortfolioManagementQueueItem["queueType"], string> = {
  intervene: "应介入",
  verify: "先核验",
  cool_down: "应降温",
  false_activity: "假性活跃",
  ownership_gap: "责任缺口",
};

const OWNER_STATUS_LABELS: Record<PortfolioManagementQueueItem["ownerSummary"]["status"], string> = {
  assigned: "已有人负责",
  recommended: "建议 owner",
  gap: "未明确",
};

export function PortfolioJudgmentCommand({ role, refreshKey, surface = "full" }: PortfolioJudgmentCommandProps) {
  const [view, setView] = useState<PortfolioJudgmentView | null>(null);
  const [patternAwareSignals, setPatternAwareSignals] = useState<PatternAwarePortfolioSignal[]>([]);
  const [patternSignalSummary, setPatternSignalSummary] = useState<PatternAwareSignalSummary | null>(null);
  const [playExecutionSignals, setPlayExecutionSignals] = useState<PlayExecutionPortfolioSignal[]>([]);
  const [playExecutionSignalSummary, setPlayExecutionSignalSummary] = useState<PortfolioSignalsResponse["playExecutionSignalSummary"] | null>(null);
  const [publicWebSignals, setPublicWebSignals] = useState<PublicWebPortfolioSignal[]>([]);
  const [publicWebSignalSummary, setPublicWebSignalSummary] = useState<PublicWebSignalSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/portfolio-signals", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() as Promise<PortfolioSignalsResponse> : null))
      .catch(() => null)
      .then((payload) => {
        if (!cancelled) {
          setView(payload?.portfolioJudgment ?? null);
          setPatternAwareSignals(payload?.patternAwareSignals ?? []);
          setPatternSignalSummary(payload?.patternSignalSummary ?? null);
          setPlayExecutionSignals(payload?.playExecutionSignals ?? []);
          setPlayExecutionSignalSummary(payload?.playExecutionSignalSummary ?? null);
          setPublicWebSignals(payload?.publicWebSignals ?? []);
          setPublicWebSignalSummary(payload?.publicWebSignalSummary ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setView(null);
          setPatternAwareSignals([]);
          setPatternSignalSummary(null);
          setPlayExecutionSignals([]);
          setPlayExecutionSignalSummary(null);
          setPublicWebSignals([]);
          setPublicWebSignalSummary(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [refreshKey]);

  const sections = useMemo(() => {
    if (!view) return [];
    if (role === "manager") {
      return [
        {
          id: "stuck",
          title: "卡住的大单",
          subtitle: "先看团队卡住的大单，不直接跳到高层介入。",
          icon: AlertTriangle,
          items: view.manager.stuckDeals.slice(0, 3),
        },
        {
          id: "coach",
          title: "辅导原因",
          subtitle: "经理要辅导的是判断卡点，不是催动作数量。",
          icon: UsersRound,
          items: view.manager.coachingCandidates.slice(0, 3),
        },
        {
          id: "verify",
          title: "升级前核验",
          subtitle: "证据薄时只能核验，不能假装需要高层介入。",
          icon: ShieldCheck,
          items: view.manager.verifyBeforeEscalate.slice(0, 3),
        },
      ];
    }

    return [
      {
        id: "resource",
        title: "高层介入候选",
        subtitle: "",
        icon: CheckCircle2,
        items: (view.executive.resourceAllocationCandidates ?? []).slice(0, 3),
      },
    ];
  }, [role, view]);

  if (loading) {
    return <div className="h-28 rounded-lg border border-border skeleton" />;
  }

  if (!view) return null;

  if (surface === "management-queue") {
    const queueItems = view.managementQueue ?? [];
    if (queueItems.length === 0) {
      return (
        <div className="rounded-lg border border-border bg-card/65 px-3 py-3 text-xs text-muted">
          暂无需要处理的管理判断队列。继续从账户判断核心补证据，而不是制造新的判断层。
        </div>
      );
    }

    return <ManagementQueuePanel items={queueItems} />;
  }

  const visibleSections = sections.filter((section) => section.items.length > 0);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-accent/15 bg-card/70 p-3 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">组合局势判断</p>
            <h4 className="text-sm font-semibold text-foreground">团队 / 组合局势面板</h4>
            <p className="mt-0.5 text-[11px] text-muted">
              同一套账户判断核心的组合级投影：{view.summary.openOpportunities} 个开放机会，{view.summary.verifyBeforeEscalate} 个需先核验证据，{view.summary.ownershipGaps ?? 0} 个责任缺口。
            </p>
          </div>
          <span className="rounded-full border border-border bg-background px-2 py-1 text-[10px] text-muted">
            {role === "manager" ? "经理" : "高层"}
          </span>
        </div>

        {visibleSections.length > 0 ? (
          <div className="grid gap-2 lg:grid-cols-3">
            {visibleSections.map((section) => (
              <SignalSection key={section.id} {...section} role={role} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-background/60 px-3 py-3 text-xs text-muted">
            暂无需要升级的组合级判断信号。继续从账户判断核心补证据，而不是制造新的判断层。
          </div>
        )}
      </div>

      <ManagementQueuePanel items={view.managementQueue ?? []} />

      <PlayExecutionSignalsPanel signals={playExecutionSignals} summary={playExecutionSignalSummary} />

      <PublicWebSignalsPanel signals={publicWebSignals} summary={publicWebSignalSummary} />

      <PatternAwareSignalsPanel signals={patternAwareSignals} summary={patternSignalSummary} />

      <JudgmentPatternLibraryPanel refreshKey={refreshKey} />
    </div>
  );
}

const PATTERN_SIGNAL_LABELS: Record<PatternAwarePortfolioSignal["signalType"], string> = {
  historical_failure_risk: "历史失败风险",
  successful_recovery_pattern: "成功恢复模式",
  evidence_gap_pattern: "证据缺口模式",
  intervention_opportunity: "介入机会",
  overconfidence_warning: "过度自信预警",
};

const PLAY_EXECUTION_STATUS_LABEL: Record<PlayExecutionPortfolioSignal["status"], string> = {
  planned: "计划中",
  in_progress: "执行中",
  done: "已完成",
  blocked: "受阻",
  invalidated: "已失效",
};

const PLAY_EXECUTION_SEVERITY_CLASS: Record<PlayExecutionPortfolioSignal["severity"], string> = {
  critical: "border-danger/25 bg-danger/[0.05]",
  warning: "border-warning/25 bg-warning/[0.05]",
  focus: "border-accent/25 bg-accent/[0.05]",
  positive: "border-positive/25 bg-positive/[0.05]",
};

const PUBLIC_WEB_PAGE_LABELS: Record<string, string> = {
  leadership: "关键人/组织",
  procurement: "采购/供应商",
  case_study: "案例/方案",
  news: "公开新闻",
  about: "公司介绍",
  home: "官网",
  public_page: "公开网页",
};

const PUBLIC_WEB_SEVERITY_CLASS: Record<PublicWebPortfolioSignal["severity"], string> = {
  warning: "border-warning/25 bg-warning/[0.05]",
  focus: "border-accent/25 bg-accent/[0.05]",
};

function ManagementQueuePanel({ items }: { items: PortfolioManagementQueueItem[] }) {
  const [assignmentState, setAssignmentState] = useState<Record<string, { loading?: boolean; message?: string; error?: string }>>({});
  const [selectedOwners, setSelectedOwners] = useState<Record<string, string>>({});
  const { orgMembers } = useAuth();
  const assignableMembers = useMemo(
    () => orgMembers.filter((member) => Boolean(member.userId)),
    [orgMembers],
  );
  const visible = [...items]
    .sort((a, b) => {
      if (a.queueType === "ownership_gap" && b.queueType !== "ownership_gap") return -1;
      if (a.queueType !== "ownership_gap" && b.queueType === "ownership_gap") return 1;
      return b.rankScore - a.rankScore;
    })
    .slice(0, 4);
  if (visible.length === 0) return null;

  const ownershipCount = items.filter((item) => item.queueType === "ownership_gap").length;

  function memberLabel(member: OrgMember) {
    return member.displayName || member.email?.split('@')[0] || member.userId;
  }

  function ownerNameFor(userId: string) {
    const member = assignableMembers.find((candidate) => candidate.userId === userId);
    return member ? memberLabel(member) : userId;
  }

  async function assignOwner(item: PortfolioManagementQueueItem, ownerUserId: string, ownerName?: string) {
    if (!ownerUserId) return;
    setAssignmentState((prev) => ({ ...prev, [item.id]: { loading: true } }));
    try {
      const response = await fetch('/api/judgment/ownership-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildManagementQueueOwnershipAssignmentPayload(item, ownerUserId)),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : '记录判断责任人失败');
      }
      setAssignmentState((prev) => ({
        ...prev,
        [item.id]: { message: ownerName ? '已记录给 ' + ownerName : '已记录判断责任人' },
      }));
    } catch (err) {
      setAssignmentState((prev) => ({
        ...prev,
        [item.id]: { error: err instanceof Error ? err.message : '记录判断责任人失败' },
      }));
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card/65 p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">管理判断队列</p>
          <h4 className="text-sm font-semibold text-foreground">局势判断 → 责任缺口 → 下一步核验</h4>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">
            只展示已有账户、组合判断和团队配置推导出的缺口；AI 可推荐 owner，但不会自动指派。
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-background px-2 py-1 text-[10px] text-muted">
          {ownershipCount > 0 ? `${ownershipCount} 个责任缺口` : `${items.length} 条队列`}
        </span>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        {visible.map((item) => {
          const state = assignmentState[item.id] ?? {};
          const canAssignKnownOwner = item.queueType === "ownership_gap"
            && (item.ownerSummary.status === "recommended" || item.ownerSummary.status === "assigned")
            && Boolean(item.ownerSummary.ownerUserId);
          const canPickOwner = item.queueType === "ownership_gap" && item.ownerSummary.status === "gap";
          const selectedOwnerId = selectedOwners[item.id] ?? "";
          const selectedOwnerName = selectedOwnerId ? ownerNameFor(selectedOwnerId) : undefined;

          return (
          <article key={item.id} className="rounded-lg border border-border bg-background/55 px-2.5 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">{item.accountName}</p>
                {item.opportunityName ? <p className="truncate text-[10px] text-muted">{item.opportunityName}</p> : null}
              </div>
              <span className="shrink-0 rounded-full border border-accent/20 bg-accent/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-accent">
                {MANAGEMENT_QUEUE_LABELS[item.queueType]}
              </span>
            </div>

            <div className="mt-2 rounded-md border border-border/70 bg-card/70 px-2 py-1.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">当前判断</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-foreground/85">{item.currentJudgment}</p>
            </div>

            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              <div className="rounded-md border border-warning/20 bg-warning/[0.04] px-2 py-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-warning">为什么重要</p>
                <p className="mt-0.5 text-[10px] leading-snug text-muted">{item.whyThisMatters}</p>
              </div>
              <div className="rounded-md border border-accent/15 bg-accent/[0.04] px-2 py-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-accent">建议核验</p>
                <p className="mt-0.5 text-[10px] leading-snug text-muted">{item.recommendedAction}</p>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
              <span className="rounded-full bg-card px-1.5 py-0.5">{EVIDENCE_LABELS[item.evidenceHealth]}</span>
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-card px-1.5 py-0.5">
                <UserCheck className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {item.ownerSummary.ownerName ? `${OWNER_STATUS_LABELS[item.ownerSummary.status]}：${item.ownerSummary.ownerName}` : OWNER_STATUS_LABELS[item.ownerSummary.status]}
                </span>
              </span>
              <Link href={item.drilldownHref} className="ml-auto inline-flex items-center gap-1 text-accent hover:underline">
                查看 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {(canAssignKnownOwner || canPickOwner || state.message || state.error) && (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/70 pt-2">
                {canAssignKnownOwner && !state.message && (
                  <button
                    type="button"
                    onClick={() => assignOwner(item, item.ownerSummary.ownerUserId ?? "", item.ownerSummary.ownerName)}
                    disabled={state.loading}
                    className="inline-flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent/[0.08] px-2 py-1 text-[10px] font-medium text-accent transition-colors hover:bg-accent/[0.12] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {state.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
                    记录为判断责任人
                  </button>
                )}
                {canPickOwner && !state.message && (
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    <select
                      value={selectedOwnerId}
                      onChange={(event) => {
                        const nextOwnerId = event.target.value;
                        setSelectedOwners((prev) => ({ ...prev, [item.id]: nextOwnerId }));
                        setAssignmentState((prev) => ({ ...prev, [item.id]: {} }));
                      }}
                      disabled={state.loading || assignableMembers.length === 0}
                      aria-label="选择判断责任人"
                      className="min-w-40 flex-1 rounded-md border border-border bg-card px-2 py-1 text-[10px] text-foreground outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="">选择责任人</option>
                      {assignableMembers.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {memberLabel(member)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => assignOwner(item, selectedOwnerId, selectedOwnerName)}
                      disabled={state.loading || !selectedOwnerId}
                      className="inline-flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent/[0.08] px-2 py-1 text-[10px] font-medium text-accent transition-colors hover:bg-accent/[0.12] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {state.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
                      确认责任人
                    </button>
                    {assignableMembers.length === 0 && (
                      <span className="text-[10px] text-muted">组织成员加载后可选择责任人。</span>
                    )}
                  </div>
                )}
                {state.message && <span className="text-[10px] text-positive">{state.message}</span>}
                {state.error && <span className="text-[10px] text-danger">{state.error}</span>}
              </div>
            )}
          </article>
        );})}
      </div>
    </div>
  );
}

function PublicWebSignalsPanel({
  signals,
  summary,
}: {
  signals: PublicWebPortfolioSignal[];
  summary: PublicWebSignalSummary | null;
}) {
  if (signals.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card/65 p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">公开外部信号</p>
          <h4 className="text-sm font-semibold text-foreground">公开网页 → 判断核验 → 责任闭环</h4>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">
            {summary?.calibrationNote ?? "只提示需要核验的公开变化，不自动覆盖联系人或客户判断。"}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-background px-2 py-1 text-[10px] text-muted">
          {summary?.emittedSignals ?? signals.length}/{summary?.totalEvidence ?? signals.length} 条证据
        </span>
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        {signals.slice(0, 3).map((signal) => (
          <Link key={signal.id} href={signal.drilldownHref} className={`rounded-lg border px-2.5 py-2 transition-colors hover:bg-background/60 ${PUBLIC_WEB_SEVERITY_CLASS[signal.severity]}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">{signal.accountName}</p>
                <p className="truncate text-[10px] text-muted">{signal.title}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] text-muted">
                <Globe2 className="h-3 w-3" />
                {PUBLIC_WEB_PAGE_LABELS[signal.pageType] ?? "公开网页"}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 text-[10px] leading-snug text-foreground/85">{signal.summary}</p>
            <div className="mt-2 rounded-md border border-border/70 bg-background/50 px-2 py-1.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-accent">建议核验</p>
              <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted">{signal.recommendedAction}</p>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted">
              <span>{signal.evidenceRefs.length} 条来源</span>
              <span className="inline-flex items-center gap-1 text-accent">
                查看 <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function PlayExecutionSignalsPanel({
  signals,
  summary,
}: {
  signals: PlayExecutionPortfolioSignal[];
  summary: PortfolioSignalsResponse["playExecutionSignalSummary"] | null;
}) {
  if (signals.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card/65 p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">谋局执行闭环</p>
          <h4 className="text-sm font-semibold text-foreground">谋局计划 → 执行结果 → 来源追踪</h4>

        </div>
        <span className="shrink-0 rounded-full border border-border bg-background px-2 py-1 text-[10px] text-muted">
          {summary?.emittedSignals ?? signals.length}/{summary?.totalEvents ?? signals.length} 个事件
        </span>
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        {signals.slice(0, 3).map((signal) => (
          <Link key={signal.id} href={signal.drilldownHref} className={`rounded-lg border px-2.5 py-2 transition-colors hover:bg-background/60 ${PLAY_EXECUTION_SEVERITY_CLASS[signal.severity]}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">{signal.accountName}</p>
                {signal.opportunityName ? <p className="truncate text-[10px] text-muted">{signal.opportunityName}</p> : null}
              </div>
              <span className="shrink-0 rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] text-muted">
                {PLAY_EXECUTION_STATUS_LABEL[signal.status]}
              </span>
            </div>
            <p className="mt-1 text-[10px] font-medium text-accent">{signal.title}</p>
            <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-foreground/85">{signal.summary}</p>
            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted">
              <span>{signal.evidenceRefs.length} 条来源</span>
              <span className="inline-flex items-center gap-1 text-accent">
                查看 <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

const PATTERN_SEVERITY_CLASS: Record<PatternAwarePortfolioSignal["severity"], string> = {
  critical: "border-danger/25 bg-danger/[0.05]",
  warning: "border-warning/25 bg-warning/[0.05]",
  focus: "border-accent/25 bg-accent/[0.05]",
  positive: "border-positive/25 bg-positive/[0.05]",
};

function PatternAwareSignalsPanel({ signals, summary }: { signals: PatternAwarePortfolioSignal[]; summary: PatternAwareSignalSummary | null }) {
  if (signals.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card/65 p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">历史模式信号</p>
          <h4 className="text-sm font-semibold text-foreground">当前组合 × 历史判断模式</h4>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">
            {summary?.calibrationNote ?? "只显示带证据链和限制条件的保守相似性，不把历史样本当自动真理。"}
          </p>
        </div>
        {summary ? (
          <span className="shrink-0 rounded-full border border-border bg-background px-2 py-1 text-[10px] text-muted">
            {summary.emittedSignals}/{summary.eligiblePatterns} 条匹配
          </span>
        ) : null}
      </div>

      {signals.length > 0 ? (
        <div className="grid gap-2 lg:grid-cols-3">
          {signals.slice(0, 3).map((signal) => (
            <PatternAwareSignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-background/55 px-3 py-2 text-[11px] leading-snug text-muted">
          {summary?.gapReason ?? "暂无足够历史模式；系统不会编造相似性。"}
        </div>
      )}
    </div>
  );
}

function PatternAwareSignalCard({ signal }: { signal: PatternAwarePortfolioSignal }) {
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${PATTERN_SEVERITY_CLASS[signal.severity]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">{signal.accountName}</p>
          {signal.opportunityName ? <p className="truncate text-[10px] text-muted">{signal.opportunityName}</p> : null}
        </div>
        <span className="shrink-0 rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] text-muted tabular-nums">
          {Math.round(signal.confidence * 100)}%
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-medium text-accent">
          {PATTERN_SIGNAL_LABELS[signal.signalType]}
        </span>
        <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] text-muted">
          {signal.patternTitle}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted">
        <span>{signal.evidenceRefs.length} 条证据</span>
        <Link href={signal.drilldownHref} className="inline-flex items-center gap-1 text-accent hover:underline">
          查看 <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function SignalSection({
  title,
  subtitle,
  icon: Icon,
  items,
  role,
}: {
  title: string;
  subtitle: string;
  icon: typeof AlertTriangle;
  items: PortfolioJudgmentSignal[];
  role: PortfolioJudgmentRole;
}) {
  return (
    <section className="rounded-lg border border-border bg-background/60 p-2.5">
      <div className="mb-2 flex items-start gap-2">
        <Icon className="mt-0.5 h-3.5 w-3.5 text-accent" />
        <div>
          <h5 className="text-[11px] font-semibold text-foreground">{title}</h5>
          {subtitle ? <p className="text-[10px] leading-snug text-muted">{subtitle}</p> : null}
        </div>
      </div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <SignalCard key={item.id} item={item} role={role} />
        ))}
      </div>
    </section>
  );
}

function SignalCard({ item, role }: { item: PortfolioJudgmentSignal; role: PortfolioJudgmentRole }) {
  const [selectedAction, setSelectedAction] = useState<PortfolioInterventionActionOption | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actionOptions = getPortfolioInterventionActionOptions(role, item);

  async function submitIntervention(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAction) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(item.accountId)}/interventions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: selectedAction.type,
          action: selectedAction.action,
          status: selectedAction.defaultStatus,
          accountId: item.accountId,
          opportunityId: item.opportunityId,
          signalId: item.id,
          role,
          reason: item.reason,
          recommendedAction: item.recommendedAction,
          outcomeNote: note || `${selectedAction.label}：${item.recommendedAction}`,
          evidenceRefs: item.opportunityId ? [{
            sourceKind: "source_record",
            sourceId: item.opportunityId,
            sourceTable: "opportunities",
            sourceRowId: item.opportunityId,
            title: item.opportunityName ?? item.accountName,
          }] : [],
        }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "介入动作保存失败");
      setMessage(payload.message || "已写入判断时间线");
      setSelectedAction(null);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "介入动作保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`rounded-lg border px-2.5 py-2 ${TONE_CLASS[item.tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">{item.accountName}</p>
          {item.opportunityName ? <p className="truncate text-[10px] text-muted">{item.opportunityName}</p> : null}
        </div>
        <Link href={item.drilldownHref} className="rounded-full p-0.5 text-muted transition-colors hover:bg-background hover:text-accent" aria-label="查看账户详情">
          <ArrowRight className="h-3 w-3 shrink-0" />
        </Link>
      </div>
      <div className="mt-2 space-y-1.5">
        <div className="rounded-md border border-border/70 bg-background/50 px-2 py-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">
            {role === "executive" ? "为什么需要高层介入" : "判断卡点"}
          </p>
          <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-foreground/85">{item.reason}</p>
        </div>
        <div className="rounded-md border border-accent/15 bg-accent/[0.04] px-2 py-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-accent">
            {role === "executive" ? "建议高层动作" : "建议辅导动作"}
          </p>
          <p className="mt-0.5 line-clamp-3 text-[10px] leading-snug text-muted">{item.recommendedAction}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
        <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-muted">{EVIDENCE_LABELS[item.evidenceHealth]}</span>
        {typeof item.confidence === "number" ? (
          <span className="text-muted tabular-nums">{Math.round(item.confidence * 100)}%</span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {actionOptions.map((option) => (
          <button
            key={`${option.type}:${option.action}`}
            type="button"
            onClick={() => { setSelectedAction(option); setError(null); setMessage(null); }}
            className="rounded-full border border-border bg-background/80 px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:border-accent/50 hover:text-accent"
          >
            {option.label}
          </button>
        ))}
      </div>
      {selectedAction ? (
        <form onSubmit={submitIntervention} className="mt-2 space-y-1.5 rounded-md border border-border bg-background/70 p-2">
          <p className="text-[10px] font-medium text-foreground">写回：{selectedAction.label}</p>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="可补充结果/证据，例如：已约销售明天核实采购负责人。"
            className="min-h-12 w-full rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground outline-none focus:border-accent"
          />
          <div className="flex items-center justify-end gap-1.5">
            <button type="button" onClick={() => setSelectedAction(null)} className="px-2 py-1 text-[10px] text-muted hover:text-foreground">取消</button>
            <button type="submit" disabled={submitting} className="rounded-md bg-accent px-2 py-1 text-[10px] font-semibold text-accent-foreground disabled:opacity-60">
              {submitting ? "保存中" : "写入时间线"}
            </button>
          </div>
        </form>
      ) : null}
      {message ? (
        <div className="mt-2 rounded-md border border-positive/20 bg-positive/[0.06] px-2 py-1 text-[10px] text-positive">
          {message} · <Link href={item.drilldownHref} className="underline">查看详情</Link>
        </div>
      ) : null}
      {error ? <div className="mt-2 rounded-md border border-danger/20 bg-danger/[0.06] px-2 py-1 text-[10px] text-danger">{error}</div> : null}
    </div>
  );
}
