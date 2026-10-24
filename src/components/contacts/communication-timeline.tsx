"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Send, Plus, X, Loader2 } from "lucide-react";
import type { SavedDecode } from "@/lib/babel-engine/types";

interface CommunicationTimelineProps {
  contactId: string;
  contactName: string;
}

interface OutboundLog {
  id: string;
  date: string;
  emailText: string;
  matchedContactId: string;
  direction: "outbound";
}

const SENTIMENT_EMOJI: Record<string, string> = {
  warming: "\u{1F525}",
  cooling: "\u{2744}\u{FE0F}",
  stable: "\u{27A1}\u{FE0F}",
  volatile: "\u{26A1}",
};

const URGENCY_LABELS: { min: number; label: string; color: string }[] = [
  { min: 7, label: "\u7D27\u6025", color: "text-danger" },
  { min: 4, label: "\u4E2D\u7B49", color: "text-warning" },
  { min: 0, label: "\u6B63\u5E38", color: "text-muted" },
];

function getUrgencyInfo(urgency: number) {
  return URGENCY_LABELS.find((u) => urgency >= u.min) || URGENCY_LABELS[2];
}

function getMeaning(decode: SavedDecode): string {
  const thread = decode.decode?.threadAnalysis;
  if (thread?.keySignal) return thread.keySignal;

  const msgs = decode.decode?.messages;
  if (!msgs || msgs.length === 0) return decode.emailText?.slice(0, 120) || "\u2014";

  const them = msgs.find((m) => m.speaker === "them");
  const meaning = (them || msgs[0]).decode?.meaning || "";
  return meaning.length > 120 ? meaning.slice(0, 120) + "\u2026" : meaning;
}

