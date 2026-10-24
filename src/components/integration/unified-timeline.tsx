"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, Mail, MessageSquare, Users } from "lucide-react";
import { useHighlightScroll } from "@/lib/hooks/use-highlight-scroll";
import { visibleBusinessText } from "@/lib/visible-business-text";

// ─── Types ──────────────────────────────────────────────────────────

export interface TimelineEvent {
  id: string;
  source: "outlook" | "wecom" | "manual";
  type: "email" | "wecom_contact_added" | "wecom_group_joined" | "activity";
  title: string;
  summary?: string;
  sentiment?: "positive" | "negative" | "neutral";
  timestamp: Date;
  participants?: string[];
  metadata?: Record<string, unknown>;
  highlightId?: string;
}

interface UnifiedTimelineProps {
  accountId?: string;
  contactId?: string;
  highlightId?: string | null;
}

// ─── Source Config ───────────────────────────────────────────────────

const SOURCE_CONFIG: Record<
  TimelineEvent["source"],
  { icon: typeof Mail; colorClass: string; bgClass: string; label: string }
> = {
  outlook: {
    icon: Mail,
    colorClass: "text-blue-600",
    bgClass: "bg-blue-100",
    label: "邮件",
  },
  wecom: {
    icon: MessageSquare,
    colorClass: "text-emerald-600",
    bgClass: "bg-emerald-100",
    label: "企业微信",
  },
  manual: {
    icon: Users,
    colorClass: "text-gray-600",
    bgClass: "bg-gray-100",
    label: "手动",
  },
};

const TYPE_ICON: Partial<Record<TimelineEvent["type"], typeof Mail>> = {
  wecom_group_joined: Users,
};

const SENTIMENT_STYLE: Record<string, { label: string; className: string }> = {
  positive: { label: "积极", className: "bg-positive/10 text-positive border-positive/20" },
  negative: { label: "消极", className: "bg-danger/10 text-danger border-danger/20" },
  neutral: { label: "中性", className: "bg-secondary/10 text-secondary border-secondary/20" },
};

// ─── Helpers ────────────────────────────────────────────────────────

const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  email_received: '收到邮件',
  email_sent: '发送邮件',
  meeting_held: '完成会议',
  call_made: '完成电话',
  note_added: '新增记录',
  intel_received: '收到情报',
  task_created: '创建任务',
  task_completed: '完成任务',
};

function formatActionType(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '活动记录';
  return ACTIVITY_ACTION_LABELS[value] ?? visibleBusinessText(value.replace(/_/g, ' '));
}

const METADATA_LABELS: Record<string, string> = {
  deadline: '截止时间',
  self_heal_target: '自愈率目标',
  cost_down_constraint: '降本约束',
};

function formatRenderableValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return visibleBusinessText(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toLocaleString("zh-CN");
  if (Array.isArray(value)) {
    return value
      .map((item) => formatRenderableValue(item))
      .filter(Boolean)
      .join(", ");
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.label === 'string' && 'value' in obj) {
      const label = METADATA_LABELS[obj.label] ?? visibleBusinessText(obj.label.replace(/_/g, ' '));
      return `${label}：${formatRenderableValue(obj.value)}`;
    }
    return Object.entries(obj)
      .map(([key, item]) => `${METADATA_LABELS[key] ?? visibleBusinessText(key.replace(/_/g, ' '))}：${formatRenderableValue(item)}`)
      .filter(Boolean)
      .join('，');
  }

  return String(value);
}

