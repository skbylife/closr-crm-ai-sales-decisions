"use client";

import { useState, useEffect } from "react";
import { Loader2, Users } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

interface WeComGroup {
  id: string;
  chatId: string;
  name: string | null;
  ownerUserid: string | null;
  createTime: string | null;
  memberCount: number;
  externalMemberCount: number;
  memberList: unknown[];
}

interface WeComGroupsProps {
  orgId: string;
}

// ─── Component ──────────────────────────────────────────────────────

export function WeComGroups({ orgId }: WeComGroupsProps) {
  const [groups, setGroups] = useState<WeComGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetch_() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/integration/wecom/groups?orgId=${encodeURIComponent(orgId)}`);
        if (!res.ok) throw new Error("加载失败");

        const data = await res.json();
        setGroups(data.groups ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "未知错误");
      } finally {
        setLoading(false);
      }
    }

    if (orgId) {
      fetch_();
    }
  }, [orgId]);

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

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Users className="mx-auto h-10 w-10 text-muted" />
        <p className="mt-3 text-sm text-muted">暂无客户群</p>
        <p className="mt-1 text-xs text-muted">连接企业微信后，客户群将自动出现在这里</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {groups.map((g) => (
        <div
          key={g.id}
          className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-background"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
              <Users className="h-5 w-5" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {g.name || "未命名群"}
              </p>

              <div className="mt-1 flex items-center gap-3 text-[11px] text-muted">
                <span>{g.memberCount} 人</span>
                <span>{g.externalMemberCount} 外部成员</span>
              </div>

              {g.ownerUserid && (
                <p className="mt-0.5 text-[11px] text-muted">群主: {g.ownerUserid}</p>
              )}

              {g.createTime && (
                <p className="mt-0.5 text-[11px] text-muted">
                  创建于 {new Date(g.createTime).toLocaleDateString("zh-CN")}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
