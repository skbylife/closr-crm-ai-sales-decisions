"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Radio,
  Loader2,
  Shield,
  Plus,
  X,
  Send,
  Trash2,
  Clock,
  CheckCircle2,
  Target,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useLocale } from "@/lib/i18n";
import { appConfirm } from '@/lib/confirm-store';
import { useHighlightScroll } from "@/lib/hooks/use-highlight-scroll";
import type {
  Contact,
  IntelAnalysis,
  Credibility,
  Urgency,
  IntelSource,
} from "@/lib/babel-engine/types";
import {
  INTEL_SOURCES,
  SOURCE_LABELS,
  selectFieldClass,
  timeAgo,
  riskBadgeEl,
} from "./shared";

export function IntelSection({ accountId, accountName, contacts, highlightId }: { accountId: string; accountName: string; contacts: Contact[]; highlightId?: string | null }) {
  const { locale } = useLocale();
  const { intelItems, addIntel, deleteIntel, addTask } = useStore();
  const [addedIntelActions, setAddedIntelActions] = useState<Set<string>>(new Set());
  const accountIntel = intelItems.filter((i) => i.accountId === accountId);
  const { highlightProps } = useHighlightScroll(highlightId);

  const [showForm, setShowForm] = useState(false);
  const [source, setSource] = useState<IntelSource>("supplier");
  const [content, setContent] = useState("");
  const [credibility, setCredibility] = useState<Credibility>("medium");
  const [urgency, setUrgency] = useState<Urgency>("medium");
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (content.trim().length < 10 || analyzing) return;

    setAnalyzing(true);
    setError(null);

    try {
      const res = await fetch("/api/intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName, source, content, credibility, urgency, outputLocale: locale }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `请求失败 (${res.status})`);
      }

      const analysis: IntelAnalysis = await res.json();
      addIntel({ accountName, source, content, credibility, urgency, analysis, relatedContactIds: selectedContactIds });
      setContent("");
      setSelectedContactIds([]);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败，请重试");
    } finally {
      setAnalyzing(false);
    }
  }

  const CRED_OPTIONS: { value: Credibility; label: string }[] = [
    { value: "high", label: "高" },
    { value: "medium", label: "中" },
    { value: "low", label: "低" },
  ];
  const URG_OPTIONS: { value: Urgency; label: string; icon: string }[] = [
    { value: "high", label: "高", icon: "🔴" },
    { value: "medium", label: "中", icon: "🟡" },
    { value: "low", label: "低", icon: "🟢" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          {accountIntel.length > 0 ? `共 ${accountIntel.length} 条情报` : ""}
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          {showForm ? "收起" : "添加情报"}
        </button>
      </div>

      {/* Inline Intel Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-accent/15 bg-accent/[0.02] p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">情报来源</label>
              <select value={source} onChange={(e) => setSource(e.target.value as IntelSource)} className={selectFieldClass}>
                {INTEL_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="form-label">可信度</label>
                <div className="flex gap-1">
                  {CRED_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setCredibility(opt.value)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                        credibility === opt.value
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : "border-border bg-background text-muted hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1">
                <label className="form-label">紧急度</label>
                <div className="flex gap-1">
                  {URG_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setUrgency(opt.value)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                        urgency === opt.value
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : "border-border bg-background text-muted hover:text-foreground"
                      }`}
                    >
                      {opt.icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Related Contacts */}
          {contacts.length > 0 && (
            <div>
              <label className="form-label">相关联系人（可选）</label>
              <div className="flex flex-wrap gap-1.5">
                {contacts.map((c) => {
                  const selected = selectedContactIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setSelectedContactIds((prev) =>
                          selected ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                        )
                      }
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        selected
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : "border-border bg-background text-muted hover:text-foreground hover:border-border-subtle"
                      }`}
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-card text-xs font-bold">
                        {c.name.charAt(0)}
                      </span>
                      {c.name}
                      {selected && <X className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
              {selectedContactIds.length === 0 && (
                <p className="mt-1 text-xs text-muted/60">不选 = 公司级情报</p>
              )}
            </div>
          )}

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="输入收集到的情报..."
            className="min-h-[100px] w-full resize-none rounded-lg border border-border bg-background p-3 text-sm leading-relaxed text-foreground placeholder:text-muted/30 focus:border-accent/40 focus:outline-none input-glow transition-colors duration-150"
          />

          <div className="flex items-center justify-between">
            <button
              type="submit"
              disabled={content.trim().length < 10 || analyzing}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-40"
            >
              {analyzing ? <><Loader2 className="h-4 w-4 animate-spin" />分析中...</> : <><Send className="h-4 w-4" />提交情报</>}
            </button>
            {error && <span className="text-xs text-danger">{error}</span>}
          </div>
        </form>
      )}

      {/* Timeline */}
      {accountIntel.length > 0 ? (
        <div className="relative space-y-3">
          {/* Vertical timeline line */}
          <div className="absolute left-5 top-2 bottom-2 w-px bg-border" />

          {accountIntel.map((intel) => (
            <div key={intel.id} {...highlightProps(intel.id)} className="group relative pl-10">
              {/* Timeline dot */}
              <div className={`absolute left-[15px] top-4 h-2.5 w-2.5 rounded-full border-2 border-card ${
                intel.urgency === "high" ? "bg-danger" : intel.urgency === "medium" ? "bg-warning" : "bg-positive"
              }`} />

              <div className={`rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md overflow-hidden flex`}>
              <div className={`w-1 flex-shrink-0 ${
                intel.urgency === "high" ? "bg-[#C0392B]" : intel.urgency === "medium" ? "bg-[#B8860B]" : "bg-[#2D7A5F]"
              }`} />
              <div className="flex-1 p-4">
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted">{SOURCE_LABELS[intel.source] ?? intel.source}</span>
                    <UrgencyBadge urgency={intel.urgency} />
                    <CredibilityBadge credibility={intel.credibility} />
                    {(intel.relatedContactIds ?? []).length > 0 && (
                      <span className="flex items-center gap-1">
                        {(intel.relatedContactIds ?? []).map((cid) => {
                          const c = contacts.find((ct) => ct.id === cid);
                          if (!c) return null;
                          return (
                            <span
                              key={cid}
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent"
                              title={c.name}
                            >
                              {c.name.charAt(0)}
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </div>
                  <button onClick={async () => { if (await appConfirm({ message: '确定删除此情报？', variant: 'danger' })) deleteIntel(intel.id); }} className="opacity-0 transition-opacity group-hover:opacity-100" title="删除">
                    <Trash2 className="h-3.5 w-3.5 text-muted hover:text-danger" />
                  </button>
                </div>
                <p className="text-sm leading-relaxed text-foreground">{intel.content}</p>
                {intel.analysis && (
                  <div className="mt-3 space-y-2 rounded-lg border border-accent/10 bg-accent/[0.02] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-accent">AI 分析</p>
                    <p className="text-xs leading-relaxed text-secondary">{intel.analysis.implications}</p>
                    {intel.analysis.suggestedActions.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold text-positive">建议行动</p>
                        <ul className="mt-1 space-y-1">
                          {intel.analysis.suggestedActions.map((a, i) => {
                            const key = `${intel.id}-${i}`;
                            return (
                              <li key={i} className="flex items-center justify-between gap-2 text-xs text-foreground">
                                <div className="flex items-start gap-1.5">
                                  <span className="mt-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded bg-accent/15 text-xs font-bold text-accent">{i + 1}</span>
                                  {a}
                                </div>
                                {addedIntelActions.has(key) ? (
                                  <span className="flex items-center gap-0.5 text-positive flex-shrink-0"><CheckCircle2 className="h-2.5 w-2.5" /></span>
                                ) : (
                                  <button
                                    onClick={() => {
                                      addTask({
                                        title: a,
                                        description: `来源情报：${intel.title}\n\n${intel.analysis?.implications || ''}`,
                                        status: 'todo',
                                        priority: 'medium',
                                        source: 'intel',
                                        sourceId: intel.id,
                                        aiGenerated: true,
                                        accountId,
                                      });
                                      setAddedIntelActions((prev) => new Set(prev).add(key));
                                    }}
                                    className="flex items-center gap-0.5 rounded border border-accent/30 px-1 py-0.5 text-xs text-accent hover:bg-accent/5 transition-colors flex-shrink-0"
                                    title="添加到任务"
                                  >
                                    <Plus className="h-2.5 w-2.5" />
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                    {intel.analysis.riskAssessment && (
                      <div className="mt-2 flex items-center gap-2">
                        <Shield className="h-3 w-3 text-muted" />
                        {riskBadgeEl(intel.analysis.riskAssessment.level)}
                        <span className="text-xs text-muted">{intel.analysis.riskAssessment.description}</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <Clock className="h-3 w-3" />{timeAgo(intel.date)}
                  </div>
                  <Link
                    href={`/accounts/${accountId}?tab=plays&intelSignal=${encodeURIComponent(JSON.stringify({ content: intel.content }))}`}
                    className="flex items-center gap-1 rounded-lg border border-accent/30 px-2 py-1 text-xs text-accent hover:bg-accent/5 transition-colors"
                  >
                    <Target className="h-3 w-3" />
                    基于此创建谋局
                  </Link>
                </div>
              </div>
              </div>
            </div>
          ))}
        </div>
      ) : !showForm ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card shadow-sm p-8 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card">
            <Radio className="h-5 w-5 text-muted" />
          </div>
          <p className="text-sm font-medium text-foreground">暂无情报，添加第一条情报</p>
          <p className="mt-1 max-w-[260px] text-xs text-muted">
            情报越多，AI 分析越准确
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            添加情报
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const styles: Record<Urgency, string> = {
    high: "bg-danger/10 text-danger border-danger/20",
    medium: "bg-warning/10 text-warning border-warning/20",
    low: "bg-positive/10 text-positive border-positive/20",
  };
  const labels: Record<Urgency, string> = { high: "🔴 紧急", medium: "🟡 一般", low: "🟢 低" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles[urgency]}`}>
      {labels[urgency]}
    </span>
  );
}

export function CredibilityBadge({ credibility }: { credibility: Credibility }) {
  const styles: Record<Credibility, string> = {
    high: "bg-positive/10 text-positive border-positive/20",
    medium: "bg-warning/10 text-warning border-warning/20",
    low: "bg-danger/10 text-danger border-danger/20",
  };
  const labels: Record<Credibility, string> = { high: "高可信", medium: "待验证", low: "存疑" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles[credibility]}`}>
      {labels[credibility]}
    </span>
  );
}
