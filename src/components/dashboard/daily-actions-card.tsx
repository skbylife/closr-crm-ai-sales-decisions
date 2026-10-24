"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, Loader2 } from "lucide-react";
import type { DailyAction } from "@/types/daily-action";

const TYPE_ICON: Record<DailyAction["type"], string> = {
  follow_up: "📞",
  verify_assumption: "❓",
  risk_alert: "⚠️",
  relationship_alert: "💔",
  intel_review: "📰",
  task: "✅",
  play_stalled: "⚔️",
};

export function DailyActionsCard() {
  const [actions, setActions] = useState<DailyAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/daily-actions")
      .then((r) => r.json())
      .then((data: { actions?: DailyAction[] }) => {
        if (!cancelled) setActions(data.actions ?? []);
      })
      .catch((err) => console.error('[daily-actions] 今日行动加载失败:', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && actions.length === 0) return null;

  return (
    <div className="card-elevated rounded-xl border border-border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🎯</span>
          <h2 className="text-sm font-semibold text-foreground">今日行动</h2>
          {!loading && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
              {actions.length}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-border">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted" />
              <span className="ml-2 text-sm text-muted">加载中...</span>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {actions.map((action, i) => (
                <Link
                  key={`${action.type}-${action.relatedAccountId ?? action.relatedOpportunityId ?? ""}-${i}`}
                  href={action.entityHref}
                  className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-stripe"
                >
                  <span className="mt-0.5 text-base flex-shrink-0">
                    {TYPE_ICON[action.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {action.title}
                      </span>
                      {action.priority <= 2 && (
                        <span className="rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger flex-shrink-0">
                          {action.priority <= 1 ? "紧急" : "重要"}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted truncate">
                      {action.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
