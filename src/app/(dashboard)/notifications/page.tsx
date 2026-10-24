"use client";

import {
  ArrowRight,
  AlertTriangle,
  AlertCircle,
  Info,
  ClipboardCheck,
  Mail,
  UserPlus,
} from "lucide-react";
import { useNotifications } from "@/components/dashboard/notifications";
import { useLocale } from "@/lib/i18n";
import type { EventNotificationType } from "@/lib/store";
import { timeAgo } from "@/lib/time-utils";

const SEVERITY_CONFIG = {
  critical: { labelKey: "notifications.critical" as const, icon: AlertTriangle, color: "text-danger", border: "border-l-danger", bg: "bg-[rgba(231,76,60,0.08)]" },
  warning: { labelKey: "notifications.warning" as const, icon: AlertCircle, color: "text-warning", border: "border-l-warning", bg: "bg-[rgba(241,196,15,0.08)]" },
  info: { labelKey: "notifications.info" as const, icon: Info, color: "text-blue-400", border: "border-l-blue-500", bg: "bg-[rgba(59,130,246,0.08)]" },
} as const;

type Severity = keyof typeof SEVERITY_CONFIG;

// 事件通知使用 Lucide 图标
const EVENT_LUCIDE_ICONS: Record<EventNotificationType, typeof ClipboardCheck> = {
  task_assigned: ClipboardCheck,
  new_decode: Mail,
  org_invite: UserPlus,
};

export default function NotificationsPage() {
  const notifications = useNotifications();
  const { t } = useLocale();

  const grouped = {
    critical: notifications.filter((n) => n.severity === "critical"),
    warning: notifications.filter((n) => n.severity === "warning"),
    info: notifications.filter((n) => n.severity === "info"),
  };

  const order: Severity[] = ["critical", "warning", "info"];

  return (
    <div className="mx-auto max-w-3xl px-2 py-4 sm:px-6 sm:py-8">
      <h1 className="text-xl font-semibold text-foreground">{t("notifications.title")}</h1>
      <p className="mt-1 text-sm text-secondary">
        {t("notifications.totalCount").replace("{0}", String(notifications.length))}
      </p>

      {notifications.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-positive/20 bg-positive/10">
            <Info className="h-6 w-6 text-positive" />
          </div>
          <p className="text-base font-semibold text-positive">{t("notifications.allGood")}</p>
          <p className="mt-2 max-w-[280px] text-sm leading-relaxed text-secondary">{t("notifications.nothingToWatch")}</p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {order.map((severity) => {
            const items = grouped[severity];
            if (items.length === 0) return null;
            const config = SEVERITY_CONFIG[severity];
            const Icon = config.icon;

            return (
              <section key={severity}>
                <div className="mb-3 flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${config.color}`} />
                  <h2 className={`text-sm font-semibold ${config.color}`}>
                    {t(config.labelKey)} ({items.length})
                  </h2>
                </div>
                <div className="space-y-2">
                  {items.map((n) => {
                    // 事件通知使用 Lucide 图标
                    const EventIcon = n.eventType ? EVENT_LUCIDE_ICONS[n.eventType] : null;

                    return (
                      <div
                        key={n.id}
                        onClick={() => {
                          // Only allow same-origin relative paths; reject protocol-relative
                          // and javascript: URLs to prevent open-redirect / XSS.
                          const url = n.actionUrl ?? "";
                          if (typeof url === "string" && url.startsWith("/") && !url.startsWith("//")) {
                            window.location.href = url;
                          }
                        }}
                        style={{ cursor: "pointer" }}
                        className={`flex items-center gap-2 sm:gap-3 rounded-lg border-l-[3px] ${config.border} ${config.bg} px-3 py-3 sm:px-5 sm:py-3.5 transition-colors hover:bg-stripe`}
                      >
                        {EventIcon ? (
                          <EventIcon className="h-4 w-4 flex-shrink-0 text-accent" />
                        ) : (
                          <span className="flex-shrink-0 text-base">{n.icon}</span>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="text-[15px] leading-relaxed text-foreground">
                            {n.message}
                          </span>
                          {n.createdAt && (
                            <span className="ml-2 text-[13px] text-muted">
                              {timeAgo(n.createdAt)}
                            </span>
                          )}
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
