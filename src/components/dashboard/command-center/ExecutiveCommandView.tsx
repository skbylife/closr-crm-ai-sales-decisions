"use client";

/**
 * Executive 战略决策视图
 *
 * 全盘态势：全局简报 + 漏斗 KPI + 阶段分布 + 高危商机 + 重大风险 + 战略洞察 + 待决策问题
 */

import { useState, useEffect } from "react";
import {
  TrendingUp,
  AlertTriangle,
  Target,
  HelpCircle,
  BarChart3,
  Shield,
  Zap,
  Swords,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import type { AiDisplayMode } from "../AiCommandCenter";
import Link from "next/link";
import { MorningBriefing } from "@/components/agent/MorningBriefing";
import { PlayProgressSection } from "./PlayProgressSection";
import { PortfolioJudgmentCommand } from "@/components/dashboard/portfolio-judgment-command";
import { formatCurrency } from "@/lib/format-currency";
import { STAGE_LABELS } from "@/lib/constants";

interface ExecutiveCommandViewProps {
  accounts: { id: string; name: string }[];
  opportunities: { id: string; name: string; accountId: string }[];
  refreshKey: number;
  displayMode?: AiDisplayMode;
}

interface BriefingData {
  summary: {
    totalActiveDeals: number;
    totalPipelineValue: number;
    criticalDeals: number;
    atRiskDeals: number;
    dueTasksToday: number;
    overdueTasks: number;
  };
  stageDistribution?: Record<string, { count: number; value: number }>;
  urgentActions?: { title: string; accountName: string; dueInDays: number; accountId?: string; opportunityId?: string }[];
  criticalDealNames?: { name: string; accountName: string; stage?: string; value?: number }[];
  impactAlerts?: number;
}

interface SignalData {
  conflicts: { id: string; summary: string; severity: string; accountId: string; kind?: string }[];
  questions: { id: string; question: string; accountId: string; priority: number; context?: string }[];
  accountNames: Record<string, string>;
}

function ExecutiveDecisionSnapshot({
  loading,
  summary,
  firstRisk,
  firstAction,
  firstQuestion,
}: {
  loading: boolean;
  summary?: BriefingData["summary"];
  firstRisk?: SignalData["conflicts"][number];
  firstAction?: NonNullable<BriefingData["urgentActions"]>[number];
  firstQuestion?: SignalData["questions"][number];
}) {
  if (loading) {
    return (
      <section className="grid gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-[118px] rounded-xl skeleton" />
        ))}
      </section>
    );
  }

  const interventionCount = summary ? summary.criticalDeals + summary.atRiskDeals : 0;
  const decisionText = interventionCount > 0
    ? `先决定 ${interventionCount} 个高风险/风险商机是否需要高层介入。`
    : "先确认本周资源是否继续压在当前 4 个推进中的商机上。";
  const riskText = firstRisk?.summary ?? "暂无高危矛盾信号；继续关注证据是否足够新、是否来自关键人。";
  const actionText = firstAction
    ? `${firstAction.title}（${firstAction.accountName}）`
    : firstQuestion?.question ?? "选择一个证据最薄的账户，让负责人补齐下一步承诺。";

  return (
    <section className="grid gap-3 lg:grid-cols-3">
      <DecisionCard
        icon={Shield}
        label="现在先决定"
        text={decisionText}
        tone="accent"
      />
      <DecisionCard
        icon={AlertTriangle}
        label="最大风险"
        text={riskText}
        tone="warning"
      />
      <DecisionCard
        icon={Target}
        label="下一步授权"
        text={actionText}
        tone="positive"
      />
    </section>
  );
}

function DecisionCard({
  icon: Icon,
  label,
  text,
  tone,
}: {
  icon: typeof Shield;
  label: string;
  text: string;
  tone: "accent" | "warning" | "positive";
}) {
  const toneClass = tone === "warning"
    ? "border-warning/25 bg-warning/[0.055] text-warning"
    : tone === "positive"
      ? "border-positive/25 bg-positive/[0.055] text-positive"
      : "border-accent/25 bg-accent/[0.055] text-accent";

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">{label}</p>
      </div>
      <p className="mt-2 line-clamp-3 text-sm font-medium leading-6 text-foreground">{text}</p>
    </div>
  );
}


