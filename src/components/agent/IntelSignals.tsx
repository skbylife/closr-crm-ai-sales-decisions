"use client";

/**
 * IntelSignals — Intelligence Agent 信号通知组件
 *
 * 显示最近7天的扫描信号：
 *   - 🔴 高优先信号（立即展示）
 *   - 🟡 中优先信号（折叠，点击展开）
 *
 * 每个信号：客户名、信号内容、影响方向、建议动作、「标记已处理」按钮
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Zap,
  CheckCircle2,
  ExternalLink,
  Radio,
  Clock,
} from "lucide-react";
import { getCached, setCache, invalidate, FRESHNESS, formatCacheAge } from "@/lib/fetch-cache";

// ─── 类型 ─────────────────────────────────────────────────────────────

interface RelatedClaim {
  statement: string;
  claimType: string;
  confidence: number;
}

interface IntelSignal {
  id: string;
  scope: "account";
  accountId: string | null;
  accountName: string | null;
  content: string;
  signalType: string | null;
  priority: "high" | "medium" | "low";
  sourceUrl: string | null;
  triggeredBy: string;
  createdAt: string;
  impactLevel: "high" | "medium" | "low";
  impactDirection: "opportunity" | "risk" | "neutral";
  suggestedAction?: {
    kind: "open_account" | "generate_play" | "review_signal" | "schedule_meeting" | "create_task";
    label: string;
    targetEntityType?: "account" | "contact" | "opportunity";
  };
  actionRationale?: string;
  relatedClaims?: RelatedClaim[];
}

interface SignalsResponse {
  signals: IntelSignal[];
  total: number;
  scope?: "account";
  note?: string;
}

// ─── 辅助 ─────────────────────────────────────────────────────────────

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  job_change: "职位变动",
  funding: "融资动态",
  layoff: "裁员重组",
  competitor_news: "竞品动态",
  post: "观点发布",
  news: "新闻资讯",
  other: "其他",
};

function priorityBadge(priority: IntelSignal["priority"]) {
  if (priority === "high") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-danger">
        <span className="h-2 w-2 rounded-full bg-danger" />
        高优先
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
      <span className="h-2 w-2 rounded-full bg-warning" />
      中优先
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "刚刚";
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

// ─── 单条信号卡片 ──────────────────────────────────────────────────────

function SignalCard({
  signal,
  onAction,
}: {
  signal: IntelSignal;
  onAction: (id: string) => void;
}) {
  const router = useRouter();
  const [actioning, setActioning] = useState(false);

  const handleAction = async () => {
    setActioning(true);
    try {
      await fetch("/api/agent/intelligence/signals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId: signal.id }),
      });
      onAction(signal.id);
    } catch {
      // silent fail
    } finally {
      setActioning(false);
    }
  };

  const handlePlay = () => {
    // 把信号内容作为谋局前置上下文带过去，让谋局 AI 知道这个信号
    const signalContext = encodeURIComponent(
      JSON.stringify({
        signalType: signal.signalType,
        content: signal.content,
        priority: signal.priority,
        sourceUrl: signal.sourceUrl,
      })
    );
    if (signal.accountId) {
      // 跳转到客户详情页的谋局 tab，带入信号上下文作为预填目标
      router.push(
        `/dashboard/accounts/${signal.accountId}?tab=plays&intelSignal=${signalContext}`
      );
    }
  };

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        signal.priority === "high"
          ? "border-danger/20 bg-danger/5"
          : "border-warning/20 bg-warning/5"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2">
            {priorityBadge(signal.priority)}
            {signal.signalType && (
              <span className="text-xs text-muted">
                {SIGNAL_TYPE_LABELS[signal.signalType] ?? signal.signalType}
              </span>
            )}
          </div>
          {signal.accountName && (
            <p className="text-xs font-medium text-foreground truncate">
              {signal.accountName}
              <span className="text-muted font-normal ml-1">· 客户级信号</span>
            </p>
          )}
        </div>
        <span className="text-xs text-muted shrink-0">{timeAgo(signal.createdAt)}</span>
      </div>

      {/* Content */}
      <p className="mt-2 text-sm text-foreground leading-relaxed">{signal.content}</p>

      {/* Source link */}
      {signal.sourceUrl && (
        <a
          href={signal.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          查看来源
        </a>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className={`inline-flex items-center rounded-full px-2 py-1 font-medium ${
          signal.impactDirection === "risk"
            ? "bg-danger/10 text-danger"
            : signal.impactDirection === "opportunity"
              ? "bg-positive/10 text-positive"
              : "bg-muted/10 text-muted"
        }`}>
          {signal.impactDirection === "risk" ? "风险影响" : signal.impactDirection === "opportunity" ? "机会影响" : "中性影响"}
        </span>
        <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-1 font-medium text-accent">
          建议动作：{signal.suggestedAction?.label ?? "查看信号详情"}
        </span>
      </div>

      {signal.actionRationale && (
        <p className="mt-2 text-xs text-muted leading-relaxed">{signal.actionRationale}</p>
      )}

      {signal.relatedClaims && signal.relatedClaims.length > 0 && (
        <div className="mt-2 rounded-md border border-accent/10 bg-accent/5 px-2.5 py-2">
          <p className="text-[11px] font-medium text-accent mb-1">关联情报判断</p>
          {signal.relatedClaims.map((claim, i) => (
            <p key={i} className="text-xs text-foreground/80 leading-relaxed">
              <span className="text-muted-foreground mr-1">[{Math.round(claim.confidence * 100)}%]</span>
              {claim.statement}
            </p>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={handlePlay}
          disabled={!signal.accountId}
          className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Zap className="h-3.5 w-3.5" />
          {signal.suggestedAction?.label ?? "生成谋局"}
        </button>
        <button
          onClick={handleAction}
          disabled={actioning}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
        >
          {actioning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          标记已处理
        </button>
      </div>
    </div>
  );
}

// ─── 主组件 ────────────────────────────────────────────────────────────

const CACHE_KEY_SIGNALS = "intel-signals";

export function IntelSignals({ className }: { className?: string }) {
  const [signals, setSignals] = useState<IntelSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mediumExpanded, setMediumExpanded] = useState(false);
  const [scopeNote, setScopeNote] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number>(0);

  const fetchSignals = useCallback(async (force = false) => {
    // Check cache first (unless force-refresh)
    if (!force) {
      const cached = getCached<SignalsResponse>(CACHE_KEY_SIGNALS, FRESHNESS.INTEL);
      if (cached) {
        setSignals(cached.data.signals ?? []);
        setScopeNote(cached.data.note ?? (cached.data.scope === "account" ? "当前展示的是客户级情报信号" : null));
        setFetchedAt(cached.fetchedAt);
        setLoading(false);
        return;
      }
    } else {
      invalidate(CACHE_KEY_SIGNALS);
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/intelligence/signals");
      if (!res.ok) throw new Error("获取信号失败");
      const data = (await res.json()) as SignalsResponse;
      setSignals(data.signals ?? []);
      setScopeNote(data.note ?? (data.scope === "account" ? "当前展示的是客户级情报信号" : null));
      setFetchedAt(setCache(CACHE_KEY_SIGNALS, data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSignals(false);
  }, [fetchSignals]);

  const handleRemove = useCallback((id: string) => {
    setSignals((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const highSignals = signals.filter((s) => s.priority === "high");
  const mediumSignals = signals.filter((s) => s.priority === "medium");

  // ── Loading ──
  if (loading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className ?? ""}`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className={`rounded-lg border border-danger/20 bg-danger/5 p-4 ${className ?? ""}`}>
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  // ── Empty ──
  if (signals.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-8 text-center ${className ?? ""}`}>
        <Radio className="h-6 w-6 text-muted mb-2" />
        <p className="text-sm text-muted">暂无待处理信号</p>
        <p className="mt-1 text-xs text-muted">Intelligence Agent 将自动扫描客户级动态信号</p>
      </div>
    );
  }

  const cacheAge = fetchedAt ? formatCacheAge(fetchedAt) : null;

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      {/* Cache status + refresh */}
      {cacheAge && (
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {cacheAge.label}
          </span>
          <button
            onClick={() => void fetchSignals(true)}
            className="text-accent hover:underline"
          >
            刷新
          </button>
        </div>
      )}
      {scopeNote && (
        <div className="rounded-lg border border-accent/15 bg-accent/5 px-3 py-2 text-xs text-accent">
          {scopeNote}
        </div>
      )}

      {/* 高优先信号 */}
      {highSignals.map((signal) => (
        <SignalCard key={signal.id} signal={signal} onAction={handleRemove} />
      ))}

      {/* 中优先信号（折叠） */}
      {mediumSignals.length > 0 && (
        <div>
          <button
            onClick={() => setMediumExpanded((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-warning/20 bg-warning/5 px-3 py-2 text-sm text-warning hover:bg-warning/8 transition-colors"
          >
            <span className="flex items-center gap-2 font-medium">
              <span className="h-2 w-2 rounded-full bg-warning" />
              {mediumSignals.length} 条中优先信号
            </span>
            {mediumExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {mediumExpanded && (
            <div className="mt-2 flex flex-col gap-2">
              {mediumSignals.map((signal) => (
                <SignalCard key={signal.id} signal={signal} onAction={handleRemove} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
