'use client';

import { ChevronDown, GitBranch, Crosshair } from 'lucide-react';
import { normalizePlayStepExecutionStatus } from '@/lib/strategic-play-execution';
import { EvidenceAttributionBadge } from '@/components/judgment/strategic-play-judgment-brief-card';
import { expectedOutcomeAttributionFor } from '@/lib/strategic-play-evidence-ui';
import { visibleBusinessText } from '@/lib/visible-business-text';
import { useLocale } from '@/lib/i18n';
import { tPlay } from './labels';
import { isGenericEnglishPlayText, displayText, signalLoopLabel } from './text';
import type {
  StrategicPlay,
  PlayStep,
} from '@/lib/babel-engine/types';
import type {
  StrategicPlayRoutePlan,
} from '@/lib/strategic-play-v2/types';

// ─── Deal Path Framing ─────────────────────────────────────────────

export const PENDING_JUDGMENT_TEXT = '待验证 / 证据不足';

export type StrategicPlayWithRoutePlan = StrategicPlay & {
  v2?: {
    routePlan?: StrategicPlayRoutePlan;
  };
};

export type RouteChangeProposalForUi = {
  proposedWinGap?: {
    id?: string;
    currentState?: string;
    desiredState?: string;
    evidenceGap?: string;
    impact?: 'medium' | 'high' | 'critical';
  };
  proposedMoveDelta?: {
    proposedNextMove?: string;
    successTest?: string;
    failureTest?: string;
  };
  proposedVersion?: {
    version?: number;
    triggerKind?: string;
    triggerSourceRef?: unknown;
    changedJudgmentIds?: string[];
    changedWinGapIds?: string[];
    changedMoveIds?: string[];
    diffSummary?: string;
    createdAt?: string;
  };
};

export function cleanText(value?: string | null) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function firstCleanText(...values: Array<string | undefined | null>) {
  return values.map(cleanText).find(Boolean) ?? null;
}

export function joinCleanList(values: string[] | undefined | null, fallback = PENDING_JUDGMENT_TEXT) {
  const cleaned = (values ?? []).map(cleanText).filter((value): value is string => Boolean(value));
  if (cleaned.length === 0) return fallback;
  return cleaned.slice(0, 2).join('；') + (cleaned.length > 2 ? ` 等 ${cleaned.length} 条` : '');
}

