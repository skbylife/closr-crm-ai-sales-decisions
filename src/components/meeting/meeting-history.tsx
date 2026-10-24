"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mic,
  ChevronDown,
  ChevronRight,
  Clock,
  Users,
  AlertTriangle,
  Loader2,
  Play,
  FileText,
  CheckCircle2,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────

interface TranscriptSegment {
  speaker: string;
  speakerLabel?: string;
  startTime: number;
  endTime: number;
  text: string;
}

interface TranscriptData {
  segments: TranscriptSegment[];
  fullText: string;
  speakerCount: number;
  totalDuration: number;
}

interface MeetingDecodeResult {
  meetingSummary?: string;
  keyDecisions?: string[];
  actionItems?: { title: string; owner: string; deadline: string }[];
  salesSignals?: {
    sentimentTrend?: string;
    riskLevel?: string;
    buyerState?: string;
    keySignal?: string;
  };
  nextSteps?: string[];
  concerns?: string[];
  opportunities?: string[];
}

interface MeetingRecording {
  id: string;
  title: string;
  meeting_date: string;
  duration_seconds: number | null;
  attendee_contact_ids: string[];
  context: string | null;
  audio_url: string | null;
  transcript: TranscriptData | null;
  decode_result: MeetingDecodeResult | null;
  status: "uploading" | "transcribing" | "decoding" | "done" | "error";
  error_message: string | null;
  created_at: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; style: string }> = {
  uploading: { label: "上传中", style: "bg-gray-800 text-white" },
  transcribing: { label: "转录中", style: "bg-blue-800 text-white" },
  decoding: { label: "解读中", style: "bg-purple-800 text-white" },
  done: { label: "已完成", style: "bg-green-800 text-white" },
  error: { label: "失败", style: "bg-red-800 text-white" },
};

const SPEAKER_COLORS = [
  "text-blue-600 dark:text-blue-400",
  "text-green-600 dark:text-green-400",
  "text-purple-600 dark:text-purple-400",
  "text-orange-600 dark:text-orange-400",
  "text-pink-600 dark:text-pink-400",
];

function formatDuration(seconds: number | null): string {
  if (!seconds) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSpeakerColor(speaker: string, speakerMap: Map<string, number>): string {
  if (!speakerMap.has(speaker)) {
    speakerMap.set(speaker, speakerMap.size);
  }
  const idx = speakerMap.get(speaker) ?? 0;
  return SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
}

const RISK_STYLES: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  critical: "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200",
};

const SENTIMENT_LABELS: Record<string, string> = {
  warming: "升温 🔥",
  cooling: "降温 ❄️",
  stable: "稳定 ➡️",
  volatile: "波动 ⚡",
};

// ─── Component ─────────────────────────────────────────────────────────

interface MeetingHistoryProps {
  accountId: string;
}

