"use client";

// ─── Decode Output / Result Display ──────────────────────────────────

import { useState } from "react";
import Link from "next/link";
import {
  Target,
  ChevronRight,
  ChevronDown,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Swords,
  Plus,
  AlertTriangle,
} from "lucide-react";
import type { DecodeOutput } from "@/lib/babel-engine/types";
import { useLocale } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import {
  sentimentIcon,
  riskBadge,
  buyerStateBadge,
} from "./decode-shared";
import {
  urgencyColor,
  urgencyBarGradient,
  emotionEmoji,
  SENTIMENT_LABELS,
  DECODE_GOAL_LABELS,
  DECODE_SOURCE_LABELS,
} from "./decode-helpers";
import type { DecodeGoal, DecodeSource } from "./decode-helpers";
import { SaveAsIntelModal } from "./save-intel-modal";
import { SaveToAccountButton } from "./save-account-button";
import { SaveToKnowledgeButton } from "@/components/shared/save-to-knowledge-button";
import { DecodeContextCard } from "./decode-context-card";
import { SocialIntentPanel } from "./social-intent-panel";
import { JudgmentBrief } from "@/components/judgment/judgment-brief";
import { buildDecodeJudgmentBrief } from "@/lib/judgment/brief";
import { buildDecodeJudgmentFeedbackTarget } from "@/lib/judgment/decode-feedback-target";
import {
  DECODE_JUDGMENT_FIELD_LABELS,
  buildDecodeStabilityCorrectionCta,
  buildDecodeStabilityMetadata,
} from "@/lib/judgment/decode-stability-client";
import { buildDecodeSocialIntentSummary } from "@/lib/babel-engine/social-intent";

// ─── Props ───────────────────────────────────────────────────────────

