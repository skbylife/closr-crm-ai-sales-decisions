"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  AlertTriangle,
  RefreshCw,
  CheckCircle,
  XCircle,
  Info,
  Activity,
} from "lucide-react";
import type {
  CILAccountHealthReport,
} from "@/lib/compiled-intelligence/explain";
import type {
  CILLintFinding,
  CILLintSeverity,
  CILRefreshTarget,
} from "@/lib/compiled-intelligence/lint";

// ─── Props ───────────────────────────────────────────────────────────

interface CILHealthPanelProps {
  accountId: string;
  compact?: boolean;
}

// ─── Severity config ─────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<
  CILLintSeverity,
  { label: string; bg: string; text: string; border: string }
> = {
  critical: {
    label: "严重",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
  },
  warning: {
    label: "警告",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  review: {
    label: "待审",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  info: {
    label: "信息",
    bg: "bg-gray-50",
    text: "text-gray-600",
    border: "border-gray-200",
  },
};

const PRIORITY_CONFIG: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  high: { label: "高", bg: "bg-red-50", text: "text-red-700" },
  medium: { label: "中", bg: "bg-amber-50", text: "text-amber-700" },
  low: { label: "低", bg: "bg-gray-50", text: "text-gray-600" },
};

// ─── Health Score Ring (SVG) ─────────────────────────────────────────

function HealthScoreRing({
  score,
  size = 96,
}: {
  score: number;
  size?: number;
}) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const center = size / 2;

  const color =
    score >= 80 ? "#1A8754" : score >= 50 ? "#D4880F" : "#DF2531";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-border"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-2xl font-bold tabular-nums"
          style={{ color }}
        >
          {score}
        </span>
        <span className="text-[10px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

// ─── Skeleton loader ─────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-border/60 ${className}`}
    />
  );
}

function LoadingSkeleton({ compact }: { compact: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-4 p-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-4">
        <Skeleton className="h-24 w-24 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
      <Skeleton className="h-20" />
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Shield className="h-10 w-10 text-border mb-3" />
      <p className="text-sm font-medium text-foreground">
        尚未建立智能画像
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        通过邮件解读或手动录入 evidence 后，系统将自动生成 CIL 健康报告
      </p>
    </div>
  );
}

// ─── Mini stat card ──────────────────────────────────────────────────

