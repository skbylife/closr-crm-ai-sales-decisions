"use client";

import { useState, useCallback } from "react";
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  Target,
  RefreshCw,
} from "lucide-react";
import type { DecodeOutput, StrategyOutput, ReplyStrategy } from "@/lib/babel-engine/types";
import { useStore } from "@/lib/store";
import { friendlyError } from "@/lib/error-helper";
import { useLocale } from "@/lib/i18n";
import { ThreadView } from "./thread-view";
import { CopyButton, SkeletonDecode } from "@/components/decode/decode-shared";

// ─── Types ──────────────────────────────────────────────────────────

interface SelectedEmail {
  messageId: string;
  threadId?: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  text: string;
  html?: string;
  matchedAccountId?: string | null;
  matchedAccountName?: string | null;
  matchedContactId?: string | null;
}

export interface DecodePanelProps {
  /** 当前选中的邮件 */
  selectedEmail?: SelectedEmail | null;
  /** 解读完成回调 */
  onDecodeComplete?: (decodeResult: DecodeOutput) => void;
}

// ─── Strategy Card ──────────────────────────────────────────────────

function StrategyCard({
  strategy,
  isRecommended,
}: {
  strategy: ReplyStrategy;
  isRecommended: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        isRecommended
          ? "border-accent/30 bg-accent/[0.03] ring-1 ring-accent/10"
          : "border-border bg-sidebar"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">
          {isRecommended && (
            <span className="mr-1.5 inline-flex items-center rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
              推荐
            </span>
          )}
          {strategy.name}
        </h4>
        <span className="text-[10px] font-mono text-muted">
          成功率 {Math.round(strategy.successProbability * 100)}%
        </span>
      </div>

      <div className="space-y-1.5 text-xs">
        <p>
          <span className="font-medium text-muted">目标：</span>
          <span className="text-secondary">{strategy.goal}</span>
        </p>
        <p>
          <span className="font-medium text-muted">方法：</span>
          <span className="text-secondary">{strategy.approach}</span>
        </p>
        <p>
          <span className="font-medium text-muted">语气：</span>
          <span className="text-secondary">{strategy.tone}</span>
        </p>
        <p>
          <span className="font-medium text-muted">紧急度：</span>
          <span className="text-secondary">{strategy.urgency}</span>
        </p>
      </div>

      {/* Draft reply */}
      {strategy.draft && (
        <div className="mt-3 rounded-lg border border-border bg-background p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
              参考话术
            </span>
            <CopyButton text={strategy.draft} />
          </div>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
            {strategy.draft}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function DecodePanel({ selectedEmail, onDecodeComplete }: DecodePanelProps) {
  const { locale } = useLocale();
  const [decoding, setDecoding] = useState(false);
  const [decodeResult, setDecodeResult] = useState<DecodeOutput | null>(null);
  const [strategyResult, setStrategyResult] = useState<StrategyOutput | null>(null);
  const [strategizing, setStrategizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDecodedId, setLastDecodedId] = useState<string | null>(null);

  const saveDecode = useStore((s) => s.saveDecode);

  const handleDecode = useCallback(async () => {
    if (!selectedEmail) return;
    const emailText = selectedEmail.text || selectedEmail.html || "";
    if (emailText.trim().length < 10) return;

    setDecoding(true);
    setError(null);
    setDecodeResult(null);
    setStrategyResult(null);

    try {
      // 调用 Decode API
      const res = await fetch("/api/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailText: selectedEmail.subject
            ? `Subject: ${selectedEmail.subject}\n\n${emailText}`
            : emailText,
          clientName: selectedEmail.matchedAccountName || selectedEmail.fromName || undefined,
          matchedContactId: selectedEmail.matchedContactId || undefined,
          matchedAccountId: selectedEmail.matchedAccountId || undefined,
          outputLocale: locale,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `请求失败 (${res.status})`);
      }

      const decoded: DecodeOutput = await res.json();
      setDecodeResult(decoded);
      setLastDecodedId(selectedEmail.messageId);
      onDecodeComplete?.(decoded);

      // 获取策略建议
      setStrategizing(true);
      let strategies: StrategyOutput | undefined;
      try {
        const stratRes = await fetch("/api/strategy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decodedEmail: decoded,
            accountId: selectedEmail.matchedAccountId || undefined,
            outputLocale: locale,
          }),
        });
        if (stratRes.ok) {
          strategies = await stratRes.json();
          setStrategyResult(strategies ?? null);
        }
      } catch {
        // 策略获取失败不影响主流程
      } finally {
        setStrategizing(false);
      }

      // 自动保存到对应客户，保留完整解读与回复策略
      if (selectedEmail.matchedAccountId && selectedEmail.matchedAccountName) {
        saveDecode({
          accountId: selectedEmail.matchedAccountId,
          accountName: selectedEmail.matchedAccountName,
          matchedContactId: selectedEmail.matchedContactId || undefined,
          emailText,
          clientName: selectedEmail.matchedAccountName,
          decode: decoded,
          strategy: strategies,
        });
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setDecoding(false);
    }
  }, [selectedEmail, locale, onDecodeComplete, saveDecode]);

  // 空状态：未选中邮件
  if (!selectedEmail) {
    return (
      <div className="p-4">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-card border border-border">
            <span className="text-lg">🧠</span>
          </div>
          <p className="mt-4 text-sm text-muted">
            选择一封邮件来解读隐藏信号
          </p>
          <p className="mt-1 text-xs text-muted">
            AI 将分析语气、紧急度、隐藏异议，并建议回复策略
          </p>
        </div>
      </div>
    );
  }

  // 已选中邮件但还没解读
  const needsDecode = lastDecodedId !== selectedEmail.messageId;

  return (
    <div className="flex flex-col">
      {/* 邮件信息头 */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">
              {selectedEmail.subject || "(无主题)"}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              来自 {selectedEmail.fromName || selectedEmail.fromEmail}
              {selectedEmail.matchedAccountName && (
                <span className="ml-1.5 text-positive">
                  · {selectedEmail.matchedAccountName}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleDecode}
            disabled={decoding}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {decoding ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                解读中...
              </>
            ) : needsDecode ? (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                开始解读
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                重新解读
              </>
            )}
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-danger/20 bg-danger/5 p-3">
          <div className="flex items-start gap-2 text-xs text-danger">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Loading */}
      {decoding && <SkeletonDecode />}

      {/* 解读结果：使用 ThreadView 展示 */}
      {!decoding && decodeResult && !needsDecode && (
        <ThreadView
          messages={decodeResult.messages}
          threadAnalysis={decodeResult.threadAnalysis}
          showThreadSummary={true}
        />
      )}

      {/* 策略建议 */}
      {!decoding && strategyResult && !needsDecode && (
        <div className="border-t border-border p-4">
          <div className="mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-accent" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-accent">
              回复策略建议
            </h3>
            {strategizing && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            )}
          </div>
          {strategyResult.reasoning && (
            <p className="mb-3 text-xs text-secondary leading-relaxed">
              {strategyResult.reasoning}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {strategyResult.strategies.map((s, i) => (
              <StrategyCard
                key={i}
                strategy={s}
                isRecommended={i === strategyResult.recommended}
              />
            ))}
          </div>
        </div>
      )}

      {/* 初始提示：已选中但未解读 */}
      {!decoding && !decodeResult && !error && needsDecode && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Sparkles className="h-8 w-8 text-accent/40 mb-3" />
          <p className="text-sm text-muted">点击「开始解读」分析这封邮件</p>
          <p className="mt-1 text-xs text-muted">
            AI 将识别语气、紧急度和隐藏信号
          </p>
        </div>
      )}
    </div>
  );
}
