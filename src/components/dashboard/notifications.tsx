"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  X,
  ClipboardCheck,
  Mail,
  UserPlus,
  Swords,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useLocale } from "@/lib/i18n";
import type { EventNotificationType } from "@/lib/store";
import { STAGE_LABELS } from "@/lib/babel-engine/types";
import type { ContactRole } from "@/lib/babel-engine/types";

// ─── Types ──────────────────────────────────────────────────────────

type Severity = "critical" | "warning" | "info";

interface Notification {
  id: string;
  icon: string;
  message: string;
  severity: Severity;
  actionUrl: string;
  /** 事件通知附带的时间戳 */
  createdAt?: string;
  /** 事件通知类型（仅事件通知有） */
  eventType?: EventNotificationType;
}

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const STAGE_LABELS_EN: Partial<Record<keyof typeof STAGE_LABELS, string>> = {
  lead_identified: "Lead",
  discovery: "Discovery",
  solution_presented: "Solution",
  proposal_sent: "Proposal",
  negotiation: "Negotiation",
  contract_review: "Contract",
  closed_won: "Won",
  closed_lost: "Lost",
};

const SEVERITY_BORDER: Record<Severity, string> = {
  critical: "border-l-danger",
  warning: "border-l-warning",
  info: "border-l-blue-500",
};

const ROLE_LABELS: Record<string, string> = {
  decision_maker: "决策者",
  champion: "推动者",
  technical_evaluator: "技术评估",
  influencer: "影响者",
  blocker: "阻碍者",
  end_user: "终端用户",
  contact: "联系人",
  unknown: "未知",
};

const KEY_ROLES: ContactRole[] = ["decision_maker", "champion", "technical_evaluator"];

// ─── 事件通知图标映射 ─────────────────────────────────────────────────

const EVENT_ICONS: Record<EventNotificationType, string> = {
  task_assigned: "📋",
  new_decode: "📧",
  org_invite: "👥",
};

// ─── 相对时间格式化 ─────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

// ─── Hook ───────────────────────────────────────────────────────────

