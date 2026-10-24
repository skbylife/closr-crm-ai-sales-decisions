"use client";

import { useState } from "react";
import type { DecodedMessage, ThreadAnalysis } from "@/lib/babel-engine/types";
import {
  urgencyColor,
  urgencyBarGradient,
  emotionEmoji,
  SENTIMENT_LABELS,
} from "@/components/decode/decode-helpers";
import {
  sentimentIcon,
  riskBadge,
  buyerStateBadge,
} from "@/components/decode/decode-shared";

// ─── Types ──────────────────────────────────────────────────────────

interface ThreadViewProps {
  messages?: DecodedMessage[];
  threadAnalysis?: ThreadAnalysis;
  /** 是否展示 thread 级别的分析摘要 */
  showThreadSummary?: boolean;
}

// ─── Key Phrase Tooltip ─────────────────────────────────────────────

function PhraseTooltip({
  children,
  tooltip,
}: {
  children: React.ReactNode;
  tooltip: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <span
      className="relative inline"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span className="absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground shadow-lg">
          {tooltip}
        </span>
      )}
    </span>
  );
}

// ─── Urgency Indicator Bar ──────────────────────────────────────────

function UrgencyBar({ urgency }: { urgency: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-medium text-muted">紧急度</span>
      <div className="h-1 w-20 rounded-full bg-border">
        <div
          className={`h-1 rounded-full bg-gradient-to-r transition-all duration-300 ${urgencyBarGradient(urgency)}`}
          style={{ width: `${urgency * 10}%` }}
        />
      </div>
      <span className={`text-[10px] font-mono font-medium ${urgencyColor(urgency)}`}>
        {urgency}/10
      </span>
    </div>
  );
}

// ─── Sentiment Bar ──────────────────────────────────────────────────

function SentimentBar({ emotion, confidence }: { emotion: string; confidence: number }) {
  // 根据 confidence 显示一个小进度条
  return (
    <div className="flex items-center gap-2">
      <span className="text-base" title={emotion}>
        {emotionEmoji(emotion)}
      </span>
      <span className="text-xs text-secondary">{emotion}</span>
      <div className="h-1 w-12 rounded-full bg-border">
        <div
          className="h-1 rounded-full bg-accent/60 transition-all duration-300"
          style={{ width: `${confidence * 100}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-muted">
        {Math.round(confidence * 100)}%
      </span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function ThreadView({
  messages,
  threadAnalysis,
  showThreadSummary = true,
}: ThreadViewProps) {
  if (!messages || messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-sidebar border border-border">
          <span className="text-lg">💬</span>
        </div>
        <p className="text-sm text-muted">暂无消息</p>
        <p className="mt-1 text-xs text-muted">选择邮件后会在此显示解读结果</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Thread-level Analysis Summary */}
      {showThreadSummary && threadAnalysis && (
        <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">
            对话走势分析
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1">
              {sentimentIcon(threadAnalysis.sentimentTrend)}
              <span className="text-xs font-medium text-secondary">
                {SENTIMENT_LABELS[threadAnalysis.sentimentTrend] ?? threadAnalysis.sentimentTrend}
              </span>
            </div>
            {riskBadge(threadAnalysis.riskLevel)}
            {buyerStateBadge(threadAnalysis.buyerState)}
          </div>
          {threadAnalysis.keySignal && (
            <p className="mt-2 rounded-lg border border-border bg-card/50 px-3 py-2 text-sm text-foreground leading-relaxed">
              {threadAnalysis.keySignal}
            </p>
          )}
        </div>
      )}

      {/* Per-message decode */}
      {messages.map((msg, i) => {
        const isClient = msg.speaker === "them";
        const decode = msg.decode;

        return (
          <div
            key={i}
            className={`rounded-xl border p-4 transition-colors ${
              isClient
                ? "border-border bg-sidebar"
                : "border-accent/10 bg-accent/[0.03]"
            }`}
          >
            {/* Header: speaker + emotion */}
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded text-xs font-bold ${
                    isClient
                      ? "bg-card text-secondary"
                      : "bg-accent/15 text-accent"
                  }`}
                >
                  {isClient ? "C" : "Y"}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {isClient ? "客户" : "你"}
                </span>
              </div>
              {decode && <UrgencyBar urgency={decode.urgency} />}
            </div>

            {/* Original text with inline annotations */}
            <div className="mb-3 rounded-lg bg-background/50 px-3 py-2">
              {decode?.meaning ? (
                <PhraseTooltip tooltip={`AI 解读：${decode.meaning}`}>
                  <p className="text-sm leading-relaxed text-secondary cursor-help border-b border-dashed border-accent/30">
                    &quot;{msg.original}&quot;
                  </p>
                </PhraseTooltip>
              ) : (
                <p className="text-sm leading-relaxed text-secondary">
                  &quot;{msg.original}&quot;
                </p>
              )}
            </div>

            {/* Decode details */}
            {decode && (
              <div className="space-y-2">
                {/* Real intent */}
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                    真实意图
                  </span>
                  <p className="mt-0.5 text-sm leading-relaxed text-foreground">
                    {decode.meaning}
                  </p>
                </div>

                {/* Sentiment bar + confidence */}
                <SentimentBar emotion={decode.emotion} confidence={decode.confidence} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
