"use client";

import { visibleBusinessText } from "@/lib/visible-business-text";
import { useState, useMemo } from "react";
import Link from "next/link";
import { Send, Loader2, AlertTriangle, Shield, Target, ChevronRight, Clock, Trash2, Radio, Globe, Search, Plus, X, Zap, ArrowUpDown } from "lucide-react";
import { AIActionButton } from '@/components/ai-action-button';
import { appConfirm } from '@/lib/confirm-store';
import { useStore } from "@/lib/store";
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";
import { friendlyError } from "@/lib/error-helper";
import type { IntelSource, Credibility, Urgency, IntelAnalysis, IntelItem, SpinItem } from "@/lib/babel-engine/types";
import { SPIN_COLORS } from "@/lib/babel-engine/types";
import { useLocale } from "@/lib/i18n";
import { NewsSearch } from "@/components/intel/news-search";

// ─── Constants ───────────────────────────────────────────────────────

const INTEL_SOURCES: {
  value: IntelSource;
  label: string;
}[] = [{
  value: "supplier",
  label: "供应商消息"
}, {
  value: "industry_event",
  label: "行业活动"
}, {
  value: "news",
  label: "新闻"
}, {
  value: "internal",
  label: "内部渠道"
}, {
  value: "social_media",
  label: "社交媒体"
}, {
  value: "client_direct",
  label: "客户直接透露"
}, {
  value: "meeting",
  label: "会议"
}, {
  value: "call",
  label: "电话"
}, {
  value: "email",
  label: "邮件"
}, {
  value: "chat",
  label: "聊天"
}, {
  value: "other",
  label: "其他"
}];
const SOURCE_LABELS: Record<IntelSource, string> = {
  supplier: "供应商消息",
  industry_event: "行业活动",
  news: "新闻",
  internal: "内部渠道",
  social_media: "社交媒体",
  client_direct: "客户直接透露",
  meeting: "会议",
  call: "电话",
  email: "邮件",
  chat: "聊天",
  other: "其他",
  ai_decode: "AI 解读",
  ai_play: "AI 谋局"
};
const CREDIBILITY_OPTIONS: {
  value: Credibility;
  label: string;
}[] = [{
  value: "high",
  label: "高"
}, {
  value: "medium",
  label: "中"
}, {
  value: "low",
  label: "低"
}];
const URGENCY_OPTIONS: {
  value: Urgency;
  label: string;
  icon: string;
}[] = [{
  value: "high",
  label: "高",
  icon: "🔴"
}, {
  value: "medium",
  label: "中",
  icon: "🟡"
}, {
  value: "low",
  label: "低",
  icon: "🟢"
}];

// ─── Helpers ─────────────────────────────────────────────────────────

