"use client";

/**
 * MorningBriefing — AI 今日行动简报组件（整合 AI 洞察）
 * 显示在 Dashboard 首屏顶部，帮助销售快速了解今天需要推进的 deal
 * 同时内联展示来自 AI 洞察的风险预警和高优行动建议
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Sparkles,
  RefreshCw,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  ChevronDown,
  ChevronUp,
  Shield,
  Zap,
} from "lucide-react";
import type { MorningBriefing as MorningBriefingType, DealBriefingItem } from "@/lib/agent/morning-briefing";
import type { UserRoleLevel } from "@/lib/babel-engine/types";

// ─── Types for AI Insights ────────────────────────────────────────────

interface RiskAlert {
  entityId: string;
  entityType: string;
  level: "healthy" | "at_risk" | "critical";
  score: number;
  reasons: string[];
  recommendations: string[];
  dealName?: string;
  accountName?: string;
}

interface ActionItem {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  dueInDays: number;
  triggerEvent: string;
  relatedEntityId?: string;
  accountId?: string;
  accountName?: string;
}

// ─── Priority 样式映射 ────────────────────────────────────────────────

const priorityConfig = {
  urgent: {
    badge: "bg-danger/10 text-danger border border-danger/20",
    dot: "bg-danger",
    label: "紧急",
    card: "border-danger/20 bg-danger/[0.02]",
  },
  high: {
    badge: "bg-warning/10 text-warning border border-warning/20",
    dot: "bg-warning",
    label: "重要",
    card: "border-warning/20 bg-warning/[0.02]",
  },
  medium: {
    badge: "bg-accent/10 text-accent border border-accent/20",
    dot: "bg-accent",
    label: "关注",
    card: "border-border bg-muted/5",
  },
} as const;

// ─── 生成具体摘要行 ──────────────────────────────────────────────────

function buildConcreteSummary(
  deals: DealBriefingItem[],
  risks: RiskAlert[],
): string {
  // 第一句：最紧急的1-2个项目名 + 原因
  const topDeals = deals.filter((d) => d.priority === "urgent" || d.priority === "high").slice(0, 2);

  if (topDeals.length === 0 && deals.length === 0) {
    return "所有项目正常推进中";
  }

  // 如果没有 urgent/high，取第一个 deal
  const highlighted = topDeals.length > 0 ? topDeals : deals.slice(0, 1);

  const descriptions = highlighted.map((deal) => {
    if (deal.daysSinceUpdate >= 14) {
      return `${deal.accountName}「${deal.dealName}」停滞${deal.daysSinceUpdate}天`;
    }
    if (deal.daysSinceUpdate > 7) {
      return `${deal.accountName}「${deal.dealName}」${deal.daysSinceUpdate}天未更新`;
    }
    return `${deal.accountName}「${deal.dealName}」${deal.reason}`;
  });

  // 补充 critical 风险中未覆盖的项目
  const coveredNames = new Set(highlighted.map((d) => d.accountName));
  for (const risk of risks.filter((r) => r.level === "critical").slice(0, 1)) {
    if (risk.accountName && !coveredNames.has(risk.accountName)) {
      descriptions.push(`${risk.accountName} ${risk.reasons[0] ?? "严重风险"}`);
    }
  }

  const firstSentence = descriptions.slice(0, 2).join("，");

  // 第二句：今日最高优先行动（取第一个 urgent/high deal 的 suggestedAction）
  const topAction = highlighted[0];
  const secondSentence = topAction
    ? `建议优先：${topAction.suggestedAction}`
    : "";

  return secondSentence
    ? `${firstSentence}。${secondSentence}`
    : firstSentence;
}

// ─── Deal 卡片 ────────────────────────────────────────────────────────

function DealCard({ deal }: { deal: DealBriefingItem }) {
  const config = priorityConfig[deal.priority];

  return (
    <div className={`rounded-lg border p-3.5 ${config.card} transition-all`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${config.dot}`} />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground text-sm">{deal.accountName}</p>
            <p className="truncate text-xs text-muted">{deal.dealName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {deal.amount && (
            <span className="text-xs text-muted">
              ${(deal.amount / 1000).toFixed(0)}K
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${config.badge}`}>
            {config.label}
          </span>
          <Link
            href={`/pipeline?deal=${deal.opportunityId}`}
            className="flex items-center gap-0.5 text-xs text-muted hover:text-foreground transition-colors"
          >
            详情
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="mt-2.5 space-y-1.5">
        <p className="text-xs text-foreground/80">
          <span className="font-medium text-muted">原因：</span>
          {deal.reason}
        </p>
        <p className="text-xs text-accent">
          <span className="font-medium">→ </span>
          {deal.suggestedAction}
        </p>
      </div>

      {/* 元信息 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] text-muted">
        {deal.daysSinceUpdate > 0 && (
          <span className={`flex items-center gap-1 ${deal.daysSinceUpdate > 7 ? "text-danger" : ""}`}>
            <Clock className="h-3 w-3" />
            {deal.daysSinceUpdate} 天未更新
          </span>
        )}
        {deal.missingMeddicc.length > 0 && (
          <span className="flex items-center gap-1 text-warning">
            <AlertTriangle className="h-3 w-3" />
            缺 {deal.missingMeddicc.length} 个 MEDDICC 维度
          </span>
        )}
        {deal.signals.length > 0 && (
          <span className="text-positive">
            {deal.signals.length} 条新情报
          </span>
        )}
      </div>
    </div>
  );
}

// ─── 内联风险预警卡片 ──────────────────────────────────────────────────

function InlineRiskCard({ risk }: { risk: RiskAlert }) {
  const isCritical = risk.level === "critical";
  return (
    <Link
      href={`/pipeline/${risk.entityId}`}
      className={`block rounded-lg border p-2.5 transition-shadow hover:shadow-sm ${
        isCritical
          ? "border-danger/20 bg-danger/[0.03]"
          : "border-warning/20 bg-warning/[0.03]"
      }`}
    >
      <div className="flex items-start gap-2">
        <Shield className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${isCritical ? "text-danger" : "text-warning"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {risk.dealName ?? risk.entityId}
            </span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
              isCritical ? "bg-red-800 text-white" : "bg-amber-500 text-white"
            }`}>
              {isCritical ? "严重" : "关注"}
            </span>
          </div>
          {risk.accountName && (
            <p className="text-[11px] text-muted">{risk.accountName}</p>
          )}
          {risk.reasons.length > 0 && (
            <p className="mt-1 text-xs text-secondary truncate">{risk.reasons[0]}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── 内联行动建议 ────────────────────────────────────────────────────

function InlineActionItem({ action }: { action: ActionItem }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <Zap className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-accent" />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-foreground">
          {action.accountName && `${action.accountName}: `}
          {action.title}
        </span>
        <span className="text-muted ml-1.5">
          {action.dueInDays <= 0 ? "立即" : `${action.dueInDays}天内`}
        </span>
      </div>
    </div>
  );
}

// ─── 主组件 ────────────────────────────────────────────────────────────

/** 按职级返回简报的 UI 标签 */
function getBriefingLabels(roleLevel: UserRoleLevel) {
  switch (roleLevel) {
    case "director":
      return {
        title: "团队洞察",
        riskLabel: "团队风险与行动",
        emptyMsg: "团队 pipeline 暂无需要关注的 deal。",
      };
    case "executive":
      return {
        title: "战略简报",
        riskLabel: "战略风险预警",
        emptyMsg: "当前无战略级风险，整体态势良好。",
      };
    default:
      return {
        title: "AI 简报",
        riskLabel: "风险与行动",
        emptyMsg: "当前没有需要关注的活跃 deal。",
      };
  }
}

