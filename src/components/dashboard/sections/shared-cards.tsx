"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  Target,
  Mail,
  Users,
  Activity,
  ChevronDown,
  CheckSquare,
  Radio,
  ClipboardList,
} from "lucide-react";
import dynamic from "next/dynamic";
import { formatCurrency } from "@/lib/format-currency";
import { timeAgo } from "@/lib/time-utils";
import { useStore } from "@/lib/store";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import { useForecast } from "@/hooks/use-analytics";
import type {
  Opportunity,
  Task,
  OrgRole,
} from "@/lib/babel-engine/types";

const TeamView = dynamic(() => import("@/components/compass/team-view"), { ssr: false });

// ─── Progress Bar ─────────────────────────────────────────────────────

export function ProgressBar({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-xs font-medium text-muted">{Math.round(pct)}%</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-background">
        <div
          className={`h-full rounded-full ${color} transition-all duration-400`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── AE Forecast Summary Card ───────────────────────────────────────

export function AEForecastSummary({
  opportunities,
  quarterlyTarget,
}: {
  opportunities: Opportunity[];
  quarterlyTarget: number;
}) {
  const currency = useStore((s) => s.currencyCode);
  const { t } = useLocale();
  const forecast = useForecast(opportunities, quarterlyTarget);

  const coverageColors = {
    positive: "text-positive",
    warning: "text-warning",
    danger: "text-danger",
  };

  return (
    <div className="card-elevated rounded-xl border border-border bg-card p-5 mt-6">
      <div className="flex items-center gap-2 mb-3">
        <Target className="h-4 w-4 text-positive" />
        <h2 className="text-sm font-semibold text-foreground">{t("dashboard.forecastSummary")}</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div>
          <p className="text-xs text-muted">{t("dashboard.forecast.pipelineTotal")}</p>
          <p className="text-lg font-bold text-foreground tabular-nums">{formatCurrency(forecast.pipelineTotal, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">{t("dashboard.forecast.weightedAmount")}</p>
          <p className="text-lg font-bold text-foreground tabular-nums">{formatCurrency(forecast.weightedAmount, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">{t("dashboard.forecast.coverage")}</p>
          <p className={`text-lg font-bold tabular-nums ${quarterlyTarget > 0 ? coverageColors[forecast.coverageColor] : "text-foreground"}`}>
            {quarterlyTarget > 0 ? `${forecast.coverage.toFixed(1)}x` : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline Empty State ───────────────────────────────────────────

export function PipelineEmptyState({ compact = false }: { compact?: boolean }) {
  const { t, locale } = useLocale();
  const en = locale === "en";
  return (
    <div className={`card-elevated rounded-xl border border-border bg-card ${compact ? "p-6" : "p-8"} text-center`}>
      <div className={`${compact ? "text-3xl" : "text-4xl"} mb-3`}>{"\uD83C\uDFAF"}</div>
      <h3 className={`${compact ? "text-sm" : "text-base"} font-semibold text-foreground`}>{t("dashboard.noOpportunities")}</h3>
      <p className={`${compact ? "text-xs mt-1" : "text-sm mt-2"} text-muted max-w-xs mx-auto`}>
        {t("dashboard.noOpportunitiesHint")}
      </p>
      <div className={`flex items-center justify-center gap-3 ${compact ? "mt-3" : "mt-4"}`}>
        <Link
          href="/pipeline"
          className={`inline-flex items-center gap-2 ${compact ? "px-4 py-2 text-xs" : "px-5 py-3 text-sm"} rounded-lg bg-accent font-semibold text-white shadow-sm transition-all hover:bg-accent-hover hover:shadow-md`}
        >
          <Target className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          {en ? "Create Opportunity" : "创建销售机会"}
        </Link>
        <Link
          href="/accounts"
          className={`inline-flex items-center gap-2 ${compact ? "px-4 py-2 text-xs" : "px-5 py-3 text-sm"} rounded-lg border border-border font-medium text-secondary transition-colors hover:bg-sidebar hover:text-foreground`}
        >
          <Building2 className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          {t("dashboard.goToAccounts")}
        </Link>
      </div>
    </div>
  );
}

// ─── Org Header ─────────────────────────────────────────────────────

const ORG_ROLE_LABEL_KEYS: Record<OrgRole, TranslationKey> = {
  owner: "dashboard.orgRole.owner",
  admin: "dashboard.orgRole.admin",
  manager: "dashboard.orgRole.manager",
  member: "dashboard.orgRole.member",
};

const ORG_ROLE_STYLES: Record<OrgRole, string> = {
  owner: "bg-accent/10 text-accent",
  admin: "bg-blue-50 text-blue-600",
  manager: "bg-warning/10 text-warning",
  member: "bg-positive/10 text-positive",
};

export function OrgHeader({
  orgName,
  orgRole,
  scopeLabel,
  t,
}: {
  orgName: string | null;
  orgRole: OrgRole | null;
  scopeLabel: string;
  t: (key: TranslationKey) => string;
}) {
  if (!orgName && !orgRole) return null;
  const roleStyle = orgRole ? ORG_ROLE_STYLES[orgRole] : "";
  const roleLabelKey = orgRole ? ORG_ROLE_LABEL_KEYS[orgRole] : null;

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/8">
        <Building2 className="h-4 w-4 text-accent" />
      </div>
      <div className="flex items-center gap-2">
        {orgName && (
          <span className="text-sm font-semibold text-foreground">{orgName}</span>
        )}
        {orgRole && roleLabelKey && (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${roleStyle}`}>
            {t(roleLabelKey)}
          </span>
        )}
        <span className="text-xs text-muted">· {scopeLabel}</span>
      </div>
    </div>
  );
}

// ─── Team View Section ──────────────────────────────────────────────

export function TeamViewSection() {
  const [open, setOpen] = useState(false);
  const { locale } = useLocale();
  const en = locale === "en";
  return (
    <div className="card-elevated rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold text-foreground">👥 {en ? "Team View" : "团队视图"}</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-border px-6 py-4">
          <TeamView />
        </div>
      )}
    </div>
  );
}

// ─── Weekly Brief Card ──────────────────────────────────────────────

export function WeeklyBriefCard({ opportunities, tasks }: { opportunities: Opportunity[]; tasks: Task[] }) {
  const [expanded, setExpanded] = useState(false);

  // eslint-disable-next-line react-hooks/purity -- Date.now() needed for weekly comparison
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const newDeals = opportunities.filter((o) => o.createdAt > weekAgo);
  const closedWon = opportunities.filter((o) => o.stage === 'closed_won' && o.updatedAt > weekAgo);
  const closedLost = opportunities.filter((o) => o.stage === 'closed_lost' && o.updatedAt > weekAgo);

  const riskDeals = opportunities
    .filter((o) => o.stage !== 'closed_won' && o.stage !== 'closed_lost' && (o.meddicc?.overallScore ?? 0) < 40)
    .sort((a, b) => (a.meddicc?.overallScore ?? 0) - (b.meddicc?.overallScore ?? 0))
    .slice(0, 3);

  const completedTasks = tasks.filter((t) => t.status === 'done' && t.updatedAt && t.updatedAt > weekAgo);
  const overdueTasks = tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < new Date().toISOString());

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-bold text-foreground">📋 本周简报</h3>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="text-center">
          <p className="text-lg font-bold text-accent">{newDeals.length}</p>
          <p className="text-[12px] text-muted">新商机</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-positive">{closedWon.length}</p>
          <p className="text-[12px] text-muted">赢单</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-danger">{riskDeals.length}</p>
          <p className="text-[12px] text-muted">风险商机</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-warning">{overdueTasks.length}</p>
          <p className="text-[12px] text-muted">逾期任务</p>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-border pt-3">
          {riskDeals.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-danger mb-1">⚠️ Top 风险商机</p>
              {riskDeals.map((d) => (
                <Link key={d.id} href={`/pipeline/${d.id}`} className="flex items-center justify-between py-1 hover:bg-background rounded px-2">
                  <span className="text-xs text-foreground">{d.name}</span>
                  <span className="text-[12px] text-danger">MEDDICC {d.meddicc?.overallScore ?? 0}分</span>
                </Link>
              ))}
            </div>
          )}
          {closedLost.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-danger mb-1">❌ 本周丢单 {closedLost.length} 个</p>
            </div>
          )}
          {completedTasks.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-positive mb-1">✅ 本周完成 {completedTasks.length} 个任务</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Time Range ─────────────────────────────────────────────────────

export type TimeRange = "week" | "month" | "quarter" | "all";
const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  week: "本周",
  month: "本月",
  quarter: "本季度",
  all: "全部",
};
const TIME_RANGE_LABELS_EN: Record<TimeRange, string> = {
  week: "This week",
  month: "This month",
  quarter: "This quarter",
  all: "All",
};

export function filterByTimeRange<T extends { createdAt: string; updatedAt?: string }>(items: T[], range: TimeRange): T[] {
  if (range === "all") return items;
  const now = new Date();
  let start: Date;
  if (range === "week") {
    start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
  } else if (range === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    start = new Date(now.getFullYear(), quarterMonth, 1);
  }
  return items.filter((item) => {
    const date = new Date(item.updatedAt || item.createdAt);
    return date >= start;
  });
}

export function TimeRangeSelector({ value, onChange }: { value: TimeRange; onChange: (v: TimeRange) => void }) {
  const { locale } = useLocale();
  const labels = locale === "en" ? TIME_RANGE_LABELS_EN : TIME_RANGE_LABELS;
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
      {(Object.keys(TIME_RANGE_LABELS) as TimeRange[]).map((range) => (
        <button
          key={range}
          onClick={() => onChange(range)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === range
              ? "bg-accent text-white shadow-sm"
              : "text-muted hover:text-foreground hover:bg-background"
          }`}
        >
          {labels[range]}
        </button>
      ))}
    </div>
  );
}

// ─── Recent Feed Card ───────────────────────────────────────────────

const FEED_ICON_MAP: Record<string, { icon: React.ComponentType<{ className?: string }>; bg: string; color: string }> = {
  decode: { icon: Mail, bg: "bg-accent/8", color: "text-accent" },
  intel: { icon: Radio, bg: "bg-warning/10", color: "text-warning" },
  task: { icon: CheckSquare, bg: "bg-blue-50", color: "text-blue-500" },
  opportunity: { icon: Target, bg: "bg-positive/10", color: "text-positive" },
};

export function RecentFeedCard({
  items,
  t,
}: {
  items: { id: string; type: string; title: string; subtitle: string; date: string; href: string }[];
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="card-elevated rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-6 py-4">
        <Activity className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground">{t("dashboard.recentFeed")}</h2>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-secondary">{items.length}</span>
      </div>
      {items.length > 0 ? (
        <div className="divide-y divide-border">
          {items.map((item) => {
            const cfg = FEED_ICON_MAP[item.type] || FEED_ICON_MAP.task;
            const FeedIcon = cfg.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                className="flex items-start gap-3 px-6 py-3 transition-colors hover:bg-stripe"
              >
                <div className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full ${cfg.bg}`}>
                  <FeedIcon className={`h-3.5 w-3.5 ${cfg.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                  <p className="mt-0.5 text-xs text-muted truncate">{item.subtitle}</p>
                </div>
                <span className="mt-0.5 flex-shrink-0 text-xs text-secondary">{timeAgo(item.date)}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-muted">{t("dashboard.noRecentFeed")}</p>
        </div>
      )}
    </div>
  );
}
