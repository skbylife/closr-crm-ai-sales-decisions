"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Mail,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Search,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Building2,
  AlertTriangle,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { autoMatchAccount } from "@/components/decode/decode-helpers";

// ─── Types ──────────────────────────────────────────────────────────

interface InboxEmail {
  messageId: string;
  threadId: string;
  from: string;
  fromEmail: string;
  fromName: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  timestamp: string;
  labels: string[];
  originalSenderEmail?: string | null;
  originalSenderName?: string | null;
  matchedContactId?: string | null;
  matchedContactName?: string | null;
  matchedAccountId?: string | null;
  matchedAccountName?: string | null;
}

interface EmailThread {
  threadId: string;
  subject: string;
  messages: InboxEmail[];
  latestTimestamp: string;
  senderName: string;
  matchedAccountName?: string | null;
}

export interface EmailListProps {
  onSelectEmail?: (email: InboxEmail) => void;
  onDecodeEmail?: (email: InboxEmail) => void;
  selectedEmailId?: string | null;
  /** 外部传入的解读状态 */
  decodeStatus?: Record<string, "pending" | "decoding" | "done" | "error">;
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) {
    const mins = Math.floor(diffMs / (1000 * 60));
    return `${mins} 分钟前`;
  }
  if (diffHours < 24) {
    return `${Math.floor(diffHours)} 小时前`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} 天前`;
  }
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function getSenderDisplay(email: InboxEmail) {
  return email.originalSenderName || email.fromName || email.fromEmail;
}

/** 按 threadId 分组，同一 thread 合并 */
function groupByThread(emails: InboxEmail[]): EmailThread[] {
  const map = new Map<string, InboxEmail[]>();
  for (const email of emails) {
    const key = email.threadId || email.messageId;
    const group = map.get(key);
    if (group) {
      group.push(email);
    } else {
      map.set(key, [email]);
    }
  }

  const threads: EmailThread[] = [];
  for (const [threadId, messages] of map) {
    const sorted = messages.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const latest = sorted[0];
    threads.push({
      threadId,
      subject: latest.subject,
      messages: sorted,
      latestTimestamp: latest.timestamp,
      senderName: getSenderDisplay(latest),
      matchedAccountName: latest.matchedAccountName,
    });
  }

  return threads.sort(
    (a, b) => new Date(b.latestTimestamp).getTime() - new Date(a.latestTimestamp).getTime()
  );
}

// ─── Component ──────────────────────────────────────────────────────

export function EmailList({
  onSelectEmail,
  onDecodeEmail,
  selectedEmailId,
  decodeStatus = {},
}: EmailListProps) {
  const [emails, setEmails] = useState<InboxEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const accounts = useStore((s) => s.accounts);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/check-emails?limit=50");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `请求失败 (${res.status})`);
      }
      const data = await res.json();
      const msgs: InboxEmail[] = data.messages ?? [];

      // 尝试自动匹配未识别的发件人
      for (const msg of msgs) {
        if (!msg.matchedAccountId) {
          const content = msg.text || msg.html || "";
          const match = autoMatchAccount(
            `${msg.fromEmail} ${msg.fromName} ${content}`.slice(0, 500),
            accounts
          );
          if (match) {
            msg.matchedAccountId = match.accountId;
            msg.matchedAccountName = match.accountName;
            msg.matchedContactId = match.contactId ?? null;
            msg.matchedContactName = match.contactName ?? null;
          }
        }
      }

      setEmails(msgs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载邮件失败");
    } finally {
      setLoading(false);
    }
  }, [accounts]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  // 搜索过滤
  const filtered = searchQuery.trim()
    ? emails.filter((e) => {
        const q = searchQuery.toLowerCase();
        return (
          e.subject.toLowerCase().includes(q) ||
          e.fromName.toLowerCase().includes(q) ||
          e.fromEmail.toLowerCase().includes(q) ||
          (e.matchedAccountName ?? "").toLowerCase().includes(q)
        );
      })
    : emails;

  const threads = groupByThread(filtered);

  function toggleThread(threadId: string) {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }
      return next;
    });
  }

  /** 渲染单条邮件行 */
  function renderEmailRow(email: InboxEmail, isNested: boolean) {
    const status = decodeStatus[email.messageId];
    const isSelected = selectedEmailId === email.messageId;

    return (
      <div
        key={email.messageId}
        role="button"
        tabIndex={0}
        onClick={() => onSelectEmail?.(email)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectEmail?.(email);
          }
        }}
        className={`flex w-full items-center gap-3 text-left transition-colors cursor-pointer ${
          isNested ? "pl-10 pr-4 py-2" : "px-4 py-3"
        } ${
          isSelected
            ? "bg-accent/5 border-l-2 border-l-accent"
            : "hover:bg-sidebar border-l-2 border-l-transparent"
        }`}
      >
        {/* 发件人头像 */}
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-sidebar text-xs font-bold text-muted">
          {getSenderDisplay(email).charAt(0).toUpperCase()}
        </div>

        {/* 内容 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {getSenderDisplay(email)}
            </span>
            {email.matchedAccountName && (
              <span className="flex items-center gap-1 rounded-full bg-positive/10 px-1.5 py-0.5 text-[10px] font-medium text-positive border border-positive/20 flex-shrink-0">
                <Building2 className="h-2.5 w-2.5" />
                {email.matchedAccountName}
              </span>
            )}
            <span className="flex-shrink-0 text-xs text-muted ml-auto">
              {formatTime(email.timestamp)}
            </span>
          </div>
          <p className="text-xs text-secondary truncate">{email.subject}</p>
          <p className="line-clamp-1 text-xs text-muted mt-0.5">
            {(email.text || email.html || "").slice(0, 100)}
          </p>
        </div>

        {/* 解读状态 */}
        <div className="flex-shrink-0">
          {status === "done" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-positive/10 px-2 py-0.5 text-xs text-positive border border-positive/20">
              <CheckCircle2 className="h-3 w-3" />
              已解读
            </span>
          ) : status === "decoding" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
              <Loader2 className="h-3 w-3 animate-spin" />
              解读中
            </span>
          ) : status === "error" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger border border-danger/20">
              <AlertTriangle className="h-3 w-3" />
              失败
            </span>
          ) : onDecodeEmail ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDecodeEmail(email);
              }}
              className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover transition-colors"
            >
              <Sparkles className="h-3 w-3" />
              解读
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* 搜索栏 + 刷新 */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="搜索邮件..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted focus:border-accent/40 focus:outline-none"
          />
        </div>
        <button
          onClick={fetchEmails}
          disabled={loading}
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-secondary hover:bg-sidebar disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* 错误 */}
      {error && (
        <div className="mx-4 mt-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {/* 邮件列表 */}
      {loading && emails.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      ) : threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Mail className="h-8 w-8 text-muted mb-2" />
          <p className="text-sm text-muted">
            {searchQuery ? "没有匹配的邮件" : "暂无邮件"}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {threads.map((thread) => {
            const isMulti = thread.messages.length > 1;
            const isExpanded = expandedThreads.has(thread.threadId);
            const latestEmail = thread.messages[0];

            return (
              <div key={thread.threadId}>
                {/* 主邮件行 */}
                <div className="relative">
                  {isMulti && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleThread(thread.threadId);
                      }}
                      className="absolute left-1 top-1/2 -translate-y-1/2 z-10 rounded p-1 text-muted hover:text-foreground hover:bg-sidebar"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </button>
                  )}
                  <div className={isMulti ? "pl-4" : ""}>
                    {renderEmailRow(latestEmail, false)}
                  </div>
                  {isMulti && !isExpanded && (
                    <div className="ml-14 -mt-1 mb-1 text-[10px] text-muted">
                      共 {thread.messages.length} 封邮件
                    </div>
                  )}
                </div>

                {/* 展开的子邮件 */}
                {isMulti && isExpanded && (
                  <div className="border-l-2 border-l-border ml-5 bg-sidebar/30">
                    {thread.messages.slice(1).map((msg) => renderEmailRow(msg, true))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
