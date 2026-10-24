'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, History, MessageSquarePlus, ShieldCheck, Sparkles } from 'lucide-react';
import { JudgmentFeedbackForm } from '@/components/judgment/judgment-feedback-form';
import type { Judgment } from '@/lib/babel-engine/types';
import { buildJudgmentActionPanelModel, type JudgmentActionPanelChangeTone, type JudgmentActionPanelEvidenceTone } from '@/lib/judgment/action-panel';
import type { RoleBasedJudgmentView } from '@/lib/judgment/role-view';
import type { JudgmentFeedbackRevisionRecord } from '@/lib/judgment/feedback';
import type { AccountMomentumSnapshot } from '@/lib/judgment/momentum';
import type { JudgmentMemorySourceItem } from '@/lib/judgment/memory-sources';
import type { JudgmentTimelineItem } from '@/lib/judgment/timeline';
import type { WinLossCalibrationItem } from '@/lib/judgment/win-loss-calibration';
import { visibleBusinessText } from '@/lib/visible-business-text';

interface JudgmentActionPanelProps {
  accountId: string;
  judgments: Judgment[];
  loading?: boolean;
  accountMomentum?: AccountMomentumSnapshot | null;
  judgmentMemories?: JudgmentMemorySourceItem[];
  feedbackRevisionRecords?: JudgmentFeedbackRevisionRecord[];
  winLossCalibrations?: WinLossCalibrationItem[];
  judgmentTimeline?: JudgmentTimelineItem[];
  roleView?: RoleBasedJudgmentView | null;
  primaryOpportunityId?: string;
  onOpenFullBoard?: () => void;
  onOpenActivity?: () => void;
}

const EVIDENCE_TONE_CLASS: Record<JudgmentActionPanelEvidenceTone, string> = {
  strong: 'border-positive/25 bg-positive/10 text-positive',
  partial: 'border-warning/30 bg-warning/10 text-warning',
  thin: 'border-border bg-muted/30 text-secondary',
};

const CHANGE_TONE_CLASS: Record<JudgmentActionPanelChangeTone, string> = {
  neutral: 'border-border bg-background text-secondary',
  accent: 'border-accent/25 bg-accent/10 text-accent',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  positive: 'border-positive/25 bg-positive/10 text-positive',
};

function formatDateTime(value?: string) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return new Date(time).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function LoadingPanel() {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 animate-pulse rounded-xl bg-muted" />
        <div className="space-y-2">
          <div className="h-3 w-28 animate-pulse rounded bg-muted" />
          <div className="h-4 w-56 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-muted/60" />)}
      </div>
    </section>
  );
}