export function MorningBriefing({
  accounts = [],
  opportunities = [],
  roleLevel = "ae",
  embedded = false,
}: {
  accounts?: { id: string; name: string }[];
  opportunities?: { id: string; name: string; accountId: string }[];
  roleLevel?: UserRoleLevel;
  embedded?: boolean;
} = {}) {
  const labels = getBriefingLabels(roleLevel);
  const [briefing, setBriefing] = useState<MorningBriefingType | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [insightsExpanded, setInsightsExpanded] = useState(false);

  // AI 洞察数据
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);

  const fetchBriefing = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const method = forceRefresh ? "POST" : "GET";

      // 并行获取简报 + AI 洞察数据
      const briefingUrl = `/api/agent/morning-briefing?roleLevel=${roleLevel}`;
      const [briefingRes, healthRes, actionRes] = await Promise.all([
        fetch(briefingUrl, { method }),
        fetch("/api/ai-insights?insightType=health&entityType=opportunity"),
        fetch("/api/ai-insights?insightType=action"),
      ]);

      if (!briefingRes.ok) {
        throw new Error(`HTTP ${briefingRes.status}`);
      }

      const briefingData = (await briefingRes.json()) as { briefing: MorningBriefingType };
      setBriefing(briefingData.briefing);

      // 处理风险预警（只取 at_risk 和 critical）
      if (healthRes.ok) {
        try {
          const healthData = await healthRes.json();
          const alerts: RiskAlert[] = (healthData.insights ?? [])
            .filter((i: Record<string, unknown>) => {
              const data = i.data as Record<string, unknown>;
              return data?.level === "at_risk" || data?.level === "critical";
            })
            .map((i: Record<string, unknown>) => {
              const data = i.data as Record<string, unknown>;
              const opp = opportunities.find((o) => o.id === i.entityId);
              const acct = opp ? accounts.find((a) => a.id === opp.accountId) : null;
              return {
                entityId: i.entityId as string,
                entityType: i.entityType as string,
                level: (data.level as string) ?? "at_risk",
                score: (data.score as number) ?? 0,
                reasons: (data.reasons as string[]) ?? [],
                recommendations: (data.recommendations as string[]) ?? [],
                dealName: opp?.name,
                accountName: acct?.name,
              };
            })
            .sort((a: RiskAlert, b: RiskAlert) => {
              if (a.level === "critical" && b.level !== "critical") return -1;
              if (b.level === "critical" && a.level !== "critical") return 1;
              return a.score - b.score;
            });
          setRiskAlerts(alerts);
        } catch {
          // 洞察加载失败不影响简报
        }
      }

      // 处理行动建议（只取 high priority）
      if (actionRes.ok) {
        try {
          const actionData = await actionRes.json();
          const allActions: ActionItem[] = [];
          for (const insight of actionData.insights ?? []) {
            const data = insight.data as Record<string, unknown>;
            const acctId = insight.entityId as string;
            const acct = accounts.find((a) => a.id === acctId);
            for (const action of (data?.actions as ActionItem[]) ?? []) {
              allActions.push({
                ...action,
                accountId: acctId,
                accountName: acct?.name,
              });
            }
          }
          allActions.sort((a, b) => {
            const prio = { high: 0, medium: 1, low: 2 };
            return (prio[a.priority] ?? 1) - (prio[b.priority] ?? 1);
          });
          setActions(allActions);
        } catch {
          // 行动建议加载失败不影响简报
        }
      }
    } catch (err) {
      setError("简报加载失败，请稍后重试。");
      console.error("[MorningBriefing] fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accounts, opportunities, roleLevel]);

  useEffect(() => {
    void fetchBriefing(false);
  }, [fetchBriefing]);

  // 筛选出 high priority 的行动建议
  const highPriorityActions = useMemo(
    () => actions.filter((a) => a.priority === "high").slice(0, 4),
    [actions],
  );

  // 摘要行：具体项目名 + 原因
  const concreteSummary = useMemo(() => {
    if (!briefing) return "";
    return buildConcreteSummary(briefing.topDeals, riskAlerts);
  }, [briefing, riskAlerts]);

  // 内联展示的洞察数量
  const topRisks = riskAlerts.slice(0, 3);
  const hasInsights = topRisks.length > 0 || highPriorityActions.length > 0;
  const totalInsightItems = topRisks.length + highPriorityActions.length;
  const INLINE_LIMIT = 4;
  const showMoreButton = totalInsightItems > INLINE_LIMIT;

  // 加载中骨架屏
  if (loading) {
    return (
      <div className={embedded ? "animate-pulse" : "rounded-xl border border-accent/15 bg-accent/[0.02] p-4 animate-pulse"}>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-4 w-4 rounded bg-accent/20" />
          <div className="h-4 w-24 rounded bg-accent/20" />
        </div>
        <div className="h-3 w-3/4 rounded bg-muted/20 mb-4" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-muted/10" />
          ))}
        </div>
      </div>
    );
  }

  // 错误降级
  if (error) {
    return (
      <div className={embedded ? "" : "rounded-xl border border-border bg-muted/5 p-4"}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">AI 简报</span>
          </div>
          <button
            onClick={() => void fetchBriefing(false)}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重试
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">{error}</p>
      </div>
    );
  }

  // 空状态
  if (!briefing || briefing.topDeals.length === 0) {
    return (
      <div className={embedded ? "" : "rounded-xl border border-border bg-muted/5 p-4"}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="text-sm font-medium text-foreground">{labels.title}</span>
          <span className="text-xs text-muted">·</span>
          <span className="text-xs text-muted">
            {briefing?.date ?? new Date().toLocaleDateString("zh-CN")}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted">
          {briefing?.summary ?? labels.emptyMsg}
        </p>
      </div>
    );
  }

  const dateLabel = new Date(briefing.date).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <div className={embedded ? "" : "rounded-xl border border-accent/15 bg-accent/[0.02]"}>
      {/* 标题栏 */}
      <div className={`flex items-center justify-between ${embedded ? "pb-3" : "px-4 py-3 border-b border-accent/10"}`}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-left"
        >
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold text-foreground">{labels.title}</span>
          <span className="text-xs text-muted">· {dateLabel}</span>
          {collapsed
            ? <ChevronDown className="h-3.5 w-3.5 text-muted" />
            : <ChevronUp className="h-3.5 w-3.5 text-muted" />
          }
        </button>
        <button
          onClick={() => void fetchBriefing(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted hover:bg-muted/10 hover:text-foreground transition-all disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "生成中..." : "刷新"}
        </button>
      </div>

      {!collapsed && (
        <div className={embedded ? "space-y-3" : "p-4 space-y-3"}>
          {/* 具体摘要行 — 一眼看到关键项目 */}
          <p className="text-sm font-medium text-foreground leading-relaxed">
            {concreteSummary}
          </p>

          {/* AI 洞察：风险预警 + 高优行动 */}
          {hasInsights && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-warning" />
                <span className="text-[11px] font-semibold text-warning uppercase tracking-wide">
                  {labels.riskLabel}
                </span>
              </div>

              {/* 风险预警 */}
              {topRisks.slice(0, insightsExpanded ? topRisks.length : Math.min(2, INLINE_LIMIT)).map((risk) => (
                <InlineRiskCard key={risk.entityId} risk={risk} />
              ))}

              {/* 高优行动建议 */}
              {highPriorityActions.slice(0, insightsExpanded ? highPriorityActions.length : Math.max(0, INLINE_LIMIT - topRisks.length)).map((action, i) => (
                <InlineActionItem key={i} action={action} />
              ))}

              {/* 展开/收起更多 */}
              {showMoreButton && (
                <button
                  onClick={() => setInsightsExpanded(!insightsExpanded)}
                  className="flex items-center gap-1 text-[11px] text-accent hover:text-accent/80 transition-colors"
                >
                  {insightsExpanded ? (
                    <>收起 <ChevronUp className="h-3 w-3" /></>
                  ) : (
                    <>查看全部 {totalInsightItems} 条 <ChevronDown className="h-3 w-3" /></>
                  )}
                </button>
              )}
            </div>
          )}

          {/* 分隔线 */}
          {hasInsights && (
            <div className="border-t border-accent/10" />
          )}

          {/* Deal 卡片列表 — AE 视角优先展示 urgent */}
          <div className="space-y-2">
            {(roleLevel === "ae"
              ? [...briefing.topDeals].sort((a, b) => {
                  const rank = { urgent: 0, high: 1, medium: 2 };
                  return (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2);
                })
              : briefing.topDeals
            ).map((deal) => (
              <DealCard key={deal.opportunityId} deal={deal} />
            ))}
          </div>

          {/* 底部时间戳 */}
          <p className="text-[11px] text-muted text-right">
            生成于 {new Date(briefing.generatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      )}
    </div>
  );
}
