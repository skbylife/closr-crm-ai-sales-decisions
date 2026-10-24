"use client";

import { useState, useEffect } from "react";
import { Loader2, MessageSquare, Tag } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

interface WeComContact {
  id: string;
  externalUserid: string;
  name: string;
  corpName: string | null;
  corpFullName: string | null;
  position: string | null;
  avatar: string | null;
  followUserid: string | null;
  followRemark: string | null;
  followDescription: string | null;
  addTime: string | null;
  tags: string[];
  accountId: string | null;
  contactId: string | null;
}

interface WeComContactsProps {
  accountId?: string;
  contactId?: string;
}

// ─── Component ──────────────────────────────────────────────────────

export function WeComContacts({ accountId, contactId }: WeComContactsProps) {
  const [contacts, setContacts] = useState<WeComContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetch_() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (accountId) params.set("accountId", accountId);
        if (contactId) params.set("contactId", contactId);

        const res = await fetch(`/api/integration/wecom?${params.toString()}`);
        if (!res.ok) throw new Error("加载失败");

        const data = await res.json();
        setContacts(data.contacts ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "未知错误");
      } finally {
        setLoading(false);
      }
    }

    if (accountId || contactId) {
      fetch_();
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

  if (contacts.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <MessageSquare className="mx-auto h-10 w-10 text-muted" />
        <p className="mt-3 text-sm text-muted">暂无企业微信联系人</p>
        <p className="mt-1 text-xs text-muted">连接企业微信后，外部联系人将自动出现在这里</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {contacts.map((c) => (
        <div
          key={c.id}
          className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-background"
        >
          <div className="flex items-start gap-3">
            {/* 头像 */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-sm font-semibold">
              {c.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.avatar} alt={c.name} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                c.name.charAt(0)
              )}
            </div>

            <div className="flex-1 min-w-0">
              {/* 姓名 + 职位 */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                {c.position && (
                  <span className="text-[11px] text-muted truncate">{c.position}</span>
                )}
              </div>

              {/* 企业 */}
              {(c.corpName || c.corpFullName) && (
                <p className="mt-0.5 text-xs text-secondary truncate">
                  {c.corpFullName || c.corpName}
                </p>
              )}

              {/* 归属员工 */}
              {c.followUserid && (
                <p className="mt-1 text-[11px] text-muted">
                  归属: {c.followRemark || c.followUserid}
                </p>
              )}

              {/* 添加时间 */}
              {c.addTime && (
                <p className="mt-0.5 text-[11px] text-muted">
                  添加于 {new Date(c.addTime).toLocaleDateString("zh-CN")}
                </p>
              )}

              {/* 标签 */}
              {c.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700"
                    >
                      <Tag className="h-2.5 w-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
