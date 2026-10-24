"use client";

import { useState, useEffect } from "react";
import { Mail, Loader2 } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

interface EmailEntry {
  id: string;
  messageId: string;
  sender: string;
  subject: string;
  receivedAt: string;
  summary: string | null;
  sentiment: string | null;
  intent: string | null;
  keyInfo: string[] | null;
  contactId: string | null;
}

interface EmailTimelineProps {
  accountId?: string;
  contactId?: string;
}

// ─── Sentiment Config ───────────────────────────────────────────────

const SENTIMENT_STYLE: Record<string, { label: string; className: string }> = {
  positive: { label: "积极", className: "bg-positive/10 text-positive border-positive/20" },
  negative: { label: "消极", className: "bg-danger/10 text-danger border-danger/20" },
  neutral: { label: "中性", className: "bg-secondary/10 text-secondary border-secondary/20" },
};

// ─── Component ──────────────────────────────────────────────────────

export function EmailTimeline({ accountId, contactId }: EmailTimelineProps) {
  const [emails, setEmails] = useState<EmailEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEmails() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (accountId) params.set("accountId", accountId);
        if (contactId) params.set("contactId", contactId);

        const res = await fetch(`/api/integration/emails?${params.toString()}`);
        if (!res.ok) throw new Error("加载失败");

        const data = await res.json();
        setEmails(data.emails ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "未知错误");
      } finally {
        setLoading(false);
      }
    }

    if (accountId || contactId) {
      fetchEmails();
    }
  }, [accountId, contactId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-danger/20 bg-danger/5 p-4">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Mail className="mx-auto h-10 w-10 text-muted" />
        <p className="mt-3 text-sm text-muted">暂无同步的邮件互动</p>
        <p className="mt-1 text-xs text-muted">连接 Outlook 后，相关邮件将自动出现在这里</p>
      </div>
    );
  }

  // 按日期分组
  const grouped = groupByDate(emails);

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([dateLabel, dayEmails]) => (
        <div key={dateLabel}>
          <p className="mb-2 text-xs font-semibold text-secondary uppercase tracking-wide">
            {dateLabel}
          </p>
          <div className="space-y-2">
            {dayEmails.map((email) => {
              const sentimentInfo = SENTIMENT_STYLE[email.sentiment ?? "neutral"] ?? SENTIMENT_STYLE.neutral;

              return (
                <div
                  key={email.id}
                  className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-background"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* 发件人 + 时间 */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-foreground truncate">
                          {email.sender}
                        </span>
                        <span className="text-[11px] text-muted">
                          {new Date(email.receivedAt).toLocaleTimeString("zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      {/* 主题 */}
                      {email.subject && (
                        <p className="mt-1 text-sm text-foreground truncate">
                          {email.subject}
                        </p>
                      )}

                      {/* AI 摘要 */}
                      {email.summary && (
                        <p className="mt-1.5 text-xs text-secondary leading-relaxed">
                          {email.summary}
                        </p>
                      )}

                      {/* 关键信息 */}
                      {email.keyInfo && email.keyInfo.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {email.keyInfo.map((info, i) => (
                            <span
                              key={i}
                              className="rounded-md bg-stripe px-1.5 py-0.5 text-[11px] text-secondary"
                            >
                              {info}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 右侧标签 */}
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${sentimentInfo.className}`}
                      >
                        {sentimentInfo.label}
                      </span>
                      {email.intent && (
                        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted">
                          {email.intent}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function groupByDate(emails: EmailEntry[]): Record<string, EmailEntry[]> {
  const groups: Record<string, EmailEntry[]> = {};

  for (const email of emails) {
    const date = new Date(email.receivedAt);
    const label = date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    if (!groups[label]) groups[label] = [];
    groups[label].push(email);
  }

  return groups;
}
