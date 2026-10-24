'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import type { JudgmentBriefData, JudgmentBriefEvidenceChip, JudgmentBriefTone } from '@/lib/judgment/brief';
import { normalizeBriefConfidence } from '@/lib/judgment/brief';
import type { JudgmentEvidenceRef } from '@/lib/babel-engine/types';
import type { JudgmentFeedbackTarget } from '@/lib/judgment/feedback';
import { JudgmentFeedbackForm } from './judgment-feedback-form';
import { useLocale } from '@/lib/i18n';
import { visibleBusinessText } from '@/lib/visible-business-text';

const CHIP_TONE_CLASS: Record<JudgmentBriefTone, string> = {
  neutral: 'bg-background text-secondary border-border',
  positive: 'bg-positive/10 text-positive border-positive/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  danger: 'bg-danger/10 text-danger border-danger/20',
  accent: 'bg-accent/10 text-accent border-accent/20',
};

const EVIDENCE_STRENGTH_LABELS = {
  strong: '证据强',
  moderate: '证据中',
  thin: '证据薄',
  missing: '缺证据',
} as const;
const EVIDENCE_STRENGTH_LABELS_EN: Record<keyof typeof EVIDENCE_STRENGTH_LABELS, string> = {
  strong: 'Strong evidence',
  moderate: 'Moderate evidence',
  thin: 'Thin evidence',
  missing: 'Missing evidence',
};

const QUALITY_RISK_LABELS = {
  low: '判断稳',
  medium: '需复核',
  high: '高风险',
} as const;
const QUALITY_RISK_LABELS_EN: Record<keyof typeof QUALITY_RISK_LABELS, string> = {
  low: 'Stable judgment',
  medium: 'Needs review',
  high: 'High risk',
};

const FRESHNESS_LABELS = {
  fresh: '新鲜',
  aging: '待更新',
  stale: '已过期',
  unknown: '时间未知',
} as const;
const FRESHNESS_LABELS_EN: Record<keyof typeof FRESHNESS_LABELS, string> = {
  fresh: 'Fresh',
  aging: 'Needs update',
  stale: 'Stale',
  unknown: 'Unknown date',
};

const EVOLUTION_LABELS: Record<NonNullable<JudgmentBriefData['evolution']>['changeType'], string> = {
  improved: '向好',
  declined: '转弱',
  shifted: '转向',
  new: '首次判断',
  unchanged: '维持',
};
const EVOLUTION_LABELS_EN: Record<NonNullable<JudgmentBriefData['evolution']>['changeType'], string> = {
  improved: 'Improved',
  declined: 'Declined',
  shifted: 'Shifted',
  new: 'New judgment',
  unchanged: 'Unchanged',
};

const EVOLUTION_TONE_CLASS: Record<NonNullable<JudgmentBriefData['evolution']>['changeType'], string> = {
  improved: 'border-positive/20 bg-positive/10 text-positive',
  declined: 'border-danger/20 bg-danger/10 text-danger',
  shifted: 'border-accent/20 bg-accent/10 text-accent',
  new: 'border-border bg-card text-secondary',
  unchanged: 'border-border bg-card text-secondary',
};

const QUALITY_TONE_CLASS = {
  positive: 'border-positive/20 bg-positive/10 text-positive',
  warning: 'border-warning/20 bg-warning/10 text-warning',
  danger: 'border-danger/20 bg-danger/10 text-danger',
  neutral: 'border-border bg-card text-secondary',
  accent: 'border-accent/20 bg-accent/10 text-accent',
} as const;

function getConfidenceTone(confidence: number) {
  if (confidence >= 0.7) return 'text-positive';
  if (confidence >= 0.45) return 'text-warning';
  return 'text-danger';
}

function getEvidenceStrengthTone(strength: NonNullable<JudgmentBriefData['quality']>['evidenceStrength']): keyof typeof QUALITY_TONE_CLASS {
  if (strength === 'strong') return 'positive';
  if (strength === 'moderate') return 'accent';
  if (strength === 'thin') return 'warning';
  return 'danger';
}

function getQualityRiskTone(risk: NonNullable<JudgmentBriefData['quality']>['qualityRisk']): keyof typeof QUALITY_TONE_CLASS {
  if (risk === 'high') return 'danger';
  if (risk === 'medium') return 'warning';
  return 'neutral';
}

function getFreshnessTone(freshness: NonNullable<JudgmentBriefData['quality']>['freshness']): keyof typeof QUALITY_TONE_CLASS {
  if (freshness === 'fresh') return 'neutral';
  if (freshness === 'aging' || freshness === 'unknown') return 'warning';
  return 'danger';
}

function formatUpdatedAt(updatedAt: JudgmentBriefData['updatedAt'], en: boolean) {
  if (!updatedAt) return null;
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(en ? 'en-US' : 'zh-CN');
}

function tBrief(en: boolean, zh: string, english: string) {
  return en ? english : zh;
}