function urgencyBadge(u: Urgency) {
  const styles: Record<Urgency, string> = {
    high: "bg-red-600 text-white border-red-600",
    medium: "bg-amber-500 text-white border-amber-500",
    low: "bg-green-600 text-white border-green-600"
  };
  const labels: Record<Urgency, string> = {
    high: "紧急",
    medium: "一般",
    low: "低"
  };
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[u]}`}>
      {labels[u]}
    </span>;
}
function credibilityBadge(c: Credibility) {
  const styles: Record<Credibility, string> = {
    high: "bg-emerald-600 text-white border-emerald-600",
    medium: "bg-amber-500 text-white border-amber-500",
    low: "bg-slate-500 text-white border-slate-500"
  };
  const labels: Record<Credibility, string> = {
    high: "高可信",
    medium: "待验证",
    low: "存疑"
  };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[c]}`}>
      {labels[c]}
    </span>;
}
function riskBadge(level: string) {
  const styles: Record<string, string> = {
    low: "bg-green-600 text-white border-green-600",
    medium: "bg-amber-500 text-white border-amber-500",
    high: "bg-red-600 text-white border-red-600",
    critical: "bg-red-800 text-white border-red-800"
  };
  const labels: Record<string, string> = {
    low: "低风险",
    medium: "中等风险",
    high: "高风险",
    critical: "危险"
  };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[level] ?? styles.low}`}>
      {level === "critical" && <AlertTriangle className="mr-1 h-3 w-3" />}
      {labels[level] ?? "未知"}
    </span>;
}
function timeAgo(dateStr: string): string {
  const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

// ─── Skeleton ────────────────────────────────────────────────────────

function AIAnalyzingHint() {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  return <div className="flex items-center gap-3 rounded-lg border border-accent/15 bg-accent/[0.03] px-4 py-3">
      <Loader2 className="h-4 w-4 animate-spin text-accent flex-shrink-0" />
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-accent">{tx("正在分析情报内容...")}</span>
        <span className="text-[13px] text-muted">{tx("AI 将交叉验证信息并生成行动建议")}</span>
      </div>
    </div>;
}
function SkeletonAnalysis() {
  return <div className="space-y-4 rounded-xl border border-accent/15 bg-accent/[0.03] p-5">
      <div className="flex items-center gap-2">
        <div className="skeleton h-4 w-4 rounded-full" />
        <div className="skeleton h-4 w-24 rounded" />
      </div>
      {[1, 2, 3, 4].map(i => <div key={i} className="space-y-2">
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-3/4 rounded" />
        </div>)}
    </div>;
}

// ─── Analysis Card ───────────────────────────────────────────────────

function AnalysisCard({
  analysis
}: {
  analysis: IntelAnalysis;
}) {
  const {
    t
  } = useLocale();
  return <div className="space-y-4 rounded-xl border border-accent/15 bg-accent/[0.03] p-5">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
        <Target className="h-3.5 w-3.5" />
        {t("intel.aiAnalysis")}
      </h3>

      {/* Cross Validation */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-warning">
          {t("intel.crossValidation")}
        </p>
        <ul className="space-y-1.5">
          {analysis.crossValidation.map((item, i) => <li key={i} className="flex items-start gap-2 text-sm text-foreground">
              <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
              {item}
            </li>)}
        </ul>
      </div>

      {/* Implications */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">
          {t("intel.implications")}
        </p>
        <p className="rounded-lg border border-border bg-card/50 px-3 py-2.5 text-sm leading-relaxed text-foreground">
          {analysis.implications}
        </p>
      </div>

      {/* Suggested Actions */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-positive">
          {t("intel.suggestedActions")}
        </p>
        <ul className="space-y-1.5">
          {analysis.suggestedActions.map((action, i) => <li key={i} className="flex items-start gap-2 text-sm text-foreground">
              <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-accent/15 text-xs font-bold text-accent">
                {i + 1}
              </span>
              <span className="flex-1">{action}</span>
              <AIActionButton suggestion={action} source="intel" />
            </li>)}
        </ul>
      </div>

      {/* Risk Assessment */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-card/50 px-3 py-2.5">
        <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted" />
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              {t("intel.riskAssessment")}
            </span>
            {riskBadge(analysis.riskAssessment.level)}
          </div>
          <p className="text-sm text-secondary">
            {analysis.riskAssessment.description}
          </p>
        </div>
      </div>
    </div>;
}

// ─── Timeline Item (enhanced with impact hint) ──────────────────────

function TimelineItem({
  intel,
  onDelete
}: {
  intel: IntelItem;
  onDelete: () => void;
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const {
    t
  } = useLocale();
  const {
    addTask,
    accounts
  } = useStore();
  const [expanded, setExpanded] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [actionCreated, setActionCreated] = useState<'task' | 'play' | null>(null);

  // 找到关联的 Account ID（通过名称匹配）
  const relatedAccount = accounts.find(a => a.name === intel.accountName);
  return <div className="group relative rounded-2xl border border-border bg-sidebar p-5 transition-colors duration-150 hover:border-border-subtle">
      {/* Header */}
      <div className="mb-2.5 flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-foreground">
            {intel.accountName}
          </span>
          <span className="rounded-md bg-card px-2 py-0.5 text-xs text-muted border border-border">
            {SOURCE_LABELS[intel.source] ?? intel.source}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {urgencyBadge(intel.urgency)}
          {credibilityBadge(intel.credibility)}
          <button onClick={async () => {
          if (await appConfirm({
            message: '确定删除此情报？',
            variant: 'danger'
          })) onDelete();
        }} className="opacity-0 transition-opacity group-hover:opacity-100" title={tx("删除")}>
            <Trash2 className="h-3.5 w-3.5 text-muted hover:text-danger" />
          </button>
        </div>
      </div>

      {/* SPIN Classification Badges */}
      {Array.isArray(intel.spinClassification) && intel.spinClassification.length > 0 && <div className="mb-2.5 flex flex-wrap gap-1.5">
          {intel.spinClassification.map((item: SpinItem, i: number) => <span key={i} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${SPIN_COLORS[item.category].bg} ${SPIN_COLORS[item.category].text} ${SPIN_COLORS[item.category].border}`}>
              {item.category === 'situation' ? 'S' : item.category === 'problem' ? 'P' : item.category === 'implication' ? 'I' : 'N'}
              <span className="max-w-[120px] truncate">{item.text}</span>
            </span>)}
        </div>}

      {/* Content */}
      <p className={`text-sm leading-relaxed text-foreground ${!expanded && intel.content.length > 120 ? "line-clamp-2" : ""}`}>
        {intel.content}
      </p>
      {intel.content.length > 120 && <button onClick={() => setExpanded(!expanded)} className="mt-1 text-xs text-accent hover:underline">
          {expanded ? t("intel.collapse") : t("intel.expandFull")}
        </button>}

      {/* AI Impact Hint — brief line before full analysis */}
      {intel.analysis && !showAnalysis && <button onClick={() => setShowAnalysis(true)} className="mt-2.5 flex w-full items-center gap-2 rounded-xl border border-accent/15 bg-accent/[0.03] px-3.5 py-2 text-left transition-colors hover:bg-accent/[0.06]">
          <Zap className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
          <span className="flex-1 truncate text-xs text-accent">
            <span className="font-semibold">{tx("影响：")}</span>
            {intel.analysis.implications}
          </span>
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-accent/50" />
        </button>}

      {/* Full AI Analysis (expanded) */}
      {intel.analysis && showAnalysis && <div className="mt-3">
          <div className="mb-2 flex justify-end">
            <button onClick={() => setShowAnalysis(false)} className="text-xs text-muted hover:text-foreground">{tx("收起分析")}</button>
          </div>
          <AnalysisCard analysis={intel.analysis} />
        </div>}

      {/* Quick Actions */}
      <div className="mt-3 flex items-center justify-between gap-2 pt-3 border-t border-border">
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Clock className="h-3 w-3" />
          {timeAgo(intel.date)}
        </div>
        <div className="flex items-center gap-1.5">
          {relatedAccount && <>
              <Link href={`/accounts/${relatedAccount.id}`} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-foreground hover:border-accent/30 hover:bg-accent/5 transition-colors">{tx("查看客户")}</Link>
              <Link href={`/accounts/${relatedAccount.id}?tab=plays&intelSignal=${encodeURIComponent(JSON.stringify({
            content: intel.content
          }))}`} className="flex items-center gap-1 rounded-lg border border-accent/30 px-2 py-1 text-xs text-accent hover:bg-accent/5 transition-colors">
                <Target className="h-3 w-3" />{tx("创建谋局")}</Link>
            </>}
          <button onClick={() => {
          addTask({
            title: `处理情报：${intel.accountName}`,
            description: `${intel.content}\n\n${intel.analysis?.implications || ''}`,
            status: 'todo',
            priority: intel.urgency === 'high' ? 'high' : 'medium',
            source: 'intel',
            sourceId: intel.id,
            aiGenerated: true,
            accountId: relatedAccount?.id
          });
          setActionCreated('task');
        }} disabled={actionCreated === 'task'} className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors ${actionCreated === 'task' ? 'bg-positive/10 text-positive border border-positive/20' : 'border border-border text-foreground hover:border-accent/30 hover:bg-accent/5'}`}>
            <Plus className="h-3 w-3" />
            {actionCreated === 'task' ? '已创建任务' : '创建任务'}
          </button>
        </div>
      </div>
    </div>;
}

// ─── Intel Entry Modal ───────────────────────────────────────────────

function IntelEntryModal({
  open,
  onClose,
  onSubmit,
  analyzing,
  error
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    accountName: string;
    source: IntelSource;
    content: string;
    credibility: Credibility;
    urgency: Urgency;
  }) => void;
  analyzing: boolean;
  error: string | null;
}) {
  const {
    t
  } = useLocale();
  const [accountName, setAccountName] = useState("");
  const [source, setSource] = useState<IntelSource>("supplier");
  const [content, setContent] = useState("");
  const [credibility, setCredibility] = useState<Credibility>("medium");
  const [urgency, setUrgency] = useState<Urgency>("medium");
  const canSubmit = accountName.trim().length > 0 && content.trim().length > 10 && !analyzing;
  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      accountName,
      source,
      content,
      credibility,
      urgency
    });
  }
  if (!open) return null;
  const inputFieldClass = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted/40 focus:border-accent/40 focus:outline-none input-glow transition-colors duration-150";
  return <div className="modal-backdrop" onClick={e => {
    if (e.target === e.currentTarget) onClose();
  }}>
      <div className="modal-content !rounded-2xl !max-w-2xl w-full mx-4">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Radio className="h-4 w-4 text-accent" />
            {t("intel.intelEntry")}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-card hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleFormSubmit} className="flex flex-col gap-4 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
                {t("intel.accountName")}
              </label>
              <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)} placeholder={t("intel.accountPlaceholder")} className={inputFieldClass} autoFocus />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
                {t("intel.source")}
              </label>
              <select value={source} onChange={e => setSource(e.target.value as IntelSource)} className={inputFieldClass}>
                {INTEL_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
              {t("intel.content")}
            </label>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder={t("intel.contentPlaceholder")} rows={5} className="w-full resize-none rounded-xl border border-border bg-background p-3 text-sm leading-relaxed text-foreground placeholder:text-muted/30 focus:border-accent/40 focus:outline-none input-glow transition-colors duration-150" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
                {t("intel.credibility")}
              </label>
              <div className="flex gap-2">
                {CREDIBILITY_OPTIONS.map(opt => <button key={opt.value} type="button" onClick={() => setCredibility(opt.value)} className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors duration-150 ${credibility === opt.value ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-background text-muted hover:border-secondary hover:text-foreground"}`}>
                    {opt.label}
                  </button>)}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
                {t("intel.urgencyLevel")}
              </label>
              <div className="flex gap-2">
                {URGENCY_OPTIONS.map(opt => <button key={opt.value} type="button" onClick={() => setUrgency(opt.value)} className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors duration-150 ${urgency === opt.value ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-background text-muted hover:border-secondary hover:text-foreground"}`}>
                    {opt.icon} {opt.label}
                  </button>)}
              </div>
            </div>
          </div>

          <button type="submit" disabled={!canSubmit} className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-accent-hover hover:shadow-md disabled:pointer-events-none disabled:opacity-40">
            {analyzing ? <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("intel.analyzing")}
              </> : <>
                <Send className="h-4 w-4" />
                {t("intel.submit")}
              </>}
          </button>

          {error && <div className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/5 p-3 text-sm text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {error}
            </div>}
        </form>
      </div>
    </div>;
}

