"use client";

import { useState } from "react";
import {
  Search,
  Loader2,
  Globe,
  Newspaper,
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";

interface CompanyIntelResult {
  company_name: string;
  timestamp: string;
  website: {
    url?: string;
    title?: string;
    description?: string;
    about?: string;
    key_messages?: string[];
    scraped_at?: string;
    error?: string | null;
  };
  news: Array<{
    title?: string;
    url?: string;
    published_at?: string;
    summary?: string;
    error?: string;
  }>;
  social_signals: Record<string, string>;
  errors?: string[];
}

interface IntelFormProps {
  /** 预填的客户名称 */
  defaultCompanyName?: string;
  /** 预填的网站 URL */
  defaultWebsiteUrl?: string;
  /** 如果提供 accountId，调研结果将自动保存到知识库 */
  accountId?: string;
  /** 调研完成后回调 */
  onComplete?: (intel: CompanyIntelResult) => void;
}

export function IntelForm({
  defaultCompanyName = "",
  defaultWebsiteUrl = "",
  accountId,
  onComplete,
}: IntelFormProps) {
  const [companyName, setCompanyName] = useState(defaultCompanyName);
  const [websiteUrl, setWebsiteUrl] = useState(defaultWebsiteUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompanyIntelResult | null>(null);
  const [expandedNews, setExpandedNews] = useState<Record<number, boolean>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = companyName.trim();
    if (!name) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/company-intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: name,
          websiteUrl: websiteUrl.trim() || undefined,
          accountId: accountId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? `请求失败 (${res.status})`
        );
      }

      const data = (await res.json()) as { ok: boolean; intel: CompanyIntelResult };
      setResult(data.intel);
      onComplete?.(data.intel);
    } catch (err) {
      setError(err instanceof Error ? err.message : "调研失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted/40 focus:border-accent/40 focus:outline-none input-glow transition-colors duration-150";

  return (
    <div className="space-y-4">
      {/* Search Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="intel-company"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted"
          >
            公司名称
          </label>
          <input
            id="intel-company"
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="例如：华为、阿里巴巴、腾讯"
            className={inputClass}
            autoFocus
          />
        </div>

        <div>
          <label
            htmlFor="intel-website"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted"
          >
            公司网站（可选，提高精度）
          </label>
          <input
            id="intel-website"
            type="text"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://www.example.com"
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={loading || !companyName.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-accent-hover hover:shadow-md disabled:pointer-events-none disabled:opacity-40"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              调研中...（最多30秒）
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              调研公司
            </>
          )}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/5 p-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Company Overview */}
          <div className="rounded-xl border border-border bg-sidebar p-4 space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Building2 className="h-4 w-4 text-accent" />
              {result.company_name}
            </h3>

            {result.website?.description && (
              <p className="text-sm text-secondary leading-relaxed">
                {result.website.description}
              </p>
            )}

            {result.website?.about && (
              <p className="text-xs text-muted leading-relaxed">
                {result.website.about}
              </p>
            )}

            {result.website?.key_messages &&
              result.website.key_messages.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.website.key_messages.map((msg, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-accent/20 bg-accent/5 px-2.5 py-0.5 text-xs text-accent"
                    >
                      {msg}
                    </span>
                  ))}
                </div>
              )}

            {result.website?.url && (
              <a
                href={result.website.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <Globe className="h-3 w-3" />
                {result.website.url}
              </a>
            )}
          </div>

          {/* News */}
          {result.news.filter((n) => !n.error && n.title).length > 0 && (
            <div className="rounded-xl border border-border bg-sidebar p-4 space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Newspaper className="h-4 w-4 text-accent" />
                近期新闻
                <span className="text-xs text-muted font-normal">
                  ({result.news.filter((n) => !n.error && n.title).length} 条)
                </span>
              </h3>

              <div className="space-y-2">
                {result.news
                  .filter((n) => !n.error && n.title)
                  .map((item, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-border bg-background overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedNews((prev) => ({
                            ...prev,
                            [i]: !prev[i],
                          }))
                        }
                        className="flex w-full items-start justify-between gap-2 p-3 text-left hover:bg-card/50 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground leading-snug">
                            {item.title}
                          </p>
                          {item.published_at && (
                            <p className="mt-0.5 text-xs text-muted">
                              {item.published_at}
                            </p>
                          )}
                        </div>
                        {expandedNews[i] ? (
                          <ChevronUp className="h-4 w-4 text-muted flex-shrink-0" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted flex-shrink-0" />
                        )}
                      </button>

                      {expandedNews[i] && (
                        <div className="border-t border-border px-3 pb-3 pt-2 space-y-2">
                          {item.summary && (
                            <p className="text-xs text-secondary leading-relaxed">
                              {item.summary}
                            </p>
                          )}
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              查看原文
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Scrape errors (if any) */}
          {result.errors && result.errors.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-1">
              <p className="text-xs font-medium text-amber-600">部分数据获取失败：</p>
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs text-amber-500">
                  {err}
                </p>
              ))}
            </div>
          )}

          {/* Timestamp */}
          <p className="text-xs text-muted text-right">
            调研时间：{result.timestamp}
            {accountId && " · 已自动保存到知识库"}
          </p>
        </div>
      )}
    </div>
  );
}
