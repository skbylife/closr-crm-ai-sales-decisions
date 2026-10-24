"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Mail,
  RefreshCw,
  Clock,
  User,
  Sparkles,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Link2,
  Building2,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";

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
  // Original sender (from forwarded content)
  originalSenderEmail?: string | null;
  originalSenderName?: string | null;
  // Contact match
  matchedContactId?: string | null;
  matchedContactName?: string | null;
  matchedAccountId?: string | null;
  matchedAccountName?: string | null;
}

interface DecodeStatus {
  [messageId: string]: "pending" | "decoding" | "done" | "error";
}

function LinkToAccountDropdown({
  onLinked,
}: {
  onLinked: (accountId: string, accountName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const accounts = useStore((s) => s.accounts);

  function handleSelect(accountId: string, accountName: string) {
    onLinked(accountId, accountName);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="flex items-center gap-1 rounded-md border border-warning/20 bg-warning/5 px-2 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning/10"
      >
        <Link2 className="h-3 w-3" />
        未知联系人 — 点击关联
      </button>
    );
  }

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1">
        <select
          autoFocus
          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:border-accent/40 focus:outline-none"
          defaultValue=""
          onChange={(e) => {
            const accountId = e.target.value;
            if (!accountId) return;
            const account = accounts.find((a) => a.id === accountId);
            if (account) handleSelect(account.id, account.name);
          }}
        >
          <option value="">选择客户...</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => setOpen(false)}
          className="rounded p-0.5 text-muted hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export default function InboxPanel({
  onDecodeEmail,
}: {
  onDecodeEmail: (emailText: string, fromName: string, subject: string) => void;
}) {
  const [emails, setEmails] = useState<InboxEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [decodeStatus, setDecodeStatus] = useState<DecodeStatus>({});
  const [selectedEmail, setSelectedEmail] = useState<InboxEmail | null>(null);

const checkEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch("/api/check-emails?limit=20", { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`status_${res.status}`);
      }
      const data = await res.json();
      setEmails(data.messages ?? []);
      setLastChecked(new Date().toLocaleTimeString("zh-CN"));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("请求超时，邮件服务响应较慢，请稍后重试");
      } else {
        setError("检查邮件失败，请检查网络后重试");
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  // 打开收件箱时自动加载邮件
  useEffect(() => { checkEmails(); }, [checkEmails]);

  function handleDecodeEmail(email: InboxEmail) {
    setDecodeStatus((prev) => ({ ...prev, [email.messageId]: "decoding" }));
    const emailContent = email.text || email.html || "";
    const senderName = email.originalSenderName || email.matchedContactName || email.fromName || email.fromEmail;
    onDecodeEmail(emailContent, senderName, email.subject);
    setTimeout(() => {
      setDecodeStatus((prev) => ({ ...prev, [email.messageId]: "done" }));
    }, 500);
  }

  function handleDismiss(messageId: string) {
    setEmails((prev) => prev.filter((e) => e.messageId !== messageId));
  }

  function handleLinked(messageId: string, accountId: string, accountName: string) {
    setEmails((prev) =>
      prev.map((e) =>
        e.messageId === messageId
          ? { ...e, matchedAccountId: accountId, matchedAccountName: accountName }
          : e
      )
    );
  }

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

  /** Get the display name for the sender — prefers original sender over forwarder */
  function getSenderDisplay(email: InboxEmail) {
    const name = email.originalSenderName || email.fromName || email.fromEmail;
    const emailAddr = email.originalSenderEmail || email.fromEmail;
    return { name, email: emailAddr };
  }

  return (
    <div className="rounded-xl border border-border bg-card card-elevated">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-foreground">转发收件箱</h2>
          {emails.length > 0 && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
              {emails.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastChecked && (
            <span className="flex items-center gap-1 text-xs text-muted">
              <Clock className="h-3 w-3" />
              {lastChecked}
            </span>
          )}
          <button
            onClick={checkEmails}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-sidebar hover:text-foreground disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {loading ? "检查中..." : "检查新邮件"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mt-3 rounded-lg border border-danger/20 bg-danger/5 p-3">
          <div className="flex items-start gap-2 text-xs text-danger">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-danger/50 hover:text-danger">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={checkEmails}
            className="mt-2 rounded-md bg-danger/10 px-3 py-1 text-xs font-medium text-danger hover:bg-danger/20 transition-colors"
          >
            重试
          </button>
        </div>
      )}

      {/* Email List or Empty State */}
      <div className="p-3">
        {emails.length === 0 && !loading && !error ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-sidebar">
              <Mail className="h-5 w-5 text-muted" />
            </div>
            <p className="text-sm font-medium text-foreground">暂无转发邮件</p>
            <p className="mt-1 text-xs text-muted">
              点击&quot;检查新邮件&quot;获取最新转发
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {emails.map((email) => {
              const status = decodeStatus[email.messageId];
              const isSelected = selectedEmail?.messageId === email.messageId;
              const sender = getSenderDisplay(email);
              const hasMatch = !!email.matchedAccountName;
              const isForwarded = !!email.originalSenderEmail;

              return (
                <div key={email.messageId}>
                  <div
                    onClick={() => setSelectedEmail(isSelected ? null : email)}
                    className={`group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                      isSelected
                        ? "bg-accent/5 border border-accent/15"
                        : "hover:bg-sidebar border border-transparent"
                    }`}
                  >
                    {/* Avatar */}
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-sidebar text-xs font-bold text-muted">
                      {sender.name.charAt(0).toUpperCase()}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {sender.name}
                        </span>
                        {/* Account match badge */}
                        {hasMatch ? (
                          <span className="flex items-center gap-1 rounded-full bg-positive/10 px-2 py-0.5 text-xs font-medium text-positive border border-positive/20 flex-shrink-0">
                            <Building2 className="h-2.5 w-2.5" />
                            {email.matchedAccountName}
                          </span>
                        ) : isForwarded ? (
                          <span className="flex-shrink-0">
                            <LinkToAccountDropdown
                              onLinked={(accountId, name) => handleLinked(email.messageId, accountId, name)}
                            />
                          </span>
                        ) : null}
                        <span className="flex-shrink-0 text-xs text-muted">
                          {formatTime(email.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-secondary truncate">{email.subject}</p>
                      {isForwarded && (
                        <p className="text-xs text-muted truncate">
                          转发自: {email.fromName || email.fromEmail}
                        </p>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {status === "done" ? (
                        <span className="flex items-center gap-1 text-xs text-positive">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          已解读
                        </span>
                      ) : status === "decoding" ? (
                        <span className="flex items-center gap-1 text-xs text-accent">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          解读中
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDecodeEmail(email); }}
                            className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-hover transition-colors"
                          >
                            <Sparkles className="h-3 w-3" />
                            解读
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDismiss(email.messageId); }}
                            className="rounded-md px-2 py-1 text-xs text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                          >
                            忽略
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isSelected && (
                    <div className="ml-11 mr-3 mb-1 mt-1 rounded-lg border border-border bg-sidebar p-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {isForwarded ? (
                            <>
                              原始发件人: {email.originalSenderName && `${email.originalSenderName} `}
                              &lt;{email.originalSenderEmail}&gt;
                            </>
                          ) : (
                            email.fromEmail
                          )}
                        </span>
                        <span>{new Date(email.timestamp).toLocaleString("zh-CN")}</span>
                      </div>
                      {isForwarded && (
                        <div className="text-xs text-muted">
                          转发者: {email.fromName || email.fromEmail}
                        </div>
                      )}
                      {hasMatch && (
                        <div className="flex items-center gap-1.5 text-xs text-positive">
                          <CheckCircle2 className="h-3 w-3" />
                          已自动匹配到客户「{email.matchedAccountName}」
                          {email.matchedContactName && `的联系人「${email.matchedContactName}」`}
                        </div>
                      )}
                      <p className="text-xs text-secondary leading-relaxed line-clamp-4">
                        {(email.text || email.html || "").slice(0, 300)}
                        {(email.text || email.html || "").length > 300 && "..."}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDecodeEmail(email);
                        }}
                        disabled={status === "decoding" || status === "done"}
                        className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                      >
                        {status === "done" ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            已解读
                          </>
                        ) : status === "decoding" ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            解读中...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3 w-3" />
                            解读此邮件
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
