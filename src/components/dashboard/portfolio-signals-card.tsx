"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  HelpCircle,
  ChevronRight,
  Zap,
  ShieldAlert,
  ArrowUpRight,
  Globe2,
  Clock3,
  Link2,
  ShieldCheck,
} from "lucide-react";
import type { PublicWebPortfolioSignal } from "@/lib/judgment/public-web-portfolio-signals";

// ─── Types ──────────────────────────────────────────────────────────

interface ConflictItem {
  id: string;
  accountId: string;
  summary: string;
  kind: string;
  severity: string;
  detectedAt: string;
}

interface QuestionItem {
  id: string;
  accountId: string;
  question: string;
  context: string;
  priority: number;
  createdAt: string;
}

interface PortfolioSignalsData {
  conflicts: ConflictItem[];
  questions: QuestionItem[];
  accountNames: Record<string, string>;
  publicWebSignals?: PublicWebPortfolioSignal[];
}

interface FallbackSignalItem {
  accountId: string;
  accountName: string;
  summary: string;
}

interface JudgmentQueueItem {
  id: string;
  href: string;
  accountName: string;
  priorityLabel: string;
  reason: string;
  evidence: string;
  action: string;
  tone: "critical" | "warning" | "focus";
}

// ─── Labels ────────────────────────────────────────────────

const CONFLICT_KIND_LABEL: Record<string, string> = {
  budget_contradiction: "预算矛盾",
  stance_contradiction: "立场分歧",
  person_stance_flip: "干系人翻转",
  temporal_reversal: "信号反转",
  engagement_gap: "参与断崖",
  cross_source_disagreement: "来源冲突",
  competitor_displacement: "竞品冲击",
  unknown: "信号矛盾",
};

const SEVERITY_STYLE: Record<string, { dot: string; text: string }> = {
  high: { dot: "var(--dash-health-bad)", text: "var(--dash-severity-critical)" },
  medium: { dot: "var(--dash-health-warn)", text: "var(--dash-severity-warning)" },
  low: { dot: "var(--dash-text-tertiary)", text: "var(--dash-text-secondary)" },
};

const PUBLIC_WEB_PAGE_LABELS: Record<string, string> = {
  leadership: "关键人/组织",
  procurement: "采购/供应商",
  case_study: "案例/方案",
  news: "公开新闻",
  about: "公司介绍",
  home: "官网",
  public_page: "公开网页",
};

function formatSignalTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待校准";
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function buildJudgmentQueue(params: {
  conflicts: ConflictItem[];
  questions: QuestionItem[];
  accountNames: Record<string, string>;
  publicWebSignals: PublicWebPortfolioSignal[];
  fallbackItems: FallbackSignalItem[];
}): JudgmentQueueItem[] {
  const publicWebItems: JudgmentQueueItem[] = params.publicWebSignals.slice(0, 2).map((signal) => ({
    id: signal.id,
    href: signal.drilldownHref,
    accountName: signal.accountName,
    priorityLabel: signal.severity === "warning" ? "先核验" : "补证据",
    reason: signal.judgmentImpact,
    evidence: `${signal.auditLabel} · ${signal.evidenceStrengthLabel}`,
    action: signal.recommendedAction,
    tone: signal.severity === "warning" ? "warning" : "focus",
  }));

  const conflictItems: JudgmentQueueItem[] = params.conflicts.slice(0, 2).map((item) => {
    const kindLabel = CONFLICT_KIND_LABEL[item.kind] ?? CONFLICT_KIND_LABEL.unknown;
    return {
      id: `conflict:${item.id}`,
      href: `/accounts/${item.accountId}?tab=overview`,
      accountName: params.accountNames[item.accountId] ?? "未知客户",
      priorityLabel: item.severity === "high" ? "高风险" : "矛盾",
      reason: item.summary,
      evidence: `${kindLabel} · ${formatSignalTime(item.detectedAt)}`,
      action: "先回到账户页核对冲突来源，再决定是否调整判断或推进动作。",
      tone: item.severity === "high" ? "critical" : "warning",
    };
  });

  const questionItems: JudgmentQueueItem[] = params.questions.slice(0, 2).map((item) => ({
    id: `question:${item.id}`,
    href: `/accounts/${item.accountId}?tab=overview`,
    accountName: params.accountNames[item.accountId] ?? "未知客户",
    priorityLabel: item.priority >= 3 ? "高优问题" : "待解问题",
    reason: item.question,
    evidence: item.context || "开放问题 · 需要一手信息补齐",
    action: "把问题转成下一步客户沟通或内部核验任务。",
    tone: item.priority >= 3 ? "warning" : "focus",
  }));

  const fallbackQueue: JudgmentQueueItem[] = params.fallbackItems.slice(0, 2).map((item) => ({
    id: `fallback:${item.accountId}`,
    href: `/accounts/${item.accountId}?tab=overview`,
    accountName: item.accountName,
    priorityLabel: "关键客户",
    reason: item.summary,
    evidence: "来自当前管线与账户健康度",
    action: "进入账户页确认当前证据、联系人路径和下一步动作。",
    tone: "focus",
  }));

  return [...publicWebItems, ...conflictItems, ...questionItems, ...fallbackQueue].slice(0, 4);
}