function getMaxUrgency(decode: SavedDecode): number {
  const msgs = decode.decode?.messages;
  if (!msgs || msgs.length === 0) return 1;
  return Math.max(...msgs.map((m) => m.decode?.urgency || 1));
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CommunicationTimeline({
  contactId,
  contactName,
}: CommunicationTimelineProps) {
  const emailDecodes = useStore((s) => s.emailDecodes);
  const accounts = useStore((s) => s.accounts);

  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState(todayStr);
  const [emailText, setEmailText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outboundLogs, setOutboundLogs] = useState<OutboundLog[]>([]);

  // Find parent account for this contact
  let parentAccountId = "";
  for (const acc of accounts) {
    if (acc.contacts.some((c) => c.id === contactId)) {
      parentAccountId = acc.id;
      break;
    }
  }

  const directMatches = emailDecodes.filter((d) => d.matchedContactId === contactId);
  const sourceDecodes = directMatches.length > 0
    ? directMatches
    : emailDecodes.filter((d) => parentAccountId && d.accountId === parentAccountId);

  const relevantDecodes = sourceDecodes
    .sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    // dedup: same email content only keep newest decode
    .filter((d, i, arr) => {
      const normalized = (d.emailText || '')
        .replace(/\s+/g, ' ')
        .replace(/[\r\n\t]+/g, ' ')
        .trim()
        .slice(0, 500);
      const key = [d.matchedContactId || '', normalized].join('|');
      return arr.findIndex((x) => {
        const normalizedX = (x.emailText || '')
          .replace(/\s+/g, ' ')
          .replace(/[\r\n\t]+/g, ' ')
          .trim()
          .slice(0, 500);
        return [x.matchedContactId || '', normalizedX].join('|') === key;
      }) === i;
    })
    .slice(0, 10);

  // Merge store decodes + local outbound logs, sort by date desc
  type TimelineItem =
    | { type: "decode"; data: SavedDecode }
    | { type: "outbound"; data: OutboundLog };

  const timelineItems: TimelineItem[] = [
    ...relevantDecodes.map((d): TimelineItem => ({ type: "decode", data: d })),
    ...outboundLogs.map((d): TimelineItem => ({ type: "outbound", data: d })),
  ].sort(
    (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
  );

  async function handleSubmit() {
    if (!emailText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/outbound-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, emailText: emailText.trim(), date }),
      });
      if (res.ok) {
        const result = await res.json();
        setOutboundLogs((prev) => [
          ...prev,
          {
            id: result.id || `local_${Date.now()}`,
            date,
            emailText: emailText.trim(),
            matchedContactId: contactId,
            direction: "outbound",
          },
        ]);
        setShowForm(false);
        setEmailText("");
        setDate(todayStr());
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      {/* Add outbound log button */}
      <div className="mb-4">
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-card hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            记录发出邮件
          </button>
        ) : (
          <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">记录发出邮件</span>
              <button onClick={() => setShowForm(false)} className="text-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">日期</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <textarea
                value={emailText}
                onChange={(e) => setEmailText(e.target.value)}
                placeholder="粘贴邮件内容或填写简要摘要，用于更新互动记录..."
                rows={4}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm resize-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSubmit}
                disabled={submitting || !emailText.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                记录
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {timelineItems.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-muted">暂无 {contactName} 的沟通记录</p>
        </div>
      ) : (
        <div className="relative max-h-[400px] overflow-y-auto pr-1 scrollbar-thin">
          {/* Vertical timeline line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

          <div className="space-y-0">
            {timelineItems.map((item, i) => {
              const isLast = i === timelineItems.length - 1;

              if (item.type === "outbound") {
                const log = item.data;
                const preview = log.emailText.length > 120
                  ? log.emailText.slice(0, 120) + "\u2026"
                  : log.emailText;
                return (
                  <div key={log.id} className={`relative pl-7 ${isLast ? "" : "pb-4"}`}>
                    <div className="absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-card bg-accent/30 flex items-center justify-center">
                      <Send className="h-[7px] w-[7px] text-accent" />
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-accent/20 dark:bg-accent/5 p-3 transition-colors">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-medium text-secondary">
                          {new Date(log.date).toLocaleString("zh-CN", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <span className="font-medium text-accent">我方发出</span>
                      </div>
                      <p className="mt-1.5 text-sm text-foreground leading-relaxed line-clamp-2">
                        {preview}
                      </p>
                    </div>
                  </div>
                );
              }

              // Inbound / decoded item
              const decode = item.data as SavedDecode & { direction?: 'inbound' | 'outbound' };
              const isOutbound = decode.direction === "outbound";

              if (isOutbound) {
                const preview = (decode.emailText || "").length > 120
                  ? decode.emailText.slice(0, 120) + "\u2026"
                  : decode.emailText || "\u2014";
                return (
                  <div key={decode.id} className={`relative pl-7 ${isLast ? "" : "pb-4"}`}>
                    <div className="absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-card bg-accent/30 flex items-center justify-center">
                      <Send className="h-[7px] w-[7px] text-accent" />
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-accent/20 dark:bg-accent/5 p-3 transition-colors">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-medium text-secondary">
                          {new Date(decode.date).toLocaleString("zh-CN", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <span className="font-medium text-accent">我方发出</span>
                      </div>
                      <p className="mt-1.5 text-sm text-foreground leading-relaxed line-clamp-2">
                        {preview}
                      </p>
                    </div>
                  </div>
                );
              }

              const sentiment =
                decode.decode?.threadAnalysis?.sentimentTrend || "stable";
              const emoji = SENTIMENT_EMOJI[sentiment] || "\u27A1\u{FE0F}";
              const meaning = getMeaning(decode);
              const urgency = getMaxUrgency(decode);
              const urgencyInfo = getUrgencyInfo(urgency);

              return (
                <div key={decode.id} className={`relative pl-7 ${isLast ? "" : "pb-4"}`}>
                  {/* Timeline dot */}
                  <div className="absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-card bg-border flex items-center justify-center">
                    <div
                      className="h-[7px] w-[7px] rounded-full"
                      style={{
                        backgroundColor:
                          sentiment === "warming"
                            ? "#22c55e"
                            : sentiment === "cooling"
                              ? "#3b82f6"
                              : sentiment === "volatile"
                                ? "#eab308"
                                : "#6b7280",
                      }}
                    />
                  </div>

                  {/* Content */}
                  <div className="rounded-lg border border-border bg-background p-3 transition-colors hover:bg-card">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-secondary">
                        {new Date(decode.date).toLocaleString("zh-CN", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span>{emoji}</span>
                      <span className={`font-medium ${urgencyInfo.color}`}>
                        {urgencyInfo.label}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-foreground leading-relaxed line-clamp-2">
                      {meaning}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
