"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Loader2,
  Check,
  Clock,
  X,
  Phone,
  AlertTriangle,
  HeartCrack,
  FileSearch,
  ListTodo,
  Swords,
  HelpCircle,
} from "lucide-react";
import type { DailyAction } from "@/types/daily-action";

// ── Visual config per action type ─────────────────────────────────
const TYPE_CONFIG: Record<
  DailyAction["type"],
  { icon: typeof Phone; label: string }
> = {
  follow_up: { icon: Phone, label: "跟进" },
  verify_assumption: { icon: HelpCircle, label: "验证" },
  risk_alert: { icon: AlertTriangle, label: "风险" },
  relationship_alert: { icon: HeartCrack, label: "关系" },
  intel_review: { icon: FileSearch, label: "情报" },
  task: { icon: ListTodo, label: "任务" },
  play_stalled: { icon: Swords, label: "谋局" },
};

function priorityColor(p: number): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  if (p <= 1)
    return {
      bg: "bg-danger/8",
      text: "text-danger",
      border: "border-danger/20",
      dot: "bg-danger",
    };
  if (p <= 2)
    return {
      bg: "bg-warning/8",
      text: "text-warning",
      border: "border-warning/20",
      dot: "bg-warning",
    };
  return {
    bg: "bg-blue-500/8",
    text: "text-blue-500",
    border: "border-blue-500/20",
    dot: "bg-blue-500",
  };
}

function priorityLabel(p: number): string {
  if (p <= 1) return "紧急";
  if (p <= 2) return "重要";
  return "常规";
}

type ActionStatus = "pending" | "done" | "snoozed" | "dismissed";

export function ActionQueue({ embedded = false, scope }: { embedded?: boolean; scope?: 'personal' | 'team' | 'global' } = {}) {
  const [actions, setActions] = useState<DailyAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [statuses, setStatuses] = useState<Record<string, ActionStatus>>({});

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (scope) params.set('scope', scope);
    const query = params.toString();
    const url = query ? `/api/daily-actions?${query}` : "/api/daily-actions";
    fetch(url)
      .then((r) => r.json())
      .then((data: { actions?: DailyAction[] }) => {
        if (!cancelled) setActions(data.actions ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const setStatus = useCallback((key: string, status: ActionStatus) => {
    setStatuses((prev) => ({ ...prev, [key]: status }));
  }, []);

  const actionKey = (a: DailyAction, i: number) =>
    `${a.type}-${a.relatedAccountId ?? a.relatedOpportunityId ?? a.relatedContactId ?? ""}-${i}`;

  const visibleActions = actions.filter(
    (a, i) => !["done", "dismissed"].includes(statuses[actionKey(a, i)] ?? "")
  );
  const doneCount = Object.values(statuses).filter(
    (s) => s === "done"
  ).length;

  if (!loading && actions.length === 0) return null;

  return (
    <div className={embedded ? "" : "card-elevated rounded-xl border border-border bg-card"}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex w-full items-center justify-between text-left ${embedded ? "pb-3" : "px-5 py-3.5"}`}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-base">🎯</span>
          <h2 className="text-sm font-semibold text-foreground">
            每日行动队列
          </h2>
          {!loading && (
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                {visibleActions.length}
              </span>
              {doneCount > 0 && (
                <span className="rounded-full bg-positive/10 px-2 py-0.5 text-xs font-medium text-positive">
                  +{doneCount} 已完成
                </span>
              )}
            </div>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {/* Body */}
      {expanded && (
        <div className="border-t border-border">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted" />
              <span className="ml-2 text-sm text-muted">分析行动项...</span>
            </div>
          ) : visibleActions.length === 0 ? (
            <div className="py-8 text-center">
              <Check className="mx-auto h-6 w-6 text-positive" />
              <p className="mt-2 text-sm font-medium text-foreground">
                全部完成！
              </p>
              <p className="text-xs text-muted">今日行动已全部处理</p>
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto divide-y divide-border">
              {visibleActions.map((action) => {
                const origIdx = actions.indexOf(action);
                const key = actionKey(action, origIdx);
                const status = statuses[key] ?? "pending";
                const colors = priorityColor(action.priority);
                const cfg = TYPE_CONFIG[action.type];
                const Icon = cfg.icon;

                if (status === "snoozed") {
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between px-5 py-2.5 opacity-50"
                    >
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <Clock className="h-3.5 w-3.5" />
                        <span className="line-through">{action.title}</span>
                        <span className="text-xs">已推迟</span>
                      </div>
                      <button
                        onClick={() => setStatus(key, "pending")}
                        className="text-xs text-accent hover:underline"
                      >
                        恢复
                      </button>
                    </div>
                  );
                }

                return (
                  <div key={key} className="group px-5 py-3">
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div
                        className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${colors.bg}`}
                      >
                        <Icon className={`h-4 w-4 ${colors.text}`} />
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={action.entityHref}
                            className="text-sm font-medium text-foreground hover:text-accent truncate"
                          >
                            {action.title}
                          </Link>
                          <span
                            className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${colors.bg} ${colors.text}`}
                          >
                            {priorityLabel(action.priority)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted truncate">
                          {action.description}
                        </p>
                        <p className="mt-1 text-xs text-secondary italic">
                          💡 {action.suggestedAction}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => setStatus(key, "done")}
                          title="完成"
                          className="rounded-md p-1.5 text-positive hover:bg-positive/10"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setStatus(key, "snoozed")}
                          title="推迟"
                          className="rounded-md p-1.5 text-warning hover:bg-warning/10"
                        >
                          <Clock className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setStatus(key, "dismissed")}
                          title="忽略"
                          className="rounded-md p-1.5 text-secondary hover:bg-surface-2 hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