function daysSince(dateStr: string | undefined): number {
  if (!dateStr) return Infinity;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function useNotifications(): Notification[] {
  const { locale } = useLocale();
  const en = locale === "en";
  const accounts = useStore((s) => s.accounts);
  const opportunities = useStore((s) => s.opportunities);
  const eventNotifications = useStore((s) => s.eventNotifications);

  return useMemo(() => {
    const notifications: Notification[] = [];

    // ── 事件通知（task_assigned / new_decode / org_invite）──────────
    for (const eventNotification of eventNotifications) {
      if (eventNotification.read) continue;
      notifications.push({
        id: `event-${eventNotification.id}`,
        icon: EVENT_ICONS[eventNotification.type],
        message: eventNotification.message,
        severity: "info",
        actionUrl: eventNotification.actionUrl,
        createdAt: eventNotification.createdAt,
        eventType: eventNotification.type,
      });
    }

    // a) Champion decay: champion contacts not contacted in > 14 days
    for (const account of accounts) {
      for (const contact of account.contacts) {
        if (
          contact.role === "champion" &&
          contact.lastContactedAt &&
          daysSince(contact.lastContactedAt) > 14
        ) {
          const days = daysSince(contact.lastContactedAt);
          notifications.push({
            id: `champion-decay-${contact.id}`,
            icon: "⚠️",
            message: en ? `${contact.name} (${account.name}) has had no interaction for ${days} days; champion relationship may be decaying` : `${contact.name} (${account.name}) 已 ${days} 天未互动，Champion 关系可能衰减`,
            severity: days > 30 ? "critical" : "warning",
            actionUrl: `/accounts/${account.id}?tab=contacts`,
          });
        }
      }
    }

    // b) Deal stuck: opportunities in same stage > 14 days
    for (const opp of opportunities) {
      if (opp.stage === "closed_won" || opp.stage === "closed_lost") continue;
      const days = daysSince(opp.updatedAt);
      if (days > 14) {
        notifications.push({
          id: `deal-stuck-${opp.id}`,
          icon: "⏰",
          message: en ? `${opp.name} has stayed in ${STAGE_LABELS_EN[opp.stage] ?? opp.stage} for ${days} days` : `${opp.name} 在 ${STAGE_LABELS[opp.stage]} 阶段已停留 ${days} 天`,
          severity: days > 30 ? "critical" : "warning",
          actionUrl: `/pipeline/${opp.id}`,
        });
      }
    }

    // c) Silent contacts: key roles never contacted
    for (const account of accounts) {
      for (const contact of account.contacts) {
        if (
          contact.role &&
          KEY_ROLES.includes(contact.role) &&
          !contact.lastContactedAt
        ) {
          notifications.push({
            id: `silent-${contact.id}`,
            icon: "📭",
            message: en ? `${contact.name} (${account.name}) has never been contacted; role: ${ROLE_LABELS[contact.role] || contact.role}` : `${contact.name} (${account.name}) 从未联系，角色：${ROLE_LABELS[contact.role] || contact.role}`,
            severity: contact.role === "decision_maker" ? "critical" : "warning",
            actionUrl: `/accounts/${account.id}?tab=contacts`,
          });
        }
      }
    }

    // d) MEDDICC gaps: opportunities with overallScore < 40
    for (const opp of opportunities) {
      if (opp.stage === "closed_won" || opp.stage === "closed_lost") continue;
      const score = opp.meddicc?.overallScore ?? 0;
      if (score < 40) {
        notifications.push({
          id: `meddicc-gap-${opp.id}`,
          icon: "📉",
          message: en ? `${opp.name} qualification score is only ${score}/100; add key evidence` : `${opp.name} MEDDICC 评分仅 ${score}/100，建议补充关键信息`,
          severity: score < 20 ? "critical" : "info",
          actionUrl: `/pipeline/${opp.id}`,
        });
      }
    }

    // e) Missing champion: opportunities where account has no champion-role contacts
    for (const opp of opportunities) {
      if (opp.stage === "closed_won" || opp.stage === "closed_lost") continue;
      const oppAccount = accounts.find((a) => a.id === opp.accountId);
      const hasChampion = oppAccount?.contacts.some((c) => c.role === "champion");
      if (!hasChampion) {
        notifications.push({
          id: `no-champion-${opp.id}`,
          icon: "🚫",
          message: en ? `${opp.name} has no champion; win risk is high` : `${opp.name} 没有内部推动者，赢单风险高`,
          severity: "critical",
          actionUrl: `/pipeline/${opp.id}`,
        });
      }
    }

    // Sort by severity
    notifications.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

    return notifications;
  }, [accounts, opportunities, eventNotifications, en]);
}

// ─── AI 洞察通知 Hook ────────────────────────────────────────────────

export function useAINotifications(): { count: number; alerts: { id: string; message: string; severity: Severity; href: string }[] } {
  const [alerts, setAlerts] = useState<{ id: string; message: string; severity: Severity; href: string }[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchAlerts() {
      try {
        const res = await fetch('/api/ai-insights?insightType=health');
        if (!res.ok) return;
        const data = await res.json();

        const criticalAlerts = (data.insights ?? [])
          .filter((i: Record<string, unknown>) => {
            const d = i.data as Record<string, unknown>;
            return d?.level === 'critical' || d?.level === 'at_risk';
          })
          .map((i: Record<string, unknown>) => {
            const d = i.data as Record<string, unknown>;
            const level = d?.level as string;
            const reasons = (d?.reasons as string[]) ?? [];
            return {
              id: `ai-${i.entityId}`,
              message: `Deal 风险: ${reasons[0] ?? level}（AI 检测）`,
              severity: (level === 'critical' ? 'critical' : 'warning') as Severity,
              href: `/pipeline/${i.entityId}`,
            };
          });

        if (!cancelled) setAlerts(criticalAlerts);
      } catch {
        // ignore
      }
    }

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { count: alerts.length, alerts };
}

// ─── 谋局预警通知 Hook ────────────────────────────────────────────────

interface PlayAlertNotification {
  id: string;
  title: string;
  body: string | null;
  priority: string;
  actions: { id: string; label: string; style: string; action: Record<string, unknown> }[];
  createdAt: string;
}

export function usePlayAlertNotifications(): Notification[] {
  const [alerts, setAlerts] = useState<Notification[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchPlayAlerts() {
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) return;
        const data = await res.json();
        const notifications: (PlayAlertNotification & { type: string })[] = data.notifications ?? [];
        const playAlerts = notifications
          .filter((n) => n.type === "play_assumption_alert")
          .map((n): Notification => {
            const viewAction = n.actions?.find((a) => a.id === "view_play");
            const accountId = (viewAction?.action?.accountId as string) ?? "";
            return {
              id: `play-alert-${n.id}`,
              icon: "⚔️",
              message: `${n.title}${n.body ? `\n${n.body}` : ""}`,
              severity: n.priority === "high" ? "critical" : "warning",
              actionUrl: `/accounts/${accountId}?tab=plays`,
              createdAt: n.createdAt,
            };
          });
        if (!cancelled) setAlerts(playAlerts);
      } catch {
        // ignore
      }
    }

    fetchPlayAlerts();
    const interval = setInterval(fetchPlayAlerts, 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return alerts;
}

// ─── 事件通知 Lucide 图标组件映射 ────────────────────────────────────

const EVENT_LUCIDE_ICONS: Record<EventNotificationType, typeof ClipboardCheck> = {
  task_assigned: ClipboardCheck,
  new_decode: Mail,
  org_invite: UserPlus,
};

// ─── Panel Component ────────────────────────────────────────────────

// Dismissed notifications (persisted in localStorage)
function useDismissed() {
  const key = "closr-dismissed-notifications";
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem(key);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem(key, JSON.stringify([...next]));
      return next;
    });
  }, []);
  const clearAll = useCallback(() => {
    setDismissed(new Set());
    localStorage.removeItem(key);
  }, []);
  return { dismissed, dismiss, clearAll };
}

