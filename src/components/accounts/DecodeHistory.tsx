"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Target,
  ChevronRight,
  Shield,
  Sparkles,
  Loader2,
  AlertTriangle,
  Mail,
  Plus,
  CheckCircle2
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";
import { friendlyError } from "@/lib/error-helper";
import { useLocale } from "@/lib/i18n";
import { useHighlightScroll } from "@/lib/hooks/use-highlight-scroll";
import type { DecodeOutput, StrategyOutput } from "@/lib/babel-engine/types";
import { buildDecodeStabilitySnapshotView } from "@/lib/judgment/decode-stability-client";
import {
  DEAL_STAGES,
  SENTIMENT_LABELS,
  inputFieldClass,
  selectFieldClass,
  timeAgo,
  sentimentIcon,
  riskBadgeEl,
  CopyButton,
} from "./shared";

export function DecodeHistory({ accountId, accountName, highlightId }: { accountId: string; accountName: string; highlightId?: string | null }) {
  const { emailDecodes } = useRoleFilteredData();
  const saveDecode = useStore((s) => s.saveDecode);
  const { locale } = useLocale();
  const addTask = useStore((s) => s.addTask);
  const updateDecode = useStore((s) => s.updateDecode);
  const [createdTaskKeys, setCreatedTaskKeys] = useState<Set<string>>(new Set());
  const accountDecodes = emailDecodes.filter((d) => d.accountId === accountId);
  const { highlightProps } = useHighlightScroll(highlightId);
  const signalStatusLabels = {
    new: "待处理",
    task_created: "已建任务",
    in_play: "已进谋局",
    ignored: "已忽略",
  } as const;

  const [showDecode, setShowDecode] = useState(false);
  const [emailText, setEmailText] = useState("");
  const [clientName, setClientName] = useState("");
  const [dealStage, setDealStage] = useState("");
  const [decodeResult, setDecodeResult] = useState<DecodeOutput | null>(null);
  const [strategyResult, setStrategyResult] = useState<StrategyOutput | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [strategizing, setStrategizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDecodeId, setSelectedDecodeId] = useState<string | null>(null);

  useEffect(() => {
    if (!highlightId) return;
    if (accountDecodes.some((decode) => decode.id === highlightId)) {
      setSelectedDecodeId(highlightId);
    }
  }, [highlightId, accountDecodes]);

  async function handleDecode() {
    setDecoding(true);
    setError(null);
    setDecodeResult(null);
    setStrategyResult(null);

    try {
      const res = await fetch("/api/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailText,
          clientName: clientName || accountName,
          dealStage: dealStage || undefined,
          outputLocale: locale,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `请求失败 (${res.status})`);
      }
      const decoded: DecodeOutput = await res.json();
      setDecodeResult(decoded);
      setDecoding(false);

      // Auto-fetch strategies first, then save with strategy
      setStrategizing(true);
      let strategies: StrategyOutput | undefined;
      const stratRes = await fetch("/api/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decodedEmail: decoded, accountId, outputLocale: locale }),
      });
      if (stratRes.ok) {
        strategies = await stratRes.json();
        setStrategyResult(strategies ?? null);
      }

      // Save to account with strategy included
      saveDecode({
        accountId,
        accountName,
        emailText,
        clientName: clientName || accountName,
        dealStage: dealStage || undefined,
        decode: decoded,
        strategy: strategies,
      });
    } catch (err) {
      setError(friendlyError(err));
      setDecoding(false);
    } finally {
      setStrategizing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          {accountDecodes.length > 0 ? `共 ${accountDecodes.length} 条解读记录` : ""}
        </p>
        <button
          onClick={() => setShowDecode(!showDecode)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {showDecode ? "收起" : "新建解读"}
        </button>
      </div>

      {/* Inline Decode Workbench */}
      {showDecode && (
        <div className="rounded-xl border border-accent/15 bg-accent/[0.02] p-4 space-y-3">
          <textarea
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            placeholder="粘贴邮件内容..."
            className="min-h-[120px] w-full resize-none rounded-lg border border-border bg-background p-3 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted/30 focus:border-accent/40 focus:outline-none input-glow transition-colors duration-150"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">联系人名称</label>
              <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={accountName} className={inputFieldClass} />
            </div>
            <div>
              <label className="form-label">交易阶段</label>
              <select value={dealStage} onChange={(e) => setDealStage(e.target.value)} className={selectFieldClass}>
                <option value="">选择阶段...</option>
                {DEAL_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={handleDecode}
            disabled={emailText.trim().length < 10 || decoding}
            className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-40"
          >
            {decoding ? <><Loader2 className="h-4 w-4 animate-spin" />解读中...</> : <><Sparkles className="h-4 w-4" />解读邮件</>}
          </button>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />{error}
            </div>
          )}

          {/* Decode Result */}
          {decodeResult && (
            <div className="space-y-3 border-t border-border pt-3">
              <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-4">
                <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                  <Target className="h-3.5 w-3.5" />情报简报
                </h4>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1">
                    {sentimentIcon(decodeResult.threadAnalysis?.sentimentTrend)}
                    <span className="text-xs font-medium text-secondary">
                      {SENTIMENT_LABELS[decodeResult.threadAnalysis?.sentimentTrend] ?? decodeResult.threadAnalysis?.sentimentTrend}
                    </span>
                  </div>
                  {riskBadgeEl(decodeResult.threadAnalysis?.riskLevel)}
                </div>
                {decodeResult.threadAnalysis?.keySignal && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-border bg-card/50 px-3 py-2">
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" />
                    <p className="text-sm leading-relaxed text-foreground">{decodeResult.threadAnalysis?.keySignal}</p>
                  </div>
                )}
              </div>
              {decodeResult.messages.map((msg, i) => (
                <div key={i} className={`rounded-lg border p-3 ${msg.speaker === "them" ? "border-border bg-sidebar" : "border-accent/10 bg-accent/[0.03]"}`}>
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-semibold uppercase tracking-wider text-muted">{msg.speaker === "them" ? "客户" : "你"}</span>
                    <span className="font-mono text-muted">{msg.decode?.urgency}/10</span>
                  </div>
                  <p className="mb-2 rounded bg-background/50 px-2 py-1.5 text-xs text-secondary line-clamp-2">&quot;{msg.original}&quot;</p>
                  <p className="text-sm text-foreground"><span className="text-accent text-xs font-semibold uppercase">真实意图</span> {msg.decode?.meaning}</p>
                </div>
              ))}
            </div>
          )}

          {/* Strategy Result */}
          {(strategizing || strategyResult) && (
            <div className="border-t border-border pt-3">
              <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                <Shield className="h-3.5 w-3.5" />回复策略
              </h4>
              {strategizing && !strategyResult && (
                <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" />生成策略中...</div>
              )}
              {strategyResult && (
                <div className="grid gap-3 lg:grid-cols-3">
                  {strategyResult.strategies.map((strategy, i) => {
                    const isRec = i === strategyResult.recommended;
                    return (
                      <div key={i} className={`flex flex-col rounded-lg border p-3 ${isRec ? "border-accent/25 bg-accent/[0.03]" : "border-border bg-sidebar"}`}>
                        <div className="mb-2 flex items-start justify-between">
                          <div>
                            <h5 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                              {strategy.name}
                              {isRec && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-xs font-bold uppercase text-accent">推荐</span>}
                            </h5>
                            <p className="mt-0.5 text-xs text-accent">{strategy.goal}</p>
                          </div>
                          <span className="font-mono text-lg font-semibold text-foreground">{Math.round(strategy.successProbability * 100)}%</span>
                        </div>
                        <p className="mb-2 text-xs text-secondary">{strategy.approach}</p>
                        <div className="mt-auto rounded-lg border border-border bg-background p-2">
                          <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-secondary">{strategy.draft}</p>
                        </div>
                        <div className="mt-2 flex justify-end"><CopyButton text={strategy.draft} /></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* History */}
      {accountDecodes.length > 0 ? (
        <div className="space-y-3">
          {accountDecodes.map((decode) => {
            const isSelected = selectedDecodeId === decode.id;
            const stabilitySnapshot = buildDecodeStabilitySnapshotView(decode.decode);
            return (
              <div key={decode.id} {...highlightProps(decode.id)}>
                <button
                  onClick={() => setSelectedDecodeId(isSelected ? null : decode.id)}
                  className={`w-full rounded-xl border text-left p-4 transition-colors ${
                    isSelected
                      ? "border-accent/30 bg-accent/[0.03]"
                      : "border-border bg-sidebar hover:border-border-subtle"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-secondary">{decode.clientName ?? "未命名"}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted">{timeAgo(decode.date)}</span>
                      <span className="rounded-full border border-positive/20 bg-positive/5 px-2 py-0.5 text-[11px] text-positive">
                        {signalStatusLabels[decode.signalStatus || "new"]}
                      </span>
                      {stabilitySnapshot.available && (
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${
                          stabilitySnapshot.statusTone === "warning"
                            ? "border-warning/20 bg-warning/10 text-warning"
                            : stabilitySnapshot.statusTone === "positive"
                              ? "border-positive/20 bg-positive/5 text-positive"
                              : "border-border bg-card text-muted"
                        }`}>
                          依据快照 · {stabilitySnapshot.statusLabel}
                        </span>
                      )}
                      <ChevronRight className={`h-3.5 w-3.5 text-muted transition-transform ${isSelected ? "rotate-90" : ""}`} />
                    </div>
                  </div>
                  <p className="line-clamp-2 text-sm text-foreground">{decode.emailText.slice(0, 150)}...</p>
                  {decode?.decode?.threadAnalysis && (
                    <div className="mt-2 flex items-center gap-2">
                      {sentimentIcon(decode?.decode?.threadAnalysis?.sentimentTrend)}
                      {riskBadgeEl(decode?.decode?.threadAnalysis?.riskLevel)}
                      <span className="text-xs text-muted">{decode?.decode?.threadAnalysis?.keySignal?.slice(0, 60)}</span>
                    </div>
                  )}
                </button>

                {/* Expanded decode detail */}
                {isSelected && (
                  <div className="mt-2 space-y-3 rounded-xl border border-accent/15 bg-accent/[0.02] p-4">
                    {/* Intel Briefing */}
                    <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-4">
                      <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                        <Target className="h-3.5 w-3.5" />情报简报
                      </h4>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1">
                          {sentimentIcon(decode?.decode?.threadAnalysis?.sentimentTrend)}
                          <span className="text-xs font-medium text-secondary">
                            {SENTIMENT_LABELS[decode?.decode?.threadAnalysis?.sentimentTrend] ?? decode?.decode?.threadAnalysis?.sentimentTrend}
                          </span>
                        </div>
                        {riskBadgeEl(decode?.decode?.threadAnalysis?.riskLevel)}
                      </div>
                      {decode?.decode?.threadAnalysis?.keySignal && (
                        <div className="mt-2 flex items-start gap-2 rounded-lg border border-border bg-card/50 px-3 py-2">
                          <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" />
                          <p className="text-sm leading-relaxed text-foreground">{decode?.decode?.threadAnalysis?.keySignal}</p>
                        </div>
                      )}
                    </div>

                    {stabilitySnapshot.available && (
                      <div className="rounded-xl border border-border bg-card p-4">
                        <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                          <CheckCircle2 className="h-3.5 w-3.5" />判断稳定性
                        </h4>
                        <p className="text-sm leading-relaxed text-foreground">{stabilitySnapshot.headline}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">依据快照可用</span>
                          {stabilitySnapshot.changeReasons.slice(0, 2).map((reason, index) => (
                            <span key={`${index}-${reason}`} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">{reason}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Messages */}
                    {decode?.decode?.messages.map((msg, i) => (
                      <div key={i} className={`rounded-lg border p-3 ${msg.speaker === "them" ? "border-border bg-sidebar" : "border-accent/10 bg-accent/[0.03]"}`}>
                        <div className="mb-2 flex items-center justify-between text-xs">
                          <span className="font-semibold uppercase tracking-wider text-muted">{msg.speaker === "them" ? "客户" : "你"}</span>
                          <span className="font-mono text-muted">{msg.decode?.urgency}/10</span>
                        </div>
                        <p className="mb-2 rounded bg-background/50 px-2 py-1.5 text-xs text-secondary line-clamp-3">&quot;{msg.original}&quot;</p>
                        <p className="text-sm text-foreground"><span className="text-accent text-xs font-semibold uppercase">真实意图</span> {msg.decode?.meaning}</p>
                        <p className="mt-1 text-sm text-foreground"><span className="text-warning text-xs font-semibold uppercase">态度</span> {msg.decode?.emotion}</p>
                      </div>
                    ))}

                    {/* Action items if available */}
                    {decode.decode.actionItems && decode.decode.actionItems.length > 0 && (
                      <div className="border-t border-border pt-3">
                        <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                          <Target className="h-3.5 w-3.5" />建议动作
                        </h4>
                        <div className="space-y-2">
                          {decode.decode.actionItems.map((item, i) => {
                            const taskKey = `${decode.id}-action-${i}`;
                            const isCreated = createdTaskKeys.has(taskKey);
                            return (
                              <div key={taskKey} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                                  <p className="mt-1 text-xs text-secondary">{item.reasoning}</p>
                                </div>
                                <button
                                  onClick={() => {
                                    if (isCreated) return;
                                    const dueDate = new Date();
                                    dueDate.setDate(dueDate.getDate() + item.dueInDays);
                                    const taskId = addTask({
                                      title: item.title,
                                      description: item.reasoning,
                                      status: 'todo',
                                      priority: item.priority,
                                      dueDate: dueDate.toISOString().split('T')[0],
                                      source: 'decode',
                                      aiGenerated: true,
                                      accountId,
                                      contactId: decode.matchedContactId,
                                      sourceId: decode.id,
                                    });
                                    updateDecode(decode.id, {
                                      signalStatus: "task_created",
                                      signalTaskId: taskId,
                                    });
                                    setCreatedTaskKeys((prev) => new Set(prev).add(taskKey));
                                  }}
                                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs ${isCreated ? 'border-positive/20 bg-positive/10 text-positive' : 'border-accent/20 bg-accent/10 text-accent hover:bg-accent/20'}`}
                                >
                                  {isCreated ? <CheckCircle2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                                  {isCreated ? '已建任务' : '添加任务'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Strategy if available */}
                    {decode.strategy && (
                      <div className="border-t border-border pt-3">
                        <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                          <Shield className="h-3.5 w-3.5" />回复策略
                        </h4>
                        <div className="grid gap-3 lg:grid-cols-3">
                          {decode.strategy.strategies.map((strategy, i) => {
                            const isRec = i === decode.strategy!.recommended;
                            const taskKey = `${decode.id}-strategy-${i}`;
                            const isCreated = createdTaskKeys.has(taskKey);
                            return (
                              <div key={i} className={`flex flex-col rounded-lg border p-3 ${isRec ? "border-accent/25 bg-accent/[0.03]" : "border-border bg-sidebar"}`}>
                                <div className="mb-2 flex items-start justify-between">
                                  <div>
                                    <h5 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                                      {strategy.name}
                                      {isRec && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-xs font-bold uppercase text-accent">推荐</span>}
                                    </h5>
                                    <p className="mt-0.5 text-xs text-accent">{strategy.goal}</p>
                                  </div>
                                  <span className="font-mono text-lg font-semibold text-foreground">{Math.round(strategy.successProbability * 100)}%</span>
                                </div>
                                <p className="mb-2 text-xs text-secondary">{strategy.approach}</p>
                                <div className="mt-auto rounded-lg border border-border bg-background p-2">
                                  <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-secondary">{strategy.draft}</p>
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <CopyButton text={strategy.draft} />
                                  <button
                                    onClick={() => {
                                      if (isCreated) return;
                                      const taskId = addTask({
                                        title: strategy.name,
                                        description: `${strategy.approach}

回复策略：${strategy.draft}`,
                                        status: 'todo',
                                        priority: strategy.urgency.includes('立即') || strategy.urgency.includes('紧急') ? 'high' : 'medium',
                                        source: 'decode',
                                        aiGenerated: true,
                                        accountId,
                                        contactId: decode.matchedContactId,
                                        sourceId: decode.id,
                                      });
                                      updateDecode(decode.id, {
                                        signalStatus: "task_created",
                                        signalTaskId: taskId,
                                      });
                                      setCreatedTaskKeys((prev) => new Set(prev).add(taskKey));
                                    }}
                                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs ${isCreated ? 'border-positive/20 bg-positive/10 text-positive' : 'border-accent/20 bg-accent/10 text-accent hover:bg-accent/20'}`}
                                  >
                                    {isCreated ? <CheckCircle2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                                    {isCreated ? '已建任务' : '添加任务'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : !showDecode ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card shadow-sm p-8 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card">
            <Mail className="h-5 w-5 text-muted" />
          </div>
          <p className="text-sm font-medium text-foreground">暂无解读记录</p>
          <p className="mt-1 max-w-[260px] text-xs text-muted">
            在快速解读中分析客户邮件，记录会自动关联到此客户
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setShowDecode(true)}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              <Sparkles className="h-3.5 w-3.5" />
              新建解读
            </button>
            <Link href="/decode" className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:bg-sidebar">
              去快速解读
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