function EvidenceChip({ chip }: { chip: JudgmentBriefEvidenceChip }) {
  const toneClass = CHIP_TONE_CLASS[chip.tone ?? 'neutral'];
  const content = (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${toneClass}`} title={chip.description}>
      <span className="truncate">{chip.label}</span>
      {chip.href ? <ExternalLink className="h-3 w-3 shrink-0 opacity-70" /> : null}
    </span>
  );

  if (!chip.href) return content;
  return (
    <Link href={chip.href} className="min-w-0 hover:opacity-80">
      {content}
    </Link>
  );
}

export function JudgmentBrief({
  brief,
  loading = false,
  emptyAction,
  detailsAction,
  feedbackTarget,
}: {
  brief: JudgmentBriefData | null;
  loading?: boolean;
  emptyAction?: { href: string; label: string };
  detailsAction?: { label: string; onClick: () => void };
  feedbackTarget?: {
    accountId: string;
    targetType: JudgmentFeedbackTarget;
    targetId: string;
    previousSummary?: string;
    evidenceRefs?: JudgmentEvidenceRef[];
    buttonLabel?: string;
    helperText?: string;
  };
}) {
  const { locale } = useLocale();
  const en = locale === 'en';
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [evolutionOpen, setEvolutionOpen] = useState(true);

  if (loading && !brief) {
    return (
      <div className="rounded-xl border border-accent/20 bg-accent/[0.04] p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-accent">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tBrief(en, '正在形成当前判断...', 'Building the current judgment...')}
        </div>
        <p className="mt-2 text-xs text-muted">{tBrief(en, '加载完成后这里只保留当前判断、最大风险和下一步动作。', 'Once loaded, this keeps only the current judgment, biggest risk, and next action.')}</p>
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-muted/40 p-2 text-secondary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{tBrief(en, '暂无足够证据形成稳定判断', 'Not enough evidence for a stable judgment yet')}</p>
            <p className="mt-1 text-xs text-muted">{tBrief(en, '先沉淀一次客户沟通，系统会自动把信号转成底层判断。', 'Capture one customer interaction first; the system will turn signals into the underlying judgment.')}</p>
            {emptyAction ? (
              <Link href={emptyAction.href} className="mt-3 inline-flex rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background">
                {emptyAction.label}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const confidence = normalizeBriefConfidence(brief.confidence);
  const updatedAt = formatUpdatedAt(brief.updatedAt, en);
  const evidenceChips = (brief.evidenceChips ?? [])
    .map((chip) => ({ ...chip, label: chip.label?.trim() || chip.description?.trim() || '' }))
    .filter((chip) => chip.label.length > 0)
    .slice(0, 4);
  const quality = brief.quality;
  const qualityFlags = (quality?.flags ?? []).filter(Boolean).slice(0, 4);
  const evolution = brief.evolution;
  const evolutionSignals = (evolution?.changedSignals ?? []).filter(Boolean).slice(0, 3);

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/[0.035] p-4 sm:p-5 space-y-4">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-accent">{visibleBusinessText(brief.contextLabel ?? tBrief(en, '判断摘要', 'Judgment Summary'), locale)}</p>
        <h3 className="mt-1 text-base font-semibold text-foreground">{tBrief(en, '结论与证据', 'Conclusion & Evidence')}</h3>
      </div>

      <div className="space-y-3">
        <section className="rounded-xl border border-accent/15 bg-card px-4 py-4">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-accent">{tBrief(en, '现在该怎么判断', 'Current Judgment')}</p>
          <p className="mt-2 text-base font-semibold leading-7 text-foreground">{visibleBusinessText(brief.currentJudgment, locale)}</p>
        </section>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="rounded-xl border border-danger/15 bg-danger/[0.035] px-4 py-4">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-danger">{tBrief(en, '最大风险是什么', 'Biggest Risk')}</p>
            <p className="mt-2 text-sm font-medium leading-6 text-foreground">{visibleBusinessText(brief.biggestRisk, locale)}</p>
          </section>
          <section className="rounded-xl border border-warning/20 bg-warning/[0.04] px-4 py-4">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-warning">{tBrief(en, '下一步做什么', 'Next Action')}</p>
            <p className="mt-2 text-sm font-medium leading-6 text-foreground">{visibleBusinessText(brief.nextAction, locale)}</p>
          </section>
        </div>
      </div>

      {evolution ? (
        <div className="rounded-xl border border-border bg-card/80">
          <button
            type="button"
            onClick={() => setEvolutionOpen((value) => !value)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{tBrief(en, '为什么判断变了', 'Why the judgment changed')}</p>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${EVOLUTION_TONE_CLASS[evolution.changeType]}`}>
                  {en ? EVOLUTION_LABELS_EN[evolution.changeType] : EVOLUTION_LABELS[evolution.changeType]}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">{visibleBusinessText(evolution.summary, locale)}</p>
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 text-secondary transition-transform ${evolutionOpen ? 'rotate-180' : ''}`} />
          </button>

          {evolutionOpen ? (
            <div className="space-y-3 border-t border-border px-4 py-3">
              <div className="rounded-lg border border-accent/10 bg-accent/5 px-3 py-3">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-accent">{tBrief(en, '变化原因', 'Reason for Change')}</p>
                <p className="mt-1 text-sm leading-6 text-foreground">{visibleBusinessText(evolution.whyChanged, locale)}</p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-background px-3 py-2.5">
                  <p className="text-[10px] tracking-wide text-muted">{tBrief(en, '之前怎么判断', 'Previous Judgment')}</p>
                  <p className="mt-1 text-xs leading-5 text-foreground">{visibleBusinessText(evolution.previousJudgment ?? tBrief(en, '首次形成判断，暂无上一版。', 'First judgment; no previous version.'), locale)}</p>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2.5">
                  <p className="text-[10px] tracking-wide text-muted">{tBrief(en, '现在怎么判断', 'Current Judgment')}</p>
                  <p className="mt-1 text-xs leading-5 text-foreground">{visibleBusinessText(evolution.currentJudgment, locale)}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {feedbackTarget ? (
          <JudgmentFeedbackForm
            accountId={feedbackTarget.accountId}
            targetType={feedbackTarget.targetType}
            targetId={feedbackTarget.targetId}
            previousSummary={feedbackTarget.previousSummary ?? brief.currentJudgment}
            evidenceRefs={feedbackTarget.evidenceRefs}
            buttonLabel={feedbackTarget.buttonLabel ?? tBrief(en, "反馈/修正这个判断", "Feedback / Correct Judgment")}
            helperText={feedbackTarget.helperText}
            compact
          />
        ) : null}
        {detailsAction ? (
          <button
            type="button"
            onClick={detailsAction.onClick}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20"
          >
            {detailsAction.label}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setDetailsOpen((value) => !value)}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-secondary hover:bg-muted/20 hover:text-foreground"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
          {detailsOpen ? tBrief(en, '收起系统细节', 'Hide system details') : tBrief(en, '查看系统细节', 'View system details')}
        </button>
      </div>

      {detailsOpen ? (
        <div className="space-y-3 rounded-xl border border-border bg-card/80 p-4">
          <div className="flex flex-wrap gap-2 text-[11px] text-secondary">
            {brief.statusLabel ? <span className="rounded-md border border-border bg-background px-2 py-1">{brief.statusLabel}</span> : null}
            {confidence != null ? <span className={`rounded-md border border-border bg-background px-2 py-1 ${getConfidenceTone(confidence)}`}>{tBrief(en, '置信度', 'Confidence')} {Math.round(confidence * 100)}%</span> : null}
            {updatedAt ? <span className="rounded-md border border-border bg-background px-2 py-1 text-muted">{tBrief(en, '更新', 'Updated')} {updatedAt}</span> : null}
            {quality?.evidenceStrength ? <span className={`rounded-md border px-2 py-1 ${QUALITY_TONE_CLASS[getEvidenceStrengthTone(quality.evidenceStrength)]}`}>{en ? EVIDENCE_STRENGTH_LABELS_EN[quality.evidenceStrength] : EVIDENCE_STRENGTH_LABELS[quality.evidenceStrength]}</span> : null}
            {quality?.qualityRisk ? <span className={`rounded-md border px-2 py-1 ${QUALITY_TONE_CLASS[getQualityRiskTone(quality.qualityRisk)]}`}>{en ? QUALITY_RISK_LABELS_EN[quality.qualityRisk] : QUALITY_RISK_LABELS[quality.qualityRisk]}</span> : null}
            {quality?.freshness ? <span className={`rounded-md border px-2 py-1 ${QUALITY_TONE_CLASS[getFreshnessTone(quality.freshness)]}`}>{en ? FRESHNESS_LABELS_EN[quality.freshness] : FRESHNESS_LABELS[quality.freshness]}</span> : null}
          </div>

          {qualityFlags.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {qualityFlags.map((flag, index) => (
                <div key={`${flag.label}-${index}`} className={`rounded-lg border px-3 py-2 text-xs ${QUALITY_TONE_CLASS[flag.tone ?? 'warning']}`}>
                  <p className="font-medium">{visibleBusinessText(flag.label, locale)}</p>
                  {flag.detail ? <p className="mt-0.5 leading-5 opacity-85">{visibleBusinessText(flag.detail, locale)}</p> : null}
                </div>
              ))}
            </div>
          ) : null}

          {evolutionSignals.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-secondary">{tBrief(en, '变化信号', 'Changed Signals')}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {evolutionSignals.map((signal, index) => (
                  <span key={`${signal}-${index}`} className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-secondary">{visibleBusinessText(signal, locale)}</span>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-secondary">{tBrief(en, '证据索引', 'Evidence Index')}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {evidenceChips.length > 0 ? evidenceChips.map((chip, index) => (
                <EvidenceChip key={`${chip.sourceLabel ?? 'evidence'}:${chip.label}:${index}`} chip={chip} />
              )) : (
                <p className="rounded-md border border-border bg-background px-2.5 py-2 text-xs text-muted">{tBrief(en, '暂无可跳转证据索引。', 'No linked evidence index yet.')}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

}
