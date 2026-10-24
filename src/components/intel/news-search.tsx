"use client";

import { useState } from "react";
import {
  Search,
  Loader2,
  ExternalLink,
  Save,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Brain,
} from "lucide-react";

interface NewsResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

interface SavedSet {
  [index: number]: boolean;
}

export function NewsSearch({
  defaultQuery,
  accountName,
  onSaveAsIntel,
}: {
  defaultQuery?: string;
  accountName?: string;
  onSaveAsIntel?: (item: { title: string; url: string; content: string; publishedDate?: string }) => void;
}) {
  const [query, setQuery] = useState(defaultQuery ?? "");
  const [results, setResults] = useState<NewsResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [saved, setSaved] = useState<SavedSet>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [summaries, setSummaries] = useState<Record<number, string>>({});
  const [summarizing, setSummarizing] = useState<Record<number, boolean>>({});

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    setSaved({});
    try {
      const res = await fetch("/api/news-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, accountName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `请求失败 (${res.status})`);
      }
      const data = await res.json() as { results: NewsResult[] };
      setResults(data.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(index: number) {
    setExpanded((prev) => ({ ...prev, [index]: !prev[index] }));
  }

  async function handleSummarize(index: number) {
    const item = results[index];
    if (!item || summaries[index]) return;
    setSummarizing((prev) => ({ ...prev, [index]: true }));
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `请对以下新闻做一个简洁的销售情报摘要（3-5句），重点分析：对我们与「${accountName || '该客户'}」的销售推进有什么影响？有什么可以利用的信号？\n\n标题：${item.title}\n来源：${item.url}\n内容：${item.content}`,
          context: { currentPage: '/accounts' },
        }),
      });
      if (res.ok) {
        const data = await res.json() as { reply?: string };
        setSummaries((prev) => ({ ...prev, [index]: data.reply || "无法生成摘要" }));
      } else {
        setSummaries((prev) => ({ ...prev, [index]: "AI 摘要生成失败" }));
      }
    } catch {
      setSummaries((prev) => ({ ...prev, [index]: "AI 摘要生成失败" }));
    } finally {
      setSummarizing((prev) => ({ ...prev, [index]: false }));
    }
  }

  function handleSave(index: number) {
    const item = results[index];
    if (!item || !onSaveAsIntel) return;
    onSaveAsIntel({
      title: item.title,
      url: item.url,
      content: item.content,
      publishedDate: item.publishedDate,
    });
    setSaved((prev) => ({ ...prev, [index]: true }));
  }

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="输入搜索关键词..."
          className="flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent/50 transition-colors"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-[#C41E3A] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#A01830] disabled:opacity-40 disabled:pointer-events-none"
        >
          {loading ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" />搜索中...</>
          ) : (
            <><Search className="h-3.5 w-3.5" />搜索</>
          )}
        </button>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((item, i) => {
            const isExpanded = expanded[i];
            return (
            <div
              key={i}
              className="rounded-xl border border-border bg-sidebar overflow-hidden transition-colors"
            >
              {/* Clickable header */}
              <button
                type="button"
                onClick={() => toggleExpand(i)}
                className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-background/50 transition-colors"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium text-foreground leading-snug">{item.title}</p>
                  <p className="text-xs text-muted leading-relaxed line-clamp-2">{item.content}</p>
                  <div className="flex items-center gap-2 text-[13px] text-secondary">
                    {item.publishedDate && (
                      <span>{new Date(item.publishedDate).toLocaleDateString("zh-CN")}</span>
                    )}
                    <span className="truncate max-w-[200px]">
                      {(() => { try { return new URL(item.url).hostname; } catch { return ""; } })()}
                    </span>
                  </div>
                </div>
                {isExpanded ? <ChevronUp className="h-4 w-4 text-secondary flex-shrink-0 mt-0.5" /> : <ChevronDown className="h-4 w-4 text-secondary flex-shrink-0 mt-0.5" />}
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
                  <p className="text-xs text-muted leading-relaxed whitespace-pre-wrap">{item.content}</p>

                  {/* AI Summary */}
                  {summaries[i] ? (
                    <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
                      <p className="text-[13px] font-semibold text-accent mb-1.5 flex items-center gap-1"><Brain className="h-3 w-3" />AI 摘要</p>
                      <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{summaries[i]}</p>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSummarize(i)}
                      disabled={summarizing[i]}
                      className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs font-semibold text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                    >
                      {summarizing[i] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                      {summarizing[i] ? "生成 AI 摘要中..." : "生成 AI 摘要"}
                    </button>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />查看原文
                    </a>
                    {onSaveAsIntel && (
                      saved[i] ? (
                        <span className="flex items-center gap-1 text-xs text-positive">
                          <CheckCircle2 className="h-3 w-3" />已保存
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSave(i)}
                          className="flex items-center gap-1 rounded-lg border border-accent/30 px-2.5 py-1 text-xs text-accent hover:bg-accent/5 transition-colors"
                        >
                          <Save className="h-3 w-3" />保存为情报
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Collapsed save button */}
              {!isExpanded && onSaveAsIntel && (
                <div className="flex items-center justify-end px-3 pb-2">
                  {saved[i] ? (
                    <span className="flex items-center gap-1 text-xs text-positive">
                      <CheckCircle2 className="h-3 w-3" />已保存
                    </span>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSave(i); }}
                      className="flex items-center gap-1 rounded-lg border border-accent/30 px-2 py-0.5 text-xs text-accent hover:bg-accent/5 transition-colors"
                    >
                      <Save className="h-3 w-3" />保存为情报
                    </button>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {searched && !loading && results.length === 0 && !error && (
        <p className="text-xs text-muted text-center py-4">未找到相关新闻</p>
      )}
    </div>
  );
}