export function NotificationPanel() {
  const router = useRouter();
  const { locale } = useLocale();
  const en = locale === "en";
  const storeNotifications = useNotifications();
  const playAlerts = usePlayAlertNotifications();
  const allRaw = useMemo(
    () => [...storeNotifications, ...playAlerts].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    ),
    [storeNotifications, playAlerts]
  );
  const markNotificationRead = useStore((s) => s.markNotificationRead);
  const { dismissed, dismiss } = useDismissed();
  const all = allRaw.filter((n) => !dismissed.has(n.id));
  const [expanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const criticalWarningCount = all.filter(
    (n) => n.severity === "critical" || n.severity === "warning"
  ).length;
  const total = all.length;
  const visible = showAll ? all : all.slice(0, 10);

  // 关闭通知：同时标记事件通知为已读 + dismiss 计算通知
  const handleDismiss = useCallback((n: Notification) => {
    dismiss(n.id);
    // 事件通知 id 格式为 "event-{realId}"
    if (n.id.startsWith("event-")) {
      markNotificationRead(n.id.replace("event-", ""));
    }
    // 谋局预警通知 id 格式为 "play-alert-{realId}"
    if (n.id.startsWith("play-alert-")) {
      const realId = n.id.replace("play-alert-", "");
      fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [realId] }),
      }).catch((err) => console.error('[notifications] 标记通知已读失败:', err));
    }
  }, [dismiss, markNotificationRead]);

  return (
    <div className="card-elevated rounded-xl border border-border bg-card">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-stripe"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🔔</span>
          <h2 className="text-sm font-semibold text-foreground">
            {en ? "Needs attention" : "需要关注"} ({criticalWarningCount > 0 ? criticalWarningCount : total})
          </h2>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-secondary" />
        ) : (
          <ChevronDown className="h-4 w-4 text-secondary" />
        )}
      </button>

      {/* Body */}
      {expanded && (
        <>
          {total === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-positive font-medium">✅ {en ? "All clear" : "一切正常"}</p>
              <p className="mt-1 text-xs text-secondary">{en ? "No items need attention" : "暂无需要关注的事项"}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {visible.map((n) => {
                // 事件通知使用 Lucide 图标
                const LucideIcon = n.eventType ? EVENT_LUCIDE_ICONS[n.eventType] : null;

                return (
                  <div
                    key={n.id}
                    className={`flex items-center gap-3 border-l-[3px] px-5 py-3 transition-colors hover:bg-stripe cursor-pointer ${SEVERITY_BORDER[n.severity]}`}
                    onClick={() => router.push(n.actionUrl)}
                  >
                    {/* 图标 */}
                    {n.id.startsWith("play-alert-") ? (
                      <Swords className="h-4 w-4 flex-shrink-0 text-warning" />
                    ) : LucideIcon ? (
                      <LucideIcon className="h-4 w-4 flex-shrink-0 text-accent" />
                    ) : (
                      <span className="flex-shrink-0 text-sm">{n.icon}</span>
                    )}
                    {/* 标题 + 时间 */}
                    <div className="min-w-0 flex-1">
                      <span className="text-[15px] leading-relaxed text-foreground">
                        {n.message}
                      </span>
                      {n.createdAt && (
                        <span className="ml-2 text-[13px] text-muted">
                          {timeAgo(n.createdAt)}
                        </span>
                      )}
                      {n.id.startsWith("play-alert-") && (
                        <Link
                          href={n.actionUrl}
                          onClick={(e) => e.stopPropagation()}
                          className="ml-2 inline-flex items-center gap-1 rounded bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
                        >
                          <Swords className="h-3 w-3" />
                          {en ? "View play" : "查看谋局"}
                        </Link>
                      )}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleDismiss(n); }} className="flex-shrink-0 rounded p-1 text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={en ? "Close notification" : "关闭此通知"}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}

              {total > 10 && !showAll && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="w-full px-6 py-3 text-center text-xs font-medium text-accent transition-colors hover:bg-stripe"
                >
                  {en ? `View all ${total} notifications` : `查看全部 ${total} 条通知`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
