"use client";

// ─── Meeting Recording & Decode UI ───────────────────────────────────

import { useState, useCallback } from "react";
import {
  Loader2,
  Check,
  AlertTriangle,
  Sparkles,
  Users,
  FileText,
} from "lucide-react";
import type { Contact } from "@/lib/babel-engine/types";
import { useStore } from "@/lib/store";
import MeetingRecorder from "@/components/meeting/meeting-recorder";
import type { MeetingDecodeResult, MeetingTranscriptData } from "./decode-shared";

// ─── Meeting Progress Steps ──────────────────────────────────────────

function MeetingProgressSteps({ step }: { step: "idle" | "uploading" | "transcribing" | "decoding" | "done" | "error" }) {
  const steps = [
    { key: "uploading", label: "上传中..." },
    { key: "transcribing", label: "转录中..." },
    { key: "decoding", label: "AI 解读中..." },
    { key: "done", label: "完成" },
  ];
  const stepOrder = ["uploading", "transcribing", "decoding", "done"];
  const currentIdx = stepOrder.indexOf(step);

  if (step === "error") {
    return (
      <div className="flex items-center gap-2 px-1 py-2">
        <AlertTriangle className="h-4 w-4 text-danger" />
        <span className="text-xs font-medium text-danger">处理失败</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2">
      {steps.map((s, i) => {
        const isActive = s.key === step;
        const isDone = currentIdx > i;
        return (
          <div key={s.key} className="flex items-center gap-2">
            {isDone ? (
              <Check className="h-4 w-4 text-positive" />
            ) : isActive ? (
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
            ) : (
              <div className="h-4 w-4 rounded-full border border-border" />
            )}
            <span className={`text-xs font-medium ${isActive ? "text-accent" : isDone ? "text-positive" : "text-muted"}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && <div className="h-px w-6 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Meeting Decode Display ──────────────────────────────────────────

function MeetingDecodeDisplay({ result }: { result: MeetingDecodeResult }) {
  const SENTIMENT_LABELS_MAP: Record<string, string> = {
    warming: "升温 🔥", cooling: "降温 ❄️", stable: "稳定 ➡️", volatile: "波动 ⚡",
  };
  const RISK_STYLES_MAP: Record<string, string> = {
    low: "bg-green-600 text-white",
    medium: "bg-amber-500 text-white",
    high: "bg-red-600 text-white",
    critical: "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200",
  };

  return (
    <div className="space-y-3">
      {result.salesSignals && (
        <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">销售信号</h4>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {result.salesSignals.sentimentTrend && (
              <span className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-secondary">
                {SENTIMENT_LABELS_MAP[result.salesSignals.sentimentTrend] ?? result.salesSignals.sentimentTrend}
              </span>
            )}
            {result.salesSignals.riskLevel && (
              <span className={`rounded-md border px-2.5 py-1 text-xs font-medium ${RISK_STYLES_MAP[result.salesSignals.riskLevel] ?? RISK_STYLES_MAP.low}`}>
                风险: {result.salesSignals.riskLevel}
              </span>
            )}
          </div>
          {result.salesSignals.keySignal && (
            <p className="text-sm leading-relaxed text-foreground">
              <span className="font-medium text-accent">关键信号：</span>{result.salesSignals.keySignal}
            </p>
          )}
        </div>
      )}

      {result.meetingSummary && (
        <div className="rounded-lg border border-border bg-sidebar p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">会议摘要</h4>
          <p className="text-sm leading-relaxed text-foreground">{result.meetingSummary}</p>
        </div>
      )}

      {result.keyDecisions && result.keyDecisions.length > 0 && (
        <div className="rounded-lg border border-border bg-sidebar p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">关键决策</h4>
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

      {result.actionItems && result.actionItems.length > 0 && (
        <div className="rounded-lg border border-border bg-sidebar p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">待办事项</h4>
          <div className="space-y-2">
            {result.actionItems.map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warning" />
                <div>
                  <span className="font-medium text-foreground">{item.title}</span>
                  {item.owner && <span className="ml-2 text-xs text-muted">@{item.owner}</span>}
                  {item.deadline && <span className="ml-2 text-xs text-muted">截止: {item.deadline}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

// ─── Props ───────────────────────────────────────────────────────────

export interface MeetingDecodePanelProps {
  inputFieldClass: string;
}

// ─── Main Component ──────────────────────────────────────────────────

export default function MeetingDecodePanel({ inputFieldClass }: MeetingDecodePanelProps) {
  const accounts = useStore((s) => s.accounts);

  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingAccountId, setMeetingAccountId] = useState("");
  const [meetingAttendees, setMeetingAttendees] = useState<string[]>([]);
  const [meetingContext, setMeetingContext] = useState("");
  const [meetingBlob, setMeetingBlob] = useState<Blob | null>(null);
  const [meetingDuration, setMeetingDuration] = useState(0);
  const [meetingUploading, setMeetingUploading] = useState(false);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [meetingProgress, setMeetingProgress] = useState<"idle" | "uploading" | "transcribing" | "decoding" | "done" | "error">("idle");
  const [meetingDecodeResult, setMeetingDecodeResult] = useState<MeetingDecodeResult | null>(null);
  const [meetingTranscript, setMeetingTranscript] = useState<MeetingTranscriptData | null>(null);
  const [meetingAudioUrl, setMeetingAudioUrl] = useState<string | null>(null);
  const [attendeeSearch, setAttendeeSearch] = useState("");

  const meetingAccount = accounts.find((a) => a.id === meetingAccountId);
  const meetingContacts: Contact[] = meetingAccount?.contacts ?? [];
  const filteredMeetingContacts = attendeeSearch
    ? meetingContacts.filter(
        (c) =>
          c.name.toLowerCase().includes(attendeeSearch.toLowerCase()) ||
          (c.email && c.email.toLowerCase().includes(attendeeSearch.toLowerCase()))
      )
    : meetingContacts;
  const canUploadMeeting = meetingBlob && meetingAccountId && meetingTitle.trim() && !meetingUploading;

  const handleMeetingRecordingComplete = useCallback((blob: Blob, duration: number) => {
    setMeetingBlob(blob);
    setMeetingDuration(duration);
  }, []);

  async function handleMeetingUpload() {
    if (!meetingBlob || !meetingAccountId || !meetingTitle.trim()) return;

    setMeetingUploading(true);
    setMeetingError(null);
    setMeetingProgress("uploading");
    setMeetingDecodeResult(null);
    setMeetingTranscript(null);

    try {
      const formData = new FormData();
      formData.append("file", meetingBlob, "recording.webm");
      formData.append("title", meetingTitle.trim());
      formData.append("accountId", meetingAccountId);
      formData.append("attendeeContactIds", JSON.stringify(meetingAttendees));
      formData.append("context", meetingContext);
      formData.append("duration", String(meetingDuration));

      const res = await fetch("/api/meeting-recording", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `上传失败 (${res.status})`);
      }

      const uploadData = (await res.json()) as { id: string; audioUrl: string };
      setMeetingAudioUrl(uploadData.audioUrl);
      setMeetingProgress("transcribing");
      setMeetingUploading(false);

      const transcribeRes = await fetch("/api/meeting-recording/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId: uploadData.id }),
      });

      if (!transcribeRes.ok) {
        const errData = await transcribeRes.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error ?? "转录失败");
      }

      const transcribeData = (await transcribeRes.json()) as {
        status: string;
        transcript?: MeetingTranscriptData;
        decodeResult?: MeetingDecodeResult;
      };

      if (transcribeData.transcript) {
        setMeetingTranscript(transcribeData.transcript);
      }
      if (transcribeData.decodeResult) {
        setMeetingDecodeResult(transcribeData.decodeResult);
      }

      setMeetingProgress("done");
    } catch (err) {
      setMeetingError(err instanceof Error ? err.message : "上传失败，请重试");
      setMeetingProgress("error");
      setMeetingUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="form-label">
            客户 <span className="text-danger">*</span>
          </label>
          <select
            value={meetingAccountId}
            onChange={(e) => {
              setMeetingAccountId(e.target.value);
              setMeetingAttendees([]);
            }}
            className="form-select"
          >
            <option value="">选择客户...</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">
            会议标题 <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={meetingTitle}
            onChange={(e) => setMeetingTitle(e.target.value)}
            placeholder="例：Q2 预算审批会议"
            className={inputFieldClass}
          />
        </div>
      </div>

      <div>
        <label className="form-label">参会人</label>
        {meetingAccountId && meetingContacts.length > 0 ? (
          <div className="space-y-2">
            <input
              type="text"
              value={attendeeSearch}
              onChange={(e) => setAttendeeSearch(e.target.value)}
              placeholder="搜索联系人..."
              className={inputFieldClass}
            />
            <div className="flex flex-wrap gap-1.5">
              {filteredMeetingContacts.map((c) => {
                const selected = meetingAttendees.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setMeetingAttendees((prev) =>
                        selected ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                      );
                    }}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? "border-accent/40 bg-accent/10 text-accent"
                        : "border-border bg-background text-muted hover:border-secondary hover:text-foreground"
                    }`}
                  >
                    <Users className="h-3 w-3" />
                    {c.name}
                    {c.title && <span className="text-muted">· {c.title}</span>}
                  </button>
                );
              })}
            </div>
            {meetingAttendees.length > 0 && (
              <p className="text-xs text-accent">已选 {meetingAttendees.length} 人</p>
            )}
          </div>
        ) : meetingAccountId ? (
          <p className="text-xs text-muted">该客户暂无联系人</p>
        ) : (
          <p className="text-xs text-muted">请先选择客户</p>
        )}
      </div>

      <div>
        <label className="form-label">会议背景（可选）</label>
        <textarea
          value={meetingContext}
          onChange={(e) => setMeetingContext(e.target.value)}
          placeholder="例：讨论 Q2 合作方案，客户之前表示预算紧张..."
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted/30 focus:border-accent/40 focus:outline-none"
        />
      </div>

      <MeetingRecorder onRecordingComplete={handleMeetingRecordingComplete} />

      <button
        onClick={handleMeetingUpload}
        disabled={!canUploadMeeting}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-accent-hover hover:shadow-md disabled:pointer-events-none disabled:opacity-40"
      >
        {meetingUploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            上传中...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            上传并解读
          </>
        )}
      </button>

      {meetingError && (
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" />
            <div className="flex-1">
              <p className="text-sm font-medium text-danger mb-1">处理失败</p>
              <p className="text-xs text-danger/80">{meetingError}</p>
            </div>
          </div>
          <button
            onClick={() => {
              setMeetingError(null);
              setMeetingProgress("idle");
            }}
            className="text-xs text-danger hover:underline"
          >
            重置并重试
          </button>
        </div>
      )}

      {meetingProgress !== "idle" && (
        <MeetingProgressSteps step={meetingProgress} />
      )}

      {meetingDecodeResult && (
        <MeetingDecodeDisplay result={meetingDecodeResult} />
      )}

      {meetingTranscript && meetingTranscript.fullText && (
        <div className="rounded-lg border border-border bg-sidebar p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">转录内容</div>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(meetingTranscript.fullText);
                // Could add a toast notification here
              }}
              className="text-xs text-accent hover:underline flex items-center gap-1"
            >
              <FileText className="h-3 w-3" />
              复制
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto text-sm text-secondary whitespace-pre-wrap">
            {meetingTranscript.fullText}
          </div>
        </div>
      )}

      {meetingAudioUrl && meetingProgress === "done" && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">🎧 录音回放</div>
          <audio controls src={meetingAudioUrl} className="w-full h-10 rounded-lg" />
        </div>
      )}
    </div>
  );
}
