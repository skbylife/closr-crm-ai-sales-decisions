"use client";

import { useState, useMemo } from "react";
import {
  Clock,
  ChevronRight,
  Radio,
  ArrowUpDown,
  Zap,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type {
  IntelItem,
  IntelSource,
  Urgency,
  SpinItem,
} from "@/lib/babel-engine/types";
import { SPIN_COLORS } from "@/lib/babel-engine/types";

// ─── Constants ─────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  news: "新闻",
  earnings: "财报",
  leadership_change: "人事变动",
  competitor: "竞品动态",
  manual: "手动录入",
  discovery: "发现",
  email_decode: "邮件解读",
  play_created: "谋局",
};

const SOURCE_LABELS: Record<IntelSource, string> = {
  supplier: "供应商",
  industry_event: "行业活动",
  news: "新闻",
  internal: "内部",
  social_media: "社交",
  client_direct: "客户直接",
  meeting: "会议",
  call: "电话",
  email: "邮件",
  chat: "聊天",
  other: "其他",
  ai_decode: "AI 解读",
  ai_play: "AI 谋局",
};

type SortOrder = "newest" | "oldest";
type TypeFilter = IntelItem["type"] | "all";

// ─── Helpers ───────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diffMin = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 60000
  );
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

function urgencyDot(u: Urgency) {
  const colors: Record<Urgency, string> = {
    high: "bg-red-500",
    medium: "bg-amber-400",
    low: "bg-green-500",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[u]}`} />;
}

// ─── Props ─────────────────────────────────────────────────────────

interface IntelTimelineProps {
  /** 只显示指定客户的情报 */
  accountId?: string;
  /** 最大显示条数，默认不限制 */
  maxItems?: number;
  /** 是否显示过滤控件，默认 true */
  showFilters?: boolean;
  /** 紧凑模式（用于侧边栏等），默认 false */
  compact?: boolean;
}

// ─── Component ─────────────────────────────────────────────────────

export function IntelTimeline({
  accountId,
  maxItems,
  showFilters = true,
  compact = false,
}: IntelTimelineProps) {
  const { intelItems } = useStore();

  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [filterType, setFilterType] = useState<TypeFilter>("all");
  const [filterUrgency, setFilterUrgency] = useState<Urgency | "all">("all");

  // Filter by accountId if provided
  const scopedItems = useMemo(() => {
    if (!accountId) return intelItems;
    return intelItems.filter((item) => item.accountId === accountId);
  }, [intelItems, accountId]);

  // Available types for filter dropdown
  const availableTypes = useMemo(
    () => [...new Set(scopedItems.map((item) => item.type))].sort(),
    [scopedItems]
  );

  // Apply filters + sort
  const displayItems = useMemo(() => {
    let items = scopedItems;

    if (filterType !== "all") {
      items = items.filter((item) => item.type === filterType);
    }
    if (filterUrgency !== "all") {
      items = items.filter((item) => item.urgency === filterUrgency);
    }

    // Sort by date
    items = [...items].sort((a, b) => {
      const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
      return sortOrder === "newest" ? diff : -diff;
    });

    if (maxItems && maxItems > 0) {
      items = items.slice(0, maxItems);
    }

    return items;
  }, [scopedItems, filterType, filterUrgency, sortOrder, maxItems]);

  const selectClass =
    "rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-accent/40 focus:outline-none transition-colors";

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      {showFilters && scopedItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as TypeFilter)}
            className={selectClass}
          >
            <option value="all">全部类型</option>
            {availableTypes.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type] ?? type}
              </option>
            ))}
          </select>

          <select
            value={filterUrgency}
            onChange={(e) =>
              setFilterUrgency(e.target.value as Urgency | "all")
            }
            className={selectClass}
          >
            <option value="all">全部紧急度</option>
            <option value="high">紧急</option>
            <option value="medium">一般</option>
            <option value="low">低</option>
          </select>

          <button
            onClick={() =>
              setSortOrder((prev) =>
                prev === "newest" ? "oldest" : "newest"
              )
            }
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs text-muted hover:text-foreground hover:border-accent/30 transition-colors"
            title={sortOrder === "newest" ? "当前：最新优先" : "当前：最早优先"}
          >
            <ArrowUpDown className="h-3 w-3" />
            {sortOrder === "newest" ? "最新" : "最早"}
          </button>

          <span className="ml-auto text-xs text-muted">
            {displayItems.length} / {scopedItems.length} 条
          </span>
        </div>
      )}

      {/* Timeline */}
      {displayItems.length > 0 ? (
        <div className={`space-y-${compact ? "2" : "3"}`}>
          {displayItems.map((intel) => (
            <TimelineEntry key={intel.id} intel={intel} compact={compact} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-sidebar">
            <Radio className="h-5 w-5 text-muted" />
          </div>
          <p className="text-sm text-muted">暂无情报数据</p>
          <p className="mt-1 text-xs text-muted">
            使用情报中心的「录入情报」开始收集客户情报
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Timeline Entry ────────────────────────────────────────────────

function TimelineEntry({
  intel,
  compact,
}: {
  intel: IntelItem;
  compact: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-xl border border-border bg-sidebar transition-colors hover:border-border-subtle ${
        compact ? "p-3" : "p-4"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {urgencyDot(intel.urgency)}
          <span
            className={`font-medium text-foreground truncate ${
              compact ? "text-xs" : "text-sm"
            }`}
          >
            {intel.accountName}
          </span>
          <span className="rounded bg-card px-1.5 py-0.5 text-[11px] text-muted border border-border flex-shrink-0">
            {SOURCE_LABELS[intel.source] ?? intel.source}
          </span>
          {intel.type && (
            <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[11px] text-accent border border-accent/20 flex-shrink-0">
              {TYPE_LABELS[intel.type] ?? intel.type}
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 text-[11px] text-muted whitespace-nowrap flex-shrink-0">
          <Clock className="h-3 w-3" />
          {timeAgo(intel.date)}
        </span>
      </div>

      {/* SPIN badges */}
      {!compact &&
        Array.isArray(intel.spinClassification) &&
        intel.spinClassification.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {intel.spinClassification.map((item: SpinItem, i: number) => (
              <span
                key={i}
                className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] font-medium ${SPIN_COLORS[item.category].bg} ${SPIN_COLORS[item.category].text} ${SPIN_COLORS[item.category].border}`}
              >
                {item.category === "situation"
                  ? "S"
                  : item.category === "problem"
                    ? "P"
                    : item.category === "implication"
                      ? "I"
                      : "N"}
                <span className="max-w-[100px] truncate">{item.text}</span>
              </span>
            ))}
          </div>
        )}

      {/* Content */}
      <p
        className={`mt-2 leading-relaxed text-foreground ${
          compact ? "text-xs" : "text-sm"
        } ${!expanded && intel.content.length > 100 ? "line-clamp-2" : ""}`}
      >
        {intel.content}
      </p>
      {intel.content.length > 100 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs text-accent hover:underline"
        >
          {expanded ? "收起" : "展开"}
        </button>
      )}

      {/* Analysis hint */}
      {intel.analysis && !compact && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-accent/15 bg-accent/[0.03] px-2.5 py-1.5">
          <Zap className="h-3 w-3 text-accent flex-shrink-0" />
          <span className="text-xs text-accent truncate">
            <span className="font-semibold">影响：</span>
            {intel.analysis.implications}
          </span>
          <ChevronRight className="h-3 w-3 text-accent/50 flex-shrink-0" />
        </div>
      )}

      {/* Relevance (if available) */}
      {intel.relevance && !compact && (
        <p className="mt-1.5 text-xs text-secondary italic">
          {intel.relevance}
        </p>
      )}
    </div>
  );
}
