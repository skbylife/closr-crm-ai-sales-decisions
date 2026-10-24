"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Target,
  Shield,
  CheckCircle2,
  Plus,
  Languages,
  Clock3,
  Building2,
  MessageSquareText,
  AlertTriangle,
  Swords,
} from "lucide-react";

import type { SavedDecode } from "@/lib/babel-engine/types";
import { useStore } from "@/lib/store";
import {
  DEAL_STAGE_LABELS,
  SENTIMENT_LABELS,
  CopyButton,
  riskBadgeEl,
  sentimentIcon,
} from "@/components/accounts/shared";
import { DECODE_GOAL_LABELS, DECODE_SOURCE_LABELS } from "@/components/decode/decode-helpers";
import { buildDecodeStabilitySnapshotView } from "@/lib/judgment/decode-stability-client";

function detectLanguage(text: string) {
  if (!text.trim()) return "未知";
  if (/[\u4e00-\u9fff]/.test(text)) return "中文";
  if (/[а-яА-ЯЁё]/.test(text)) return "俄语";
  if (/[ぁ-んァ-ン]/.test(text)) return "日语";
  if (/[가-힣]/.test(text)) return "韩语";
  return "English";
}

function formatDate(date: string) {
  return new Date(date).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildThreadSummary(item: SavedDecode) {
  const thread = item.decode.threadAnalysis;
  const parts = [
    thread?.keySignal,
    thread?.buyerState ? `客户状态：${thread.buyerState}` : null,
    item.dealStage ? `阶段：${DEAL_STAGE_LABELS[item.dealStage] ?? item.dealStage}` : null,
  ].filter(Boolean);
  return parts.join("，");
}

function buildContextSummary(item: SavedDecode) {
  const parts = [
    item.accountName || item.clientName,
    item.originalSenderName || item.originalSenderEmail,
    item.direction === "inbound" ? "收到客户来信" : item.direction === "outbound" ? "我方发出" : null,
    item.matchedContactId ? "已关联联系人" : null,
    item.signalSource ? `来源：${DECODE_SOURCE_LABELS[item.signalSource]?.zh ?? item.signalSource}` : null,
    item.analysisGoal ? `目标：${DECODE_GOAL_LABELS[item.analysisGoal]?.zh ?? item.analysisGoal}` : null,
  ].filter(Boolean);
  return parts.join("，");
}

export default function DecodeHistoryDrawer({
  item,
  open,
  onClose,
}: {
  item: SavedDecode | null;
  open: boolean;
  onClose: () => void;
}) {
  const addTask = useStore((s) => s.addTask);
  const updateDecode = useStore((s) => s.updateDecode);
  const [createdTaskKeys, setCreatedTaskKeys] = useState<Set<string>>(new Set());

  const handleClose = () => {
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  const meta = useMemo(() => {
    if (!item) return null;
    return {
      language: detectLanguage(item.emailText),
      hasStrategy: !!item.strategy?.strategies?.length,
      threadSummary: buildThreadSummary(item),
      contextSummary: buildContextSummary(item),
      stabilitySnapshot: buildDecodeStabilitySnapshotView(item.decode),
    };
  }, [item]);

  if (!open || !item || !meta || typeof document === 'undefined') return null;

  const signalStatusLabels: Record<NonNullable<SavedDecode["signalStatus"]>, string> = {
    new: "待处理",
    task_created: "已建任务",
    in_play: "已进谋局",
    ignored: "已忽略",
  };
  const signalStatus = item.signalStatus || "new";

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col border-l border-border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">信号详情</p>
            <h3 className="mt-1 truncate text-lg font-semibold text-foreground">
              {item.accountName || item.clientName || "未命名客户"}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formatDate(item.date)}</span>
              <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{item.accountName || item.clientName || "未关联对象"}</span>
              <span className="inline-flex items-center gap-1"><Languages className="h-3.5 w-3.5" />{meta.language}</span>
              <span className="rounded-full border border-border bg-card px-2 py-0.5">
                {DECODE_SOURCE_LABELS[item.signalSource || "email"]?.zh ?? "邮件"}
              </span>
              <span className="rounded-full border border-border bg-card px-2 py-0.5">
                {DECODE_GOAL_LABELS[item.analysisGoal || "auto"]?.zh ?? "让 AI 判断"}
              </span>
              <span className={`rounded-full border px-2 py-0.5 ${meta.hasStrategy ? "border-accent/20 bg-accent/10 text-accent" : "border-border bg-card text-muted"}`}>
                {meta.hasStrategy ? "含回复策略" : "仅解读"}
              </span>
              <span className="rounded-full border border-positive/20 bg-positive/10 px-2 py-0.5 text-positive">
                {signalStatusLabels[signalStatus]}
              </span>
              {meta.stabilitySnapshot.available && (
                <span className={`rounded-full border px-2 py-0.5 ${
                  meta.stabilitySnapshot.statusTone === "warning"
                    ? "border-warning/20 bg-warning/10 text-warning"
                    : meta.stabilitySnapshot.statusTone === "positive"
                      ? "border-positive/20 bg-positive/10 text-positive"
                      : "border-border bg-card text-muted"
                }`}>
                  依据快照 · {meta.stabilitySnapshot.statusLabel}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => updateDecode(item.id, { signalStatus: signalStatus === "ignored" ? "new" : "ignored" })}
              className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-secondary transition-colors hover:bg-card hover:text-foreground"
            >
              {signalStatus === "ignored" ? "恢复待处理" : "忽略"}
            </button>
            {item.accountId && (
              <a
                href={`/accounts/${item.accountId}?tab=plays${item.opportunityId ? `&opportunityId=${item.opportunityId}` : ""}`}
                onClick={() => updateDecode(item.id, { signalStatus: "in_play" })}
                className="inline-flex items-center gap-1 rounded-lg border border-accent/20 bg-accent/10 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
              >
                <Swords className="h-3.5 w-3.5" />
                进谋局
              </a>
            )}
            <button type="button" onClick={handleClose} className="rounded-lg border border-border p-2 text-muted transition-colors hover:bg-card hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-4">
              <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                <Target className="h-3.5 w-3.5" />核心判断
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1">
                  {sentimentIcon(item.decode.threadAnalysis?.sentimentTrend)}
                  <span className="text-xs font-medium text-secondary">
                    {SENTIMENT_LABELS[item.decode.threadAnalysis?.sentimentTrend] ?? item.decode.threadAnalysis?.sentimentTrend}
                  </span>
                </div>
                {riskBadgeEl(item.decode.threadAnalysis?.riskLevel)}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-foreground">{item.decode.threadAnalysis?.keySignal || "暂无核心判断"}</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                <AlertTriangle className="h-3.5 w-3.5" />风险与阶段
              </h4>
              <div className="space-y-2 text-sm text-secondary">
                <div className="flex items-center gap-2"><span className="text-muted">风险等级：</span>{riskBadgeEl(item.decode.threadAnalysis?.riskLevel)}</div>
                <p><span className="text-muted">客户状态：</span>{item.decode.threadAnalysis?.buyerState || "未知"}</p>
                <p><span className="text-muted">交易阶段：</span>{item.dealStage ? DEAL_STAGE_LABELS[item.dealStage] ?? item.dealStage : "未记录"}</p>
              </div>
            </div>
          </div>

          {meta.stabilitySnapshot.available && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                <CheckCircle2 className="h-3.5 w-3.5" />判断稳定性
              </h4>
              <p className="text-sm leading-relaxed text-foreground">{meta.stabilitySnapshot.headline}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                  依据快照可用
                </span>
                {meta.stabilitySnapshot.snapshotRows.slice(0, 2).map((row) => (
                  <span key={row.label} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                    {row.label}：{row.value}
                  </span>
                ))}
              </div>
              {meta.stabilitySnapshot.changeReasons.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {meta.stabilitySnapshot.changeReasons.slice(0, 3).map((reason, index) => (
                    <li key={`${index}-${reason}`} className="text-xs leading-relaxed text-muted">• {reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {item.signalContext && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                <MessageSquareText className="h-3.5 w-3.5" />信号背景
              </h4>
              <p className="text-sm leading-relaxed text-foreground">{item.signalContext}</p>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                <MessageSquareText className="h-3.5 w-3.5" />thread 摘要
              </h4>
              <p className="text-sm leading-relaxed text-foreground">{meta.threadSummary || "暂无摘要"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                <Building2 className="h-3.5 w-3.5" />context 摘要
              </h4>
              <p className="text-sm leading-relaxed text-foreground">{meta.contextSummary || "暂无上下文"}</p>
            </div>
          </div>

          {item.decode.actionItems && item.decode.actionItems.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                  <Target className="h-3.5 w-3.5" />建议动作
                </h4>
                <span className="text-xs text-muted">{item.decode.actionItems.length} 条</span>
              </div>
              <div className="space-y-3">
                {item.decode.actionItems.map((actionItem, index) => {
                  const taskKey = `${item.id}-action-${index}`;
                  const isCreated = createdTaskKeys.has(taskKey);
                  return (
                    <div key={taskKey} className="rounded-xl border border-border bg-background p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground">{actionItem.title}</p>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                            <span className="rounded-full border border-border px-2 py-0.5">优先级 {actionItem.priority}</span>
                            <span className="rounded-full border border-border px-2 py-0.5">{actionItem.dueInDays} 天内</span>
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-secondary">{actionItem.reasoning}</p>
                        </div>
                        <button
                          onClick={() => {
                            if (isCreated) return;
                            const dueDate = new Date();
                            dueDate.setDate(dueDate.getDate() + actionItem.dueInDays);
                            const taskId = addTask({
                              title: actionItem.title,
                              description: actionItem.reasoning,
                              status: "todo",
                              priority: actionItem.priority,
                              dueDate: dueDate.toISOString().split("T")[0],
                              source: "decode",
                              aiGenerated: true,
                              accountId: item.accountId,
                              opportunityId: item.opportunityId,
                              contactId: item.matchedContactId,
                              sourceId: item.id,
                            });
                            updateDecode(item.id, {
                              signalStatus: "task_created",
                              signalTaskId: taskId,
                            });
                            setCreatedTaskKeys((prev) => new Set(prev).add(taskKey));
                          }}
                          className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs ${isCreated ? "border-positive/20 bg-positive/10 text-positive" : "border-accent/20 bg-accent/10 text-accent hover:bg-accent/20"}`}
                        >
                          {isCreated ? <CheckCircle2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                          {isCreated ? "已建任务" : "添加任务"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {item.strategy && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                    <Shield className="h-3.5 w-3.5" />回复策略
                  </h4>
                  <p className="mt-1 text-xs text-muted">{item.strategy.reasoning}</p>
                </div>
              </div>
              <div className="space-y-3">
                {item.strategy.strategies.map((strategy, index) => {
                  const taskKey = `${item.id}-strategy-${index}`;
                  const isCreated = createdTaskKeys.has(taskKey);
                  const isRecommended = index === item.strategy!.recommended;
                  return (
                    <div key={taskKey} className={`rounded-xl border p-4 ${isRecommended ? "border-accent/25 bg-accent/[0.03]" : "border-border bg-background"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h5 className="text-sm font-semibold text-foreground">{strategy.name}</h5>
                            {isRecommended && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-bold uppercase text-accent">推荐</span>}
                            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">成功率 {Math.round(strategy.successProbability * 100)}%</span>
                          </div>
                          <p className="mt-1 text-sm text-accent">{strategy.goal}</p>
                          <p className="mt-2 text-sm leading-relaxed text-secondary">{strategy.approach}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                            <span className="rounded-full border border-border px-2 py-0.5">语气 {strategy.tone}</span>
                            <span className="rounded-full border border-border px-2 py-0.5">时效 {strategy.urgency}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <CopyButton text={strategy.draft} />
                          <button
                            onClick={() => {
                              if (isCreated) return;
                              const taskId = addTask({
                                title: strategy.name,
                                description: `${strategy.approach}\n\n回复策略：${strategy.draft}`,
                                status: "todo",
                                priority: strategy.urgency.includes("立即") || strategy.urgency.includes("紧急") ? "high" : "medium",
                                source: "decode",
                                aiGenerated: true,
                                accountId: item.accountId,
                                opportunityId: item.opportunityId,
                                contactId: item.matchedContactId,
                                sourceId: item.id,
                              });
                              updateDecode(item.id, {
                                signalStatus: "task_created",
                                signalTaskId: taskId,
                              });
                              setCreatedTaskKeys((prev) => new Set(prev).add(taskKey));
                            }}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs ${isCreated ? "border-positive/20 bg-positive/10 text-positive" : "border-accent/20 bg-accent/10 text-accent hover:bg-accent/20"}`}
                          >
                            {isCreated ? <CheckCircle2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                            {isCreated ? "已建任务" : "添加任务"}
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 rounded-lg border border-border bg-card p-3">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{strategy.draft}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-4">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">沟通拆解</h4>
            <div className="space-y-3">
              {item.decode.messages.map((message, index) => (
                <div key={`${item.id}-message-${index}`} className={`rounded-xl border p-3 ${message.speaker === "them" ? "border-border bg-sidebar" : "border-accent/10 bg-accent/[0.03]"}`}>
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-semibold uppercase tracking-wider text-muted">{message.speaker === "them" ? "客户" : "你"}</span>
                    <span className="font-mono text-muted">紧迫度 {message.decode?.urgency ?? "-"}/10</span>
                  </div>
                  <p className="rounded-lg bg-background/60 px-3 py-2 text-xs leading-relaxed text-secondary">“{message.original}”</p>
                  <div className="mt-2 space-y-1 text-sm text-foreground">
                    <p><span className="text-accent text-xs font-semibold uppercase">真实意图</span> {message.decode?.meaning || "暂无"}</p>
                    <p><span className="text-warning text-xs font-semibold uppercase">情绪态度</span> {message.decode?.emotion || "暂无"}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">原始内容</h4>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-secondary">{item.emailText}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
