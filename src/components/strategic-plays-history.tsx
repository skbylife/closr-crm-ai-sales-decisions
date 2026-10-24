"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Brain,
  Loader2,
  ChevronDown,
  ChevronUp,
  Clock,
  Target,
  CheckCircle2,
  AlertTriangle,
  Building2,
} from "lucide-react";
import { useStore } from "@/lib/store";

interface PlayStep {
  index: number;
  title: string;
  description: string;
  who: string;
  target: string;
  action: string;
  timing: string;
  purpose: string;
  rationale?: string;  // 理论依据
  risk: string;
  fallback: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  culturalNote?: string;
}

interface AlternativePath {
  name: string;
  confidence: number;
  steps: PlayStep[];
  reason: string;
}

interface StrategicPlay {
  id: string;
  accountId: string;
  goalType: string;
  goalDescription: string;
  steps: PlayStep[];
  alternativePaths: AlternativePath[];
  confidence: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const GOAL_LABELS: Record<string, string> = {
  close_deal: "推进成交",
  expand_relationship: "拓展关系",
  recover_stalled: "挽回停滞",
  competitive_defense: "竞争防御",
  upsell_crosssell: "追加/交叉销售",
  executive_alignment: "高层对齐",
  custom: "自定义",
};

const STATUS_CONFIG: Record<string, { label: string; style: string }> = {
  active: { label: "进行中", style: "bg-blue-600 text-white" },
  completed: { label: "已完成", style: "bg-green-600 text-white" },
  abandoned: { label: "已放弃", style: "bg-slate-500 text-white" },
};

export default function StrategicPlaysHistory() {
  const [plays, setPlays] = useState<StrategicPlay[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const accounts = useStore((s) => s.accounts);

  useEffect(() => {
    async function fetchAll() {
      try {
        const res = await fetch("/api/strategic-play");
        if (res.ok) {
          const data = await res.json();
          setPlays(data.plays ?? []);
        }
      } catch (err) {
        console.error("[strategic-plays-history] Fetch failed:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  function getAccountName(accountId: string): string {
    return accounts.find((a) => a.id === accountId)?.name ?? accountId;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (plays.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
        <Brain className="mx-auto h-10 w-10 text-secondary mb-3" />
        <p className="text-sm font-medium text-foreground">暂无谋局计划</p>
        <p className="mt-1 text-xs text-muted">
          进入客户详情页 → 谋局 tab，创建第一个谋局计划
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-secondary">
        共 {plays.length} 个谋局计划，跨 {new Set(plays.map((p) => p.accountId)).size} 个客户
      </p>
      {plays.map((play) => {
        const isExpanded = expandedId === play.id;
        const statusCfg = STATUS_CONFIG[play.status] ?? STATUS_CONFIG.active;
        const completedSteps = play.steps.filter((s) => s.status === "completed").length;
        const totalSteps = play.steps.length;
        const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

        return (
          <div
            key={play.id}
            className="rounded-2xl border border-border-subtle bg-card overflow-hidden transition-colors"
          >
            {/* Header — clickable */}
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : play.id)}
              className="flex w-full items-center gap-4 p-4 text-left hover:bg-background/50 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle bg-background">
                <Brain className="h-5 w-5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/accounts/${play.accountId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    <Building2 className="h-3 w-3" />
                    {getAccountName(play.accountId)}
                  </Link>
                  <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${statusCfg.style}`}>
                    {statusCfg.label}
                  </span>
                  <span className="rounded-full border border-border-subtle bg-background px-2 py-0.5 text-[12px] font-medium text-secondary">
                    {GOAL_LABELS[play.goalType] ?? play.goalType}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-foreground truncate">
                  {play.goalDescription}
                </p>
                <div className="mt-1.5 flex items-center gap-3 text-[13px] text-secondary">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(play.createdAt).toLocaleDateString("zh-CN")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    {completedSteps}/{totalSteps} 步 ({progress}%)
                  </span>
                  <span className="flex items-center gap-1">
                    置信度 {play.confidence}%
                  </span>
                </div>
              </div>
              {/* Progress bar */}
              <div className="hidden sm:flex flex-col items-end gap-1.5 flex-shrink-0">
                <div className="w-24 h-1.5 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-secondary flex-shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-secondary flex-shrink-0" />
              )}
            </button>

            {/* Expanded steps */}
            {isExpanded && (
              <div className="border-t border-border-subtle px-4 pb-4 pt-3 space-y-2">
                {play.steps.map((step, i) => {
                  const isDone = step.status === "completed";
                  const isActive = step.status === "in_progress";
                  return (
                    <div
                      key={i}
                      className={`flex gap-3 rounded-xl border p-3 text-xs ${
                        isDone
                          ? "border-positive/20 bg-positive/5"
                          : isActive
                          ? "border-accent/20 bg-accent/5"
                          : "border-border-subtle bg-background/50"
                      }`}
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-full border border-border-subtle bg-card text-[12px] font-bold flex-shrink-0">
                        {isDone ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
                        ) : (
                          step.index
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground">{step.title}</p>
                        <p className="mt-0.5 text-secondary">{step.description}</p>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          <span className="text-muted">👤 {step.who} → {step.target}</span>
                          <span className="text-muted">⏰ {step.timing}</span>
                        </div>
                        {step.rationale && (
                          <p className="mt-1 text-info">📖 依据: {step.rationale}</p>
                        )}
                        {step.risk && (
                          <p className="mt-1 flex items-start gap-1 text-warning">
                            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            风险: {step.risk}
                          </p>
                        )}
                        {step.fallback && (
                          <p className="mt-0.5 text-muted">🔄 备选: {step.fallback}</p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Alternative paths */}
                {play.alternativePaths && play.alternativePaths.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border-subtle">
                    <p className="text-[13px] font-semibold text-secondary mb-2">
                      备选路径 ({play.alternativePaths.length})
                    </p>
                    {play.alternativePaths.map((path, pi) => (
                      <div key={pi} className="rounded-lg border border-border-subtle bg-background/50 p-3 mb-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">{path.name}</span>
                          <span className="text-[12px] text-secondary">置信度 {path.confidence}%</span>
                        </div>
                        <p className="mt-1 text-[13px] text-muted">{path.reason}</p>
                        <p className="mt-1 text-[13px] text-secondary">{path.steps.length} 步</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