// ─── Component ──────────────────────────────────────────────────────

export function PortfolioSignalsCard({ fallbackSignals = [] }: { fallbackSignals?: FallbackSignalItem[] }) {
  const [data, setData] = useState<PortfolioSignalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"conflicts" | "questions">("conflicts");
  const loadedRef = useRef(false);
  const [renderTime] = useState(() => Date.now());

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    fetch("/api/portfolio-signals")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border p-4 shadow-[var(--dash-card-shadow)]" style={{ borderColor: "var(--dash-card-border)", backgroundColor: "var(--dash-card-bg)" }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-4 w-4 rounded skeleton" />
          <div className="h-4 w-24 rounded skeleton" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-lg skeleton" />)}
        </div>
      </div>
    );
  }

  const conflicts = data?.conflicts ?? [];
  const questions = data?.questions ?? [];
  const accountNames = data?.accountNames ?? {};
  const publicWebSignals = (data?.publicWebSignals ?? []).slice(0, 3);

  const fallbackItems = fallbackSignals.filter((item) => item.accountId && item.accountName).slice(0, 3);

  // Nothing to show
  if (conflicts.length === 0 && questions.length === 0 && publicWebSignals.length === 0 && fallbackItems.length === 0) return null;

  const hasConflicts = conflicts.length > 0;
  const hasQuestions = questions.length > 0;
  const now = renderTime;
  const judgmentQueue = buildJudgmentQueue({ conflicts, questions, accountNames, publicWebSignals, fallbackItems });

  return (
    <div className="rounded-2xl border shadow-[var(--dash-card-shadow)] overflow-hidden" style={{ borderColor: "var(--dash-card-border)", backgroundColor: "var(--dash-card-bg)" }}>
      {/* Header */}
      <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--dash-card-divider)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4" style={{ color: "var(--dash-icon-accent)" }} />
            <h3 className="text-sm font-semibold" style={{ color: "var(--dash-text-primary)" }}>
              结构性信号
            </h3>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: "var(--dash-counter-bg)", color: "var(--dash-icon-accent)" }}>
              {conflicts.length + questions.length + publicWebSignals.length || fallbackItems.length}
            </span>
          </div>
        </div>

        {/* Tabs */}
        {hasConflicts && hasQuestions && (
          <div className="mt-2.5 flex gap-1 rounded-lg p-0.5" style={{ backgroundColor: "var(--dash-card-divider)" }}>
            <button
              onClick={() => setActiveTab("conflicts")}
              className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all"
              style={{
                backgroundColor: activeTab === "conflicts" ? "var(--dash-card-bg)" : "transparent",
                color: activeTab === "conflicts" ? "var(--dash-text-primary)" : "var(--dash-text-tertiary)",
                boxShadow: activeTab === "conflicts" ? "0 1px 2px rgba(0,0,0,0.04)" : undefined,
              }}
            >
              <ShieldAlert className="mr-1 inline h-3 w-3" />
              矛盾信号
              <span className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums" style={{ backgroundColor: "var(--dash-counter-bg)", color: "var(--dash-icon-accent)" }}>
                {conflicts.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("questions")}
              className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all"
              style={{
                backgroundColor: activeTab === "questions" ? "var(--dash-card-bg)" : "transparent",
                color: activeTab === "questions" ? "var(--dash-text-primary)" : "var(--dash-text-tertiary)",
                boxShadow: activeTab === "questions" ? "0 1px 2px rgba(0,0,0,0.04)" : undefined,
              }}
            >
              <HelpCircle className="mr-1 inline h-3 w-3" />
              待解问题
              <span className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums" style={{ backgroundColor: "var(--dash-counter-bg)", color: "var(--dash-icon-accent)" }}>
                {questions.length}
              </span>
            </button>
          </div>
        )}
      </div>

      {judgmentQueue.length > 0 && (
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--dash-card-divider)" }}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold" style={{ color: "var(--dash-text-primary)" }}>今日判断队列</p>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--dash-text-tertiary)" }}>
                从信号、证据、判断影响到下一步动作，先处理最能改变局势的事项。
              </p>
            </div>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: "var(--dash-counter-bg)", color: "var(--dash-icon-accent)" }}>
              {judgmentQueue.length}
            </span>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {judgmentQueue.map((item) => {
              const accent = item.tone === "critical"
                ? "var(--dash-health-bad)"
                : item.tone === "warning"
                  ? "var(--dash-health-warn)"
                  : "var(--dash-icon-accent)";
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="rounded-lg border px-3 py-2 transition-colors hover:bg-[var(--dash-hover-bg)]"
                  style={{ borderColor: "var(--dash-card-divider)", backgroundColor: "var(--dash-card-bg)" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: "var(--dash-text-primary)" }}>{item.accountName}</span>
                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: "var(--dash-counter-bg)", color: accent }}>{item.priorityLabel}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed" style={{ color: "var(--dash-text-primary)" }}>{item.reason}</p>
                  <p className="mt-1 line-clamp-1 text-[11px]" style={{ color: "var(--dash-text-tertiary)" }}>证据：{item.evidence}</p>
                  <p className="mt-1 line-clamp-1 text-[11px]" style={{ color: "var(--dash-text-secondary)" }}>下一步：{item.action}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="max-h-[320px] overflow-y-auto scrollbar-thin">
        {/* Fallback structural view */}
        {conflicts.length === 0 && questions.length === 0 && publicWebSignals.length === 0 && fallbackItems.length > 0 && (
          <div className="divide-y" style={{ borderColor: "var(--dash-card-divider)" }}>
            {fallbackItems.map((item) => (
              <Link
                key={item.accountId}
                href={`/accounts/${item.accountId}?tab=overview`}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--dash-hover-bg)]"
              >
                <Zap className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: "var(--dash-icon-accent)" }} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold" style={{ color: "var(--dash-text-primary)" }}>
                      {item.accountName}
                    </span>
                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: "var(--dash-counter-bg)", color: "var(--dash-icon-accent)" }}>
                      查看详情
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed" style={{ color: "var(--dash-text-primary)" }}>
                    {item.summary}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--dash-text-tertiary)" }} />
              </Link>
            ))}
          </div>
        )}

        {/* Public web evidence */}
        {publicWebSignals.length > 0 && (
          <div className="divide-y" style={{ borderColor: "var(--dash-card-divider)" }}>
            {publicWebSignals.map((signal) => (
              <div
                key={signal.id}
                className="group px-4 py-3 transition-colors hover:bg-[var(--dash-hover-bg)]"
              >
                <div className="flex items-start gap-3">
                  <Globe2 className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: "var(--dash-icon-accent)" }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: "var(--dash-text-primary)" }}>
                        {signal.accountName}
                      </span>
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: "var(--dash-counter-bg)", color: "var(--dash-icon-accent)" }}>
                        {PUBLIC_WEB_PAGE_LABELS[signal.pageType] ?? "公开网页"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: "var(--dash-card-divider)", color: "var(--dash-text-secondary)" }}>
                        <ShieldCheck className="h-3 w-3" />
                        {signal.evidenceStrengthLabel}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs font-medium" style={{ color: "var(--dash-text-secondary)" }}>
                      {signal.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed" style={{ color: "var(--dash-text-primary)" }}>
                      {signal.judgmentImpact}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed" style={{ color: "var(--dash-text-tertiary)" }}>
                      证据摘录：{signal.summary}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--dash-text-tertiary)" }}>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3 w-3" />
                        采集 {formatSignalTime(signal.capturedAt)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Link2 className="h-3 w-3" />
                        {signal.auditLabel}
                      </span>
                      <span>证据链 {signal.evidenceRefs.length}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Link
                        href={signal.drilldownHref}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors hover:bg-[var(--dash-card-divider)]"
                        style={{ color: "var(--dash-icon-accent)" }}
                      >
                        查看判断证据
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                      {signal.sourceUrl && (
                        <a
                          href={signal.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors hover:bg-[var(--dash-card-divider)]"
                          style={{ color: "var(--dash-text-secondary)" }}
                        >
                          <span className="truncate">打开公开来源</span>
                          <ArrowUpRight className="h-3 w-3 flex-shrink-0" />
                        </a>
                      )}
                    </div>
                  </div>
                  <p className="ml-auto hidden max-w-[9rem] text-right text-[11px] leading-snug md:block" style={{ color: "var(--dash-text-tertiary)" }}>
                    {signal.recommendedAction}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Conflicts */}
        {(activeTab === "conflicts" || !hasQuestions) && hasConflicts && (
          <div className="divide-y" style={{ borderColor: "var(--dash-card-divider)" }}>
            {conflicts.map((c) => {
              const sev = SEVERITY_STYLE[c.severity] ?? SEVERITY_STYLE.medium;
              const kindLabel = CONFLICT_KIND_LABEL[c.kind] ?? CONFLICT_KIND_LABEL.unknown;
              const acctName = accountNames[c.accountId] ?? "未知客户";
              const daysAgo = Math.floor((now - new Date(c.detectedAt).getTime()) / 86400000);

              return (
                <Link
                  key={c.id}
                  href={`/accounts/${c.accountId}?tab=overview`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--dash-hover-bg)]"
                >
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: sev.dot }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold" style={{ color: sev.text }}>
                        {kindLabel}
                      </span>
                      <span className="text-[11px]" style={{ color: "var(--dash-text-tertiary)" }}>
                        {acctName}
                      </span>
                      {daysAgo <= 3 && (
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: "var(--dash-severity-critical-bg)", color: "var(--dash-severity-critical)" }}>
                          新
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm leading-relaxed line-clamp-2" style={{ color: "var(--dash-text-primary)" }}>
                      {c.summary}
                    </p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 mt-1" style={{ color: "var(--dash-text-tertiary)" }} />
                </Link>
              );
            })}
          </div>
        )}

        {/* Open Questions */}
        {(activeTab === "questions" || !hasConflicts) && hasQuestions && (
          <div className="divide-y" style={{ borderColor: "var(--dash-card-divider)" }}>
            {questions.map((q) => {
              const acctName = accountNames[q.accountId] ?? "未知客户";

              return (
                <Link
                  key={q.id}
                  href={`/accounts/${q.accountId}?tab=overview`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--dash-hover-bg)]"
                >
                  <HelpCircle className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "var(--dash-health-warn)" }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium" style={{ color: "var(--dash-text-tertiary)" }}>
                        {acctName}
                      </span>
                      {q.priority >= 3 && (
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: "var(--dash-severity-warning-bg)", color: "var(--dash-severity-warning)" }}>
                          高优
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm leading-relaxed line-clamp-2" style={{ color: "var(--dash-text-primary)" }}>
                      {q.question}
                    </p>
                    {q.context && (
                      <p className="mt-0.5 text-xs line-clamp-1" style={{ color: "var(--dash-text-tertiary)" }}>
                        {q.context}
                      </p>
                    )}
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0 mt-1" style={{ color: "var(--dash-text-tertiary)" }} />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
