"use client";

import { useState } from "react";
import {
  Search,
  Loader2,
  ExternalLink,
  Save,
  CheckCircle2,
  Globe,
  Newspaper,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { Credibility, Urgency } from "@/lib/babel-engine/types";

interface NewsResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

interface NewsSearchPanelProps {
  accountName: string;
}

export function NewsSearchPanel({ accountName }: NewsSearchPanelProps) {
  const { addIntel } = useStore();
  const [results, setResults] = useState<NewsResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [allSaved, setAllSaved] = useState(false);

  async function handleSearch() {
    setLoading(true);
    setError(null);
    setSavedIds(new Set());
    setAllSaved(false);
    try {
      const res = await fetch("/api/news-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `请求失败 (${res.status})`);
      }
      const data = await res.json();
      setResults(data.results || []);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setLoading(false);
    }
  }

  function saveAsIntel(result: NewsResult, index: number) {
    addIntel({
      accountName,
      source: "news",
      content: `${result.title}\n\n${result.content}\n\n来源: ${result.url}`,
      credibility: "medium" as Credibility,
      urgency: "medium" as Urgency,
      type: "news",
    });
    setSavedIds((prev) => new Set(prev).add(index));
  }

  function saveAll() {
    results.forEach((r, i) => {
      if (!savedIds.has(i)) {
        saveAsIntel(r, i);
      }
    });
    setAllSaved(true);
  }

  // Score to percentage for display
  function scoreDisplay(score: number): string {
    return `${Math.round(score * 100)}%`;
  }

  function scoreColor(score: number): string {
    if (score >= 0.8) return "text-positive";
    if (score >= 0.5) return "text-warning";
    return "text-muted";
  }

  return (
    <div className="space-y-3">
      {/* Search trigger */}
      <div className="rounded-xl border border-border bg-sidebar p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Newspaper className="h-4 w-4 text-accent" />
              搜索最新新闻
            </h4>
            <p className="mt-0.5 text-xs text-muted">
              使用 Tavily 搜索「{accountName}」的最新新闻动态
            </p>
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-[#C41E3A] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#A01830] disabled:opacity-40 disabled:pointer-events-none"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                搜索中...
              </>
            ) : (
              <>
                <Search className="h-3.5 w-3.5" />
                {searched ? "重新搜索" : "搜索新闻"}
              </>
            )}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>

      {/* Loading skeleton */}
      {loading && !searched && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-sidebar p-4">
              <div className="skeleton h-4 w-48 rounded mb-3" />
              <div className="skeleton h-3 w-full rounded mb-2" />
              <div className="skeleton h-3 w-3/4 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {searched && !loading && results.length > 0 && (
        <>
          {/* Save All button */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">
              找到 {results.length} 条相关新闻
            </p>
            {allSaved ? (
              <span className="flex items-center gap-1 text-xs text-positive">
                <CheckCircle2 className="h-3 w-3" />
                全部已保存
              </span>
            ) : (
              <button
                onClick={saveAll}
                className="flex items-center gap-1 rounded-lg border border-accent/30 px-2.5 py-1 text-xs text-accent hover:bg-accent/5 transition-colors"
              >
                <Save className="h-3 w-3" />
                全部保存为情报
              </button>
            )}
          </div>

          {/* Result cards */}
          <div className="space-y-2">
            {results.map((result, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card shadow-sm p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-foreground hover:text-accent transition-colors flex items-center gap-1.5"
                    >
                      {result.title}
                      <ExternalLink className="h-3 w-3 flex-shrink-0 text-muted" />
                    </a>
                    <p className="mt-1.5 text-xs leading-relaxed text-secondary line-clamp-3">
                      {result.content}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {new URL(result.url).hostname}
                      </span>
                      <span className={`font-medium ${scoreColor(result.score)}`}>
                        相关度 {scoreDisplay(result.score)}
                      </span>
                      {result.publishedDate && (
                        <span>{result.publishedDate}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {savedIds.has(i) || allSaved ? (
                      <span className="flex items-center gap-1 text-xs text-positive">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <button
                        onClick={() => saveAsIntel(result, i)}
                        className="flex items-center gap-1 rounded-lg border border-accent/30 px-2 py-1 text-xs text-accent hover:bg-accent/5 transition-colors"
                      >
                        <Save className="h-3 w-3" />
                        保存
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Empty state after search */}
      {searched && !loading && results.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card shadow-sm p-8 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card">
            <Search className="h-5 w-5 text-muted" />
          </div>
          <p className="text-sm font-medium text-foreground">未找到相关新闻</p>
          <p className="mt-1 max-w-[280px] text-xs text-muted">
            尝试修改搜索关键词或稍后重试
          </p>
        </div>
      )}
    </div>
  );
}