export function ExecutiveCommandView({ accounts, opportunities, refreshKey, displayMode = "full" }: ExecutiveCommandViewProps) {
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [signals, setSignals] = useState<SignalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(displayMode === "full");

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/daily-briefing").then(r => r.ok ? r.json() : null),
      fetch("/api/portfolio-signals").then(r => r.ok ? r.json() : null),
    ]).then(([briefingData, signalData]) => {
      if (cancelled) return;
      setBriefing(briefingData?.briefing ?? null);
      setSignals(signalData ?? null);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [refreshKey]);

  const summary = briefing?.summary;
  const highConflicts = (signals?.conflicts ?? []).filter(c => c.severity === 'high' || c.severity === 'critical');
  const allConflicts = signals?.conflicts ?? [];
  const topQuestions = (signals?.questions ?? []).slice(0, 5);
  const firstRisk = allConflicts.find(c => c.severity === 'high' || c.severity === 'critical') ?? allConflicts[0];
  const firstAction = briefing?.urgentActions?.[0];
  const firstQuestion = topQuestions[0];
  const stageEntries = Object.entries(briefing?.stageDistribution ?? {}).sort((a, b) => b[1].value - a[1].value);
  const maxStageValue = stageEntries.length > 0 ? Math.max(...stageEntries.map(([, v]) => v.value)) : 1;

  const isSummaryMode = displayMode === "summary" && !expanded;

  return (
    <div className="p-4 space-y-5">

      <ExecutiveDecisionSnapshot
        loading={loading}
        summary={summary}
        firstRisk={firstRisk}
        firstAction={firstAction}
        firstQuestion={firstQuestion}
      />

      {/* ═══ 漏斗 KPI（始终显示）═══ */}
      <section>
        <h3 className="mb-2 text-[11px] font-semibold text-muted uppercase tracking-[0.12em] flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5" />
          漏斗健康度
        </h3>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-[72px] rounded-lg skeleton" />)}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard icon={TrendingUp} label="活跃商机" value={String(summary.totalActiveDeals)} sub="笔在推进" color="text-accent" />
            <KpiCard icon={Target} label="商机总额" value={formatCurrency(summary.totalPipelineValue)} sub={`${summary.totalActiveDeals} 笔商机`} color="text-positive" />
            <KpiCard icon={AlertTriangle} label="高危 / 风险" value={`${summary.criticalDeals} / ${summary.atRiskDeals}`} sub="需要关注" color="text-danger" highlight={summary.criticalDeals > 0} />
            <KpiCard icon={Shield} label="逾期任务" value={String(summary.overdueTasks)} sub={`今日待办 ${summary.dueTasksToday}`} color="text-warning" highlight={summary.overdueTasks > 2} />
          </div>
        ) : null}
      </section>

      {/* ═══ 摘要模式：展开按钮 ═══ */}
      {displayMode === "summary" && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 font-medium transition-colors mx-auto"
        >
          展开完整分析
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}

      {/* ═══ 以下内容在摘要模式下隐藏 ═══ */}
      {!isSummaryMode && (
      <>

      {/* ═══ 全局简报 ═══ */}
      <section>
        <h3 className="mb-2.5 text-[11px] font-semibold text-accent uppercase tracking-[0.12em] flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5" />
          全局态势
        </h3>
        <MorningBriefing
          key={`exec-briefing-${refreshKey}`}
          accounts={accounts}
          opportunities={opportunities}
          roleLevel="executive"
          embedded
        />
      </section>

      {/* ═══ 阶段分布 ═══ */}
      {stageEntries.length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold text-muted uppercase tracking-[0.12em]">
            阶段分布
          </h3>
          <div className="space-y-1.5">
            {stageEntries.map(([stage, data]) => (
              <div key={stage} className="flex items-center gap-3">
                <span className="w-12 text-[10px] text-muted text-right shrink-0">
                  {STAGE_LABELS[stage] ?? stage}
                </span>
                <div className="flex-1 h-5 rounded-md bg-border/40 overflow-hidden relative">
                  <div
                    className="h-full rounded-md bg-accent/60 transition-all"
                    style={{ width: `${Math.max(8, (data.value / maxStageValue) * 100)}%` }}
                  />
                  <span className="absolute right-2 top-0.5 text-[10px] font-medium text-foreground/80">
                    {data.count} 笔 · {formatCurrency(data.value)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══ 高危商机 ═══ */}
      {(briefing?.criticalDealNames?.length ?? 0) > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold text-danger uppercase tracking-[0.12em] flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            高危商机 ({briefing!.criticalDealNames!.length})
          </h3>
          <div className="space-y-1.5">
            {briefing!.criticalDealNames!.map((deal, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-danger/20 bg-danger/[0.04] px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{deal.name}</p>
                  <p className="text-[10px] text-muted">{deal.accountName}{deal.stage ? ` · ${STAGE_LABELS[deal.stage] ?? deal.stage}` : ''}</p>
                </div>
                {deal.value ? (
                  <span className="text-xs font-bold text-danger tabular-nums shrink-0 ml-2">{formatCurrency(deal.value)}</span>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══ 重大矛盾信号 ═══ */}
      {allConflicts.length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold text-danger/80 uppercase tracking-[0.12em] flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            矛盾信号 ({allConflicts.length}{highConflicts.length > 0 ? `，${highConflicts.length} 高危` : ''})
          </h3>
          <div className="space-y-1.5">
            {allConflicts.slice(0, 6).map(c => {
              const isHigh = c.severity === 'high' || c.severity === 'critical';
              return (
                <Link
                  key={c.id}
                  href={`/accounts/${c.accountId}?tab=overview`}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 transition-colors hover:bg-accent/5 ${
                    isHigh ? 'border-danger/20 bg-danger/[0.04]' : 'border-border'
                  }`}
                >
                  <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${isHigh ? 'text-danger' : 'text-warning'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground line-clamp-2">{c.summary}</p>
                    <p className="text-[10px] text-muted mt-0.5">{signals?.accountNames?.[c.accountId] ?? ''}</p>
                  </div>
                  <ArrowRight className="h-3 w-3 text-muted mt-0.5 shrink-0" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══ 管理判断队列 ═══ */}
      <section>
        <h3 className="mb-2 text-[11px] font-semibold text-muted uppercase tracking-[0.12em] flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" />
          管理判断队列
        </h3>
        <PortfolioJudgmentCommand role="executive" refreshKey={refreshKey} surface="management-queue" />
      </section>

      {/* ═══ 紧急行动 ═══ */}
      {(briefing?.urgentActions?.length ?? 0) > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold text-warning uppercase tracking-[0.12em] flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" />
            需立即推动 ({briefing!.urgentActions!.length})
          </h3>
          <div className="space-y-1.5">
            {briefing!.urgentActions!.map((action, i) => {
              const href = action.opportunityId
                ? `/pipeline/${action.opportunityId}`
                : action.accountId
                  ? `/accounts/${action.accountId}?tab=overview`
                  : "/tasks";
              return (
                <Link
                  key={`${action.title}-${i}`}
                  href={href}
                  className="flex items-center justify-between gap-2 rounded-lg border border-warning/20 bg-warning/[0.04] px-3 py-2 transition-colors hover:border-warning/35 hover:bg-warning/[0.08]"
                  aria-label={`查看行动：${action.title}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">{action.title}</p>
                    <p className="text-[10px] text-muted">{action.accountName}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {action.dueInDays != null && (
                      <span className={`text-[10px] font-medium ${action.dueInDays <= 0 ? 'text-danger' : 'text-warning'}`}>
                        {action.dueInDays <= 0 ? '已到期' : `${action.dueInDays}天内`}
                      </span>
                    )}
                    <ArrowRight className="h-3 w-3 text-muted" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══ 谋局进度 ═══ */}
      <section>
        <h3 className="mb-2 text-[11px] font-semibold text-muted uppercase tracking-[0.12em] flex items-center gap-1.5">
          <Swords className="h-3.5 w-3.5" />
          谋局进度
        </h3>
        <PlayProgressSection key={`exec-plays-${refreshKey}`} />
      </section>

      {/* ═══ 待决策问题 ═══ */}
      {topQuestions.length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold text-warning uppercase tracking-[0.12em] flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5" />
            待决策问题 ({topQuestions.length})
          </h3>
          <div className="space-y-1.5">
            {topQuestions.map(q => (
              <Link
                key={q.id}
                href={`/accounts/${q.accountId}?tab=overview`}
                className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/[0.04] px-3 py-2.5 transition-colors hover:bg-warning/[0.08]"
              >
                <HelpCircle className="h-3.5 w-3.5 text-warning mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">{q.question}</p>
                  <p className="text-[10px] text-muted mt-0.5">{signals?.accountNames?.[q.accountId] ?? ''}{q.context ? ` · ${q.context}` : ''}</p>
                </div>
                <ArrowRight className="h-3 w-3 text-muted mt-0.5 shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ═══ 摘要模式：收起按钮 ═══ */}
      {displayMode === "summary" && expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-accent font-medium transition-colors mx-auto"
        >
          收起详细分析
          <ChevronDown className="h-3.5 w-3.5 rotate-180" />
        </button>
      )}

      </>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, color, highlight = false }: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  sub: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-danger/30 bg-danger/[0.04]' : 'border-border bg-card'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="text-[10px] text-muted">{label}</span>
      </div>
      <p className={`text-lg font-bold tabular-nums ${highlight ? 'text-danger' : 'text-foreground'}`}>{value}</p>
      <p className="text-[10px] text-muted mt-0.5">{sub}</p>
    </div>
  );
}