export function buildWhyNow(step: PlayStep) {
  const parts = [
    cleanText(step.timing) ? `时机：${cleanText(step.timing)}` : null,
    cleanText(step.prerequisite) ? `前提：${cleanText(step.prerequisite)}` : null,
    cleanText(step.rationale) ? `判断依据：${cleanText(step.rationale)}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('；') : signalLoopLabel('待验证：这一步缺少明确时机依据。', 'Pending validation: this step needs a clear timing rationale.');
}

export function buildStepInfluence(step: PlayStep) {
  const actor = cleanText(step.who) ?? '待确认执行人';
  const target = cleanText(step.target) ?? '待确认影响对象';
  const action = cleanText(step.action);
  return action ? `${actor} → ${target}；${action}` : `${actor} → ${target}`;
}

export function buildExpectedJudgment(step: PlayStep) {
  return firstCleanText(
    step.expectedOutcome,
    step.successSignal ? `成功信号：${step.successSignal}` : null,
    step.assumptionBeingTested ? `验证假设：${step.assumptionBeingTested}` : null,
    step.purpose,
  ) ?? signalLoopLabel('待验证：尚未写明这一步要推进哪条判断。', 'Pending validation: this step needs a concrete judgment to advance.');
}

export function buildFailureLearning(step: PlayStep) {
  return firstCleanText(
    step.executionCaveat,
    step.blockerReason ? `已受阻：${step.blockerReason}` : null,
    step.risk ? `若失败，优先复核：${step.risk}` : null,
    step.assumptionBeingTested ? `若无进展，说明假设「${step.assumptionBeingTested}」可能需要修正。` : null,
    step.fallback ? `失败后改用：${step.fallback}` : null,
  ) ?? signalLoopLabel('待验证：尚未定义失败后要修正的假设。', 'Pending validation: define what assumption to revisit if this step stalls.');
}

export function routeTriggerLabel(triggerKind: string | undefined, en: boolean) {
  switch (triggerKind) {
    case 'decode_signal':
      return tPlay(en, '客户信号', 'Customer signal');
    case 'rfp_analysis':
      return tPlay(en, 'RFP 分析', 'RFP analysis');
    case 'meeting':
      return tPlay(en, '会议反馈', 'Meeting');
    case 'execution_outcome':
      return tPlay(en, '执行结果', 'Execution outcome');
    case 'seed':
      return tPlay(en, '初始路线', 'Seed route');
    default:
      return tPlay(en, '人工调整', 'Manual change');
  }
}

export function formatRouteChangeDate(value: string | undefined, en: boolean) {
  if (!value) return tPlay(en, '时间待确认', 'Time pending');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return tPlay(en, '时间待确认', 'Time pending');
  return date.toLocaleString(en ? 'en-US' : 'zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DealPathOverview({ play }: { play: StrategicPlayWithRoutePlan }) {
  const { locale } = useLocale();
  const en = locale === 'en';
  const routePlan = play.v2?.routePlan;
  const routeMove = routePlan?.currentCriticalMove;
  const nextOpenStep = play.steps.find((step) => normalizePlayStepExecutionStatus(step.status) !== 'done');
  const currentMoveTitle = routeMove?.title ?? nextOpenStep?.title;
  const impactRank = { critical: 4, high: 3, medium: 2, low: 1 } as Record<string, number>;
  const rankedWinGaps = [...(routePlan?.winGaps ?? [])].sort((a, b) => {
    const statusRank = (gap: typeof a) => gap.status === 'open' ? 2 : gap.status === 'in_progress' ? 1 : 0;
    return (statusRank(b) - statusRank(a)) || ((impactRank[b.impact] ?? 0) - (impactRank[a.impact] ?? 0));
  });
  const linkedWinGap = routeMove?.winGapId
    ? routePlan?.winGaps.find((gap) => gap.id === routeMove.winGapId)
    : undefined;
  const currentWinGap = linkedWinGap ?? rankedWinGaps[0];
  const latestChange = [...(routePlan?.whatChanged ?? [])].sort((a, b) => {
    const left = new Date(a.createdAt).getTime();
    const right = new Date(b.createdAt).getTime();
    return (Number.isNaN(right) ? 0 : right) - (Number.isNaN(left) ? 0 : left);
  })[0];
  const evidenceGapCount = routePlan?.routeRationale.confidenceProfile.missingEvidenceCount ?? (play.knowledgeGaps?.length ?? 0);
  const openAssumptions = (play.assumptions ?? []).filter((item) => item.status === 'pending');
  const invalidatedAssumptions = (play.assumptions ?? []).filter((item) => item.status === 'invalidated');
  const counterEvidence = joinCleanList(play.riskCounterEvidence, tPlay(en, '暂无明确反证；仍需执行中持续校准。', 'No explicit counter-evidence yet; continue calibrating during execution.'));
  const routeThesis = firstCleanText(routePlan?.routeThesis, play.situationJudgment, play.strategicObjective);

  return (
    <section className="rounded-2xl border border-accent/25 bg-gradient-to-b from-accent/[0.08] to-card p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-accent/25 bg-accent/[0.12] text-accent">
              <Crosshair className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[11px] font-semibold text-accent">{tPlay(en, '谋局 2.0', 'Strategic Play 2.0')}</p>
              <h4 className="text-base font-semibold text-foreground">{tPlay(en, '当前路线图', 'Current Route Map')}</h4>
            </div>
            <span className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-secondary">
              {tPlay(en, '从静态计划到动态改线', 'Static plan to dynamic route')}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-foreground">
            {displayText(routeThesis ?? tPlay(en, '先确认当前目标、最大缺口和下一步验证点；执行结果或客户新信号会触发路线修正，而不是只更新任务状态。', 'Confirm the goal, largest gap, and next verification point first; execution outcomes or new customer signals revise the route, not just task status.'))}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background/75 px-3 py-2.5 lg:w-72">
          <p className="text-[11px] font-semibold text-secondary">{tPlay(en, '最近改线信号', 'Latest route-changing signal')}</p>
          {latestChange ? (
            <>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                  {routeTriggerLabel(latestChange.triggerKind, en)}
                </span>
                <span className="text-[11px] text-muted">{formatRouteChangeDate(latestChange.createdAt, en)}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-foreground">{displayText(latestChange.diffSummary)}</p>
            </>
          ) : (
            <p className="mt-2 text-xs leading-5 text-muted">
              {tPlay(en, '暂无已接受的改线信号；新 Decode/RFP/执行结果出现后，会在这里记录路线为什么变化。', 'No accepted route-changing signal yet; new Decode, RFP, or execution outcomes will show why the route changed.')}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.05fr_1.05fr_1.25fr]">
        <div className="rounded-xl border border-border bg-background/80 px-3.5 py-3.5">
          <p className="text-[11px] font-semibold text-secondary">{tPlay(en, '当前目标', 'Current goal')}</p>
          <p className="mt-1.5 text-sm font-semibold leading-6 text-foreground">{displayText(routePlan?.goal.description || play.goalDescription)}</p>
          <p className="mt-2 text-[11px] text-muted">
            {tPlay(en, '目标状态：', 'Goal status: ')}{displayText(routePlan?.goal.status || play.status)}
            {routePlan?.goal.momentum ? ' · ' + displayText(routePlan.goal.momentum) : ''}
          </p>
        </div>
        <div className="rounded-xl border border-warning/25 bg-warning/[0.05] px-3.5 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold text-warning">{tPlay(en, '最大缺口', 'Largest gap')}</p>
            {currentWinGap?.impact && (
              <span className="rounded-full border border-warning/25 bg-background/70 px-2 py-0.5 text-[11px] font-semibold text-warning">
                {displayText(currentWinGap.impact)}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm font-semibold leading-6 text-foreground">{displayText(currentWinGap?.currentState ?? joinCleanList(play.stakeholderPath))}</p>
          <p className="mt-2 text-xs leading-5 text-secondary">
            {currentWinGap?.desiredState ? displayText(currentWinGap.desiredState) : tPlay(en, '目标状态待补齐，需要先把阻力定义成可验证缺口。', 'Desired state pending; define this blocker as a verifiable gap first.')}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background/80 px-3.5 py-3.5">
          <p className="text-[11px] font-semibold text-secondary">{tPlay(en, '下一步为什么做', 'Why the next move')}</p>
          <p className="mt-1.5 text-sm font-semibold leading-6 text-foreground">{displayText(currentMoveTitle ?? PENDING_JUDGMENT_TEXT)}</p>
          <p className="mt-2 text-xs leading-5 text-secondary">{displayText(routeMove?.expectedJudgmentDelta || routeMove?.purpose || (nextOpenStep ? buildExpectedJudgment(nextOpenStep) : PENDING_JUDGMENT_TEXT))}</p>
          {routeMove?.timing && <p className="mt-2 text-[11px] text-muted">{displayText(routeMove.timing)}</p>}
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-positive/20 bg-positive/[0.04] px-3.5 py-3">
          <p className="text-[11px] font-semibold text-positive">{tPlay(en, '成功后确认什么', 'Success confirms')}</p>
          <p className="mt-1.5 text-xs leading-5 text-foreground">{displayText(routeMove?.successTest ?? (nextOpenStep ? buildExpectedJudgment(nextOpenStep) : PENDING_JUDGMENT_TEXT))}</p>
        </div>
        <div className="rounded-xl border border-danger/20 bg-danger/[0.04] px-3.5 py-3">
          <p className="text-[11px] font-semibold text-danger">{tPlay(en, '失败后改什么线', 'If it fails, revise')}</p>
          <p className="mt-1.5 text-xs leading-5 text-foreground">{displayText(routeMove?.failureTest || routeMove?.fallbackRoute || (nextOpenStep ? buildFailureLearning(nextOpenStep) : PENDING_JUDGMENT_TEXT))}</p>
        </div>
        <div className="rounded-xl border border-border bg-background/80 px-3.5 py-3">
          <p className="text-[11px] font-semibold text-secondary">{tPlay(en, '证据 / 修正入口', 'Evidence / correction')}</p>
          <p className="mt-1.5 text-xs leading-5 text-foreground">{displayText(routePlan?.routeRationale.nextVerificationPoint ?? counterEvidence)}</p>
          {evidenceGapCount > 0 && (
            <p className="mt-1.5 text-[11px] text-warning">
              {tPlay(en, evidenceGapCount + ' 个证据缺口会影响路线置信度', evidenceGapCount + ' evidence gaps affect route confidence')}
            </p>
          )}
          {(openAssumptions.length > 0 || invalidatedAssumptions.length > 0) && (
            <p className="mt-1.5 text-[11px] text-warning">
              {openAssumptions.length > 0 ? tPlay(en, `${openAssumptions.length} 条假设待验证`, `${openAssumptions.length} assumptions pending validation`) : ''}
              {openAssumptions.length > 0 && invalidatedAssumptions.length > 0 ? ' · ' : ''}
              {invalidatedAssumptions.length > 0 ? tPlay(en, `${invalidatedAssumptions.length} 条已否定`, `${invalidatedAssumptions.length} invalidated`) : ''}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function StepEvidenceEntry({ play, step, stepIndex }: { play: StrategicPlay; step: PlayStep; stepIndex: number }) {
  const { locale } = useLocale();
  const en = locale === 'en';
  const attribution = expectedOutcomeAttributionFor(play.fieldEvidenceAttributions, step, stepIndex);
  const evidenceRefs = attribution?.evidenceRefs ?? [];
  const gaps = attribution?.gaps ?? [];
  const evidenceBasis = (play.evidenceBasis ?? []).map(cleanText).filter((value): value is string => Boolean(value));
  const counterEvidence = (play.riskCounterEvidence ?? []).map(cleanText).filter((value): value is string => Boolean(value));
  const knowledgeGaps = (play.knowledgeGaps ?? []).map(cleanText).filter((value): value is string => Boolean(value));
  const hasTrace = evidenceRefs.length > 0 || gaps.length > 0 || evidenceBasis.length > 0 || counterEvidence.length > 0 || knowledgeGaps.length > 0;
  const humanizeTraceText = (value: string, fallback = 'Review the evidence basis and define the missing step judgment.') => {
    const text = visibleBusinessText(value, en ? 'en' : 'zh');
    return en && isGenericEnglishPlayText(text) ? fallback : text;
  };
  const joinTraceList = (values: string[]) => values.map((value) => humanizeTraceText(value, value)).join('；');

  return (
    <details open className="group rounded-lg border border-border bg-background/60 px-3 py-2.5 text-xs text-secondary">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex flex-wrap items-center gap-2">
            <GitBranch className="h-3.5 w-3.5 text-secondary" />
            <span className="font-semibold text-foreground">{tPlay(en, '证据 / 反证入口', 'Evidence / Counter-Evidence')}</span>
            <EvidenceAttributionBadge attribution={attribution} />
            <span className="text-muted">{hasTrace ? tPlay(en, '默认展开，完整查看摘要', 'Expanded by default for full summary') : tPlay(en, PENDING_JUDGMENT_TEXT, 'Pending validation: no judgment has been written yet.')}</span>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/20 bg-accent/[0.06] px-2 py-0.5 text-[11px] font-semibold text-accent group-open:hidden">
            {tPlay(en, '展开', 'Expand')}
            <ChevronDown className="h-3 w-3 -rotate-90" />
          </span>
          <span className="hidden shrink-0 items-center gap-1 rounded-full border border-accent/20 bg-accent/[0.06] px-2 py-0.5 text-[11px] font-semibold text-accent group-open:inline-flex">
            {tPlay(en, '折叠', 'Collapse')}
            <ChevronDown className="h-3 w-3" />
          </span>
        </div>
      </summary>
      <div className="mt-2 space-y-2 border-t border-border/70 pt-2 leading-5">
        {attribution?.rationale ? <p><span className="font-semibold text-foreground">{tPlay(en, '归因', 'Attribution')}:</span>{humanizeTraceText(attribution.rationale)}</p> : null}
        {evidenceRefs.length > 0 ? <p><span className="font-semibold text-foreground">{tPlay(en, '字段证据', 'Field evidence')}:</span>{joinTraceList(evidenceRefs.map((ref) => ref.title || ref.excerpt || ref.sourceTable || ref.sourceId))}</p> : null}
        {evidenceBasis.length > 0 ? <p><span className="font-semibold text-foreground">{tPlay(en, '整体证据', 'Overall evidence')}:</span>{joinTraceList(evidenceBasis)}</p> : null}
        {counterEvidence.length > 0 ? <p className="text-warning"><span className="font-semibold">{tPlay(en, '反证', 'Counter-evidence')}:</span>{joinTraceList(counterEvidence)}</p> : null}
        {(gaps.length > 0 || knowledgeGaps.length > 0) ? <p className="text-warning"><span className="font-semibold">{tPlay(en, '缺口', 'Gaps')}:</span>{joinTraceList([...gaps, ...knowledgeGaps])}</p> : null}
        {!hasTrace ? <p className="text-muted">{tPlay(en, '暂无可追溯证据；执行前应先补充事实依据或保留为待验证判断。', 'No traceable evidence yet; add factual support before execution or keep this as a pending judgment.')}</p> : null}
      </div>
    </details>
  );
}
