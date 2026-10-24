'use client';

import { useEffect, useMemo, useState, useCallback, type FormEvent } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, ExternalLink, Loader2, RefreshCw, ShieldAlert, TrendingUp, X, Clock } from 'lucide-react';
import { EvidenceTrace, SOURCE_KIND_LABEL, buildEvidenceHref } from '@/components/judgment/evidence-trace';
import { JudgmentFeedbackForm } from '@/components/judgment/judgment-feedback-form';
import type { JudgmentFeedbackRevisionRecord } from '@/lib/judgment/feedback';
import type { WinLossCalibrationItem } from '@/lib/judgment/win-loss-calibration';
import type { JudgmentTimelineItem } from '@/lib/judgment/timeline';
import type { InterventionImpact, InterventionOutcome, InterventionOutcomeItem, JudgmentLearningSummary } from '@/lib/judgment/intervention-learning';
import type { AccountMemoryConflict, AccountMemorySummary, AccountTimelineItem, MomentumShift } from '@/lib/babel-engine/types';
import { buildAccountTimelineInterpretationItems, type AccountTimelineInterpretationItem } from '@/lib/judgment/account-timeline-interpretation';
import { buildAccountVerificationSignals, type AccountVerificationSignal } from '@/lib/judgment/contradiction-signals';
import { buildJudgmentMemorySourceHref, JUDGMENT_MEMORY_SOURCE_LABELS, type JudgmentMemorySourceItem } from '@/lib/judgment/memory-sources';
import type { DecodeStabilityTimelineItem } from '@/lib/judgment/decode-stability';
import type { StakeholderInterpretation } from '@/lib/judgment/stakeholder';
import type { AccountOpenQuestion } from '@/lib/judgment/open-questions';

interface Props {
  accountId: string;
  comparisonWindow?: number;
  /** When provided, skip internal fetch and use parent-supplied data */
  preloadedSummary?: AccountMemorySummary | null;
  preloadedTimeline?: AccountTimelineItem[];
  preloadedConflicts?: AccountMemoryConflict[];
  preloadedMomentumShift?: MomentumShift | null;
  preloadedJudgmentMemories?: JudgmentMemorySourceItem[];
  preloadedStakeholderInterpretations?: StakeholderInterpretation[];
  preloadedOpenQuestions?: AccountOpenQuestion[];
  preloadedFeedbackRevisionRecords?: JudgmentFeedbackRevisionRecord[];
  preloadedWinLossCalibrations?: WinLossCalibrationItem[];
  preloadedInterventionOutcomes?: InterventionOutcomeItem[];
  preloadedJudgmentLearning?: JudgmentLearningSummary | null;
  preloadedJudgmentTimeline?: JudgmentTimelineItem[];
  preloadedDecodeStabilityTimeline?: DecodeStabilityTimelineItem[];
}

const STANCE_LABEL: Record<string, string> = {
  supportive: '支持',
  blocking: '阻碍',
  resistant: '阻力',
  mixed: '立场摇摆',
  unknown: '未知',
  neutral: '中立',
  unclear: '不明',
};

const STAKEHOLDER_ROLE_LABEL: Record<StakeholderInterpretation['role'], string> = {
  champion: '内部推动者',
  blocker: '阻力点',
  evaluator: '评估者',
  decision_maker: '决策者',
  sponsor: 'Sponsor',
  unknown: '待确认',
};

const RELATIONSHIP_DISTANCE_LABEL: Record<StakeholderInterpretation['relationshipDistance'], string> = {
  close: '近',
  warm: '暖',
  distant: '远',
  unknown: '未知',
};

const SEVERITY_STYLE: Record<string, string> = {
  high: 'border-danger/30 bg-danger/10 text-danger',
  medium: 'border-warning/30 bg-warning/10 text-warning',
  low: 'border-secondary/30 bg-secondary/10 text-secondary',
};

const SEVERITY_LABEL: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

function CalibrationEmptyState({
  title,
  description,
  actionHint,
}: {
  title: string;
  description: string;
  actionHint: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/60 px-3 py-4 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-muted">{description}</p>
      <p className="mt-2 text-[11px] font-medium text-secondary">{actionHint}</p>
    </div>
  );
}

function buildJudgmentTraceSources(item: JudgmentMemorySourceItem) {
  return [
    {
      sourceId: item.sourceRecordId,
      sourceKind: 'source_record' as const,
      title: item.title,
      sourceTable: item.sourceTable,
      sourceRowId: item.sourceRowId ?? item.sourceRecordId,
    },
    ...item.evidenceRefs,
  ];
}

function sourceKindLabel(kind?: string | null): string | null {
  if (!kind) return null;
  return SOURCE_KIND_LABEL[kind as keyof typeof SOURCE_KIND_LABEL] ?? JUDGMENT_MEMORY_SOURCE_LABELS[kind as keyof typeof JUDGMENT_MEMORY_SOURCE_LABELS] ?? '记录';
}

function timelineStatusLabel(status?: string | null): string | null {
  if (!status) return null;
  const labels: Record<string, string> = {
    ready: '已生成修订预览',
    pending: '等待修订预览',
    failed: '修订预览失败',
    applied: '已应用',
    active: '已记录',
    dismissed: '已忽略',
  };
  return labels[status] ?? null;
}

