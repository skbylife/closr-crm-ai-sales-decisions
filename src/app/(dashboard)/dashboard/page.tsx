"use client";

import { formatCurrency } from "@/lib/format-currency";
import { timeAgo, isThisWeek, daysBetween } from "@/lib/time-utils";

import React, { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import {
  Building2,
  Target,
  TrendingUp,
  ScanSearch,
  AlertTriangle,
  ArrowRight,
  LayoutDashboard,
  BarChart3,
  Award,
  Zap,
  Shield,
  Radio,
  ChevronDown,
  X,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { FadeIn } from "@/components/ui/fade-in";
import { useStore } from "@/lib/store";
import { getMeddiccScore } from "@/lib/meddicc";
import { useLocale, type Locale, type TranslationKey } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";
import { useEffectiveJobLevel } from "@/hooks/use-effective-job-level";
import type { Account, Opportunity, OpportunityStage, OrgMember, SalesLead, StrategicPlay, Task, UserRoleLevel } from "@/lib/babel-engine/types";
import { STAGE_SHORT_LABELS } from "@/lib/dashboard-constants";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { NotificationPanel } from "@/components/dashboard/notifications";
import { GettingStartedCard } from "@/components/onboarding/GettingStartedCard";

import { usePlayPermissions } from "@/hooks/use-permissions";
import { getFocusAccount } from "@/lib/dashboard-command-center";
import { buildMoujuStateForTarget } from "@/lib/mouju-state";
import { visibleBusinessText } from "@/lib/visible-business-text";

// Analytics chart panels
import {
  PipelineDistributionChart,
  StageConversionFunnel,
  DealVelocityChart,
  AgingAnalysisPanel,
  ForecastPanel,
  WinLossPanel,
} from "@/components/dashboard/analytics-panels";

// Dashboard section components
import {
  SummaryStatsRow,
  QuickActions,
  PlaySignalsCard,
  ProgressBar,
  PipelineEmptyState,
  OrgHeader,
  TeamViewSection,
  TimeRangeSelector,
  filterByTimeRange,
  RecentFeedCard,
} from "@/components/dashboard/sections";
import { SpotlightTour, type TourStep } from "@/components/onboarding/SpotlightTour";
import type { TimeRange } from "@/components/dashboard/sections";

// P3 — Sales Command Center components
import { UnifiedPortfolioInsights } from "@/components/dashboard/unified-portfolio-insights";
import { NarrativeFeed } from "@/components/dashboard/narrative-feed";
import { PortfolioSignalsCard } from "@/components/dashboard/portfolio-signals-card";

// P4 — Role-based layout system
import { useDashboardLayout } from "@/hooks/use-dashboard-layout";
import { CollapsibleModule } from "@/components/dashboard/collapsible-module";
import { FalseActivityDetector } from "@/components/dashboard/false-activity-detector";
import { ExecutiveInterventionPanel } from "@/components/dashboard/executive-intervention-panel";
import { RiskHeatmap } from "@/components/dashboard/risk-heatmap";
import { ManagerInterventionPanel } from "@/components/dashboard/manager-intervention-panel";
import { StuckDealSummary } from "@/components/dashboard/stuck-deal-summary";
import { resolveDashboardRole, type DashboardModuleKey } from "@/lib/dashboard-layout";
import { SalesWorkbench } from "@/components/crm/sales-workbench";
import { buildSalesWorkbenchModel } from "@/lib/crm-foundation/sales-workbench";

const COLLAPSIBLE_TITLES: Partial<Record<DashboardModuleKey, string>> = {
  "summary-stats": "局势指标",
  "unified-portfolio-insights": "组合局势判断",
  "narrative-feed-grid": "动态信息流",
  "analytics-collapsible": "详细分析",
  "team-view": "团队视图",
  "today-situation-scaffold": "今日局势",
  "play-signals": "谋局信号",
  "todays-priorities": "下一步打法",
  "portfolio-signals": "结构性局势信号",
};

const COLLAPSIBLE_TITLE_LABELS: Record<Locale, Partial<Record<DashboardModuleKey, string>>> = {
  zh: COLLAPSIBLE_TITLES,
  en: {
    "summary-stats": "Situation Metrics",
    "unified-portfolio-insights": "Portfolio Judgment",
    "narrative-feed-grid": "Activity Feed",
    "analytics-collapsible": "Detailed Analytics",
    "team-view": "Team View",
    "today-situation-scaffold": "Today's Situation",
    "play-signals": "Play Signals",
    "todays-priorities": "Next Moves",
    "portfolio-signals": "Structural Signals",
  },
};

const DISABLE_OUTER_COLLAPSE = new Set<DashboardModuleKey>([
  "analytics-collapsible",
]);

const DASHBOARD_TOUR_STEPS: TourStep[] = [
  {
    target: "body",
    title: "全景判断",
    content: "这里汇总所有客户和商机的关键信息。Closr 会告诉你今天最该关注哪个客户、哪个谋局需要推进。每天打开 Closr，先看今日重点。",
    position: "bottom",
  },
  {
    target: "[data-tour='dashboard-stats']",
    title: "商机全景",
    content: "这里展示你所有商机的关键数据：管线金额、成单率、在跟进商机数等一目了然。",
    position: "bottom",
  },
  {
    target: "[data-tour='ai-assistant']",
    title: "行动助手",
    content: "随时点击这个按钮：解读邮件、制定策略、准备会议，它都能帮你。",
    position: "left",
  },
  {
    target: "[data-tour='dashboard-briefing']",
    title: "判断指挥中心",
    content: "所有判断集中在这里：今日简报、行动队列、情报信号、深度洞察，用标签切换查看。",
    position: "bottom",
  },
];

const DASHBOARD_TOUR_STEPS_BY_LOCALE: Record<Locale, TourStep[]> = {
  zh: DASHBOARD_TOUR_STEPS,
  en: [
    {
      target: "body",
      title: "Horizon Judgment",
      content: "This view rolls up the key accounts and opportunities that need attention today.",
      position: "bottom",
    },
    {
      target: "[data-tour='dashboard-stats']",
      title: "Opportunity Snapshot",
      content: "Track pipeline value, win rate, open opportunities, and the signals that need review.",
      position: "bottom",
    },
    {
      target: "[data-tour='ai-assistant']",
      title: "Action Assistant",
      content: "Use the assistant to decode emails, shape strategy, and prepare for meetings.",
      position: "left",
    },
    {
      target: "[data-tour='dashboard-briefing']",
      title: "Judgment Center",
      content: "Briefings, action queues, intel signals, and deeper analysis are organized here.",
      position: "bottom",
    },
  ],
};

function l(locale: Locale, zh: string, en: string): string {
  return locale === "en" ? en : zh;
}

function countLabel(locale: Locale, count: number, zhUnit: string, enSingular: string, enPlural = enSingular + "s"): string {
  return locale === "en" ? `${count} ${count === 1 ? enSingular : enPlural}` : `${count} ${zhUnit}`;
}

// ─── Role-filtered data hook ─────────────────────────────────────────

// Dashboard uses the shared hook that filters by jobLevel (not orgRole)
// This ensures "职级决定数据范围" is consistent across all pages.

// ═══════════════════════════════════════════════════════════════════════
// Key Account Situation — top accounts mini heatmap
// ═══════════════════════════════════════════════════════════════════════

function KeyAccountSituation({
  accounts,
  opportunities,
  locale,
}: {
  accounts: Array<{ id: string; name: string; dealHealth?: string; lastActivity?: string }>;
  opportunities: Opportunity[];
  locale: Locale;
}) {
  const currency = useStore((s) => s.currencyCode);

  const accountRows = useMemo(() => {
    return accounts
      .map((acct) => {
        const acctOpps = opportunities.filter(
          (o) => o.accountId === acct.id && o.stage !== "closed_won" && o.stage !== "closed_lost"
        );
        const totalValue = acctOpps.reduce((sum, o) => sum + o.value, 0);
        const avgMeddicc =
          acctOpps.length > 0
            ? Math.round(
                acctOpps.reduce((sum, o) => sum + (o.meddicc?.overallScore ?? 0), 0) / acctOpps.length
              )
            : 0;
        return {
          ...acct,
          oppCount: acctOpps.length,
          totalValue,
          avgMeddicc,
        };
      })
      .filter((a) => a.oppCount > 0)
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 6);
  }, [accounts, opportunities]);

  if (accountRows.length === 0) return null;

  return (
    <div className="rounded-2xl border p-4 shadow-[var(--dash-card-shadow)]" style={{ borderColor: 'var(--dash-card-border)', backgroundColor: 'var(--dash-card-bg)' }}>
      <div className="mb-3 flex items-center gap-2">
        <Target className="h-4 w-4" style={{ color: 'var(--dash-icon-accent)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--dash-text-primary)' }}>{l(locale, "重点客户局势", "Key Account Situation")}</h3>
      </div>
      <div className="space-y-1.5">
        {accountRows.map((acct) => {
          const healthColor =
            acct.dealHealth === "critical"
              ? "var(--dash-health-bad)"
              : acct.dealHealth === "at_risk"
                ? "var(--dash-health-warn)"
                : "var(--dash-health-good)";
          const meddiccColor =
            acct.avgMeddicc < 30
              ? "var(--dash-health-bad)"
              : acct.avgMeddicc < 50
                ? "var(--dash-health-warn)"
                : "var(--dash-health-good)";
          return (
            <Link
              key={acct.id}
              href={`/accounts/${acct.id}`}
              className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors"
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--dash-hover-bg)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: healthColor }} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: 'var(--dash-text-primary)' }}>{acct.name}</span>
              <span className="text-xs tabular-nums" style={{ color: 'var(--dash-text-tertiary)' }}>{countLabel(locale, acct.oppCount, "单", "deal")}</span>
              <span className="w-20 text-right text-xs tabular-nums" style={{ color: 'var(--dash-text-secondary)' }}>
                {formatCurrency(acct.totalValue, currency)}
              </span>
              <span className="text-xs font-bold tabular-nums w-16 text-right" style={{ color: meddiccColor }}>
                {l(locale, "证据", "Evidence")} {acct.avgMeddicc}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function VisualSituationSnapshot({
  pipelineValue,
  wonValue,
  winRate,
  avgMeddicc,
  riskDealCount,
  activeDealCount,
  locale,
}: {
  pipelineValue: number;
  wonValue: number;
  winRate: number;
  avgMeddicc: number;
  riskDealCount: number;
  activeDealCount: number;
  locale: Locale;
}) {
  const currency = useStore((s) => s.currencyCode);
  const riskPct = activeDealCount > 0 ? Math.round((riskDealCount / activeDealCount) * 100) : 0;
  const wonToPipeline = pipelineValue > 0 ? Math.min(100, Math.round((wonValue / pipelineValue) * 100)) : 0;
  const tiles = [
    { label: l(locale, "证据健康", "Evidence Health"), value: avgMeddicc, suffix: "", color: "bg-accent", hint: avgMeddicc >= 60 ? l(locale, "稳定", "Stable") : l(locale, "需复核", "Review") },
    { label: l(locale, "风险商机", "Risk Deals"), value: riskPct, suffix: "%", color: "bg-danger", hint: riskDealCount + " / " + activeDealCount },
    { label: l(locale, "转化率", "Win Rate"), value: winRate, suffix: "%", color: "bg-positive", hint: l(locale, "当前筛选", "Current filter") },
    { label: l(locale, "赢单/管线", "Won / Pipeline"), value: wonToPipeline, suffix: "%", color: "bg-warning", hint: formatCurrency(wonValue, currency) },
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{tile.label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{tile.value}{tile.suffix}</p>
            </div>
            <span className="rounded-full bg-background px-2 py-1 text-[11px] text-secondary">{tile.hint}</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-background">
            <div className={'h-full rounded-full ' + tile.color} style={{ width: Math.max(4, Math.min(100, tile.value)) + '%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

type HorizonDecisionItem = {
  id: string;
  href: string;
  account: Account;
  opportunity: Opportunity;
  ownerName: string;
  evidenceScore: number;
  moujuState: ReturnType<typeof buildMoujuStateForTarget>;
  nextTask?: Task;
  primaryStep?: StrategicPlay["steps"][number];
  problemText: string;
  riskDetail: string;
  nextAction: string;
  decisionText: string;
  meta: string;
  score: number;
  severity: number;
  dueDate?: string;
};

const OPEN_PLAY_STATUSES = new Set(["active", "in_progress"]);
const EXECUTABLE_STEP_STATUSES = new Set(["blocked", "invalidated", "in_progress", "planned", "pending"]);
const STANDARD_DEMO_DECISION_OVERRIDES: Record<string, { problem: string; risk: string; nextAction: string }> = {
  opp_platform_cloud_001: {
    problem: "续约表面健康，但 CTO 何总追问 AIOps 与自研 iMaster 的边界，采购又用年降 5% 和低价竞品压价。",
    risk: "如果今天不把 iMaster 互补边界、P1 根因链路和 92% 自愈率路线图讲清楚，三年框架会被打回年度低价续约。",
    nextAction: "由林岚推动李总转交一页互补架构图 + iMaster 边界说明给何总，并同步周总的 ROI 口径。",
  },
  opp_cmcc_5g_003: {
    problem: "POC 指标已经超标，但集团采购链和省级试点授权没有锁定，机会卡在采购路径而不是技术能力。",
    risk: "如果 48 小时内不确认赵总、孙总和集团采购中心的真实审批关系，省级试点可能变成没有复制权的小单。",
    nextAction: "让周晨锁定赵总 + 孙总三方会议，确认两省试点负责人、数据源范围和集团复制条款。",
  },
  opp_bank_app_003: {
    problem: "孙宁回归后风险从沉默转为安全评审校准，手机银行重构仍要过周总的安全条件和 POC 资源确认。",
    risk: "如果不把周总的安全边界、POC 验收标准和资源承诺一次确认，商机会继续看似推进但 forecast 不可信。",
    nextAction: "让许洁向孙宁确认 POC 资源、验收标准和周总的三条安全条件，并把客户反馈回写到商机。",
  },
};

const STANDARD_DEMO_DECISION_OVERRIDES_EN: Record<string, { problem: string; risk: string; nextAction: string }> = {
  opp_platform_cloud_001: {
    problem: "The renewal looks healthy, but the CTO is pressing on AIOps versus in-house iMaster boundaries while procurement is using a 5% annual reduction and lower-cost competitors as leverage.",
    risk: "If the iMaster complementarity, P1 root-cause path, and 92% self-healing roadmap are not clarified today, the three-year frame may be pushed back into a yearly low-price renewal.",
    nextAction: "Have Lynn Lin send Li a one-page complementary architecture and iMaster boundary note for the CTO, aligned with Zhou's ROI narrative.",
  },
  opp_cmcc_5g_003: {
    problem: "The POC metrics are above target, but procurement chain ownership and province-level pilot authorization are not locked.",
    risk: "If the real approval path across Zhao, Sun, and group procurement is not confirmed within 48 hours, the pilot may become a small deal with no replication rights.",
    nextAction: "Have Chen Zhou lock a three-party meeting with Zhao and Sun to confirm province owners, data-source scope, and group replication terms.",
  },
  opp_bank_app_003: {
    problem: "After Sun Ning re-engaged, the risk moved from silence to security-review calibration; the mobile banking rebuild still depends on Zhou's security conditions and POC resources.",
    risk: "If Zhou's security boundaries, POC acceptance criteria, and resource commitment are not confirmed together, the deal will look active while the forecast remains weak.",
    nextAction: "Have Jie Xu confirm POC resources, acceptance criteria, and Zhou's three security conditions with Sun Ning, then write the customer feedback back to the opportunity.",
  },
};

function decisionOverrides(locale: Locale): Record<string, { problem: string; risk: string; nextAction: string }> {
  return locale === "en" ? STANDARD_DEMO_DECISION_OVERRIDES_EN : STANDARD_DEMO_DECISION_OVERRIDES;
}

function cleanDashboardText(value: unknown, locale: Locale): string {
  return typeof value === "string" ? visibleBusinessText(value, locale).replace(/\s+/g, " ").trim() : "";
}

function firstDashboardText(locale: Locale, ...values: unknown[]): string {
  for (const value of values) {
    const text = cleanDashboardText(value, locale);
    if (text) return text;
  }
  return "";
}

function taskTime(task: Task): number {
  return new Date(task.dueDate ?? task.updatedAt ?? task.createdAt).getTime();
}

function findScopedNextTask(tasks: Task[], accountId: string, opportunityId: string): Task | undefined {
  const openTasks = tasks
    .filter((task) => task.status !== "done")
    .filter((task) => task.opportunityId === opportunityId || task.accountId === accountId)
    .sort((a, b) => taskTime(a) - taskTime(b));
  return openTasks.find((task) => task.opportunityId === opportunityId) ?? openTasks[0];
}

function rankPlayForHorizon(play: StrategicPlay): number {
  let score = Math.max(0, 100 - (play.confidence ?? 0));
  if (play.momentum === "blocked") score += 80;
  if (play.momentum === "stalled") score += 65;
  if (play.momentum === "slowing") score += 45;
  if ((play.daysSinceProgress ?? 0) >= 14) score += 35;
  if (play.assumptions?.some((assumption) => assumption.status === "invalidated")) score += 30;
  if (play.steps?.some((step) => step.status === "blocked" || step.status === "invalidated")) score += 25;
  return score;
}

function pickPlayForOpportunity(plays: StrategicPlay[], accountId: string, opportunityId: string): StrategicPlay | undefined {
  return [...plays]
    .filter((play) => OPEN_PLAY_STATUSES.has(play.status))
    .filter((play) => play.accountId === accountId)
    .filter((play) => !play.opportunityId || play.opportunityId === opportunityId)
    .sort((a, b) => rankPlayForHorizon(b) - rankPlayForHorizon(a))[0];
}

function pickPrimaryStep(play?: StrategicPlay): StrategicPlay["steps"][number] | undefined {
  if (!play) return undefined;
  const statusWeight = new Map<string, number>([
    ["blocked", 5],
    ["invalidated", 4],
    ["in_progress", 3],
    ["planned", 2],
    ["pending", 1],
  ]);
  return [...(play.steps ?? [])]
    .filter((step) => EXECUTABLE_STEP_STATUSES.has(step.status))
    .sort((a, b) => (statusWeight.get(b.status) ?? 0) - (statusWeight.get(a.status) ?? 0) || a.index - b.index)[0];
}

function horizonStatusLabel(item: HorizonDecisionItem | undefined | null, locale: Locale): string {
  if (!item) return l(locale, "等待反馈", "Waiting for feedback");
  if (decisionOverrides(locale)[item.opportunity.id] && item.moujuState.status === "no_plan") {
    return l(locale, "需要反馈校准", "Needs feedback calibration");
  }
  return visibleBusinessText(item.moujuState.label, locale);
}

function HorizonDecisionHomepage({
  roleLevel,
  accounts,
  opportunities,
  tasks,
  orgMembers,
  locale,
}: {
  roleLevel: UserRoleLevel;
  accounts: Account[];
  opportunities: Opportunity[];
  tasks: Task[];
  orgMembers: OrgMember[];
  locale: Locale;
}) {
  const currency = useStore((s) => s.currencyCode);
  const [plays, setPlays] = useState<StrategicPlay[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/strategic-play")
      .then((res) => (res.ok ? res.json() : { plays: [] }))
      .then((data: { plays?: StrategicPlay[] }) => {
        if (!cancelled) setPlays(data.plays ?? []);
      })
      .catch(() => {
        if (!cancelled) setPlays([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const openTasks = tasks.filter((task) => task.status !== "done");
  const overdueTasks = openTasks.filter((task) => task.dueDate && new Date(task.dueDate) < today);
  const activeOpps = opportunities.filter((opp) => opp.stage !== "closed_won" && opp.stage !== "closed_lost");
  const decisionItems = activeOpps
    .map((opp): HorizonDecisionItem | null => {
      const account = accounts.find((item) => item.id === opp.accountId);
      if (!account) return null;
      const nextTask = findScopedNextTask(openTasks, account.id, opp.id);
      const play = pickPlayForOpportunity(plays, account.id, opp.id);
      const primaryStep = pickPrimaryStep(play);
      const ownerId = opp.assignedTo ?? opp.userId ?? account.ownerId ?? account.userId ?? nextTask?.assignedTo ?? nextTask?.userId;
      const owner = ownerId ? orgMembers.find((member) => member.userId === ownerId) : undefined;
      const ownerName = owner?.displayName || owner?.email || opp.owner || l(locale, "未分配", "Unassigned");
      const evidenceScore = opp.meddicc?.overallScore ?? 0;
      const demoOverride = decisionOverrides(locale)[opp.id];
      const moujuState = buildMoujuStateForTarget({
        plays,
        accountId: account.id,
        opportunity: opp,
        accountName: account.name,
        locale,
      });
      const overdue = nextTask?.dueDate ? new Date(nextTask.dueDate) < today : false;
      const closeDays = Math.max(0, Math.ceil((new Date(opp.expectedCloseDate).getTime() - today.getTime()) / 86_400_000));
      const weakEvidence = evidenceScore < 60 || account.dealHealth === "critical";
      const severity =
        moujuState.status === "needs_executive_intervention" ? 5 :
        moujuState.status === "needs_calibration" ? 4 :
        moujuState.status === "stale" ? 3 :
        moujuState.status === "no_plan" ? 2 :
        evidenceScore < 50 ? 1 : 0;
      const riskDetail = firstDashboardText(
        locale,
        primaryStep?.blockerReason,
        primaryStep?.risk,
        demoOverride?.risk,
        moujuState.risk,
        play?.riskCounterEvidence?.[0],
        opp.meddicc?.competition?.find((competitor) => competitor.threatLevel === "high")?.ourAdvantage,
        weakEvidence ? l(locale, `${account.name} / ${opp.name} 的反馈健康度只有 ${evidenceScore}，当前判断不够可信。`, `${account.name} / ${opp.name} has an evidence health score of only ${evidenceScore}, so the current judgment is not reliable enough.`) : "",
      );
      const nextAction = firstDashboardText(
        locale,
        primaryStep?.nextAction,
        primaryStep?.action,
        demoOverride?.nextAction,
        nextTask?.title,
        moujuState.nextAction,
        primaryStep?.title,
        l(locale, `让 ${ownerName} 向客户确认下一步承诺，并把客户反馈回写到商机。`, `Ask ${ownerName} to confirm the customer's next-step commitment and write the feedback back to the opportunity.`),
      );
      const problemText = firstDashboardText(
        locale,
        demoOverride?.problem,
        moujuState.status === "no_plan" ? l(locale, `${opp.name} 还没有活跃谋局承接，风险、下一步和 owner 判断容易停留在人脑里。`, `${opp.name} does not have an active play, so risk, next move, and owner judgment may stay implicit.`) : "",
        moujuState.situation,
        primaryStep?.purpose,
        opp.notes,
        l(locale, `${account.name} 的 ${opp.name} 当前处于 ${getStageShortLabel(opp.stage, locale)}，需要判断推进路径是否仍成立。`, `${account.name}'s ${opp.name} is currently in ${getStageShortLabel(opp.stage, locale)}; confirm whether the path still holds.`),
      );
      const executiveAction = firstDashboardText(locale, primaryStep?.target ? l(locale, `让 ${ownerName} 推动 ${primaryStep.target} 完成：${nextAction}`, `Have ${ownerName} drive ${primaryStep.target} to complete: ${nextAction}`) : "", nextAction);
      const decisionTextByRole: Record<UserRoleLevel, string> = {
        executive: l(locale, `${account.name} 的 ${opp.name}（${formatCurrency(opp.value, currency)}，${getStageShortLabel(opp.stage, locale)}）卡在：${riskDetail} 今天要决定是否投入高层资源；动作是 ${executiveAction}`, `${account.name}'s ${opp.name} (${formatCurrency(opp.value, currency)}, ${getStageShortLabel(opp.stage, locale)}) is blocked by: ${riskDetail} Decide today whether to commit executive resources; the action is ${executiveAction}`),
        director: l(locale, `${ownerName} 负责的 ${account.name} / ${opp.name} 需要校准：${riskDetail} 今天主管要推动的动作是 ${nextAction}`, `${account.name} / ${opp.name}, owned by ${ownerName}, needs calibration: ${riskDetail} The manager action today is ${nextAction}`),
        ae: l(locale, `今天先推进 ${account.name} / ${opp.name}：${nextAction} 风险是 ${riskDetail}`, `Start today with ${account.name} / ${opp.name}: ${nextAction} Risk: ${riskDetail}`),
      };
      const executiveScore =
        opp.value / 100_000 +
        (moujuState.status === "needs_executive_intervention" ? 600 : 0) +
        (severity * 70) +
        (evidenceScore < 50 ? 90 : 0) +
        (closeDays <= 30 ? 70 : 0) +
        (account.dealHealth === "critical" ? 70 : 0);
      const directorScore =
        (severity * 85) +
        (overdue ? 90 : 0) +
        (evidenceScore < 60 ? 60 : 0) +
        (moujuState.status === "no_plan" ? 60 : 0) +
        (play?.momentum === "stalled" || play?.momentum === "slowing" ? 45 : 0) +
        opp.value / 250_000;
      const aeScore =
        (nextTask ? 120 : 0) +
        (overdue ? 90 : 0) +
        (primaryStep ? 70 : 0) +
        (severity * 35) +
        opp.value / 400_000;
      const score = roleLevel === "executive" ? executiveScore : roleLevel === "director" ? directorScore : aeScore;

      return {
        id: opp.id,
        href: `/pipeline/${opp.id}`,
        account,
        opportunity: opp,
        ownerName,
        evidenceScore,
        moujuState,
        nextTask,
        primaryStep,
        problemText,
        riskDetail,
        nextAction,
        decisionText: decisionTextByRole[roleLevel] ?? decisionTextByRole.ae,
        meta: [
          l(locale, `金额 ${formatCurrency(opp.value, currency)}`, `Value ${formatCurrency(opp.value, currency)}`),
          l(locale, `反馈健康度 ${evidenceScore}`, `Evidence health ${evidenceScore}`),
          closeDays <= 90 ? l(locale, `${closeDays} 天内预计签约`, `Expected close in ${closeDays} days`) : null,
          overdue ? l(locale, "有逾期动作", "Has overdue action") : null,
        ].filter(Boolean).join(" · "),
        score,
        severity,
        dueDate: nextTask?.dueDate,
      };
    })
    .filter((item): item is HorizonDecisionItem => item !== null)
    .sort((a, b) => b.score - a.score || b.opportunity.value - a.opportunity.value);
  const focusItem = decisionItems[0];
  const focusOpp = focusItem?.opportunity;
  const focusAccount = focusItem?.account ?? getFocusAccount(accounts, opportunities);
  const ownerName = focusItem?.ownerName ?? l(locale, "未分配", "Unassigned");
  const statusLabel = horizonStatusLabel(focusItem, locale);
  const targetName = focusAccount?.name ?? l(locale, "未选择客户", "No account selected");
  const opportunityName = focusOpp?.name ?? l(locale, "暂无明确商机", "No clear opportunity");
  const decisionText = focusItem?.decisionText ?? l(locale, "当前缺少足够客户互动或反馈记录，先录入最新客户反馈。", "There is not enough customer interaction or feedback yet; record the latest customer feedback first.");
  const problemText = focusItem?.problemText ?? (overdueTasks.length > 0
      ? l(locale, `${overdueTasks.length} 个动作已逾期，全景判断无法判断真实推进节奏。`, `${overdueTasks.length} actions are overdue, so Horizon cannot judge the real deal cadence.`)
      : l(locale, "当前缺少足够客户互动或反馈记录，全景判断还不能形成高置信判断。", "There is not enough customer interaction or feedback for a high-confidence Horizon judgment."));
  const riskDetail = focusItem?.riskDetail ?? (overdueTasks.length > 0
      ? l(locale, "逾期动作会让客户节奏失真，预测和负责人判断都会变弱。", "Overdue actions distort customer cadence and weaken both forecast and ownership judgment.")
      : l(locale, "没有输入就没有判断，AI 只能给泛化建议。", "Without input there is no judgment; AI can only give generic advice."));
  const focusMeta = [
    focusItem?.meta,
    overdueTasks.length > 0 ? l(locale, `${overdueTasks.length} 个逾期动作`, `${overdueTasks.length} overdue actions`) : null,
  ].filter(Boolean).join(" · ");
  const riskDecisionCount = decisionItems.filter((item) => item.severity > 0).length;
  const actionableDecisionItems = decisionItems.filter((item) => item.severity > 0 || item.nextTask || item.primaryStep);
  const decisionQueue = actionableDecisionItems.filter((item) => item.id !== focusItem?.id).slice(0, 3);
  const inspectItems = [
    riskDecisionCount > 0 ? l(locale, `${riskDecisionCount} 个风险商机`, `${riskDecisionCount} risk deals`) : l(locale, "暂无高风险商机", "No high-risk deals"),
    overdueTasks.length > 0 ? l(locale, `${overdueTasks.length} 个逾期动作`, `${overdueTasks.length} overdue actions`) : l(locale, "暂无逾期动作", "No overdue actions"),
    focusOpp ? l(locale, `${focusAccount?.name ?? "未知客户"} / ${focusOpp.name} 的负责人是 ${ownerName}`, `${focusAccount?.name ?? "Unknown account"} / ${focusOpp.name} is owned by ${ownerName}`) : l(locale, "负责人待分配", "Owner pending"),
  ];
  const statusDetails = [
    { label: l(locale, "负责人", "Owner"), value: ownerName },
    { label: l(locale, "当前信号", "Current signal"), value: focusMeta || l(locale, "等待输入", "Waiting for input") },
    { label: l(locale, "状态", "Status"), value: statusLabel },
  ];

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-secondary">{l(locale, "全景判断", "Horizon Judgment")}</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{l(locale, "关键判断", "Key Judgment")}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {focusAccount ? (
              <Link href={`/accounts/${focusAccount.id}`} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20">
                {l(locale, "打开客户", "Open Account")}
              </Link>
            ) : null}
            {focusOpp ? (
              <Link href={`/pipeline/${focusOpp.id}`} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover">
                {l(locale, "打开商机", "Open Opportunity")}
              </Link>
            ) : null}
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{l(locale, "需要判断", "Needs judgment")}</p>
              <h3 className="mt-1 text-base font-semibold leading-6 text-foreground">
                {targetName} · {opportunityName}
              </h3>
              <p className="text-sm font-medium leading-6 text-foreground">{visibleBusinessText(decisionText, locale)}</p>
              <div className="grid gap-3 lg:grid-cols-3">
                <div className="rounded-lg border border-border bg-background/70 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{l(locale, "要判断什么", "What to judge")}</p>
                  <p className="mt-2 text-sm font-medium leading-6 text-foreground">{visibleBusinessText(problemText, locale)}</p>
                </div>
                <div className="rounded-lg border border-warning/25 bg-warning/5 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-warning">{l(locale, "为什么现在", "Why now")}</p>
                  <p className="mt-2 text-sm font-medium leading-6 text-foreground">{visibleBusinessText(riskDetail, locale)}</p>
                </div>
                <div className="rounded-lg border border-positive/25 bg-positive/5 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-positive">{l(locale, "下一步", "Next move")}</p>
                  <p className="mt-2 text-sm font-medium leading-6 text-foreground">{visibleBusinessText(focusItem?.nextAction ?? l(locale, "先确认客户反馈，再把下一步动作分派给负责人。", "Confirm customer feedback first, then assign the next move to the owner."), locale)}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-background/70 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">{l(locale, "当前信号与状态", "Signals and status")}</p>
              <div className="mt-3 space-y-2">
                {statusDetails.map((item) => (
                  <div key={item.label} className="rounded-lg border border-border bg-card/70 px-3 py-2">
                    <p className="text-[11px] font-semibold tracking-wide text-muted">{item.label}</p>
                    <p className="mt-1 whitespace-normal break-words text-xs font-medium leading-5 text-foreground">
                      {visibleBusinessText(item.value, locale)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {decisionQueue.length > 0 ? (
          <div className="mt-3 rounded-xl border border-border bg-background/60 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">{l(locale, "其他判断队列", "Other judgment queue")}</p>
                <p className="mt-1 text-xs text-muted">{l(locale, "顶部已展开当前优先项；这里只列还需要继续处理的其他客户、商机、风险和动作。", "The top priority is expanded above; this lists the other accounts, opportunities, risks, and actions still needing review.")}</p>
              </div>
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                {countLabel(locale, Math.max(0, actionableDecisionItems.length - (focusItem ? 1 : 0)), "项", "item")}
              </span>
            </div>
            <div className="mt-3 divide-y divide-border">
              {decisionQueue.map((item) => (
                <Link key={item.id} href={item.href} className="grid gap-2 py-3 first:pt-0 last:pb-0 lg:grid-cols-[1.1fr_0.8fr_0.8fr] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-accent/20 bg-accent/8 px-2 py-0.5 text-[11px] font-semibold text-accent">{horizonStatusLabel(item, locale)}</span>
                      <span className="truncate text-sm font-semibold text-foreground">{item.account.name} · {item.opportunity.name}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-warning">{l(locale, "风险", "Risk")}: {visibleBusinessText(item.riskDetail, locale)}</p>
                    <p className="mt-1 text-[11px] text-muted">{visibleBusinessText(item.moujuState.evidence, locale)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold tracking-wide text-muted">{l(locale, "负责人", "Owner")}</p>
                    <p className="mt-1 truncate text-xs font-medium text-foreground">{item.ownerName}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-positive">{l(locale, "今天动作", "Today's action")}</p>
                    <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-foreground">{visibleBusinessText(item.nextAction, locale)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
        <details className="mt-3 rounded-xl border border-border bg-background/50 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-secondary">{l(locale, "展开信号和依据", "Expand signals and rationale")}</summary>
          <div className="mt-2 grid gap-2 text-xs leading-5 text-muted sm:grid-cols-3">
            {inspectItems.map((item) => <span key={item}>{visibleBusinessText(item, locale)}</span>)}
          </div>
        </details>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Today's Priorities — computed from data
// ═══════════════════════════════════════════════════════════════════════

function TodaysPriorities({
  opportunities,
  accounts,
  tasks,
  locale,
}: {
  opportunities: Opportunity[];
  accounts: SituationAccount[];
  tasks: Array<{ id: string; title: string; status: string; dueDate?: string; priority: string }>;
  locale: Locale;
}) {
  const priorities: { id: string; label: string; detail: string; href: string; urgency: "high" | "medium" | "low" }[] = [];

  // Overdue tasks
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = tasks.filter((t) => t.status !== "done" && t.dueDate && new Date(t.dueDate) < today);
  for (const t of overdue.slice(0, 2)) {
    priorities.push({
      id: `task-${t.id}`,
      label: t.title,
      detail: l(locale, "已逾期", "Overdue"),
      href: "/pulse",
      urgency: "high",
    });
  }

  // Critical deals
  const criticalDeals = opportunities
    .filter((o) => o.stage !== "closed_won" && o.stage !== "closed_lost" && (o.meddicc?.overallScore ?? 0) < 30)
    .slice(0, 2);
  for (const deal of criticalDeals) {
    const acct = accounts.find((a) => a.id === deal.accountId);
    priorities.push({
      id: `deal-${deal.id}`,
      label: l(locale, `${deal.name} 需要推进`, `${deal.name} needs progress`),
      detail: acct ? l(locale, `${acct.name} · 证据健康度 ${deal.meddicc?.overallScore ?? 0}`, `${acct.name} · Evidence health ${deal.meddicc?.overallScore ?? 0}`) : l(locale, `证据健康度 ${deal.meddicc?.overallScore ?? 0}`, `Evidence health ${deal.meddicc?.overallScore ?? 0}`),
      href: `/pipeline/${deal.id}`,
      urgency: "high",
    });
  }

  // Due today tasks
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);
  const dueToday = tasks.filter(
    (t) => t.status !== "done" && t.dueDate && new Date(t.dueDate) >= today && new Date(t.dueDate) <= endOfToday
  );
  for (const t of dueToday.slice(0, 2)) {
    if (priorities.length >= 5) break;
    priorities.push({
      id: `today-${t.id}`,
      label: t.title,
      detail: l(locale, "今日到期", "Due today"),
      href: "/pulse",
      urgency: "medium",
    });
  }

  if (priorities.length === 0) {
    return (
      <div className="rounded-2xl border p-4 shadow-[var(--dash-card-shadow)]" style={{ borderColor: 'var(--dash-card-border)', backgroundColor: 'var(--dash-card-bg)' }}>
        <div className="mb-2 flex items-center gap-2">
          <Zap className="h-4 w-4" style={{ color: 'var(--dash-icon-accent)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--dash-text-primary)' }}>{l(locale, "今日优先", "Today's priorities")}</h3>
        </div>
        <p className="py-2 text-xs" style={{ color: 'var(--dash-text-secondary)' }}>{l(locale, "暂无紧急事项，保持推进节奏", "No urgent items. Keep the current cadence.")}</p>
      </div>
    );
  }

  const urgencyColors: Record<string, string> = {
    high: "var(--dash-health-bad)",
    medium: "var(--dash-health-warn)",
    low: "var(--dash-text-tertiary)",
  };

  return (
    <div className="rounded-2xl border p-4 shadow-[var(--dash-card-shadow)]" style={{ borderColor: 'var(--dash-card-border)', backgroundColor: 'var(--dash-card-bg)' }}>
      <div className="mb-3 flex items-center gap-2">
        <Zap className="h-4 w-4" style={{ color: 'var(--dash-icon-accent)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--dash-text-primary)' }}>{l(locale, "今日优先", "Today's priorities")}</h3>
        <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: 'var(--dash-counter-bg)', color: 'var(--dash-icon-accent)' }}>
          {priorities.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {priorities.map((p) => (
          <Link
            key={p.id}
            href={p.href}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors"
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--dash-hover-bg)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: urgencyColors[p.urgency] }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" style={{ color: 'var(--dash-text-primary)' }}>{p.label}</p>
              <p className="text-[11px]" style={{ color: 'var(--dash-text-secondary)' }}>{p.detail}</p>
            </div>
            <ArrowRight className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--dash-text-tertiary)' }} />
          </Link>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Mini Pipeline Chart — simple bar visualization
// ═══════════════════════════════════════════════════════════════════════

function MiniPipelineChart({ opportunities, locale }: { opportunities: Opportunity[]; locale: Locale }) {
  const stages = useMemo(() => {
    const stageOrder: OpportunityStage[] = [
      "discovery",
      "solution_presented",
      "proposal_sent",
      "negotiation",
      "contract_review",
    ];
    const active = opportunities.filter(
      (o) => o.stage !== "closed_won" && o.stage !== "closed_lost"
    );
    const max = Math.max(1, ...stageOrder.map((s) => active.filter((o) => o.stage === s).length));
    return stageOrder.map((s) => ({
      stage: s,
      label: getStageShortLabel(s, locale),
      count: active.filter((o) => o.stage === s).length,
      pct: (active.filter((o) => o.stage === s).length / max) * 100,
    }));
  }, [opportunities, locale]);

  return (
    <div className="rounded-2xl border p-4 shadow-[var(--dash-card-shadow)]" style={{ borderColor: 'var(--dash-card-border)', backgroundColor: 'var(--dash-card-bg)' }}>
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4" style={{ color: 'var(--dash-icon-accent)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--dash-text-primary)' }}>{l(locale, "管线分布", "Pipeline Distribution")}</h3>
      </div>
      <div className="space-y-2">
        {stages.map((s) => (
          <div key={s.stage} className="flex items-center gap-3">
            <span className="w-12 truncate text-right text-[11px]" style={{ color: 'var(--dash-text-tertiary)' }}>{s.label}</span>
            <div className="h-5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--dash-card-divider)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(s.count > 0 ? 8 : 0, s.pct)}%`, background: 'var(--dash-pipeline-bar)' }}
              />
            </div>
            <span className="w-6 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--dash-text-secondary)' }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Today Situation Scaffold — 4-quadrant deal overview
// ═══════════════════════════════════════════════════════════════════════

const STAGE_STEPS: Partial<Record<OpportunityStage, string>> = {
  lead_identified: "完成初步调研，确认进入机会",
  discovery: "深挖痛点与预算，推进发现",
  solution_presented: "推进决策者会面，跟进反馈",
  proposal_sent: "跟进方案反馈，推进决策",
  negotiation: "推进条款谈判，锁定条件",
  contract_review: "跟进合同签署，消除阻力",
};

const STAGE_STEPS_EN: Partial<Record<OpportunityStage, string>> = {
  lead_identified: "Complete initial research and confirm opportunity entry",
  discovery: "Deepen pain and budget discovery",
  solution_presented: "Drive decision-maker meeting and follow-up feedback",
  proposal_sent: "Follow proposal feedback and move toward decision",
  negotiation: "Advance commercial negotiation and lock terms",
  contract_review: "Follow contract signature and remove blockers",
};

const STAGE_SHORT_LABELS_EN: Partial<Record<OpportunityStage, string>> = {
  lead_identified: "Lead",
  discovery: "Discovery",
  solution_presented: "Solution",
  proposal_sent: "Proposal",
  negotiation: "Negotiation",
  contract_review: "Contract",
  closed_won: "Won",
  closed_lost: "Lost",
};

type SituationAccount = { id: string; name: string; dealHealth?: string };
type SituationMode = "push" | "stuck" | "replan" | "won";

function getSituationAccountName(accounts: SituationAccount[], accountId: string): string {
  return accounts.find((a) => a.id === accountId)?.name ?? "—";
}

function getStageShortLabel(stage: OpportunityStage, locale: Locale): string {
  return locale === "en" ? STAGE_SHORT_LABELS_EN[stage] ?? stage : STAGE_SHORT_LABELS[stage] ?? stage;
}

function getSituationDealTag(
  opp: Opportunity,
  accounts: SituationAccount[],
  mode: SituationMode,
  locale: Locale,
): { label: string; color: string; bg: string } {
  const score = opp.meddicc?.overallScore ?? 0;
  const acct = accounts.find((a) => a.id === opp.accountId);
  if (mode === "won") {
    if (opp.stage === "closed_won") return { label: l(locale, "已成单", "Won"), color: "var(--dash-icon-accent)", bg: "var(--dash-counter-bg)" };
    return { label: l(locale, `证据健康 ${score}`, `Evidence ${score}`), color: "var(--dash-health-good)", bg: "rgba(34,197,94,0.08)" };
  }
  if (mode === "push") return { label: l(locale, `局势可信 ${score}`, `Trusted ${score}`), color: "var(--dash-health-good)", bg: "rgba(34,197,94,0.08)" };
  if (mode === "stuck") {
    const label = acct?.dealHealth === "critical" ? l(locale, "极高风险", "Critical") : acct?.dealHealth === "at_risk" ? l(locale, "有风险", "At risk") : l(locale, `证据薄 ${score}`, `Thin evidence ${score}`);
    return { label, color: "var(--dash-health-bad)", bg: "rgba(239,68,68,0.08)" };
  }
  return { label: l(locale, "需重规划", "Replan"), color: "var(--dash-health-warn)", bg: "rgba(245,158,11,0.08)" };
}

function getSituationDealStep(opp: Opportunity, accounts: SituationAccount[], mode: SituationMode, locale: Locale): string {
  const score = opp.meddicc?.overallScore ?? 0;
  const acct = accounts.find((a) => a.id === opp.accountId);
  if (mode === "won") return opp.wonDate ? l(locale, `${timeAgo(opp.wonDate)}成单 · 巩固关系`, `Won ${timeAgo(opp.wonDate)} · reinforce relationship`) : l(locale, "巩固客户关系", "Reinforce customer relationship");
  if (mode === "replan") return score < 15 ? l(locale, "重新评估进入策略", "Reassess entry strategy") : l(locale, "审视局势，制定新打法", "Review the situation and reset the plan");
  if (mode === "stuck") {
    if (acct?.dealHealth === "critical") return l(locale, "紧急盘活：恢复关键人关系", "Urgent recovery: rebuild key stakeholder relationship");
    if (acct?.dealHealth === "at_risk") return l(locale, "识别风险源，制定应对", "Identify risk source and prepare response");
    return l(locale, "补齐关键人、痛点、流程证据", "Fill stakeholder, pain, and process evidence gaps");
  }
  return locale === "en" ? STAGE_STEPS_EN[opp.stage] ?? "Move to the next stage" : STAGE_STEPS[opp.stage] ?? "推进下一阶段";
}

function SituationOpportunityList({
  accounts,
  opps,
  mode,
  empty,
  locale,
}: {
  accounts: SituationAccount[];
  opps: Opportunity[];
  mode: SituationMode;
  empty: string;
  locale: Locale;
}) {
  if (opps.length === 0) {
    return <p className="py-1.5 text-[11px]" style={{ color: "var(--dash-text-tertiary)" }}>{empty}</p>;
  }
  return (
    <div className="space-y-1.5">
      {opps.map((opp) => {
        const tag = getSituationDealTag(opp, accounts, mode, locale);
        const step = getSituationDealStep(opp, accounts, mode, locale);
        return (
          <Link
            key={opp.id}
            href={`/pipeline/${opp.id}`}
            className="flex flex-col gap-0.5 rounded-lg px-2.5 py-1.5 transition-colors"
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--dash-hover-bg)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: "var(--dash-text-primary)" }}>
                {opp.name}
              </span>
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold"
                style={{ color: tag.color, backgroundColor: tag.bg }}
              >
                {tag.label}
              </span>
            </div>
            <div className="text-[11px]" style={{ color: "var(--dash-text-tertiary)" }}>{getSituationAccountName(accounts, opp.accountId)}</div>
            <div className="text-[11px]" style={{ color: "var(--dash-text-secondary)" }}>→ {step}</div>
          </Link>
        );
      })}
    </div>
  );
}

function TodaySituationScaffold({
  opportunities,
  accounts,
  locale,
}: {
  opportunities: Opportunity[];
  accounts: Array<{ id: string; name: string; dealHealth?: string }>;
  locale: Locale;
}) {
  const activeOpps = useMemo(
    () => opportunities.filter((o) => o.stage !== "closed_won" && o.stage !== "closed_lost"),
    [opportunities]
  );

  // Q1: Today's push — late-stage or meaningful meddicc score
  const todayPush = useMemo(() => {
    const lateStages: OpportunityStage[] = ["proposal_sent", "negotiation", "contract_review"];
    return activeOpps
      .filter((o) => lateStages.includes(o.stage) || (o.meddicc?.overallScore ?? 0) >= 50)
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
  }, [activeOpps]);

  // Q2: Stuck — low meddicc or account at-risk / critical
  const stuck = useMemo(() => {
    return activeOpps
      .filter((o) => {
        const score = o.meddicc?.overallScore ?? 0;
        const acct = accounts.find((a) => a.id === o.accountId);
        return score < 30 || acct?.dealHealth === "at_risk" || acct?.dealHealth === "critical";
      })
      .sort((a, b) => (a.meddicc?.overallScore ?? 0) - (b.meddicc?.overallScore ?? 0))
      .slice(0, 3);
  }, [activeOpps, accounts]);

  // Q3: Needs replan — very low meddicc + early stage, or critical account health
  const needsReplan = useMemo(() => {
    return activeOpps
      .filter((o) => {
        const score = o.meddicc?.overallScore ?? 0;
        const acct = accounts.find((a) => a.id === o.accountId);
        const isEarly = o.stage === "lead_identified" || o.stage === "discovery" || o.stage === "solution_presented";
        return (isEarly && score < 30) || acct?.dealHealth === "critical" || score < 15;
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
  }, [activeOpps, accounts]);

  // Q4: Recently won or well-progressing (high meddicc supplement if few wins)
  const wonOrWell = useMemo(() => {
    const wonRecent = opportunities
      .filter((o) => o.stage === "closed_won" && o.wonDate)
      .sort((a, b) => new Date(b.wonDate!).getTime() - new Date(a.wonDate!).getTime())
      .slice(0, 3);
    if (wonRecent.length >= 2) return wonRecent;
    const supplement = activeOpps
      .filter((o) => (o.meddicc?.overallScore ?? 0) >= 65)
      .sort((a, b) => (b.meddicc?.overallScore ?? 0) - (a.meddicc?.overallScore ?? 0))
      .slice(0, 3 - wonRecent.length);
    return [...wonRecent, ...supplement].slice(0, 3);
  }, [opportunities, activeOpps]);

  const totalCount = todayPush.length + stuck.length + needsReplan.length + wonOrWell.length;
  if (totalCount === 0) return null;


  return (
    <div
      className="rounded-2xl border shadow-[var(--dash-card-shadow)]"
      style={{ borderColor: "var(--dash-card-border)", backgroundColor: "var(--dash-card-bg)" }}
    >
      <div
        className="flex items-center gap-2 border-b px-4 pt-4 pb-3"
        style={{ borderColor: "var(--dash-card-divider)" }}
      >
        <Radio className="h-4 w-4" style={{ color: "var(--dash-icon-accent)" }} />
        <h3 className="text-sm font-semibold" style={{ color: "var(--dash-text-primary)" }}>{l(locale, "全景判断 / 今日局势", "Horizon / Today's Situation")}</h3>
        <span
          className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ backgroundColor: "var(--dash-counter-bg)", color: "var(--dash-icon-accent)" }}
        >
          {totalCount}
        </span>
      </div>
      <div
        className="grid grid-cols-1 gap-px sm:grid-cols-2"
        style={{ backgroundColor: "var(--dash-card-divider)" }}
      >
        {/* Q1: 今日最值得推进 */}
        <div className="p-4" style={{ backgroundColor: "var(--dash-card-bg)" }}>
          <div className="mb-2.5 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" style={{ color: "var(--dash-health-good)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--dash-text-secondary)" }}>{l(locale, "今日最值得推进", "Best to advance today")}</span>
            {todayPush.length > 0 && (
              <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--dash-text-tertiary)" }}>{todayPush.length}</span>
            )}
          </div>
          <SituationOpportunityList accounts={accounts} opps={todayPush} mode="push" empty={l(locale, "暂无值得强推的客户局势", "No customer situation worth forcing today")} locale={locale} />
        </div>
        {/* Q2: 卡住的局 */}
        <div className="p-4" style={{ backgroundColor: "var(--dash-card-bg)" }}>
          <div className="mb-2.5 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--dash-health-bad)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--dash-text-secondary)" }}>{l(locale, "卡住的局", "Stuck situations")}</span>
            {stuck.length > 0 && (
              <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--dash-text-tertiary)" }}>{stuck.length}</span>
            )}
          </div>
          <SituationOpportunityList accounts={accounts} opps={stuck} mode="stuck" empty={l(locale, "暂无卡住的客户局势", "No stuck customer situations")} locale={locale} />
        </div>
        {/* Q3: 需要重规划 */}
        <div className="p-4" style={{ backgroundColor: "var(--dash-card-bg)" }}>
          <div className="mb-2.5 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" style={{ color: "var(--dash-health-warn)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--dash-text-secondary)" }}>{l(locale, "需要重规划", "Needs replan")}</span>
            {needsReplan.length > 0 && (
              <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--dash-text-tertiary)" }}>{needsReplan.length}</span>
            )}
          </div>
          <SituationOpportunityList accounts={accounts} opps={needsReplan} mode="replan" empty={l(locale, "暂无需要重排打法的客户局势", "No customer situations need a reset")} locale={locale} />
        </div>
        {/* Q4: 推进顺利 / 近期完成 */}
        <div className="p-4" style={{ backgroundColor: "var(--dash-card-bg)" }}>
          <div className="mb-2.5 flex items-center gap-1.5">
            <Award className="h-3.5 w-3.5" style={{ color: "var(--dash-icon-accent)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--dash-text-secondary)" }}>{l(locale, "可信推进 / 近期完成", "Trusted progress / Recent wins")}</span>
            {wonOrWell.length > 0 && (
              <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--dash-text-tertiary)" }}>{wonOrWell.length}</span>
            )}
          </div>
          <SituationOpportunityList accounts={accounts} opps={wonOrWell} mode="won" empty={l(locale, "暂无已完成或证据健康的客户局势", "No recent wins or healthy customer situations")} locale={locale} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════

export default function DashboardPage() {
  const currency = useStore((s) => s.currencyCode);
  const { accounts, intelItems, emailDecodes, composedEmails, opportunities, tasks } = useRoleFilteredData();
  const { t, locale } = useLocale();
  const { orgId, orgName, orgRole, orgMembers, isDemo } = useAuth();
  const jobLevel = useEffectiveJobLevel();
  const roleLevel: UserRoleLevel = jobLevel >= 2 ? 'executive' : jobLevel >= 1 ? 'director' : 'ae';
  const dashboardRole = resolveDashboardRole(orgRole ?? 'member', jobLevel);
  const playPermissions = usePlayPermissions();
  const { getStageLabel: getDynStageLabel } = usePipelineStages();

  // State
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [overdueDismissed, setOverdueDismissed] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [persistedLeads, setPersistedLeads] = useState<SalesLead[]>([]);
  const userSettings = useStore((s) => s.userSettings);
  const quarterlyTarget = userSettings.quarterlyTarget;
  const monthlyTarget = userSettings.monthlyTarget;
  const coverageTarget = userSettings.coverageTarget;

  const filteredOpportunities = useMemo(
    () => filterByTimeRange(opportunities, timeRange),
    [opportunities, timeRange]
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/leads?status=all', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({})) as { leads?: SalesLead[] };
        if (!cancelled && res.ok && Array.isArray(data.leads)) setPersistedLeads(data.leads);
      })
      .catch(() => {
        if (!cancelled) setPersistedLeads([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // ── Computed data ──────────────────────────────────────────────
  const scopeKey: TranslationKey = isDemo
    ? jobLevel >= 2
      ? "dashboard.orgScope.all"
      : jobLevel >= 1
        ? "dashboard.orgScope.team"
        : "dashboard.orgScope.mine"
    : !orgRole || orgRole === "owner" || orgRole === "admin"
    ? "dashboard.orgScope.all"
    : jobLevel >= 1
      ? "dashboard.orgScope.team"
      : "dashboard.orgScope.mine";

  const overdueTaskCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return tasks.filter((t) => {
      if (t.status === "done" || !t.dueDate) return false;
      return new Date(t.dueDate) < today;
    }).length;
  }, [tasks]);

  const kpiStats = useMemo(() => {
    const activeOpps = opportunities.filter(
      (o) => o.stage !== "closed_won" && o.stage !== "closed_lost"
    );
    const activePipelineValue = activeOpps.reduce((sum, o) => sum + o.value, 0);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const wonThisMonth = opportunities.filter(
      (o) => o.stage === "closed_won" && o.wonDate && new Date(o.wonDate) >= startOfMonth
    );
    const wonThisMonthValue = wonThisMonth.reduce((sum, o) => sum + o.value, 0);
    const wonThisMonthCount = wonThisMonth.length;

    const allWon = opportunities.filter((o) => o.stage === "closed_won" && o.wonDate);
    const salesCycles = allWon.map((o) => daysBetween(o.createdAt, o.wonDate!));
    const avgSalesCycle = salesCycles.length > 0
      ? Math.round(salesCycles.reduce((a, b) => a + b, 0) / salesCycles.length)
      : null;

    const totalOpps = opportunities.length;
    const wonCount = opportunities.filter((o) => o.stage === "closed_won").length;
    const conversionRate = totalOpps > 0 ? Math.round((wonCount / totalOpps) * 100) : null;

    const convRate = totalOpps > 0 ? wonCount / totalOpps : 0;
    const avgCycleMonths = avgSalesCycle ? avgSalesCycle / 30 : 0;
    const pipelineVelocity = avgCycleMonths > 0
      ? activePipelineValue * convRate / avgCycleMonths
      : null;

    return { activePipelineValue, wonThisMonthValue, wonThisMonthCount, avgSalesCycle, conversionRate, pipelineVelocity };
  }, [opportunities]);

  const recentFeed = useMemo(() => {
    const items: { id: string; type: "decode" | "intel" | "task" | "opportunity"; title: string; subtitle: string; date: string; href: string }[] = [];

    for (const d of emailDecodes.filter(d => d.accountId).slice(0, 10)) {
      items.push({ id: `decode-${d.id}`, type: "decode", title: d.accountName || d.clientName || l(locale, "邮件解读", "Email decode"), subtitle: d.decode?.threadAnalysis?.keySignal || d.emailText.slice(0, 50), date: d.date, href: d.accountId ? `/accounts/${d.accountId}?tab=activity&targetKind=email_decode&targetId=${d.id}` : "/decode" });
    }
    for (const i of intelItems.slice(0, 10)) {
      items.push({ id: `intel-${i.id}`, type: "intel", title: i.accountName, subtitle: i.title || i.summary, date: i.date, href: `/accounts/${i.accountId}?tab=activity&targetKind=intel_item&targetId=${i.id}` });
    }
    for (const task of tasks.slice(0, 10)) {
      items.push({ id: `task-${task.id}`, type: "task", title: task.title, subtitle: task.description || `${task.priority} · ${task.status}`, date: task.updatedAt || task.createdAt, href: "/tasks" });
    }
    for (const opp of opportunities.slice(0, 10)) {
      items.push({ id: `opp-${opp.id}`, type: "opportunity", title: opp.name, subtitle: `${formatCurrency(opp.value, currency)} · ${getDynStageLabel(opp.stage) || STAGE_SHORT_LABELS[opp.stage] || opp.stage}`, date: opp.updatedAt || opp.createdAt, href: `/pipeline/${opp.id}` });
    }

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items.slice(0, 5);
  }, [emailDecodes, intelItems, tasks, opportunities, currency, getDynStageLabel, locale]);

  const stats = useMemo(() => {
    const totalAccounts = accounts.length;
    const activeOpps = filteredOpportunities.filter((o) => o.stage !== "closed_won" && o.stage !== "closed_lost");
    const activeDeals = activeOpps.length;
    const pipelineValue = activeOpps.reduce((sum, o) => sum + o.value, 0);
    const weekDecodes = emailDecodes.filter((d) => isThisWeek(d.date)).length;
    const wonDeals = filteredOpportunities.filter((o) => o.stage === "closed_won");
    const wonValue = wonDeals.reduce((sum, o) => sum + o.value, 0);
    const totalDeals = filteredOpportunities.length;
    const winRate = totalDeals > 0 ? Math.round((wonDeals.length / totalDeals) * 100) : 0;
    const meddiccScores = activeOpps.map((o) => getMeddiccScore(o.meddicc)).filter((s) => s > 0);
    const avgMeddicc = meddiccScores.length > 0 ? Math.round(meddiccScores.reduce((a, b) => a + b, 0) / meddiccScores.length) : 0;
    const coverage = quarterlyTarget > 0 ? (pipelineValue / quarterlyTarget) : 0;
    return { totalAccounts, activeDeals, pipelineValue, weekDecodes, wonValue, winRate, avgMeddicc, coverage };
  }, [accounts, filteredOpportunities, emailDecodes, quarterlyTarget]);

  const riskAccounts = useMemo(
    () => accounts.filter((a) => a.dealHealth === "critical" || a.dealHealth === "at_risk"),
    [accounts]
  );

  const riskDeals = useMemo(() => {
    return filteredOpportunities
      .filter((o) => o.stage !== "closed_won" && o.stage !== "closed_lost")
      .filter((o) => (o.meddicc?.overallScore ?? 0) < 50 || accounts.find((a) => a.id === o.accountId)?.dealHealth === 'critical')
      .slice(0, 8);
  }, [filteredOpportunities, accounts]);

  const salesWorkbenchModel = useMemo(() => buildSalesWorkbenchModel({
    accounts,
    opportunities,
    tasks,
    leads: persistedLeads,
    intelItems,
    decodes: emailDecodes,
    composedEmails,
  }), [accounts, opportunities, tasks, persistedLeads, intelItems, emailDecodes, composedEmails]);

  const hasData = accounts.length > 0 || intelItems.length > 0 || emailDecodes.length > 0;
  const hasOpportunities = filteredOpportunities.length > 0;

  // ── Role-based layout engine ──────────────────────────────────
  const { modules, isVisible } = useDashboardLayout(dashboardRole, jobLevel, orgId ?? "no-org");
  const modulesForRender = useMemo(() => {
    if (modules.some((module) => module.key === "horizon-decision-homepage")) return modules;
    const horizonModule = {
      key: "horizon-decision-homepage" as DashboardModuleKey,
      priority: 11,
      visible: true,
      defaultExpanded: null,
    };
    const nextModules = [...modules];
    const heroIndex = nextModules.findIndex((module) => module.key === "hero");
    nextModules.splice(heroIndex >= 0 ? heroIndex + 1 : 0, 0, horizonModule);
    return nextModules;
  }, [modules]);

  // ── Empty State ────────────────────────────────────────────────
  if (!hasData) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex max-w-md flex-col items-center text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-card card-elevated border border-border">
            <LayoutDashboard className="h-8 w-8 text-secondary" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">{t("dashboard.welcomeTitle")}</h1>
          <p className="mt-3 max-w-[360px] text-sm leading-relaxed text-muted">{t("dashboard.welcomeHint")}</p>
          <div className="mt-8 flex gap-3">
            <Link href="/accounts" className="flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-accent-hover hover:shadow-md">
              <Building2 className="h-4 w-4" />
              {t("dashboard.addAccount")}
            </Link>
            <Link href="/decode" className="flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-background">
              <ScanSearch className="h-4 w-4" />
              {t("dashboard.quickDecode")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Shared analytics collapsible section ───────────────────────
  const analyticsButton = (
    <button
      onClick={() => setAnalyticsOpen(!analyticsOpen)}
      className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-5 py-3.5 text-left transition-colors hover:bg-stripe"
    >
      <span className="text-sm font-semibold text-foreground">{l(locale, "详细分析", "Detailed Analytics")}</span>
      <ChevronDown className={`ml-auto h-4 w-4 text-muted transition-transform ${analyticsOpen ? 'rotate-180' : ''}`} />
    </button>
  );

  // Overdue banner
  const overdueBanner = overdueTaskCount > 0 && !overdueDismissed ? (
    <div className="flex items-center justify-between rounded-lg border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm">
      <Link href="/pulse" className="flex items-center gap-2 font-medium text-danger hover:underline">
        <AlertTriangle className="h-4 w-4" />
        {l(locale, `${overdueTaskCount} 个任务已逾期`, `${overdueTaskCount} tasks are overdue`)}
      </Link>
      <button onClick={() => setOverdueDismissed(true)} className="rounded p-1 text-secondary hover:text-primary hover:bg-surface-2">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  ) : null;

  // ═══════════════════════════════════════════════════════════════
  // Sales Command Center — Unified layout for all roles
  // ═══════════════════════════════════════════════════════════════
  const roleTitles: Record<UserRoleLevel, { kicker: string; title: string; subtitle: string }> = {
    executive: {
      kicker: l(locale, "全景判断 / 今日局势", "Horizon / Today's Situation"),
      title: l(locale, "高管资源介入判断", "Executive Resource Judgment"),
      subtitle: l(locale, "资源介入 · 预测风险 · 负责人", "Resource call · Forecast risk · Owner")
    },
    director: {
      kicker: l(locale, "全景判断 / 今日局势", "Horizon / Today's Situation"),
      title: l(locale, "团队局势判断", "Team Situation Judgment"),
      subtitle: l(locale, "卡点 · 证据 · coaching", "Blockers · Evidence · Coaching")
    },
    ae: {
      kicker: l(locale, "全景判断 / 今日局势", "Horizon / Today's Situation"),
      title: l(locale, "今日局势与下一步打法", "Today's Situation and Next Move"),
      subtitle: l(locale, "客户局势 · 下一步 · 证据", "Customer situation · Next move · Evidence")
    },
  };

  const rt = roleTitles[roleLevel] || roleTitles.ae;

  // Module registry: lazy factories to avoid evaluating JSX for hidden modules
  const moduleRegistry: Partial<Record<DashboardModuleKey, () => React.ReactNode>> = {
    "hero": () => (
      <div className="page-hero">
        <div className="page-hero-row">
          <div>
            <div className="page-kicker tracking-widest" style={{ color: 'var(--dash-kicker-color)' }}>{rt.kicker}</div>
            <h1 className="page-title">{rt.title}</h1>
            <p className="page-subtitle">{rt.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          </div>
        </div>
        <OrgHeader orgName={orgName} orgRole={orgRole} scopeLabel={t(scopeKey)} t={t} />
      </div>
    ),
    "horizon-decision-homepage": () => (
      <FadeIn delay={20}>
        <div className="space-y-4">
          <SalesWorkbench model={salesWorkbenchModel} locale={locale} />
          <HorizonDecisionHomepage
            roleLevel={roleLevel}
            accounts={accounts}
            opportunities={opportunities}
            tasks={tasks}
            orgMembers={orgMembers}
            locale={locale}
          />
        </div>
      </FadeIn>
    ),
    "getting-started": () => <GettingStartedCard />,
    "todays-priorities": () => (
      <FadeIn delay={40}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TodaysPriorities opportunities={opportunities} accounts={accounts} tasks={tasks} locale={locale} />
          {isVisible("key-account-focus") && (
            <KeyAccountSituation accounts={accounts} opportunities={opportunities} locale={locale} />
          )}
        </div>
      </FadeIn>
    ),
    "today-situation-scaffold": () => (
      <FadeIn delay={50}>
        <TodaySituationScaffold opportunities={opportunities} accounts={accounts} locale={locale} />
      </FadeIn>
    ),
    "portfolio-signals": () => {
      const highValueAccountIds = new Set(
        filteredOpportunities
          .filter((opportunity) => opportunity.stage !== "closed_won" && opportunity.stage !== "closed_lost")
          .sort((a, b) => b.value - a.value)
          .slice(0, 3)
          .map((opportunity) => opportunity.accountId),
      );
      return (
        <FadeIn delay={60}>
          <PortfolioSignalsCard
            fallbackSignals={accounts
              .filter((account) => highValueAccountIds.has(account.id))
              .slice(0, 3)
              .map((account) => ({
                accountId: account.id,
                accountName: account.name,
                summary: account.dealHealth === "critical"
                  ? l(locale, "该客户存在高风险信号，需要优先复核当前判断和推进路径。", "This account has high-risk signals; review the current judgment and path first.")
                  : l(locale, "该客户处于关键推进窗口，建议查看当前商机、证据和下一步动作。", "This account is in a key progress window; review the opportunity, evidence, and next move."),
              }))}
          />
        </FadeIn>
      );
    },
    "summary-stats": () => <SummaryStatsRow {...kpiStats} />,
    "overdue-banner": () => overdueBanner,
    "ai-command-center": () => null,
    "play-signals": () => <PlaySignalsCard accounts={accounts} opportunities={opportunities} />,
    "unified-portfolio-insights": () => (
      <FadeIn delay={80}>
        <UnifiedPortfolioInsights
          accounts={accounts.map(a => ({ id: a.id, name: a.name }))}
          riskDeals={riskDeals}
          riskAccounts={riskAccounts}
          overdueTaskCount={overdueTaskCount}
        />
      </FadeIn>
    ),
    "narrative-feed-grid": () => (
      <FadeIn delay={120}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <NarrativeFeed
            accounts={accounts} opportunities={opportunities}
            emailDecodes={emailDecodes} tasks={tasks} intelItems={intelItems}
          />
          <div className="space-y-4">
            {hasOpportunities && <MiniPipelineChart opportunities={filteredOpportunities} locale={locale} />}
            <QuickActions t={t} />
          </div>
        </div>
      </FadeIn>
    ),
    "stat-cards": () => (
      <FadeIn delay={160}>
        <div className="space-y-3" data-tour="dashboard-stats">
          <VisualSituationSnapshot
            pipelineValue={stats.pipelineValue}
            wonValue={stats.wonValue}
            winRate={stats.winRate}
            avgMeddicc={stats.avgMeddicc}
            riskDealCount={riskDeals.length}
            activeDealCount={stats.activeDeals}
            locale={locale}
          />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label={t("dashboard.pipelineTotal")} value={formatCurrency(stats.pipelineValue, currency)} icon={TrendingUp} iconBg="bg-positive/10" iconColor="text-positive" href="/pipeline" />
            <StatCard label={roleLevel === "ae" ? t("dashboard.myAccounts") : t("dashboard.pipelineCoverage")} value={roleLevel === "ae" ? stats.totalAccounts : `${stats.coverage.toFixed(1)}x`} icon={roleLevel === "ae" ? Building2 : Shield} iconBg="bg-blue-50" iconColor="text-blue-500" href={roleLevel === "ae" ? "/accounts" : undefined} />
            <StatCard label={t("dashboard.closeRate")} value={`${stats.winRate}%`} icon={Award} iconBg="bg-accent/8" iconColor="text-accent" />
            <StatCard label={t("dashboard.closedAmount")} value={formatCurrency(stats.wonValue, currency)} icon={Target} iconBg="bg-warning/10" iconColor="text-warning" href="/pipeline" />
          </div>
        </div>
      </FadeIn>
    ),
    "target-progress": () => (quarterlyTarget > 0 || monthlyTarget > 0) ? (
      <FadeIn delay={200}>
        <div className="card-elevated rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">{t("dashboard.targetProgress")}</h2>
          <div className="space-y-4">
            {quarterlyTarget > 0 && <ProgressBar label={l(locale, `季度目标 (${formatCurrency(stats.wonValue, currency)} / ${formatCurrency(quarterlyTarget, currency)})`, `Quarterly target (${formatCurrency(stats.wonValue, currency)} / ${formatCurrency(quarterlyTarget, currency)})`)} value={stats.wonValue} max={quarterlyTarget} color="bg-accent" />}
            {monthlyTarget > 0 && <ProgressBar label={l(locale, `月度目标 (${formatCurrency(stats.wonValue, currency)} / ${formatCurrency(monthlyTarget, currency)})`, `Monthly target (${formatCurrency(stats.wonValue, currency)} / ${formatCurrency(monthlyTarget, currency)})`)} value={stats.wonValue} max={monthlyTarget} color="bg-positive" />}
            {coverageTarget > 0 && <ProgressBar label={l(locale, `覆盖率目标 (${stats.coverage.toFixed(1)}x / ${coverageTarget}x)`, `Coverage target (${stats.coverage.toFixed(1)}x / ${coverageTarget}x)`)} value={stats.coverage} max={coverageTarget} color="bg-blue-500" />}
          </div>
        </div>
      </FadeIn>
    ) : null,
    "analytics-collapsible": () => (
      <>
        <FadeIn delay={280}>
          {analyticsButton}
        </FadeIn>
        {analyticsOpen && (
          <div className="space-y-6">
            {hasOpportunities ? (
              <>
                <PipelineDistributionChart opportunities={filteredOpportunities} />
                <StageConversionFunnel opportunities={filteredOpportunities} />
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <DealVelocityChart opportunities={filteredOpportunities} />
                  <ForecastPanel opportunities={filteredOpportunities} quarterlyTarget={quarterlyTarget} />
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <AgingAnalysisPanel opportunities={filteredOpportunities} accounts={accounts} />
                  <WinLossPanel opportunities={filteredOpportunities} />
                </div>
              </>
            ) : (
              <PipelineEmptyState />
            )}
            <RecentFeedCard items={recentFeed} t={t} />
          </div>
        )}
      </>
    ),
    "team-view": () => playPermissions.canViewTeam ? <TeamViewSection /> : null,
    "notifications": () => <NotificationPanel />,

    // -- New role-specific modules --
    "false-activity-detector": () => (
      <FadeIn delay={45}>
        <FalseActivityDetector
          accounts={accounts} opportunities={opportunities}
          emailDecodes={emailDecodes} intelItems={intelItems} tasks={tasks}
        />
      </FadeIn>
    ),
    "executive-intervention-panel": () => (
      <FadeIn delay={50}>
        <ExecutiveInterventionPanel opportunities={opportunities} accounts={accounts} />
      </FadeIn>
    ),
    "risk-heatmap": () => (
      <FadeIn delay={55}>
        <RiskHeatmap opportunities={opportunities} accounts={accounts} />
      </FadeIn>
    ),
    "manager-intervention-panel": () => (
      <FadeIn delay={35}>
        <ManagerInterventionPanel
          opportunities={opportunities} tasks={tasks}
          accounts={accounts} orgMembers={orgMembers}
        />
      </FadeIn>
    ),
    "stuck-deal-summary": () => (
      <FadeIn delay={40}>
        <StuckDealSummary opportunities={opportunities} accounts={accounts} />
      </FadeIn>
    ),
  };

  return (
    <div className="page-shell">
      <SpotlightTour tourKey="dashboard" steps={DASHBOARD_TOUR_STEPS_BY_LOCALE[locale]} />
      {modulesForRender.map((mod) => {
        const factory = moduleRegistry[mod.key];
        if (!factory) return null;
        const node = factory();
        if (!node) return null;
        if (mod.defaultExpanded === false && !DISABLE_OUTER_COLLAPSE.has(mod.key)) {
          const title = COLLAPSIBLE_TITLE_LABELS[locale][mod.key] ?? mod.key;
          return (
            <CollapsibleModule key={mod.key} moduleKey={mod.key} title={title} defaultExpanded={false}>
              {node}
            </CollapsibleModule>
          );
        }
        return <React.Fragment key={mod.key}>{node}</React.Fragment>;
      })}
    </div>
  );
}