export function JudgmentActionPanel({
  accountId,
  judgments,
  loading = false,
  accountMomentum = null,
  judgmentMemories = [],
  feedbackRevisionRecords = [],
  winLossCalibrations = [],
  judgmentTimeline = [],
  roleView = null,
  primaryOpportunityId,
  onOpenFullBoard,
  onOpenActivity,
}: JudgmentActionPanelProps) {
  const model = useMemo(() => buildJudgmentActionPanelModel({
    judgments,
    accountMomentum,
    judgmentMemories,
    feedbackRevisionRecords,
    winLossCalibrations,
    judgmentTimeline,
  }), [accountMomentum, feedbackRevisionRecords, judgmentMemories, judgmentTimeline, judgments, winLossCalibrations]);
  const updatedAt = formatDateTime(model.evidence.updatedAt);
  const hasCalibrationRecords = model.calibration.feedbackCount > 0 || model.calibration.winLossCount > 0;
  const headerEyebrow = roleView?.header.eyebrow ?? '局势判断面板';
  const headerTitle = roleView?.header.title ?? '当前局势、关键张力、下一步打法';
  const currentJudgmentLabel = roleView?.emphasis.currentJudgmentLabel ?? '当前局势判断';
  const keyRiskLabel = roleView?.emphasis.keyRiskLabel ?? '关键张力 / 风险';
  const nextActionLabel = roleView?.emphasis.nextActionLabel ?? '下一步打法';
  const primaryFocus = roleView?.primaryFocus;

  if (loading) return <LoadingPanel />;

  return (
    <section className="overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/[0.08] via-card to-card shadow-sm">
      <div className="border-b border-border/80 bg-card/70 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{visibleBusinessText(headerEyebrow)}</p>
              <h2 className="mt-1 text-base font-semibold text-foreground">{visibleBusinessText(headerTitle)}</h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium ${EVIDENCE_TONE_CLASS[model.evidence.tone]}`}>
              <ShieldCheck className="h-3.5 w-3.5" />
              {visibleBusinessText(model.evidence.label)}
            </span>
            {updatedAt ? <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-muted"><Clock className="h-3.5 w-3.5" />{updatedAt}</span> : null}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {primaryFocus && !model.empty ? (
          <div className="rounded-xl border border-accent/20 bg-accent/[0.06] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{visibleBusinessText(primaryFocus.label)}</p>
            <p className="mt-1 text-sm leading-6 text-foreground">{visibleBusinessText(primaryFocus.text)}</p>
          </div>
        ) : null}
        {model.empty ? (
          <div className="rounded-xl border border-dashed border-border bg-card/80 p-4">
            <p className="text-sm font-semibold text-foreground">还缺少足够的客户信号。</p>
            <p className="mt-1 text-sm leading-6 text-secondary">先补一次关键邮件、会议纪要或客户互动；面板会自动生成当前判断、风险和下一步动作。</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/decode?accountId=${encodeURIComponent(accountId)}`} className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover">
                用沟通解读补一条信号
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              {onOpenActivity ? (
                <button type="button" onClick={onOpenActivity} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-secondary hover:text-foreground">
                  查看客户动态
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-xl border border-border bg-card/90 p-4">
                <p className="text-[11px] font-semibold text-secondary uppercase tracking-[0.14em]">{visibleBusinessText(currentJudgmentLabel)}</p>
                <p className="mt-2 text-sm leading-6 text-foreground">{visibleBusinessText(model.currentJudgment)}</p>
              </div>
              <div className="rounded-xl border border-warning/25 bg-warning/[0.045] p-4">
                <div className="flex items-center gap-1.5 text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">{visibleBusinessText(keyRiskLabel)}</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-foreground">{visibleBusinessText(model.keyRisk)}</p>
              </div>
              <div className="rounded-xl border border-positive/20 bg-positive/[0.045] p-4">
                <div className="flex items-center gap-1.5 text-positive">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">{visibleBusinessText(nextActionLabel)}</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-foreground">{visibleBusinessText(model.nextAction)}</p>
              </div>
            </div>
            {roleView?.suggestedActions.length ? (
              <div className="rounded-xl border border-border bg-card/80 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">建议动作 · {visibleBusinessText(roleView.roleLabel)}</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {roleView.suggestedActions.slice(0, 2).map((action) => (
                    <div key={action.id} className="rounded-lg border border-border bg-background/60 p-3">
                      <p className="text-xs font-medium leading-5 text-foreground">{visibleBusinessText(action.text)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
          <div className="rounded-xl border border-border bg-card/90 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-accent" />
                  <p className="text-xs font-semibold text-secondary uppercase tracking-wide">最近判断变化</p>
                </div>
              </div>
              {onOpenFullBoard ? (
                <button type="button" onClick={onOpenFullBoard} className="shrink-0 rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-secondary hover:text-foreground">
                  查看完整证据
                </button>
              ) : null}
            </div>
            <div className="mt-3 space-y-2">
              {model.recentChanges.length === 0 ? (
                <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted">暂无人工修正或成交复盘；有新反馈后会显示在这里。</p>
              ) : model.recentChanges.map((item) => (
                <div key={item.id} className="rounded-lg border border-border bg-background/60 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className={`rounded-full border px-2 py-0.5 font-medium ${CHANGE_TONE_CLASS[item.tone]}`}>{visibleBusinessText(item.label)}</span>
                    <span className="text-muted">{formatDateTime(item.occurredAt) ?? '时间待确认'}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-secondary">{visibleBusinessText(item.summary)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card/90 p-4">
              <p className="text-xs font-semibold text-secondary uppercase tracking-wide">证据可信度</p>
              <p className="mt-2 text-sm leading-6 text-foreground">{visibleBusinessText(model.evidence.description)}</p>
              {model.evidence.sourceLabels.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {model.evidence.sourceLabels.map((label) => (
                    <span key={label} className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-secondary">{visibleBusinessText(label)}</span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-border bg-card/90 p-4">
              <div className="flex items-start gap-2">
                <MessageSquarePlus className="mt-0.5 h-4 w-4 text-accent" />
                <div>
                  <p className="text-xs font-semibold text-secondary uppercase tracking-wide">校准入口</p>
                  <p className="mt-1 text-xs leading-5 text-muted">判断不准就直接修正；结果已确认就查看/分析商机复盘。</p>
                </div>
              </div>

              <div className="mt-3 space-y-3">
                <JudgmentFeedbackForm
                  accountId={accountId}
                  targetType="judgment"
                  targetId="judgment-action-panel"
                  previousSummary={visibleBusinessText(model.currentJudgment)}
                  evidenceRefs={model.feedbackEvidenceRefs}
                  buttonLabel="反馈/修正当前判断"
                  helperText="这条反馈只用于校准当前客户的判断依据，不会影响其他客户。"
                  compact
                />

                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-xs leading-5 text-secondary">
                    {hasCalibrationRecords ? visibleBusinessText(model.calibration.loopSummary) : '暂无人工修正或成交复盘；有新反馈后会显示在这里。'}
                  </p>
                  {model.calibration.feedbackCategoryLabels.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {model.calibration.feedbackCategoryLabels.map((label) => (
                        <span key={label} className="rounded-md border border-accent/20 bg-accent/5 px-2 py-0.5 text-[11px] text-accent">{label}</span>
                      ))}
                    </div>
                  ) : null}
                  {(model.calibration.latestFeedback || model.calibration.latestWinLoss) ? (
                    <p className="mt-2 text-[11px] leading-5 text-muted">
                      {model.calibration.latestFeedback ? `最近修正：${visibleBusinessText(model.calibration.latestFeedback)} ` : ''}
                      {model.calibration.latestWinLoss ? `最近复盘：${visibleBusinessText(model.calibration.latestWinLoss)}` : ''}
                    </p>
                  ) : null}
                  {primaryOpportunityId ? (
                    <Link href={`/pipeline/${encodeURIComponent(primaryOpportunityId)}`} className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline">
                      查看/分析商机复盘
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  ) : (
                    <p className="mt-2 text-[11px] text-muted">暂无可跳转商机；有成交结果后可在对应商机里查看复盘。</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