export default function MeetingHistory({ accountId }: MeetingHistoryProps) {
  const [recordings, setRecordings] = useState<MeetingRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchRecordings = useCallback(async () => {
    try {
      const res = await fetch(`/api/meeting-recording?accountId=${accountId}`);
      if (res.ok) {
        const data = (await res.json()) as { recordings: MeetingRecording[] };
        setRecordings(data.recordings);
      }
    } catch (err) {
      console.error("[meeting-history] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-12 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-sidebar">
          <Mic className="h-6 w-6 text-muted" />
        </div>
        <p className="text-sm font-medium text-foreground">暂无会议录音</p>
        <p className="mt-1.5 text-xs text-muted">
          在 Decode 页面录制会议，解读结果将自动出现在这里
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {recordings.map((rec) => {
        const isExpanded = expandedId === rec.id;
        const statusCfg = STATUS_CONFIG[rec.status] ?? STATUS_CONFIG.error;

        return (
          <div
            key={rec.id}
            className="rounded-2xl border border-border bg-card transition-colors"
          >
            {/* Header — always visible */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : rec.id)}
              className="flex w-full items-center gap-4 px-5 py-4 text-left"
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-sidebar">
                <Mic className="h-4 w-4 text-muted" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {rec.title}
                  </span>
                  <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${statusCfg.style}`}>
                    {statusCfg.label}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(rec.meeting_date || rec.created_at)}
                  </span>
                  {rec.duration_seconds && (
                    <span>{formatDuration(rec.duration_seconds)}</span>
                  )}
                  {rec.attendee_contact_ids?.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {rec.attendee_contact_ids.length} 人
                    </span>
                  )}
                </div>
              </div>

              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted" />
              )}
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-border px-5 py-4 space-y-4">
                {/* Error state */}
                {rec.status === "error" && rec.error_message && (
                  <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-danger">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    {rec.error_message}
                  </div>
                )}

                {/* Processing state */}
                {(rec.status === "transcribing" || rec.status === "decoding") && (
                  <div className="flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 p-3 text-sm text-accent">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {rec.status === "transcribing" ? "转录中..." : "AI 解读中..."}
                  </div>
                )}

                {/* Audio player */}
                {rec.audio_url && (
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                      <Play className="h-3 w-3" />
                      录音回放
                    </div>
                    <audio controls src={rec.audio_url} className="w-full h-10 rounded-lg" />
                  </div>
                )}

                {/* Decode result */}
                {rec.decode_result && (
                  <DecodeResultDisplay result={rec.decode_result} />
                )}

                {/* Transcript */}
                {rec.transcript && rec.transcript.segments.length > 0 && (
                  <TranscriptDisplay transcript={rec.transcript} />
                )}

                {/* Full text fallback */}
                {rec.transcript && rec.transcript.segments.length === 0 && rec.transcript.fullText && (
                  <div className="rounded-lg border border-border bg-sidebar p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                      <FileText className="h-3 w-3" />
                      转录状态
                    </div>
                    <p className="text-sm text-secondary">{rec.transcript.fullText}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Decode Result Sub-component ───────────────────────────────────────

function DecodeResultDisplay({ result }: { result: MeetingDecodeResult }) {
  return (
    <div className="space-y-3">
      {/* Sales signals */}
      {result.salesSignals && (
        <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">
            销售信号
          </h4>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {result.salesSignals.sentimentTrend && (
              <span className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-secondary">
                {SENTIMENT_LABELS[result.salesSignals.sentimentTrend] ?? result.salesSignals.sentimentTrend}
              </span>
            )}
            {result.salesSignals.riskLevel && (
              <span className={`rounded-md border px-2.5 py-1 text-xs font-medium ${RISK_STYLES[result.salesSignals.riskLevel] ?? RISK_STYLES.low}`}>
                风险: {result.salesSignals.riskLevel}
              </span>
            )}
          </div>
          {result.salesSignals.keySignal && (
            <p className="text-sm leading-relaxed text-foreground">
              <span className="font-medium text-accent">关键信号：</span>
              {result.salesSignals.keySignal}
            </p>
          )}
        </div>
      )}

      {/* Meeting summary */}
      {result.meetingSummary && (
        <div className="rounded-lg border border-border bg-sidebar p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            会议摘要
          </h4>
          <p className="text-sm leading-relaxed text-foreground">{result.meetingSummary}</p>
        </div>
      )}

      {/* Key decisions */}
      {result.keyDecisions && result.keyDecisions.length > 0 && (
        <div className="rounded-lg border border-border bg-sidebar p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            关键决策
          </h4>
          <ul className="space-y-1.5">
            {result.keyDecisions.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action items */}
      {result.actionItems && result.actionItems.length > 0 && (
        <div className="rounded-lg border border-border bg-sidebar p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            待办事项
          </h4>
          <div className="space-y-2">
            {result.actionItems.map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warning" />
                <div>
                  <span className="font-medium text-foreground">{item.title}</span>
                  {item.owner && (
                    <span className="ml-2 text-xs text-muted">@{item.owner}</span>
                  )}
                  {item.deadline && (
                    <span className="ml-2 text-xs text-muted">截止: {item.deadline}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next steps + Opportunities + Concerns in a grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {result.nextSteps && result.nextSteps.length > 0 && (
          <div className="rounded-lg border border-border bg-sidebar p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">下一步</h4>
            <ul className="space-y-1">
              {result.nextSteps.map((s, i) => (
                <li key={i} className="text-xs text-foreground">• {s}</li>
              ))}
            </ul>
          </div>
        )}
        {result.opportunities && result.opportunities.length > 0 && (
          <div className="rounded-lg border border-positive/20 bg-positive/[0.03] p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-positive">机会</h4>
            <ul className="space-y-1">
              {result.opportunities.map((o, i) => (
                <li key={i} className="text-xs text-foreground">• {o}</li>
              ))}
            </ul>
          </div>
        )}
        {result.concerns && result.concerns.length > 0 && (
          <div className="rounded-lg border border-warning/20 bg-warning/[0.03] p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-warning">顾虑</h4>
            <ul className="space-y-1">
              {result.concerns.map((c, i) => (
                <li key={i} className="text-xs text-foreground">• {c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Transcript Sub-component ──────────────────────────────────────────

function TranscriptDisplay({ transcript }: { transcript: TranscriptData }) {
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const speakerMap = new Map<string, number>();

  // Filter segments by search query
  const filteredSegments = searchQuery
    ? transcript.segments.filter((seg) =>
        seg.text.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : transcript.segments;

  const displaySegments = showAll ? filteredSegments : filteredSegments.slice(0, 10);

  const handleCopy = async () => {
    const text = transcript.segments
      .map((seg) => `[${seg.speakerLabel || seg.speaker}] ${seg.text}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    const text = transcript.segments
      .map((seg) => {
        const timeStr = `${Math.floor(seg.startTime / 60)}:${String(Math.floor(seg.startTime % 60)).padStart(2, "0")}`;
        return `[${timeStr}] ${seg.speakerLabel || seg.speaker}: ${seg.text}`;
      })
      .join("\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const highlightText = (text: string) => {
    if (!searchQuery) return text;
    const parts = text.split(new RegExp(`(${searchQuery})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === searchQuery.toLowerCase() ? (
        <mark key={i} className="bg-warning/30 text-foreground">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="rounded-lg border border-border bg-sidebar p-4">
      <div className="mb-3 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
            <FileText className="h-3 w-3" />
            转录记录 ({transcript.speakerCount} 位说话人)
          </h4>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="text-xs text-accent hover:underline flex items-center gap-1"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  已复制
                </>
              ) : (
                <>
                  <FileText className="h-3 w-3" />
                  复制全部
                </>
              )}
            </button>
            <button
              onClick={handleExport}
              className="text-xs text-accent hover:underline"
            >
              导出 TXT
            </button>
          </div>
        </div>

        {/* Search input */}
        {transcript.segments.length > 5 && (
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索转录内容..."
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
        )}

        {searchQuery && (
          <p className="text-xs text-muted">
            找到 {filteredSegments.length} 条匹配结果
          </p>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto space-y-2">
        {displaySegments.length === 0 ? (
          <p className="text-center text-sm text-muted py-8">
            {searchQuery ? "未找到匹配的内容" : "暂无转录记录"}
          </p>
        ) : (
          displaySegments.map((seg, i) => {
            const colorClass = getSpeakerColor(seg.speaker, speakerMap);
            const timeStr = `${Math.floor(seg.startTime / 60)}:${String(Math.floor(seg.startTime % 60)).padStart(2, "0")}`;
            return (
              <div key={i} className="flex gap-2 text-sm">
                <span className="flex-shrink-0 font-mono text-xs text-muted w-10">
                  {timeStr}
                </span>
                <span className={`flex-shrink-0 font-bold ${colorClass}`}>
                  {seg.speakerLabel || seg.speaker}:
                </span>
                <span className="text-foreground">{highlightText(seg.text)}</span>
              </div>
            );
          })
        )}
      </div>

      {filteredSegments.length > 10 && (
        <div className="mt-3 pt-3 border-t border-border text-center">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-accent hover:underline"
          >
            {showAll ? "收起" : `显示全部 (${filteredSegments.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
