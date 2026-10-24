'use client';

import { useState } from 'react';
import { Check, Loader2, MessageSquarePlus } from 'lucide-react';
import type { JudgmentEvidenceRef } from '@/lib/babel-engine/types';
import type {
  JudgmentFeedbackActionIntent,
  JudgmentFeedbackItem,
  JudgmentFeedbackKind,
  JudgmentFeedbackTarget,
  JudgmentFeedbackUsefulness,
  JudgmentRevisionStatus,
  RevisedJudgmentPreview,
} from '@/lib/judgment/feedback';

const KIND_OPTIONS: Array<{ value: JudgmentFeedbackKind; label: string; placeholder: string }> = [
  { value: 'accurate', label: '判断准确', placeholder: '这条判断为什么是准确的？可补充验证依据。' },
  { value: 'inaccurate', label: '判断不准', placeholder: '哪里不对？请写出正确判断或事实。' },
  { value: 'over_optimistic', label: '过度乐观', placeholder: '哪里把推进、赢面或关系热度看得太乐观？' },
  { value: 'missed_risk', label: '漏看风险', placeholder: '漏掉了哪条关键风险？它会怎样影响下一步判断？' },
  { value: 'missing_evidence', label: '缺证据', placeholder: '缺少哪条证据？还必须验证什么？' },
  { value: 'over_inferred', label: '过度推断', placeholder: '哪部分超出了证据范围？应降级成什么假设？' },
  { value: 'stale', label: '已过期', placeholder: '哪条事实/时间线已经过期？最新情况是什么？' },
];

const USEFULNESS_OPTIONS: Array<{ value: JudgmentFeedbackUsefulness; label: string }> = [
  { value: 'useful', label: '有用' },
  { value: 'not_useful', label: '没用' },
  { value: 'unsure', label: '不确定' },
];

const ACTION_INTENT_OPTIONS: Array<{ value: JudgmentFeedbackActionIntent; label: string }> = [
  { value: 'will_act', label: '会执行' },
  { value: 'will_not_act', label: '不会执行' },
  { value: 'needs_more_evidence', label: '先补证据' },
  { value: 'not_applicable', label: '不适用' },
];

export interface JudgmentFeedbackSubmissionResult {
  ok?: boolean;
  feedback?: JudgmentFeedbackItem;
  revisedPreview?: RevisedJudgmentPreview;
  revisionStatus?: JudgmentRevisionStatus;
  revisionError?: string;
  message?: string;
}

export function JudgmentFeedbackForm({
  accountId,
  targetType,
  targetId,
  previousSummary,
  evidenceRefs = [],
  buttonLabel = '反馈/修正',
  helperText = '这条反馈会作为当前客户的修正依据保存，不会影响其他客户或团队规则。',
  compact = false,
  onSubmitted,
}: {
  accountId: string;
  targetType: JudgmentFeedbackTarget;
  targetId: string;
  previousSummary?: string;
  evidenceRefs?: JudgmentEvidenceRef[];
  buttonLabel?: string;
  helperText?: string;
  compact?: boolean;
  onSubmitted?: (result: JudgmentFeedbackSubmissionResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<JudgmentFeedbackKind>('inaccurate');
  const [usefulness, setUsefulness] = useState<JudgmentFeedbackUsefulness>('useful');
  const [actionIntent, setActionIntent] = useState<JudgmentFeedbackActionIntent>('needs_more_evidence');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const selected = KIND_OPTIONS.find((option) => option.value === kind) ?? KIND_OPTIONS[0];

  async function submit() {
    const trimmed = content.trim();
    if (trimmed.length < 2) {
      setError('请先写下要修正或补充的内容。');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSavedMessage(null);
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/judgment-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          targetType,
          targetId,
          kind,
          feedbackType: kind,
          usefulness,
          actionIntent,
          content: trimmed,
          scope: 'account_only',
          previousSummary,
          evidenceRefs,
        }),
      });
      const payload = await response.json().catch(() => ({})) as JudgmentFeedbackSubmissionResult & { error?: string };
      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : `保存失败（${response.status}）`);
      }
      setContent('');
      setOpen(false);
      setSavedMessage(typeof payload.message === 'string' ? payload.message : '已记录为账户修正；将影响当前客户判断，不会影响其他客户或团队规则。');
      window.dispatchEvent(new CustomEvent('closr:judgment-feedback-saved', { detail: { accountId, result: payload } }));
      onSubmitted?.(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen((value) => !value);
            setError(null);
          }}
          className="inline-flex items-center gap-1 rounded-md border border-accent/20 bg-accent/5 px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent/10"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          {buttonLabel}
        </button>
        {savedMessage ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-positive">
            <Check className="h-3 w-3" />
            {savedMessage}
          </span>
        ) : null}
      </div>

      {open ? (
        <div className="rounded-lg border border-accent/15 bg-accent/[0.035] p-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {KIND_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setKind(option.value)}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${kind === option.value ? 'border-accent/30 bg-accent/10 text-accent' : 'border-border bg-card text-secondary hover:bg-background'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-semibold text-secondary">这条判断有用吗？</span>
              <select
                value={usefulness}
                onChange={(event) => setUsefulness(event.target.value as JudgmentFeedbackUsefulness)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground"
              >
                {USEFULNESS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-secondary">你会照它行动吗？</span>
              <select
                value={actionIntent}
                onChange={(event) => setActionIntent(event.target.value as JudgmentFeedbackActionIntent)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground"
              >
                {ACTION_INTENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={selected.placeholder}
            rows={compact ? 3 : 4}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent/40"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] leading-5 text-muted">{helperText}</p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-secondary hover:bg-background"
                disabled={submitting}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting}
                className="inline-flex items-center gap-1 rounded-md border border-accent/20 bg-accent px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                记录修正
              </button>
            </div>
          </div>
          {error ? <p className="text-[11px] text-danger">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