function MiniStat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <p className="text-lg font-bold tabular-nums text-foreground">
        {value}
      </p>
      {sub && (
        <p className="text-[10px] text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

// ─── Finding item ────────────────────────────────────────────────────

function FindingItem({ finding }: { finding: CILLintFinding }) {
  const cfg = SEVERITY_CONFIG[finding.severity];
  const SeverityIcon =
    finding.severity === "critical"
      ? XCircle
      : finding.severity === "warning"
        ? AlertTriangle
        : finding.severity === "review"
          ? Info
          : Info;

  return (
    <div
      className={`rounded-lg border ${cfg.border} ${cfg.bg} p-3 space-y-1.5`}
    >
      <div className="flex items-start gap-2">
        <SeverityIcon className={`h-4 w-4 mt-0.5 shrink-0 ${cfg.text}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text} border ${cfg.border}`}
            >
              {cfg.label}
            </span>
            <span className="text-xs font-semibold text-foreground truncate">
              {finding.title}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            {finding.description}
          </p>
          {finding.suggestedAction && (
            <p className="text-[11px] mt-1.5 text-foreground/70">
              <span className="font-medium">建议操作：</span>
              {finding.suggestedAction}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Refresh target item ─────────────────────────────────────────────

function RefreshTargetItem({ target }: { target: CILRefreshTarget }) {
  const cfg = PRIORITY_CONFIG[target.priority] ?? PRIORITY_CONFIG.low;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      <RefreshCw className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}
          >
            {cfg.label}优先
          </span>
          <span className="text-[10px] text-muted-foreground">
            {target.targetType === "claim" ? "Claim" : "页面"}
          </span>
        </div>
        <p className="text-xs text-foreground mt-1 line-clamp-2">
          {target.statement}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {target.reason}
        </p>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────

export function CILHealthPanel({
  accountId,
  compact = false,
}: CILHealthPanelProps) {
  const [report, setReport] = useState<CILAccountHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cil-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });

      if (!res.ok) {
        // 404 or similar means no CIL data yet
        if (res.status === 404 || res.status === 500) {
          setReport(null);
          setLoading(false);
          return;
        }
        throw new Error(`请求失败 (${res.status})`);
      }

      const json = await res.json();
      if (json.type === "account" && json.data) {
        setReport(json.data as CILAccountHealthReport);
      } else {
        setReport(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <LoadingSkeleton compact={compact} />
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-red-600">
          <XCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      </div>
    );
  }

  // ── Empty state ──
  if (!report) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <EmptyState />
      </div>
    );
  }

  // ── Derived values ──
  const {
    healthScore,
    claimDistribution,
    evidenceCoverage,
    knowledgeFreshness,
    lintFindings,
    refreshTargets,
    summary,
  } = report;

  const criticalCount = lintFindings.filter(
    (f) => f.severity === "critical"
  ).length;

  const totalPages =
    knowledgeFreshness.freshPages + knowledgeFreshness.stalePages;

  // ── Compact mode ──
  if (compact) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-4">
          <HealthScoreRing score={healthScore} size={64} />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">
                CIL 健康度
              </span>
              {criticalCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                  <XCircle className="h-3 w-3" />
                  {criticalCount} 严重
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
              {summary}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Full mode ──
  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#DF2531]" />
          <h3 className="text-sm font-semibold text-foreground">
            CIL 智能画像健康度
          </h3>
        </div>
        <button
          onClick={fetchReport}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-border/40 transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          刷新
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Score + summary row */}
        <div className="flex items-center gap-5">
          <HealthScoreRing score={healthScore} size={96} />
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-sm text-foreground leading-relaxed">
              {summary}
            </p>
            {criticalCount > 0 && (
              <div className="flex items-center gap-1.5 text-red-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">
                  {criticalCount} 项严重问题需要立即处理
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Key metrics row */}
        <div className="grid grid-cols-3 gap-3">
          <MiniStat
            icon={<Activity className="h-3.5 w-3.5" />}
            label="Claims"
            value={`${claimDistribution.active}/${claimDistribution.total}`}
            sub={`${claimDistribution.active} 活跃 / ${claimDistribution.stale} 过期`}
          />
          <MiniStat
            icon={<CheckCircle className="h-3.5 w-3.5" />}
            label="Evidence"
            value={`${evidenceCoverage.linked}/${evidenceCoverage.total}`}
            sub={
              evidenceCoverage.orphaned > 0
                ? `${evidenceCoverage.orphaned} 条未关联`
                : "全部已关联"
            }
          />
          <MiniStat
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            label="新鲜度"
            value={
              totalPages > 0
                ? `${Math.round(
                    (knowledgeFreshness.freshPages / totalPages) * 100
                  )}%`
                : "N/A"
            }
            sub={`${knowledgeFreshness.freshPages} 新鲜 / ${knowledgeFreshness.stalePages} 过期`}
          />
        </div>

        {/* Lint findings */}
        {lintFindings.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
              <h4 className="text-xs font-semibold text-foreground">
                检查发现 ({lintFindings.length})
              </h4>
            </div>
            <div className="space-y-2 max-h-[320px] overflow-y-auto">
              {lintFindings.map((finding, idx) => (
                <FindingItem
                  key={finding.targetId ?? `finding-${idx}`}
                  finding={finding}
                />
              ))}
            </div>
          </div>
        )}

        {/* Refresh targets */}
        {refreshTargets.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              <h4 className="text-xs font-semibold text-foreground">
                待刷新项 ({refreshTargets.length})
              </h4>
            </div>
            <div className="space-y-2 max-h-[240px] overflow-y-auto">
              {refreshTargets.map((target, idx) => (
                <RefreshTargetItem
                  key={target.targetId ?? `target-${idx}`}
                  target={target}
                />
              ))}
            </div>
          </div>
        )}

        {/* All clear */}
        {lintFindings.length === 0 && refreshTargets.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <span className="text-xs text-emerald-700 font-medium">
              所有检查通过，智能画像状态健康
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default CILHealthPanel;