export interface DecodeResultProps {
  decodeResult: DecodeOutput;
  saved: boolean;
  savedAccountName: string;
  savedAccountId: string;
  savedDecodeId: string;
  savedOpportunityId?: string;
  savedContactId?: string;
  clientName: string;
  signalSource?: DecodeSource;
  analysisGoal?: DecodeGoal;
  signalContext?: string;
  onSaveToAccount: (accountId: string, accountName: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────

export default function DecodeResult({
  decodeResult,
  saved,
  savedAccountName,
  savedAccountId,
  savedDecodeId,
  savedOpportunityId,
  savedContactId,
  clientName,
  signalSource = "email",
  analysisGoal = "auto",
  signalContext,
  onSaveToAccount,
}: DecodeResultProps) {
  const { t, locale } = useLocale();
  const decodeFeedbacks = useStore((s) => s.decodeFeedbacks);
  const addDecodeFeedback = useStore((s) => s.addDecodeFeedback);
  const addTask = useStore((s) => s.addTask);
  const updateDecode = useStore((s) => s.updateDecode);
  const accounts = useStore((s) => s.accounts);
  const [discoveryNoteModalOpen, setDiscoveryNoteModalOpen] = useState(false);
  const [leadActionCreated, setLeadActionCreated] = useState(false);
  const [messageDetailsOpen, setMessageDetailsOpen] = useState(false);
  const leadAction = decodeResult.actionItems?.[0];
  const matchedContact = savedContactId
    ? accounts
        .find((account) => account.id === savedAccountId)
        ?.contacts?.find((contact) => contact.id === savedContactId)
    : undefined;
  const leadActionTarget = leadAction?.targetPerson || matchedContact?.name;
  const leadActionTargetRole = leadAction?.targetRole || matchedContact?.title || matchedContact?.role;
  const stableJudgment = decodeResult.stableJudgment;
  const judgmentDiff = decodeResult.judgmentDiff;
  const stabilityMetadata = buildDecodeStabilityMetadata(decodeResult);
  const socialIntent = buildDecodeSocialIntentSummary({
    decode: decodeResult,
    relationship: signalContext,
  });
  const hasSavedDecodeTarget = saved && Boolean(savedAccountId) && Boolean(savedDecodeId);
  const savedDecodeTargetAccountId = hasSavedDecodeTarget ? savedAccountId : "";
  const savedDecodeTargetId = hasSavedDecodeTarget ? savedDecodeId : "";
  const stabilityCorrectionCta = hasSavedDecodeTarget
    ? buildDecodeStabilityCorrectionCta({
        saved,
        targetId: savedDecodeTargetId,
        metadata: stabilityMetadata,
        confidence: stableJudgment?.confidence,
        currentJudgment: decodeResult.threadAnalysis?.keySignal,
      })
    : null;
  const stabilityCopy = judgmentDiff
    ? judgmentDiff.status === "same_judgment"
      ? "与上次同内容解读的关键判断一致。"
      : judgmentDiff.status === "changed_context"
        ? "本次判断有变化，主要因为客户、联系人、商机或知识库上下文不同。"
        : judgmentDiff.status === "unstable_same_context"
          ? "同一上下文下关键判断发生变化，已标记为低稳定性，请先看依据再行动。"
          : "这是当前上下文下的第一版判断；下次重复解读会自动对比差异。"
    : null;
  const brief = buildDecodeJudgmentBrief({
    decode: decodeResult,
    savedAccountId: savedDecodeTargetAccountId,
    savedDecodeId: savedDecodeTargetId,
    clientName,
    savedAccountName,
    signalSourceLabel: DECODE_SOURCE_LABELS[signalSource]?.[locale] ?? signalSource,
    analysisGoalLabel: DECODE_GOAL_LABELS[analysisGoal]?.[locale] ?? analysisGoal,
  });
  const decodeFeedbackTarget = hasSavedDecodeTarget
    ? buildDecodeJudgmentFeedbackTarget({
        saved,
        savedAccountId: savedDecodeTargetAccountId,
        savedDecodeId: savedDecodeTargetId,
        savedAccountName,
        previousSummary: brief?.currentJudgment ?? decodeResult.threadAnalysis?.keySignal,
        stabilityCorrection: stabilityCorrectionCta?.visible ? stabilityCorrectionCta : null,
      })
    : undefined;

  return (
    <div className="space-y-3 p-5">
      <JudgmentBrief brief={brief} feedbackTarget={decodeFeedbackTarget} />

      <SocialIntentPanel summary={socialIntent} />

      {/* Context Card - only show if saved */}
      {saved && savedAccountId && (
        <DecodeContextCard
          accountId={savedAccountId}
          accountName={savedAccountName}
          opportunityId={savedOpportunityId}
          contactId={savedContactId}
        />
      )}

      {saved && savedAccountId && (
        <div className="rounded-xl border border-accent/15 bg-accent/[0.025] p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">校准历史</p>
            </div>
            <Link href={`/accounts/${savedAccountId}?tab=overview`} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-accent/20 bg-card px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent/5">
              打开账户记忆档案
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">信号上下文</span>
          <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-secondary">
            来源：{DECODE_SOURCE_LABELS[signalSource]?.[locale] ?? signalSource}
          </span>
          <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-secondary">
            目标：{DECODE_GOAL_LABELS[analysisGoal]?.[locale] ?? analysisGoal}
          </span>
          {saved ? (
            <span className="rounded-full border border-positive/20 bg-positive/10 px-2.5 py-1 text-xs font-medium text-positive">
              已沉淀
            </span>
          ) : (
            <span className="rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
              未关联客户
            </span>
          )}
        </div>
        {signalContext && (
          <p className="mt-2 text-sm leading-relaxed text-secondary">
            {signalContext}
          </p>
        )}
      </div>

      {stableJudgment && (
        <div className={`rounded-xl border p-4 ${judgmentDiff?.unstable ? "border-warning/30 bg-warning/[0.04]" : "border-border bg-card"}`}>
          <div className="flex items-start gap-3">
            {judgmentDiff?.unstable ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">判断稳定性</p>
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-secondary">
                  置信度 {Math.round(stableJudgment.confidence * 100)}%
                </span>
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-secondary">
                  风险 {stableJudgment.risk}
                </span>
              </div>
              {stabilityCopy && (
                <p className="mt-2 text-sm leading-relaxed text-foreground">{stabilityCopy}</p>
              )}
              {judgmentDiff && judgmentDiff.changed_fields.length > 0 && (
                <div className="mt-3 rounded-lg border border-border bg-background/70 px-3 py-2">
                  <p className="text-xs font-medium text-secondary">本次变化</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {judgmentDiff.changed_fields.slice(0, 4).map((field) => (
                      <span key={field.field} className="rounded-full bg-muted/10 px-2 py-0.5 text-xs text-muted">
                        {DECODE_JUDGMENT_FIELD_LABELS[field.field] ?? field.field}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {stableJudgment.uncertainty.length > 0 && (
                <p className="mt-2 text-xs leading-relaxed text-warning">
                  不确定性：{stableJudgment.uncertainty.join("；")}
                </p>
              )}
              {stabilityCorrectionCta?.visible && (
                <div className="mt-3 rounded-lg border border-warning/20 bg-warning/5 p-3">
                  <p className="text-xs leading-5 text-warning">{stabilityCorrectionCta.reason}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">下一步动作</p>
            <h3 className="mt-1 text-base font-semibold text-foreground">
              {leadAction?.title ?? decodeResult.threadAnalysis?.keySignal ?? "先保存到客户，再沉淀为后续动作"}
            </h3>
            {leadActionTarget && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-accent/20 bg-accent/5 px-2 py-0.5 text-xs font-medium text-accent">
                  建议对象：{leadActionTarget}
                </span>
                {leadActionTargetRole && (
                  <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted">
                    {leadActionTargetRole}
                  </span>
                )}
              </div>
            )}
            <p className="mt-1 text-sm leading-relaxed text-secondary">
              {leadAction?.reasoning ?? "这条信号还没有生成明确待办。你可以先保存到客户档案，后续在客户页或谋局页继续补充上下文。"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {leadAction && savedAccountId && (
              <button
                onClick={() => {
                  if (leadActionCreated) return;
                  const dueDate = new Date();
                  dueDate.setDate(dueDate.getDate() + leadAction.dueInDays);
                  const taskId = addTask({
                    title: leadAction.title,
                    description: leadAction.reasoning,
                    status: "todo",
                    priority: leadAction.priority,
                    dueDate: dueDate.toISOString().split("T")[0],
                    source: "decode",
                    aiGenerated: true,
                    accountId: savedAccountId,
                    opportunityId: savedOpportunityId,
                    contactId: savedContactId,
                    sourceId: savedDecodeId || undefined,
                  });
                  if (savedDecodeId) {
                    updateDecode(savedDecodeId, {
                      signalStatus: "task_created",
                      signalTaskId: taskId,
                    });
                  }
                  setLeadActionCreated(true);
                }}
                disabled={leadActionCreated}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  leadActionCreated
                    ? "border border-positive/20 bg-positive/10 text-positive"
                    : "bg-accent text-white hover:bg-accent-hover"
                }`}
              >
                {leadActionCreated ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {leadActionCreated ? "已创建任务" : "创建任务"}
              </button>
            )}
            {savedAccountId && (
              <Link
                href={`/accounts/${savedAccountId}?tab=plays${savedOpportunityId ? `&opportunityId=${savedOpportunityId}` : ""}`}
                onClick={() => {
                  if (savedDecodeId) updateDecode(savedDecodeId, { signalStatus: "in_play" });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/20 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
              >
                <Swords className="h-3.5 w-3.5" />
                去谋局
              </Link>
            )}
          </div>
        </div>
      </div>
      {/* Thread Summary — Intel Briefing */}
      <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
            <Target className="h-3.5 w-3.5" />
            {t("decode.intelBriefing")}
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            {/* Save as Discovery Note button */}
            <button
              onClick={() => setDiscoveryNoteModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-600 transition-colors duration-150 hover:bg-green-500/20 hover:border-green-500/30"
            >
              <BookOpen className="h-3 w-3" />
              {t("decode.saveAsDiscovery")}
            </button>

            {/* Save to Account button */}
            {saved ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-positive/20 bg-positive/10 px-3 py-1.5 text-xs font-medium text-positive">
                <CheckCircle2 className="h-3 w-3" />
                已保存到「{savedAccountName}」
                {savedAccountId && (
                  <Link
                    href={`/accounts/${savedAccountId}?tab=activity&targetKind=email_decode&targetId=${encodeURIComponent(savedDecodeId)}`}
                    className="ml-1 inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-positive/80"
                  >
                    查看
                    <ExternalLink className="h-2.5 w-2.5" />
                  </Link>
                )}
              </span>
            ) : (
              <SaveToAccountButton onSave={onSaveToAccount} />
            )}

            {/* Create Play shortcut */}
            {saved && savedAccountId && (
              <Link
                href={`/accounts/${savedAccountId}?tab=plays`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/20 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors duration-150 hover:bg-accent/20 hover:border-accent/30"
              >
                <Swords className="h-3 w-3" />
                创建谋局
              </Link>
            )}

            {/* Save to Knowledge Base */}
            {saved && savedAccountId && (
              <SaveToKnowledgeButton
                accountId={savedAccountId}
                title={`邮件解读：${clientName || '客户邮件'}`}
                content={[
                  decodeResult.threadAnalysis?.keySignal,
                  ...decodeResult.messages.map((m) => m.decode?.meaning),
                ].filter(Boolean).join('\n')}
                category="ai_insight"
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1">
            {sentimentIcon(decodeResult.threadAnalysis?.sentimentTrend)}
            <span className="text-xs font-medium text-secondary">
              {SENTIMENT_LABELS[decodeResult.threadAnalysis?.sentimentTrend] ?? decodeResult.threadAnalysis?.sentimentTrend}
            </span>
          </div>
          {riskBadge(decodeResult.threadAnalysis?.riskLevel)}
          {buyerStateBadge(decodeResult.threadAnalysis?.buyerState)}
        </div>

        {decodeResult.threadAnalysis?.keySignal && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-card/50 px-3 py-2.5">
            <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" />
            <p className="text-sm leading-relaxed text-foreground">
              {decodeResult.threadAnalysis?.keySignal}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card/80">
        <button
          type="button"
          onClick={() => setMessageDetailsOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <div>
            <p className="text-sm font-semibold text-foreground">完整逐条解读</p>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-secondary transition-transform ${messageDetailsOpen ? "rotate-180" : ""}`} />
        </button>

        {messageDetailsOpen ? (
          <div className="space-y-3 border-t border-border p-4">
            {decodeResult.messages.map((msg, i) => {
        const isClient = msg.speaker === "them";
        return (
          <div
            key={i}
            className={`rounded-xl border p-4 ${
              isClient
                ? "border-border bg-sidebar"
                : "border-accent/10 bg-accent/[0.03]"
            }`}
          >
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`flex h-5 w-5 items-center justify-center rounded text-xs font-bold ${
                  isClient
                    ? "bg-card text-secondary"
                    : "bg-accent/15 text-accent"
                }`}>
                  {isClient ? "C" : "Y"}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {isClient ? t("decode.client") : t("decode.you")}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-base" title={msg.decode?.emotion}>
                  {emotionEmoji(msg.decode?.emotion)}
                </span>
                <span className={`text-xs font-mono font-medium ${urgencyColor(msg.decode?.urgency)}`}>
                  {msg.decode?.urgency}/10
                </span>
              </div>
            </div>

            {/* Original text */}
            <p className="mb-3 rounded-lg bg-background/50 px-3 py-2 text-[15px] leading-relaxed text-secondary line-clamp-3">
              &quot;{msg.original}&quot;
            </p>

            {/* Decoded meaning */}
            <div className="space-y-2">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                  {t("decode.realIntent")}
                </span>
                <p className="mt-1 text-sm leading-relaxed text-foreground">
                  {msg.decode?.meaning}
                </p>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-warning">
                  {t("decode.attitude")}
                </span>
                <p className="mt-1 text-sm text-foreground">
                  {msg.decode?.emotion}
                </p>
              </div>
            </div>

            {/* Urgency gradient bar */}
            <div className="mt-3 flex items-center gap-2.5">
              <span className="text-xs font-medium text-muted">{t("decode.urgencyLevel")}</span>
              <div className="h-1 flex-1 rounded-full bg-border">
                <div
                  className={`h-1 rounded-full bg-gradient-to-r transition-all duration-400 ${urgencyBarGradient(msg.decode?.urgency)}`}
                  style={{ width: `${msg.decode?.urgency * 10}%` }}
                />
              </div>
              <span className="font-mono text-xs text-muted">
                {Math.round(msg.decode?.confidence * 100)}%
              </span>
            </div>
          </div>
        );
            })}
          </div>
        ) : null}
      </div>

      {/* Decode Feedback */}
      {savedDecodeId && (() => {
        const feedback = decodeFeedbacks.find((f) => f.decodeId === savedDecodeId);
        return (
          <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-sidebar/50 p-3">
            <span className="text-xs text-muted">{locale === "zh" ? "这次解读准确吗？" : "Was this decode accurate?"}</span>
            <button
              onClick={() => addDecodeFeedback({ decodeId: savedDecodeId, accurate: true })}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${feedback?.accurate === true ? "bg-positive/20 text-positive font-medium" : "text-muted hover:text-positive hover:bg-positive/10"}`}
            >
              👍 {locale === "zh" ? "准确" : "Accurate"}
            </button>
            <button
              onClick={() => addDecodeFeedback({ decodeId: savedDecodeId, accurate: false })}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${feedback?.accurate === false ? "bg-danger/20 text-danger font-medium" : "text-muted hover:text-danger hover:bg-danger/10"}`}
            >
              👎 {locale === "zh" ? "不准确" : "Inaccurate"}
            </button>
          </div>
        );
      })()}

      {/* No-client hint */}
      {!saved && !clientName && (
        <p className="text-center text-xs text-muted">
          {t("decode.autoSaveHint")}
        </p>
      )}

      {/* Save as Intel Modal */}
      <SaveAsIntelModal
        open={discoveryNoteModalOpen}
        onClose={() => setDiscoveryNoteModalOpen(false)}
        decodeResult={decodeResult}
        defaultAccountId={savedAccountId || undefined}
        defaultOpportunityId={savedOpportunityId || undefined}
      />
    </div>
  );
}