// ─── News Search Modal ───────────────────────────────────────────────

function NewsSearchModal({
  open,
  onClose,
  onSaveAsIntel
}: {
  open: boolean;
  onClose: () => void;
  onSaveAsIntel: (item: {
    title: string;
    url: string;
    content: string;
    publishedDate?: string;
  }) => void;
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  if (!open) return null;
  return <div className="modal-backdrop" onClick={e => {
    if (e.target === e.currentTarget) onClose();
  }}>
      <div className="modal-content !rounded-2xl !max-w-3xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 flex-shrink-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Globe className="h-4 w-4 text-accent" />{tx("新闻搜索")}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-card hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <NewsSearch onSaveAsIntel={onSaveAsIntel} />
        </div>
      </div>
    </div>;
}

// ─── Main Component ──────────────────────────────────────────────────

export default function IntelCenter() {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const {
    addIntel,
    deleteIntel
  } = useStore();
  const {
    intelItems
  } = useRoleFilteredData();
  const {
    t
  } = useLocale();

  // Modals
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showNewsModal, setShowNewsModal] = useState(false);

  // Filters
  const [filterSource, setFilterSource] = useState<IntelSource | "all">("all");
  const [filterAccount, setFilterAccount] = useState("");
  const [filterUrgency, setFilterUrgency] = useState<Urgency | "all">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [searchQuery, setSearchQuery] = useState("");

  // Unique account names from intel items
  const accountNames = useMemo(() => [...new Set(intelItems.map(item => item.accountName))].sort(), [intelItems]);
  const filteredIntelItems = useMemo(() => {
    let items = intelItems;
    if (filterSource !== "all") items = items.filter(item => item.source === filterSource);
    if (filterAccount) items = items.filter(item => item.accountName === filterAccount);
    if (filterUrgency !== "all") items = items.filter(item => item.urgency === filterUrgency);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(item => item.content.toLowerCase().includes(q) || item.accountName.toLowerCase().includes(q));
    }
    // Sort by date
    items = [...items].sort((a, b) => {
      const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
      return sortOrder === "newest" ? diff : -diff;
    });
    return items;
  }, [intelItems, filterSource, filterAccount, filterUrgency, searchQuery, sortOrder]);

  // Submission state
  const [analyzing, setAnalyzing] = useState(false);
  const [latestAnalysis, setLatestAnalysis] = useState<IntelAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function handleEntrySubmit(data: {
    accountName: string;
    source: IntelSource;
    content: string;
    credibility: Credibility;
    urgency: Urgency;
  }) {
    setAnalyzing(true);
    setError(null);
    setLatestAnalysis(null);
    try {
      const res = await fetch("/api/intel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...data,
          outputLocale: locale
        })
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as {
          error?: string;
        }).error ?? `请求失败 (${res.status})`);
      }
      const analysis: IntelAnalysis = await res.json();
      setLatestAnalysis(analysis);
      addIntel({
        ...data,
        analysis
      });
      setShowEntryModal(false);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setAnalyzing(false);
    }
  }
  function handleSaveNewsAsIntel(item: {
    title: string;
    url: string;
    content: string;
    publishedDate?: string;
  }) {
    addIntel({
      accountName: "新闻情报",
      source: "news",
      content: `${item.title}\n\n${item.content}\n\n来源: ${item.url}`,
      credibility: "medium",
      urgency: "medium"
    });
  }
  const filterSelectClass = "rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground focus:border-accent/40 focus:outline-none transition-colors duration-150";
  return <div className="flex flex-col gap-4 lg:h-full lg:overflow-hidden">
      {/* ── Top Bar: Search + Filters + Actions ── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        {/* Row 1: Search + Action Buttons */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={tx("搜索情报内容、客户名称...")} className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted/40 focus:border-accent/40 focus:outline-none input-glow transition-colors duration-150" />
          </div>
          <button onClick={() => setShowNewsModal(true)} className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted hover:border-accent/30 hover:text-foreground transition-colors duration-150">
            <Globe className="h-3.5 w-3.5" />{tx("新闻搜索")}</button>
          <button onClick={() => setShowEntryModal(true)} className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-hover hover:shadow-md transition-all duration-150">
            <Plus className="h-4 w-4" />{tx("录入情报")}</button>
        </div>

        {/* Row 2: Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className={filterSelectClass}>
            <option value="">{tx("全部客户")}</option>
            {accountNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <select value={filterSource} onChange={e => setFilterSource(e.target.value as IntelSource | "all")} className={filterSelectClass}>
            <option value="all">{tx("全部来源")}</option>
            {INTEL_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={filterUrgency} onChange={e => setFilterUrgency(e.target.value as Urgency | "all")} className={filterSelectClass}>
            <option value="all">{tx("全部紧急度")}</option>
            <option value="high">{tx("🔴 紧急")}</option>
            <option value="medium">{tx("🟡 一般")}</option>
            <option value="low">{tx("🟢 低")}</option>
          </select>
          <button onClick={() => setSortOrder(prev => prev === "newest" ? "oldest" : "newest")} className="flex items-center gap-1 rounded-xl border border-border px-3 py-2.5 text-xs text-muted hover:text-foreground hover:border-accent/30 transition-colors duration-150" title={sortOrder === "newest" ? "当前：最新优先" : "当前：最早优先"}>
            <ArrowUpDown className="h-3 w-3" />
            {sortOrder === "newest" ? "最新优先" : "最早优先"}
          </button>
          <span className="ml-auto text-xs text-muted">
            {intelItems.length > 0 ? t("intel.totalCount").replace("{0}", String(filteredIntelItems.length)) : t("intel.timelineEmpty")}
          </span>
        </div>
      </div>

      {/* ── Full-Width Timeline ── */}
      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-card">
        {analyzing && <div className="space-y-3 border-b border-border p-5">
            <AIAnalyzingHint />
            <SkeletonAnalysis />
          </div>}

        {!analyzing && latestAnalysis && intelItems.length > 0 && <div className="border-b border-border p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">
              {t("intel.latestAnalysis")}
            </p>
            <AnalysisCard analysis={latestAnalysis} />
          </div>}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filteredIntelItems.length > 0 ? <div className="grid gap-3 p-5 sm:grid-cols-1 lg:grid-cols-2">
              {filteredIntelItems.map(intel => <TimelineItem key={intel.id} intel={intel} onDelete={() => deleteIntel(intel.id)} />)}
            </div> : !analyzing && <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-sidebar">
                  <Radio className="h-6 w-6 text-muted" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {searchQuery.trim() ? "未找到匹配的情报" : t("intel.startCollecting")}
                </p>
                <p className="mt-1.5 max-w-[280px] text-xs leading-relaxed text-muted">
                  {searchQuery.trim() ? "尝试调整搜索关键词或筛选条件" : t("intel.startCollectingHint")}
                </p>
              </div>}
        </div>
      </div>

      {/* ── Modals ── */}
      <IntelEntryModal open={showEntryModal} onClose={() => setShowEntryModal(false)} onSubmit={handleEntrySubmit} analyzing={analyzing} error={error} />
      <NewsSearchModal open={showNewsModal} onClose={() => setShowNewsModal(false)} onSaveAsIntel={handleSaveNewsAsIntel} />
    </div>;
}