function MetadataTags({ items, className }: { items: unknown; className: string }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const tags = items
    .map((tag) => formatRenderableValue(tag))
    .filter(Boolean);

  if (tags.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {tags.map((tag, i) => (
        <span key={`${tag}-${i}`} className={`rounded-md px-1.5 py-0.5 text-[11px] ${className}`}>
          {tag}
        </span>
      ))}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────

export function UnifiedTimeline({ accountId, contactId, highlightId }: UnifiedTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { highlightProps } = useHighlightScroll(loading ? null : highlightId);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (accountId) params.set("accountId", accountId);
      if (contactId) params.set("contactId", contactId);
      const qs = params.toString();

      const allEvents: TimelineEvent[] = [];

      // 并行 fetch emails + WeCom contacts + manual activity logs
      const [emailResult, wecomResult, activityResult] = await Promise.allSettled([
        fetch(`/api/integration/emails?${qs}`).then(async (res) => {
          if (!res.ok) throw new Error(`API error: ${res.status}`);
          return res.json();
        }),
        fetch(`/api/integration/wecom?${qs}`).then(async (res) => {
          if (!res.ok) {
            if (res.status >= 500) {
              return { contacts: [] };
            }
            throw new Error(`API error: ${res.status}`);
          }
          return res.json();
        }),
        fetch(`/api/activity-logs?${qs}`).then(async (res) => {
          if (!res.ok) throw new Error(`API error: ${res.status}`);
          return res.json();
        }),
      ]);

      const errors: string[] = [];

      if (emailResult.status === "fulfilled") {
        for (const e of emailResult.value.emails ?? []) {
          allEvents.push({
            id: `email-${e.id}`,
            source: "outlook",
            type: "email",
            title: e.subject || "(无主题)",
            summary: e.summary ?? undefined,
            sentiment: e.sentiment ?? undefined,
            timestamp: new Date(e.receivedAt),
            participants: [e.sender],
            metadata: { intent: e.intent, keyInfo: e.keyInfo },
            highlightId: e.id,
          });
        }
      } else {
        errors.push("邮件加载失败");
      }

      if (wecomResult.status === "fulfilled") {
        for (const c of wecomResult.value.contacts ?? []) {
          allEvents.push({
            id: `wecom-contact-${c.id}`,
            source: "wecom",
            type: "wecom_contact_added",
            title: `添加企微联系人: ${c.name}`,
            summary: [c.corpFullName || c.corpName, c.position]
              .filter(Boolean)
              .join(" · ") || undefined,
            timestamp: c.addTime ? new Date(c.addTime) : new Date(c.createdAt ?? Date.now()),
            participants: [c.name, c.followRemark || c.followUserid].filter(Boolean) as string[],
            metadata: { tags: c.tags },
            highlightId: c.id,
          });
        }
      } else {
        errors.push("企微数据加载失败");
      }

      if (activityResult.status === "fulfilled") {
        for (const log of activityResult.value.logs ?? []) {
          allEvents.push({
            id: `activity-${log.id}`,
            source: 'manual',
            type: 'activity',
            title: log.actionType ? `活动记录 · ${formatActionType(log.actionType)}` : '活动记录',
            summary: log.summary ?? undefined,
            timestamp: new Date(log.createdAt),
            participants: log.contactName ? [log.contactName] : undefined,
            highlightId: log.id,
          });
        }
      } else {
        errors.push('活动记录加载失败');
      }

      // Only show error if ALL sources failed AND no events at all
      // In demo mode, integration APIs may not be connected — just show empty state
      if (errors.length > 0 && allEvents.length === 0) {
        // Don't show error in demo, just show empty
        const isDemo = document.cookie.includes('closr-demo-mode=true');
        if (!isDemo) {
          setError(errors.join("；"));
        }
      }
      setEvents(allEvents);
      setLoading(false);
    }

    if (accountId || contactId) {
      fetchAll();
    }
  }, [accountId, contactId]);

  // 按日期分组
  const grouped = useMemo(() => {
    const sorted = [...events].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const groups: Record<string, TimelineEvent[]> = {};
    for (const event of sorted) {
      const label = event.timestamp.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      if (!groups[label]) groups[label] = [];
      groups[label].push(event);
    }
    return groups;
  }, [events]);

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

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Mail className="mx-auto h-10 w-10 text-muted" />
        <p className="mt-3 text-sm text-muted">暂无互动记录</p>
        <p className="mt-1 text-xs text-muted">连接 Outlook 或企业微信后，互动记录将自动出现在这里</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([dateLabel, dayEvents]) => (
        <div key={dateLabel}>
          <p className="mb-2 text-xs font-semibold text-secondary uppercase tracking-wide">
            {dateLabel}
          </p>
          <div className="space-y-2">
            {dayEvents.map((event) => {
              const config = SOURCE_CONFIG[event.source];
              const IconComponent = TYPE_ICON[event.type] ?? config.icon;
              const sentimentInfo = event.sentiment
                ? SENTIMENT_STYLE[event.sentiment]
                : null;

              return (
                <div
                  key={event.id}
                  {...highlightProps(event.highlightId ?? event.id)}
                  className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-background"
                >
                  <div className="flex items-start gap-3">
                    {/* 来源图标 */}
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.bgClass}`}
                    >
                      <IconComponent className={`h-4 w-4 ${config.colorClass}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-foreground truncate">
                          {formatRenderableValue(event.title) || "(无标题)"}
                        </span>
                        <span className="text-[11px] text-muted">
                          {event.timestamp.toLocaleTimeString("zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {/* 来源标签 */}
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${config.bgClass} ${config.colorClass}`}
                        >
                          {config.label}
                        </span>
                      </div>

                      {/* 摘要 */}
                      {formatRenderableValue(event.summary) && (
                        <p className="mt-1 text-xs text-secondary leading-relaxed">
                          {formatRenderableValue(event.summary)}
                        </p>
                      )}

                      {/* 参与者 */}
                      {event.participants && event.participants.length > 0 && (
                        <p className="mt-1 text-[11px] text-muted truncate">
                          {event.participants.map((participant) => formatRenderableValue(participant)).filter(Boolean).join(", ")}
                        </p>
                      )}

                      {/* 关键信息 (emails) */}
                      <MetadataTags items={event.metadata?.keyInfo} className="bg-stripe text-secondary" />

                      {/* 企微标签 */}
                      <MetadataTags items={event.metadata?.tags} className="bg-emerald-50 text-emerald-700" />
                    </div>

                    {/* 右侧情感标签 */}
                    {sentimentInfo && (
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${sentimentInfo.className}`}
                      >
                        {sentimentInfo.label}
                      </span>
                    )}
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