function RecentWinLossCalibrationPanel({ items }: { items: WinLossCalibrationItem[] }) {
  const visibleItems = items.slice(0, 3);
  const outcomeLabel: Record<WinLossCalibrationItem['outcome'], string> = {
    won: '赢单',
    lost: '丢单',
    stalled: '停滞',
    unknown: '未知',
  };

  return (
    <div className="rounded-xl border border-positive/20 bg-positive/[0.035] p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-positive uppercase tracking-[0.14em]">成交/丢单后的判断校准</p>
          <p className="mt-1 text-[11px] text-muted">最近成交、丢单或停滞记录会作为当前账户判断的校准依据。</p>
        </div>
        {visibleItems.length > 0 ? <span className="rounded-full border border-positive/20 bg-card px-2 py-0.5 text-[11px] text-positive">{visibleItems.length} 条</span> : null}
      </div>
      <div className="mt-3 space-y-2">
        {visibleItems.length === 0 ? (
          <CalibrationEmptyState
            title="还没有成交复盘校准历史"
            description="这不是加载失败：当前账户还没有成交、丢单或停滞结果回流。只有记录真实结果后，系统才会把判断偏差沉淀为校准依据。"
            actionHint="在商机复盘入口记录一次结果，用它校准当前判断。"
          />
        ) : visibleItems.map((item) => (
          <div key={item.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="rounded-md border border-positive/20 bg-positive/5 px-1.5 py-0.5 font-medium text-positive">{outcomeLabel[item.outcome]}</span>
              {item.opportunityId ? <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-secondary">商机 {item.opportunityId}</span> : null}
              <span className="ml-auto text-muted">{new Date(item.outcomeAt).toLocaleString('zh-CN')}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-foreground">{item.notes}</p>
            {(item.validatedSignals.length > 0 || item.disprovenSignals.length > 0) ? (
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div className="rounded-md border border-positive/20 bg-positive/5 px-3 py-2">
                  <p className="text-[11px] font-semibold text-positive">被结果验证的信号</p>
                  {item.validatedSignals.length > 0 ? (
                    <ul className="mt-1 space-y-1 text-xs leading-5 text-secondary">
                      {item.validatedSignals.slice(0, 4).map((signal, index) => <li key={`${item.id}-validated-${index}`}>• {signal}</li>)}
                    </ul>
                  ) : <p className="mt-1 text-xs text-muted">暂无明确验证信号。</p>}
                </div>
                <div className="rounded-md border border-warning/25 bg-warning/5 px-3 py-2">
                  <p className="text-[11px] font-semibold text-warning">噪音 / 误判信号</p>
                  {item.disprovenSignals.length > 0 ? (
                    <ul className="mt-1 space-y-1 text-xs leading-5 text-secondary">
                      {item.disprovenSignals.slice(0, 4).map((signal, index) => <li key={`${item.id}-disproven-${index}`}>• {signal}</li>)}
                    </ul>
                  ) : <p className="mt-1 text-xs text-muted">暂无明确误判信号。</p>}
                </div>
              </div>
            ) : null}
            {item.lessons.length > 0 ? (
              <ul className="mt-2 space-y-1 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs leading-5 text-secondary">
                {item.lessons.slice(0, 3).map((lesson, index) => <li key={`${item.id}-lesson-${index}`}>• {lesson}</li>)}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function CalibrationLoopBanner({ feedbackCount, winLossCount }: { feedbackCount: number; winLossCount: number }) {
  const active = feedbackCount + winLossCount > 0;
  return (
    <div className="rounded-xl border border-accent/15 bg-card p-4">
      <p className="text-[11px] font-semibold text-accent uppercase tracking-[0.14em]">校准闭环</p>
      <p className="mt-2 text-sm leading-6 text-foreground">
        {active
          ? `已形成闭环：${feedbackCount} 条人工反馈 / ${winLossCount} 条成交复盘 → 回写账户判断记忆 → 后续客户判断、模式识别、组合信号会把这些记录当作校准证据。`
          : '闭环尚未启动：先标记一次判断准确/不准，或记录一次成交/丢单结果，系统才知道哪些判断值得信任、哪些是噪音。'}
      </p>
    </div>
  );
}

function RecentFeedbackPanel({ items }: { items: JudgmentFeedbackRevisionRecord[] }) {
  const visibleItems = items.slice(0, 5);
  const kindLabel = {
    accurate: '判断准确',
    inaccurate: '判断不准',
    over_optimistic: '过度乐观',
    missed_risk: '漏看风险',
    missing_evidence: '缺证据',
    over_inferred: '过度推断',
    stale: '已过期',
  } as const;
  const targetLabel = {
    account_momentum: '动量',
    stakeholder: '干系人',
    open_question: '待验证问题',
    judgment: '综合判断',
    rfp: 'RFP',
    decode: 'Decode',
    strategic_play: '谋局',
    unknown: '未知目标',
  } as const;
  const scopeLabel = {
    account_only: '仅当前客户',
    session_only: '仅本次会话',
    candidate_global_rule: '候选团队规则',
  } as const;
  const revisionStatusLabel = {
    ready: '修订预览已生成',
    pending: '修订预览生成中',
    failed: '修订预览失败',
  } as const;

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/[0.035] p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-accent uppercase tracking-[0.14em]">最近人工反馈 / 修订记录</p>
          <p className="mt-1 text-[11px] text-muted">原始反馈会保留；系统会显示是否已生成修订预览。</p>
        </div>
        {visibleItems.length > 0 ? <span className="rounded-full border border-accent/20 bg-card px-2 py-0.5 text-[11px] text-accent">{visibleItems.length} 条</span> : null}
      </div>
      <div className="mt-3 space-y-2">
        {visibleItems.length === 0 ? (
          <p className="text-xs text-muted">暂无人工反馈记录。</p>
        ) : visibleItems.map((record) => (
          <div key={record.feedback.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="rounded-md border border-accent/20 bg-accent/5 px-1.5 py-0.5 font-medium text-accent">{kindLabel[record.feedback.kind]}</span>
              <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-secondary">{targetLabel[record.feedback.targetType]}</span>
              <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-secondary">{scopeLabel[record.feedback.scope]}</span>
              <span className={record.revisionStatus === 'failed' ? 'text-danger' : record.revisionStatus === 'ready' ? 'text-positive' : 'text-warning'}>{revisionStatusLabel[record.revisionStatus]}</span>
              <span className="ml-auto text-muted">{new Date(record.feedback.createdAt).toLocaleString('zh-CN')}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-foreground">{record.feedback.content}</p>
            {record.revisedPreview ? (
              <p className="mt-2 rounded-md border border-border bg-muted/20 px-2.5 py-2 text-xs leading-5 text-secondary">修订预览：{record.revisedPreview.revisedSummary}</p>
            ) : record.revisionError ? (
              <p className="mt-2 text-xs text-danger">修订预览失败：{record.revisionError}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function DecodeStabilityTimelinePanel({ accountId, items }: { accountId: string; items: DecodeStabilityTimelineItem[] }) {
  const visibleItems = items.slice(0, 5);
  const statusClass: Record<DecodeStabilityTimelineItem['status'], string> = {
    same: 'border-positive/20 bg-positive/5 text-positive',
    changed: 'border-border bg-background text-secondary',
    unstable: 'border-warning/30 bg-warning/10 text-warning',
    context_changed: 'border-accent/20 bg-accent/5 text-accent',
  };

  return (
    <div className="rounded-xl border border-border bg-muted/10 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-secondary uppercase tracking-[0.14em]">最近判断稳定性</p>
          <p className="mt-1 text-[11px] text-muted">展示最近 Decode 是否在相同背景下保持一致；不稳定或低置信度时可直接修正。</p>
        </div>
        {visibleItems.length > 0 ? <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-secondary">{visibleItems.length} 条</span> : null}
      </div>
      <div className="mt-3 space-y-2">
        {visibleItems.length === 0 ? (
          <p className="text-xs text-muted">暂无可复盘的 Decode 判断稳定性记录。新解读保存后会自动出现在这里。</p>
        ) : visibleItems.map((item) => (
          <div key={item.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className={`rounded-md border px-1.5 py-0.5 font-medium ${statusClass[item.status]}`}>{item.statusLabel}</span>
              <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-muted">置信度 {item.confidence === null ? '未知' : `${Math.round(item.confidence * 100)}%`}</span>
              <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-muted">{item.hasSnapshot ? '依据可复盘' : '依据不完整'}</span>
              <span className="ml-auto inline-flex items-center gap-1 text-muted"><Clock className="h-3 w-3" />{new Date(item.occurredAt).toLocaleString('zh-CN')}</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-foreground">{item.title}</p>
            <p className="mt-1 text-xs leading-5 text-secondary">{item.inputSummary}</p>
            {item.changedFieldLabels.length > 0 ? (
              <p className="mt-2 text-[11px] leading-5 text-muted">变化项：{item.changedFieldLabels.slice(0, 4).join('、')}</p>
            ) : null}
            {item.correctionCta.visible ? (
              <div className="mt-3 rounded-lg border border-warning/20 bg-warning/5 p-3">
                <p className="mb-2 text-xs leading-5 text-warning">{item.correctionCta.reason}</p>
                <JudgmentFeedbackForm
                  accountId={accountId}
                  targetType="decode"
                  targetId={item.correctionCta.targetId}
                  previousSummary={item.correctionCta.previousSummary ?? item.currentJudgment}
                  evidenceRefs={[
                    {
                      sourceId: item.sourceRecordId,
                      sourceKind: 'source_record',
                      title: `${item.title} · 判断记忆`,
                      sourceTable: 'source_records',
                      sourceRowId: item.sourceRecordId,
                    },
                    {
                      sourceId: item.sourceId,
                      sourceKind: 'email_decode',
                      title: item.title,
                      sourceTable: 'email_decodes',
                      sourceRowId: item.sourceId,
                    },
                  ]}
                  buttonLabel={item.correctionCta.buttonLabel}
                  helperText={item.correctionCta.helperText}
                  compact
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

const INTERVENTION_OUTCOME_LABEL: Record<InterventionOutcome, string> = {
  effective: '有效',
  ineffective: '无效',
  delayed_effective: '延迟有效',
  inconclusive: '证据不足',
};

const INTERVENTION_IMPACT_LABEL: Record<InterventionImpact, string> = {
  deal_progressed: '交易推进',
  risk_reduced: '风险降低',
  evidence_improved: '证据改善',
  stakeholder_shifted: '关键人变化',
  no_change: '暂无变化',
  worsened: '情况恶化',
};

function InterventionOutcomeInlineForm({ item, onSaved }: { item: JudgmentTimelineItem; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<InterventionOutcome>('effective');
  const [impact, setImpact] = useState<InterventionImpact>('deal_progressed');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sourceRecordId = typeof item.meta?.sourceRecordId === 'string' ? item.meta.sourceRecordId : item.sourceRowId;
  const opportunityId = typeof item.meta?.opportunityId === 'string' ? item.meta.opportunityId : undefined;
  const role = typeof item.meta?.role === 'string' ? item.meta.role : undefined;

  async function submitOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sourceRecordId || !item.sourceId) {
      setError('缺少原介入 source_record，无法追踪学习结论');
      return;
    }
    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(item.accountId)}/intervention-outcomes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: item.accountId,
          opportunityId,
          interventionId: item.sourceId,
          sourceRecordId,
          role,
          reason: item.signal,
          outcome,
          impact,
          confidence: 0.7,
          outcomeNote: note,
          learningSummary: note ? `介入结果：${note}` : undefined,
          evidenceRefs: item.evidenceRefs ?? [],
        }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || '介入结果保存失败');
      setMessage(payload.message || '介入结果已记录');
      setNote('');
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : '介入结果保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { setOpen(true); setError(null); setMessage(null); }}
          className="rounded-md border border-purple-500/20 bg-purple-500/5 px-2.5 py-1 text-[11px] font-medium text-purple-600 hover:border-purple-500/40"
        >
          记录结果/学习
        </button>
        {message ? <span className="text-[11px] text-positive">{message}</span> : null}
        {error ? <span className="text-[11px] text-danger">{error}</span> : null}
      </div>
    );
  }

  return (
    <form onSubmit={submitOutcome} className="mt-3 space-y-2 rounded-lg border border-purple-500/20 bg-purple-500/[0.035] p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-[11px] text-secondary">
          结果
          <select value={outcome} onChange={(event) => setOutcome(event.target.value as InterventionOutcome)} className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground outline-none focus:border-accent">
            {Object.entries(INTERVENTION_OUTCOME_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-[11px] text-secondary">
          影响
          <select value={impact} onChange={(event) => setImpact(event.target.value as InterventionImpact)} className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground outline-none focus:border-accent">
            {Object.entries(INTERVENTION_IMPACT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        required
        minLength={2}
        placeholder="后来发生了什么？哪些证据说明这次介入有效、无效或还无法判断？"
        className="min-h-16 w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-accent"
      />
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="px-2 py-1 text-[11px] text-muted hover:text-foreground">取消</button>
        <button type="submit" disabled={submitting} className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground disabled:opacity-60">
          {submitting ? '保存中' : '保存学习'}
        </button>
      </div>
      {error ? <p className="text-[11px] text-danger">{error}</p> : null}
    </form>
  );
}

function JudgmentLearningPanel({ summary, outcomeCount }: { summary: JudgmentLearningSummary | null; outcomeCount: number }) {
  const recent = summary?.recentLearnings ?? [];
  return (
    <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.035] p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-purple-600 uppercase tracking-[0.14em]">最近介入学习</p>
          <p className="mt-1 text-[11px] text-muted">记录哪些判断/介入后来被证明有效、无效或证据不足；只作为账户级校准证据。</p>
        </div>
        {outcomeCount > 0 ? <span className="rounded-full border border-purple-500/20 bg-card px-2 py-0.5 text-[11px] text-purple-600">{outcomeCount} 条</span> : null}
      </div>
      <div className="mt-3 space-y-2">
        {recent.length === 0 ? (
          <CalibrationEmptyState
            title="还没有介入结果回流"
            description="当前还没有可用的介入结果样本，所以系统不能判断哪些介入有效、无效或只是证据不足。"
            actionHint="在下方判断演化时间线的介入记录上点击“记录结果/学习”，让结果反向校准客户判断。"
          />
        ) : recent.slice(0, 3).map((item) => (
          <div key={item.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="rounded-md border border-purple-500/20 bg-purple-500/5 px-1.5 py-0.5 font-medium text-purple-600">{INTERVENTION_IMPACT_LABEL[item.impact]}</span>
              <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-muted">置信度 {Math.round(item.confidence * 100)}%</span>
              <span className="ml-auto text-muted">{new Date(item.occurredAt).toLocaleString('zh-CN')}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-secondary">{item.summary}</p>
          </div>
        ))}
      </div>
      {summary?.calibrationNote ? <p className="mt-3 text-[11px] leading-5 text-muted">{summary.calibrationNote}</p> : null}
    </div>
  );
}

function JudgmentEvolutionTimelinePanel({ items, onOutcomeSaved }: { items: JudgmentTimelineItem[]; onOutcomeSaved: () => void }) {
  const visibleItems = items.slice(0, 5);
  const kindLabel: Record<JudgmentTimelineItem['kind'], string> = {
    judgment_memory: '判断来源',
    feedback: '用户反馈',
    win_loss_calibration: '成交校准',
    task_outcome: '任务反馈',
    intervention: '介入回写',
    intervention_outcome: '介入结果/学习结论',
    play_execution_event: '谋局执行',
  };
  const kindClass: Record<JudgmentTimelineItem['kind'], string> = {
    judgment_memory: 'border-accent/20 bg-accent/5 text-accent',
    feedback: 'border-warning/25 bg-warning/5 text-warning',
    win_loss_calibration: 'border-positive/20 bg-positive/5 text-positive',
    task_outcome: 'border-primary/20 bg-primary/5 text-primary',
    intervention: 'border-purple-500/20 bg-purple-500/5 text-purple-600',
    intervention_outcome: 'border-purple-500/25 bg-purple-500/10 text-purple-700',
    play_execution_event: 'border-accent/25 bg-accent/5 text-accent',
  };

  return (
    <div className="rounded-xl border border-border bg-muted/10 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-secondary uppercase tracking-[0.14em]">判断演化时间线</p>
          <p className="mt-1 text-[11px] text-muted">统一串起系统判断、人工反馈、成交校准与介入学习，最多展示最近 5 条。</p>
        </div>
        {visibleItems.length > 0 ? <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-secondary">{visibleItems.length} 条</span> : null}
      </div>
      <div className="mt-3 space-y-2">
        {visibleItems.length === 0 ? (
          <p className="text-xs text-muted">暂无判断演化记录。</p>
        ) : visibleItems.map((item) => {
          const revisionStatus = typeof item.meta?.revisionStatus === 'string' ? item.meta.revisionStatus : null;
          const status = revisionStatus ?? item.traceStatus;
          return (
            <div key={item.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className={`rounded-md border px-1.5 py-0.5 font-medium ${kindClass[item.kind]}`}>{kindLabel[item.kind]}</span>
                {sourceKindLabel(item.sourceKind) ? <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-secondary">{sourceKindLabel(item.sourceKind)}</span> : null}
                {timelineStatusLabel(status) ? <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-muted">{timelineStatusLabel(status)}</span> : null}
                <span className="ml-auto inline-flex items-center gap-1 text-muted"><Clock className="h-3 w-3" />{new Date(item.occurredAt).toLocaleString('zh-CN')}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-foreground">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-secondary">{item.summary}</p>
              {item.kind === 'intervention' ? <InterventionOutcomeInlineForm item={item} onSaved={onOutcomeSaved} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JudgmentMemorySourcesPanel({ accountId, items }: { accountId: string; items: JudgmentMemorySourceItem[] }) {
  const visibleItems = items.slice(0, 6);

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-secondary uppercase tracking-wide">最近判断来源</p>
          <p className="mt-1 text-[11px] text-muted">Decode、RFP 和谋局产生的判断变化，证据痕迹默认收起。</p>
        </div>
        {items.length > 0 ? (
          <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-secondary">
            {items.length} 条
          </span>
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        {visibleItems.length === 0 ? (
          <p className="text-xs text-muted">暂无可追踪的判断来源。先保存一次 Decode、RFP 分析或谋局计划。</p>
        ) : visibleItems.map((item) => {
          const href = buildJudgmentMemorySourceHref(item, accountId);
          return (
            <div key={item.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-accent/20 bg-accent/5 px-2 py-0.5 text-[11px] font-medium text-accent">
                      {JUDGMENT_MEMORY_SOURCE_LABELS[item.sourceKind]}
                    </span>
                    <span className="text-[11px] text-muted">
                      更新 {new Date(item.updatedAt).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">{item.title}</p>
                </div>
                {href ? (
                  <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-accent hover:underline">
                    查看来源
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : null}
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <div className="rounded-md border border-border bg-muted/20 p-2.5">
                  <p className="text-[10px] text-muted">当前判断</p>
                  <p className="mt-1 text-xs leading-5 text-foreground">{item.currentJudgment}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-2.5">
                  <p className="text-[10px] text-muted">最大风险</p>
                  <p className="mt-1 text-xs leading-5 text-foreground">{item.risk}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-2.5">
                  <p className="text-[10px] text-muted">下一步动作</p>
                  <p className="mt-1 text-xs leading-5 text-foreground">{item.nextAction}</p>
                </div>
              </div>

              <div className="mt-3">
                <EvidenceTrace
                  accountId={accountId}
                  title="展开证据可信度"
                  description="来源索引、置信度解释和仍需确认的信息。"
                  confidence={item.confidence}
                  provisional={item.provisional}
                  uncertainty={item.uncertainty}
                  sources={buildJudgmentTraceSources(item)}
                  emptyText="暂无证据索引。"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function OpenQuestionsPanel({ accountId, items }: { accountId: string; items: AccountOpenQuestion[] }) {
  const visibleItems = items.slice(0, 5);
  const blockedLabel: Record<AccountOpenQuestion['blockedJudgment'], string> = {
    momentum: '阻塞动量判断',
    risk: '阻塞风险判断',
    stakeholder: '阻塞关键人判断',
    rfp: '阻塞 RFP 判断',
    unknown: '阻塞下一步判断',
  };

  return (
    <div className="rounded-xl border border-warning/25 bg-warning/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-warning uppercase tracking-[0.14em]">下一步必须验证什么</p>
          <p className="mt-1 text-[11px] text-muted">把张力、矛盾和混合立场转成具体问题；判断解释默认展开，证据只露出 1-2 条。</p>
        </div>
        {visibleItems.length > 0 ? (
          <span className="rounded-full border border-warning/30 bg-card px-2 py-0.5 text-[11px] font-medium text-warning">
            {visibleItems.length} 个问题
          </span>
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        {visibleItems.length === 0 ? (
          <p className="text-xs leading-5 text-muted">暂无可验证问题：缺少张力、矛盾、关键人立场或判断来源。先补一条客户互动或联系人角色事实。</p>
        ) : visibleItems.map((item) => (
          <div key={item.id} className="rounded-lg border border-warning/20 bg-card p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_STYLE[item.priority] ?? SEVERITY_STYLE.medium}`}>
                优先级：{SEVERITY_LABEL[item.priority] ?? item.priority}
              </span>
              <span className="inline-flex rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] text-secondary">
                {blockedLabel[item.blockedJudgment]}
              </span>
              {item.provisional ? <span className="inline-flex rounded-md border border-warning/20 bg-warning/5 px-1.5 py-0.5 text-[10px] text-warning">临时判断</span> : null}
              <span className="text-[10px] text-muted">置信度 {Math.round(item.confidence * 100)}%</span>
            </div>

            <p className="mt-2 text-sm font-semibold leading-6 text-foreground">{item.question}</p>
            <p className="mt-1 text-xs leading-5 text-secondary">为什么重要：{item.whyItMatters}</p>
            <p className="mt-2 text-xs leading-5 text-foreground">验证动作：{item.nextVerificationAction}</p>
            {item.whoToAsk?.name ? (
              <p className="mt-1 text-[11px] text-muted">建议询问：{item.whoToAsk.name}{item.whoToAsk.title ? `（${item.whoToAsk.title}）` : ''}</p>
            ) : null}

            <div className="mt-3">
              <JudgmentFeedbackForm
                accountId={accountId}
                targetType="open_question"
                targetId={item.id}
                previousSummary={item.question}
                evidenceRefs={item.evidenceRefs}
                buttonLabel="反馈/修正这个问题"
                compact
              />
            </div>

            {item.evidenceRefs.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.evidenceRefs.slice(0, 2).map((source, index) => {
                  const href = buildEvidenceHref(source, accountId);
                  const kindLabel = SOURCE_KIND_LABEL[source.sourceKind] ?? '记录';
                  const label = source.title || source.sourceTable || source.sourceId;
                  const chip = (
                    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-secondary">
                      <span className="shrink-0 font-medium text-foreground">{kindLabel}</span>
                      <span className="truncate">{label}</span>
                      {href ? <ExternalLink className="h-3 w-3 shrink-0 opacity-70" /> : null}
                    </span>
                  );
                  return href ? (
                    <Link key={`${source.sourceKind}:${source.sourceId}:${index}`} href={href} className="min-w-0 hover:opacity-80">
                      {chip}
                    </Link>
                  ) : (
                    <span key={`${source.sourceKind}:${source.sourceId}:${index}`} className="min-w-0">{chip}</span>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function StakeholderInterpretationsPanel({ accountId, items, fallbackPeople }: { accountId: string; items: StakeholderInterpretation[]; fallbackPeople: AccountMemorySummary['people'] }) {
  const visibleItems = items.slice(0, 5);

  if (visibleItems.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <p className="text-[11px] font-semibold text-secondary uppercase tracking-[0.14em]">关键人物</p>
        <div className="mt-3 space-y-2">
          {(fallbackPeople ?? []).length === 0 ? <p className="text-xs text-muted">暂无结构化人物记忆</p> : fallbackPeople.map((person) => (
            <div key={person.contactId} className="rounded-md border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{person.name}</p>
                  <p className="text-xs text-muted">{person.title || person.influenceLabel}</p>
                </div>
                <span className="text-[11px] rounded-full border px-2 py-0.5 text-secondary">{STANCE_LABEL[person.stance] ?? person.stance}</span>
              </div>
              <p className="mt-2 text-xs text-secondary">{person.summary}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-secondary uppercase tracking-[0.14em]">干系人判断</p>
          <p className="mt-1 text-[11px] text-muted">最多展示 5 位关键人，保留临时判断与不确定性。</p>
        </div>
        <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-secondary">{items.length} 位</span>
      </div>
      <div className="mt-3 space-y-2">
        {visibleItems.map((item) => (
          <div key={item.contactId} className="rounded-md border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                <p className="truncate text-xs text-muted">{item.title || '职位待确认'}</p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                <span className="rounded-full border border-accent/20 bg-accent/5 px-2 py-0.5 text-[11px] font-medium text-accent">
                  {STAKEHOLDER_ROLE_LABEL[item.role]}
                </span>
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-secondary">
                  {STANCE_LABEL[item.stance] ?? item.stance}
                </span>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              <span className="rounded-md border border-border bg-background px-2 py-0.5">关系 {RELATIONSHIP_DISTANCE_LABEL[item.relationshipDistance]}</span>
              <span className="rounded-md border border-border bg-background px-2 py-0.5">置信度 {Math.round(item.confidence * 100)}%</span>
              {item.provisional ? <span className="rounded-md border border-warning/20 bg-warning/5 px-2 py-0.5 text-warning">临时判断</span> : null}
            </div>

            <p className="mt-2 text-xs leading-5 text-secondary">{item.whyThisRole}</p>
            {item.uncertainty ? <p className="mt-1 text-[11px] leading-5 text-warning">不确定性：{item.uncertainty}</p> : null}
            <p className="mt-2 text-xs leading-5 text-foreground">下一步：{item.nextAction}</p>

            {item.evidenceRefs.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.evidenceRefs.slice(0, 2).map((source, index) => {
                  const href = buildEvidenceHref(source, accountId);
                  const kindLabel = SOURCE_KIND_LABEL[source.sourceKind] ?? '记录';
                  const label = source.title || source.sourceTable || source.sourceId;
                  const chip = (
                    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-secondary">
                      <span className="shrink-0 font-medium text-foreground">{kindLabel}</span>
                      <span className="truncate">{label}</span>
                      {href ? <ExternalLink className="h-3 w-3 shrink-0 opacity-70" /> : null}
                    </span>
                  );
                  return href ? (
                    <Link key={`${source.sourceKind}:${source.sourceId}:${index}`} href={href} className="min-w-0 hover:opacity-80">
                      {chip}
                    </Link>
                  ) : (
                    <span key={`${source.sourceKind}:${source.sourceId}:${index}`} className="min-w-0">{chip}</span>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineInterpretationPanel({ accountId, items }: { accountId: string; items: AccountTimelineInterpretationItem[] }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-secondary uppercase tracking-wide">判断变化时间线</p>
          <p className="mt-1 text-[11px] text-muted">把事件、判断来源和矛盾信号合并成最近 5 条；判断解释默认展开，证据来源按需展开。</p>
        </div>
        {items.length > 0 ? (
          <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-secondary">
            {items.length} 条
          </span>
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted">暂无可解释的时间线变化。补充客户信号后，这里会显示它如何改变判断、风险和下一步动作。</p>
        ) : items.map((item) => (
          <div key={item.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-secondary">
                    {item.sourceLabel}
                  </span>
                  {item.hasConflictSignal ? (
                    <span className="rounded-full border border-danger/20 bg-danger/5 px-2 py-0.5 text-[11px] font-medium text-danger">有矛盾</span>
                  ) : null}
                  {item.hasUncertaintySignal ? (
                    <span className="rounded-full border border-warning/20 bg-warning/5 px-2 py-0.5 text-[11px] font-medium text-warning">待验证</span>
                  ) : null}
                  <span className="text-[11px] text-muted">{new Date(item.occurredAt).toLocaleString('zh-CN')}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-secondary">{item.interpretationSummary}</p>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-border bg-muted/20 p-2.5">
              <div className="grid gap-2 md:grid-cols-3">
                <div className="rounded-md border border-border bg-card p-2.5">
                  <p className="text-[10px] text-muted">判断变化</p>
                  <p className="mt-1 text-xs leading-5 text-foreground">{item.judgmentImpact}</p>
                </div>
                <div className="rounded-md border border-border bg-card p-2.5">
                  <p className="text-[10px] text-muted">风险影响</p>
                  <p className="mt-1 text-xs leading-5 text-foreground">{item.riskImpact}</p>
                </div>
                <div className="rounded-md border border-border bg-card p-2.5">
                  <p className="text-[10px] text-muted">下一步动作</p>
                  <p className="mt-1 text-xs leading-5 text-foreground">{item.nextAction}</p>
                </div>
              </div>
              <div className="mt-3">
                <EvidenceTrace
                  accountId={accountId}
                  title="展开证据来源"
                  description="来源跳转、置信度和仍需确认的信息。"
                  confidence={item.confidence}
                  provisional={item.provisional ?? item.hasUncertaintySignal}
                  uncertainty={item.hasUncertaintySignal ? '这条判断仍需要新证据校准。' : undefined}
                  sources={item.evidenceRefs}
                  emptyText="暂无可跳转来源。"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AccountMemoryPanel({ accountId, comparisonWindow = 30, preloadedSummary, preloadedTimeline, preloadedConflicts, preloadedMomentumShift, preloadedJudgmentMemories, preloadedStakeholderInterpretations, preloadedOpenQuestions, preloadedFeedbackRevisionRecords, preloadedWinLossCalibrations, preloadedInterventionOutcomes, preloadedJudgmentLearning, preloadedJudgmentTimeline, preloadedDecodeStabilityTimeline }: Props) {
  const usePreloaded = preloadedSummary !== undefined;
  const [summary, setSummary] = useState<AccountMemorySummary | null>(preloadedSummary ?? null);
  const [timeline, setTimeline] = useState<AccountTimelineItem[]>(preloadedTimeline ?? []);
  const [conflicts, setConflicts] = useState<AccountMemoryConflict[]>(preloadedConflicts ?? []);
  const [momentumShift, setMomentumShift] = useState<MomentumShift | null>(preloadedMomentumShift ?? null);
  const [judgmentMemories, setJudgmentMemories] = useState<JudgmentMemorySourceItem[]>(preloadedJudgmentMemories ?? []);
  const [stakeholderInterpretations, setStakeholderInterpretations] = useState<StakeholderInterpretation[]>(preloadedStakeholderInterpretations ?? []);
  const [openQuestions, setOpenQuestions] = useState<AccountOpenQuestion[]>(preloadedOpenQuestions ?? []);
  const [feedbackRevisionRecords, setFeedbackRevisionRecords] = useState<JudgmentFeedbackRevisionRecord[]>(preloadedFeedbackRevisionRecords ?? []);
  const [winLossCalibrations, setWinLossCalibrations] = useState<WinLossCalibrationItem[]>(preloadedWinLossCalibrations ?? []);
  const [interventionOutcomes, setInterventionOutcomes] = useState<InterventionOutcomeItem[]>(preloadedInterventionOutcomes ?? []);
  const [judgmentLearning, setJudgmentLearning] = useState<JudgmentLearningSummary | null>(preloadedJudgmentLearning ?? null);
  const [judgmentTimeline, setJudgmentTimeline] = useState<JudgmentTimelineItem[]>(preloadedJudgmentTimeline ?? []);
  const [decodeStabilityTimeline, setDecodeStabilityTimeline] = useState<DecodeStabilityTimelineItem[]>(preloadedDecodeStabilityTimeline ?? []);
  const [loading, setLoading] = useState(!usePreloaded);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const interpretationItems = useMemo(() => buildAccountTimelineInterpretationItems({
    timelineItems: timeline,
    judgmentMemories,
    conflicts,
    limit: 5,
  }), [timeline, judgmentMemories, conflicts]);

  // Sync from parent when preloaded data changes
  useEffect(() => {
    if (usePreloaded) {
      setSummary(preloadedSummary ?? null);
      setTimeline(preloadedTimeline ?? []);
      setConflicts(preloadedConflicts ?? []);
      setMomentumShift(preloadedMomentumShift ?? null);
      setJudgmentMemories(preloadedJudgmentMemories ?? []);
      setStakeholderInterpretations(preloadedStakeholderInterpretations ?? []);
      setOpenQuestions(preloadedOpenQuestions ?? []);
      setFeedbackRevisionRecords(preloadedFeedbackRevisionRecords ?? []);
      setWinLossCalibrations(preloadedWinLossCalibrations ?? []);
      setInterventionOutcomes(preloadedInterventionOutcomes ?? []);
      setJudgmentLearning(preloadedJudgmentLearning ?? null);
      setJudgmentTimeline(preloadedJudgmentTimeline ?? []);
      setDecodeStabilityTimeline(preloadedDecodeStabilityTimeline ?? []);
      setLoading(false);
    }
  }, [usePreloaded, preloadedSummary, preloadedTimeline, preloadedConflicts, preloadedMomentumShift, preloadedJudgmentMemories, preloadedStakeholderInterpretations, preloadedOpenQuestions, preloadedFeedbackRevisionRecords, preloadedWinLossCalibrations, preloadedInterventionOutcomes, preloadedJudgmentLearning, preloadedJudgmentTimeline, preloadedDecodeStabilityTimeline]);

  useEffect(() => {
    function handleMemoryChanged(event: Event) {
      const detail = (event as CustomEvent<{ accountId?: string }>).detail;
      if (!detail?.accountId || detail.accountId === accountId) setReloadToken((value) => value + 1);
    }
    window.addEventListener('closr:judgment-feedback-saved', handleMemoryChanged);
    window.addEventListener('closr:decode-judgment-memory-saved', handleMemoryChanged);
    return () => {
      window.removeEventListener('closr:judgment-feedback-saved', handleMemoryChanged);
      window.removeEventListener('closr:decode-judgment-memory-saved', handleMemoryChanged);
    };
  }, [accountId]);

  // Only fetch independently when no preloaded data or manual refresh
  useEffect(() => {
    if (usePreloaded && reloadToken === 0) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/accounts/${accountId}/memory-payload?window=${comparisonWindow}`, { cache: 'no-store' });
        if (cancelled) return;
        if (!res.ok) {
          setSummary(null);
          setTimeline([]);
          setConflicts([]);
          setJudgmentMemories([]);
          setStakeholderInterpretations([]);
          setOpenQuestions([]);
          setFeedbackRevisionRecords([]);
          setWinLossCalibrations([]);
          setInterventionOutcomes([]);
          setJudgmentLearning(null);
          setJudgmentTimeline([]);
          setDecodeStabilityTimeline([]);
          setError(`账户记忆加载失败（${res.status}）`);
          return;
        }

        const payload = await res.json();
        if (cancelled) return;
        setSummary(payload.summary ?? null);
        setTimeline(payload.timelineItems ?? []);
        setConflicts(payload.conflicts ?? []);
        setMomentumShift(payload.momentumShift ?? null);
        setJudgmentMemories(payload.judgmentMemories ?? []);
        setStakeholderInterpretations(payload.stakeholderInterpretations ?? []);
        setOpenQuestions(payload.openQuestions ?? []);
        setFeedbackRevisionRecords(payload.feedbackRevisionRecords ?? []);
        setWinLossCalibrations(payload.winLossCalibrations ?? []);
        setInterventionOutcomes(payload.interventionOutcomes ?? []);
        setJudgmentLearning(payload.judgmentLearning ?? null);
        setJudgmentTimeline(payload.judgmentTimeline ?? []);
        setDecodeStabilityTimeline(payload.decodeStabilityTimeline ?? payload.judgmentStabilityTimeline ?? []);
      } catch {
        if (cancelled) return;
        setSummary(null);
        setTimeline([]);
        setConflicts([]);
        setMomentumShift(null);
        setJudgmentMemories([]);
        setStakeholderInterpretations([]);
        setOpenQuestions([]);
        setFeedbackRevisionRecords([]);
        setWinLossCalibrations([]);
        setInterventionOutcomes([]);
        setJudgmentLearning(null);
        setJudgmentTimeline([]);
        setDecodeStabilityTimeline([]);
        setError('账户记忆加载失败，请稍后重试');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [accountId, comparisonWindow, reloadToken, usePreloaded]);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <p className="text-[11px] font-semibold text-secondary uppercase tracking-[0.14em]">账户记忆</p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">判断 · 证据 · 矛盾 · 变化</h3>
        </div>
        <div className="flex items-center gap-2">
          {summary?.momentum && (
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground">
              <TrendingUp className="h-3 w-3" />
              {summary.momentum.label}
            </span>
          )}
          <button
            type="button"
            onClick={() => setReloadToken((v) => v + 1)}
            className="inline-flex items-center rounded-md border border-border bg-card p-1.5 text-muted hover:text-foreground hover:bg-background"
            title="刷新"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : error ? (
        <div className="rounded-xl border border-danger/20 bg-danger/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">账户记忆暂时不可用</p>
              <p className="mt-1 text-xs text-muted">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setReloadToken((value) => value + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-background"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重试
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ── 判断摘要 ── */}
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <p className="mb-2 text-[11px] font-semibold text-secondary uppercase tracking-[0.14em]">判断摘要</p>
            <p className="text-sm leading-6 text-foreground">{summary?.narrativeSummary ?? '证据不足，暂无法生成账户记忆摘要。'}</p>
            {summary?.momentum?.reasoning && <p className="mt-2 text-xs text-muted">{summary.momentum.reasoning}</p>}
            {summary && (
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-secondary">
                  置信度 <span className={`font-semibold ${summary.confidence >= 0.6 ? 'text-positive' : summary.confidence >= 0.3 ? 'text-warning' : 'text-danger'}`}>{Math.round(summary.confidence * 100)}%</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-secondary">
                  数据来源 <span className="font-semibold text-foreground">{summary.sourceCoverage.kinds.length} 类 / {summary.sourceCoverage.totalRecords} 条</span>{timeline[0]?.title ? <span className="ml-1 text-muted">最新：{timeline[0].title}</span> : null}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-secondary">
                  {comparisonWindow}天新增 <span className={`font-semibold ${summary.sourceCoverage.freshRecords > 0 ? 'text-positive' : 'text-muted'}`}>{summary.sourceCoverage.freshRecords} 条</span>
                </span>
                <span className="text-[10px] text-muted">
                  更新于 {new Date(summary.lastComputedAt).toLocaleString('zh-CN')}
                </span>
              </div>
            )}
          </div>

          {momentumShift ? (
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent" />
                <p className="text-xs font-semibold text-secondary uppercase tracking-wide">动量变化追踪</p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[11px] text-muted">上次判断</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{momentumShift.previousLabel}</p>
                  <p className="mt-1 text-xs text-secondary">{momentumShift.previousSummary}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[11px] text-muted">本次判断</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{momentumShift.currentLabel}</p>
                  <p className="mt-1 text-xs text-secondary">{momentumShift.currentSummary}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[11px] text-muted">为什么变化</p>
                  <p className="mt-1 text-xs leading-6 text-secondary">{momentumShift.whyChanged}</p>
                </div>
              </div>
            </div>
          ) : null}

          <OpenQuestionsPanel accountId={accountId} items={openQuestions} />

          <CalibrationLoopBanner feedbackCount={feedbackRevisionRecords.length} winLossCount={winLossCalibrations.length} />

          <RecentWinLossCalibrationPanel items={winLossCalibrations} />

          <RecentFeedbackPanel items={feedbackRevisionRecords} />

          <JudgmentLearningPanel summary={judgmentLearning} outcomeCount={interventionOutcomes.length} />

          <JudgmentEvolutionTimelinePanel items={judgmentTimeline} onOutcomeSaved={() => setReloadToken((value) => value + 1)} />

          <DecodeStabilityTimelinePanel accountId={accountId} items={decodeStabilityTimeline} />

          <JudgmentMemorySourcesPanel accountId={accountId} items={judgmentMemories} />

          {/* ── 关键人物 + 张力与证据覆盖 ── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <StakeholderInterpretationsPanel
              accountId={accountId}
              items={stakeholderInterpretations}
              fallbackPeople={summary?.people ?? []}
            />

            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
              <div>
                <p className="text-[11px] font-semibold text-secondary uppercase tracking-[0.14em]">张力与矛盾</p>
                <div className="mt-3 space-y-2">
                  {(summary?.tensions ?? []).length === 0 ? <p className="text-xs text-muted">暂无显著张力</p> : summary?.tensions.map((tension, index) => (
                    <div key={index} className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-xs text-foreground">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                      {tension}
                    </div>
                  ))}
                </div>
              </div>

              {/* 证据覆盖 */}
              {summary && (
                <div>
                  <p className="text-[11px] font-semibold text-secondary uppercase tracking-[0.14em]">证据覆盖</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {summary.sourceCoverage.kinds.map((kind) => (
                      <span key={kind} className="inline-flex rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-secondary">
                        {SOURCE_KIND_LABEL[kind] ?? kind}
                      </span>
                    ))}
                    {summary.sourceCoverage.kinds.length === 0 && <p className="text-xs text-muted">无数据来源：缺少邮件、活动、RFP 或谋局记录，暂时无法定位具体证据。</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── 判断变化时间线 ── */}
          <TimelineInterpretationPanel accountId={accountId} items={interpretationItems} />

          {/* ── 未解决矛盾 / 需要验证的信号 ── */}
          <UnresolvedSignalsPanel
            conflicts={conflicts}
            timelineItems={timeline}
            judgmentMemories={judgmentMemories}
            accountId={accountId}
            onResolved={() => setReloadToken((v) => v + 1)}
          />
        </>
      )}
    </div>
  );
}

// ─── Unresolved Signals Panel ──────────────────────────────────────

function SignalSources({ signal, accountId }: { signal: AccountVerificationSignal; accountId: string }) {
  const sources = signal.sourceRefs.slice(0, 4);
  if (sources.length === 0) {
    return <p className="text-[11px] text-muted">暂无可跳转来源。</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {sources.map((source, index) => {
        const href = buildEvidenceHref(source, accountId);
        const kindLabel = SOURCE_KIND_LABEL[source.sourceKind] ?? '记录';
        const label = source.title || source.sourceTable || source.sourceId;
        const chip = (
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-secondary">
            <span className="shrink-0 font-medium text-foreground">{kindLabel}</span>
            <span className="truncate">{label}</span>
            {href ? <ExternalLink className="h-3 w-3 shrink-0 opacity-70" /> : null}
          </span>
        );
        return href ? (
          <Link key={`${source.sourceKind}:${source.sourceId}:${index}`} href={href} className="min-w-0 hover:opacity-80">
            {chip}
          </Link>
        ) : (
          <span key={`${source.sourceKind}:${source.sourceId}:${index}`} className="min-w-0">
            {chip}
          </span>
        );
      })}
    </div>
  );
}

function UnresolvedSignalsPanel({
  conflicts,
  timelineItems,
  judgmentMemories,
  accountId,
  onResolved,
}: {
  conflicts: AccountMemoryConflict[];
  timelineItems: AccountTimelineItem[];
  judgmentMemories: JudgmentMemorySourceItem[];
  accountId: string;
  onResolved: () => void;
}) {
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const handleResolve = useCallback(async (conflictId: string, resolution: 'confirmed' | 'false_positive' | 'follow_up') => {
    setResolvingId(conflictId);
    try {
      const res = await fetch('/api/conflicts/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conflictId, accountId, resolution }),
      });
      if (res.ok) {
        setResolvedIds((prev) => new Set([...prev, conflictId]));
        // Delay refresh to let animation play
        setTimeout(onResolved, 800);
      }
    } catch {
      // silently fail
    } finally {
      setResolvingId(null);
    }
  }, [accountId, onResolved]);

  const signals = buildAccountVerificationSignals({
    conflicts: conflicts.filter((conflict) => !resolvedIds.has(conflict.id)),
    timelineItems,
    judgmentMemories,
    limit: 5,
  });

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-danger" />
          <div>
            <p className="text-xs font-semibold text-secondary uppercase tracking-wide">未解决矛盾 / 需要验证的信号</p>
            <p className="mt-0.5 text-[11px] text-muted">优先展示 5 条，避免把证据墙直接推到前台。</p>
          </div>
        </div>
        {signals.length > 0 && (
          <span className="rounded-full border border-danger/20 bg-danger/5 px-2 py-0.5 text-[11px] font-medium text-danger">
            {signals.length} 条待验证
          </span>
        )}
      </div>
      <div className="mt-3 space-y-2">
        {signals.length === 0 ? (
          <p className="text-xs text-muted">暂无未解决矛盾或待验证风险信号。</p>
        ) : signals.map((signal) => {
          const isResolving = signal.conflictId ? resolvingId === signal.conflictId : false;
          return (
            <div key={signal.id} className="rounded-lg border border-danger/20 bg-danger/5 p-3 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-secondary">
                      {signal.typeLabel}
                    </span>
                    <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_STYLE[signal.severity] ?? SEVERITY_STYLE.low}`}>
                      优先级：{SEVERITY_LABEL[signal.severity] ?? signal.severity}
                    </span>
                    {signal.detectedAt ? (
                      <span className="text-[10px] text-muted">
                        {new Date(signal.detectedAt).toLocaleDateString('zh-CN')}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm font-medium text-foreground">{signal.summary}</p>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="rounded-md border border-danger/10 bg-card/80 p-2.5">
                  <p className="text-[11px] font-semibold text-secondary">相关来源</p>
                  <div className="mt-2">
                    <SignalSources signal={signal} accountId={accountId} />
                  </div>
                </div>
                <div className="rounded-md border border-warning/20 bg-warning/5 p-2.5">
                  <p className="text-[11px] font-semibold text-warning">建议验证动作</p>
                  <p className="mt-1 text-xs leading-5 text-foreground">{signal.suggestedAction}</p>
                </div>
              </div>

              {signal.conflictId ? (
                <div className="flex items-center gap-2 border-t border-danger/10 pt-1">
                  <button
                    type="button"
                    disabled={isResolving}
                    onClick={() => handleResolve(signal.conflictId!, 'confirmed')}
                    className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-[11px] font-medium text-danger transition-colors hover:bg-danger/20 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" />
                    确认风险
                  </button>
                  <button
                    type="button"
                    disabled={isResolving}
                    onClick={() => handleResolve(signal.conflictId!, 'false_positive')}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-secondary transition-colors hover:bg-background disabled:opacity-50"
                  >
                    <X className="h-3 w-3" />
                    误报
                  </button>
                  <button
                    type="button"
                    disabled={isResolving}
                    onClick={() => handleResolve(signal.conflictId!, 'follow_up')}
                    className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-[11px] font-medium text-warning transition-colors hover:bg-warning/20 disabled:opacity-50"
                  >
                    <Clock className="h-3 w-3" />
                    待跟进
                  </button>
                  {isResolving && <Loader2 className="h-3 w-3 animate-spin text-muted" />}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
