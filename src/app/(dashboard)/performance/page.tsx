'use client';

import { visibleBusinessText } from "@/lib/visible-business-text";
import { useLocale } from "@/lib/i18n";
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertTriangle, Brain, CheckCircle2, ChevronDown, LineChart, ShieldCheck, Target, Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { formatCurrency } from '@/lib/format-currency';
import { useStore } from '@/lib/store';
import { useAuth } from '@/lib/auth-context';
import { useRepScorecards } from '@/hooks/use-rep-scorecards';
import type { RepScorecard, RepScorecardSortKey } from '@/lib/sales-management/rep-scorecard';
const SORT_OPTIONS: Array<{
  key: RepScorecardSortKey;
  label: string;
  shortLabel: string;
  queueLabel: string;
}> = [{
  key: 'overall',
  label: '综合',
  shortLabel: '综合',
  queueLabel: '按综合判断排序'
}, {
  key: 'judgment',
  label: '判断质量',
  shortLabel: '判断',
  queueLabel: '按判断质量排序'
}, {
  key: 'forecast',
  label: '预测校准',
  shortLabel: '预测',
  queueLabel: '按预测校准排序'
}, {
  key: 'execution',
  label: '执行可靠性',
  shortLabel: '执行',
  queueLabel: '按执行可靠性排序'
}, {
  key: 'coverage',
  label: '关系覆盖',
  shortLabel: '关系',
  queueLabel: '按关系覆盖排序'
}, {
  key: 'pipeline',
  label: '商机金额',
  shortLabel: '金额',
  queueLabel: '按商机金额排序'
}];

function getSortOption(sortBy: RepScorecardSortKey) {
  return SORT_OPTIONS.find(option => option.key === sortBy) ?? SORT_OPTIONS[0];
}

function repMetricValue(rep: RepScorecard, sortBy: RepScorecardSortKey): number {
  if (sortBy === 'judgment') return rep.judgmentQualityScore;
  if (sortBy === 'forecast') return rep.forecastCalibrationScore;
  if (sortBy === 'execution') return rep.executionReliabilityScore;
  if (sortBy === 'coverage') return rep.relationshipCoverageScore;
  if (sortBy === 'pipeline') return rep.pipelineValue;
  if (sortBy === 'revenue') return rep.wonValue;
  return rep.overallScore;
}

function metricTone(rep: RepScorecard, sortBy: RepScorecardSortKey): string {
  if (sortBy === 'pipeline' || sortBy === 'revenue') return 'text-foreground';
  return scoreTone(repMetricValue(rep, sortBy));
}
function scoreTone(score: number): string {
  if (score >= 75) return 'text-positive';
  if (score >= 50) return 'text-warning';
  return 'text-danger';
}
function ProgressLine({
  label,
  value
}: {
  label: string;
  value: number;
}) {
  return <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-secondary">{label}</span>
        <span className={'font-semibold tabular-nums ' + scoreTone(value)}>{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sidebar">
        <div className="h-full rounded-full bg-accent" style={{
        width: Math.max(4, Math.min(100, value)) + '%'
      }} />
      </div>
    </div>;
}
function avg(reps: RepScorecard[], pick: (rep: RepScorecard) => number): number {
  if (reps.length === 0) return 0;
  return Math.round(reps.reduce((sum, rep) => sum + pick(rep), 0) / reps.length);
}
function VisualBar({
  label,
  value,
  tone = 'bg-accent'
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-secondary">{label}</span>
        <span className={'font-semibold tabular-nums ' + scoreTone(value)}>{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-background">
        <div className={'h-full rounded-full ' + tone} style={{
        width: Math.max(4, Math.min(100, value)) + '%'
      }} />
      </div>
    </div>;
}
function TeamVisualPanel({
  reps
}: {
  reps: RepScorecard[];
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const dimensions = [{
    label: '判断',
    value: avg(reps, rep => rep.judgmentQualityScore),
    tone: 'bg-warning'
  }, {
    label: '预测',
    value: avg(reps, rep => rep.forecastCalibrationScore),
    tone: 'bg-accent'
  }, {
    label: '执行',
    value: avg(reps, rep => rep.executionReliabilityScore),
    tone: 'bg-positive'
  }, {
    label: '关系',
    value: avg(reps, rep => rep.relationshipCoverageScore),
    tone: 'bg-blue-500'
  }];
  const signalCounts = [{
    label: '预测风险',
    value: reps.reduce((sum, rep) => sum + rep.forecastContradictions, 0),
    tone: 'bg-danger'
  }, {
    label: '判断缺口',
    value: reps.reduce((sum, rep) => sum + rep.judgmentGaps, 0),
    tone: 'bg-warning'
  }, {
    label: '关系缺口',
    value: reps.reduce((sum, rep) => sum + rep.coverageGaps, 0),
    tone: 'bg-accent'
  }, {
    label: '执行风险',
    value: reps.reduce((sum, rep) => sum + rep.executionRisks, 0),
    tone: 'bg-positive'
  }];
  const totalSignals = Math.max(1, signalCounts.reduce((sum, item) => sum + item.value, 0));
  const matrixReps = reps.slice(0, 8);
  return <section className="grid gap-3 lg:grid-cols-[1fr_1fr_1.15fr]">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{tx("团队判断分布")}</h2>
          <span className="text-xs text-muted">{tx("均值")}</span>
        </div>
        <div className="space-y-3">
          {dimensions.map(item => <VisualBar key={item.label} label={item.label} value={item.value} tone={item.tone} />)}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{tx("风险构成")}</h2>
          <span className="text-xs text-muted">{totalSignals === 1 && signalCounts.every(item => item.value === 0) ? '0' : totalSignals}{tx("个信号")}</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-background">
          {signalCounts.map(item => <div key={item.label} className={item.tone} style={{
          width: (item.value > 0 ? Math.max(8, item.value / totalSignals * 100) : 0) + '%'
        }} />)}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {signalCounts.map(item => <div key={item.label} className="rounded-lg bg-background px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={'h-2 w-2 rounded-full ' + item.tone} />
                <span className="text-[11px] text-secondary">{item.label}</span>
              </div>
              <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{item.value}</p>
            </div>)}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{tx("销售判断矩阵")}</h2>
          <span className="text-xs text-muted">{tx("横轴=预测校准 · 纵轴=判断质量")}</span>
        </div>
        <div className="relative h-48 rounded-lg border border-border bg-background">
          <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
          <div className="absolute left-0 top-1/2 h-px w-full bg-border" />
          {matrixReps.map((rep, index) => {
          const x = Math.max(8, Math.min(92, rep.forecastCalibrationScore));
          const y = 100 - Math.max(8, Math.min(92, rep.judgmentQualityScore));
          const tone = rep.reviewSignals.some(signal => signal.severity === 'critical') ? 'bg-danger text-white' : rep.reviewSignals.length > 0 ? 'bg-warning text-foreground' : 'bg-positive text-white';
          return <div key={rep.userId} className={'absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-bold shadow-sm ' + tone} style={{
            left: x + '%',
            top: y + '%'
          }} title={rep.name + ' · 判断 ' + rep.judgmentQualityScore + ' · 预测 ' + rep.forecastCalibrationScore}>
                {index + 1}
              </div>;
        })}
          <span className="absolute bottom-2 left-3 text-[11px] text-muted">{tx("低校准")}</span>
          <span className="absolute bottom-2 right-3 text-[11px] text-muted">{tx("高校准")}</span>
          <span className="absolute left-3 top-2 text-[11px] text-muted">{tx("高判断")}</span>
        </div>
      </div>
    </section>;
}
function CoachingActionList({
  rep
}: {
  rep: RepScorecard;
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  if (rep.reviewSignals.length === 0) {
    return <div className="rounded-lg bg-positive/10 px-3 py-2 text-sm text-positive">{tx("暂无需要经理介入的明显信号。")}</div>;
  }
  const [primarySignal, ...secondarySignals] = rep.reviewSignals;
  const primaryTone = primarySignal.severity === 'critical' ? 'border-danger/20 bg-danger/10 text-danger' : primarySignal.severity === 'warning' ? 'border-warning/20 bg-warning/10 text-warning' : 'border-accent/20 bg-accent/10 text-accent';
  return <div className="space-y-2">
      <div className={'rounded-lg border px-3 py-2 ' + primaryTone}>
        <div className="flex items-start gap-2">
          <Brain className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">{primarySignal.summary}</p>
            <p className="mt-1 text-xs opacity-80">{primarySignal.label}</p>
          </div>
        </div>
      </div>
      {secondarySignals.length > 0 && <details className="group rounded-lg border border-border bg-background">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-medium text-secondary">
            <span>{tx("展开其余")}{secondarySignals.length}{tx("个信号")}</span>
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t border-border px-3 py-2">
            {secondarySignals.map(signal => <div key={signal.id} className="text-xs text-secondary">
                <p className="font-semibold text-foreground">{signal.summary}</p>
                <p className="mt-0.5">{signal.detail}</p>
              </div>)}
          </div>
        </details>}
    </div>;
}
function RepCoachingCard({
  rep,
  rank,
  sortBy
}: {
  rep: RepScorecard;
  rank: number;
  sortBy: RepScorecardSortKey;
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const currency = useStore(state => state.currencyCode);
  const primaryAccountHref = rep.activeDeals > 0 ? '/pipeline' : '/accounts';
  const activeOption = getSortOption(sortBy);
  const activeMetricValue = repMetricValue(rep, sortBy);
  const activeMetricDisplay = sortBy === 'pipeline' || sortBy === 'revenue'
    ? formatCurrency(activeMetricValue, currency)
    : String(activeMetricValue);
  return <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-sm font-bold text-secondary">
            {rank}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{rep.name}</h2>
            <p className="mt-0.5 text-xs text-muted">{rep.email ?? rep.role ?? '团队成员'}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-secondary">
              <span className="rounded-full bg-background px-2 py-1">{rep.activeDeals}{tx("个活跃机会")}</span>
              <span className="rounded-full bg-background px-2 py-1">{formatCurrency(rep.pipelineValue, currency)}{tx("商机金额")}</span>
              {rep.quota > 0 && <span className="rounded-full bg-background px-2 py-1">{tx("配额完成")}{rep.quotaAttainment}%</span>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[280px]">
          <div className="rounded-lg border border-border bg-background p-2">
            <p className={'text-xl font-bold tabular-nums ' + metricTone(rep, sortBy)}>{activeMetricDisplay}</p>
            <p className="text-[11px] text-muted">{tx(activeOption.shortLabel)}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-2">
            <p className={'text-xl font-bold tabular-nums ' + (rep.forecastRiskAmount > 0 ? 'text-danger' : 'text-positive')}>{rep.forecastContradictions}</p>
            <p className="text-[11px] text-muted">{tx("预测偏差")}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-2">
            <p className={'text-xl font-bold tabular-nums ' + (rep.executionRisks > 0 ? 'text-warning' : 'text-positive')}>{rep.executionRisks}</p>
            <p className="text-[11px] text-muted">{tx("执行风险")}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_280px]">
        <div className="grid gap-4 md:grid-cols-2">
          <ProgressLine label={tx("判断质量")} value={rep.judgmentQualityScore} />
          <ProgressLine label={tx("预测校准")} value={rep.forecastCalibrationScore} />
          <ProgressLine label={tx("执行可靠性")} value={rep.executionReliabilityScore} />
          <ProgressLine label={tx("关系覆盖")} value={rep.relationshipCoverageScore} />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{tx("默认复盘焦点")}</p>
          <CoachingActionList rep={rep} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-secondary">
        <div className="flex flex-wrap gap-3">
          <span>{tx("判断缺口")}{rep.judgmentGaps}</span>
          <span>{tx("关系缺口")}{rep.coverageGaps}</span>
          <span>{tx("逾期任务")}{rep.tasksOverdue}</span>
          <span>{tx("谋局推进")}{rep.strategicPlayStepCompletion || 0}%</span>
        </div>
        <Link href={primaryAccountHref} className="font-semibold text-accent hover:underline">{tx("查看相关机会")}</Link>
      </div>
      {rep.reviewSignals.length > 0 && <details className="group border-t border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-xs font-semibold text-secondary">
            <span>{tx("查看证据解释与复盘口径")}</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-3 px-5 pb-5 md:grid-cols-2">
            {rep.reviewSignals.map(signal => <div key={signal.id} className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs font-semibold text-foreground">{signal.label}</p>
                <p className="mt-1 text-sm text-secondary">{signal.detail}</p>
              </div>)}
          </div>
        </details>}
    </section>;
}
function TeamReviewPanel({
  reps
}: {
  reps: RepScorecard[];
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const forecastRisk = reps.filter(rep => rep.forecastContradictions > 0);
  const judgmentRisk = reps.filter(rep => rep.judgmentGaps > 0 || rep.coverageGaps > 0);
  const executionRisk = reps.filter(rep => rep.executionRisks > 0);
  const items = [{
    icon: LineChart,
    title: '先校准预测',
    detail: forecastRisk.length > 0 ? forecastRisk.slice(0, 2).map(rep => rep.name).join('、') + ' 存在销售概率与证据不一致。' : '当前没有明显预测偏差信号。',
    tone: forecastRisk.length > 0 ? 'text-danger' : 'text-positive'
  }, {
    icon: ShieldCheck,
    title: '补齐判断证据',
    detail: judgmentRisk.length > 0 ? judgmentRisk.slice(0, 2).map(rep => rep.name).join('、') + ' 的关键判断或关系覆盖需要复核。' : '关键判断证据状态相对稳定。',
    tone: judgmentRisk.length > 0 ? 'text-warning' : 'text-positive'
  }, {
    icon: CheckCircle2,
    title: '清理执行断点',
    detail: executionRisk.length > 0 ? executionRisk.slice(0, 2).map(rep => rep.name).join('、') + ' 有逾期动作或停滞谋局。' : '执行动作暂无集中断点。',
    tone: executionRisk.length > 0 ? 'text-warning' : 'text-positive'
  }];
  return <div className="rounded-xl border border-accent/15 bg-accent/[0.02]">
      <div className="flex items-center gap-2 border-b border-border/50 px-5 py-3">
        <Brain className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground">{tx("本周团队辅导重点")}</h2>
      </div>
      <div className="grid gap-3 p-4 lg:grid-cols-3">
        {items.map(item => {
        const Icon = item.icon;
        return <div key={item.title} className="rounded-lg border border-border bg-card p-4">
              <Icon className={'h-4 w-4 ' + item.tone} />
              <p className="mt-3 text-sm font-semibold text-foreground">{item.title}</p>
              <p className="mt-1 text-sm text-secondary">{item.detail}</p>
            </div>;
      })}
      </div>
    </div>;
}
export default function PerformancePage() {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const [sortBy, setSortBy] = useState<RepScorecardSortKey>('overall');
  const currency = useStore(state => state.currencyCode);
  const {
    orgName
  } = useAuth();
  const {
    scorecards
  } = useRepScorecards(sortBy);
  const activeSortOption = getSortOption(sortBy);
  const teamStats = useMemo(() => {
    const totalPipeline = scorecards.reduce((sum, rep) => sum + rep.pipelineValue, 0);
    const totalWon = scorecards.reduce((sum, rep) => sum + rep.wonValue, 0);
    const forecastRisk = scorecards.reduce((sum, rep) => sum + rep.forecastRiskAmount, 0);
    const avgJudgment = scorecards.length > 0 ? Math.round(scorecards.reduce((sum, rep) => sum + rep.judgmentQualityScore, 0) / scorecards.length) : 0;
    return {
      totalPipeline,
      totalWon,
      forecastRisk,
      avgJudgment
    };
  }, [scorecards]);
  const oneOnOneQueue = useMemo(() => {
    return scorecards.filter(rep => rep.reviewSignals.length > 0 || rep.tasksOverdue > 0 || rep.forecastRiskAmount > 0).slice(0, 4);
  }, [scorecards]);
  return <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-accent">{tx("团队判断复盘")}</p>
          <h1 className="mt-1 text-lg font-semibold text-foreground">{tx("销售判断复盘")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-secondary">
            {orgName ? orgName + ' · ' : ''}{tx("默认只呈现最需要经理介入的判断焦点；证据解释收起，避免 1:1 被低价值细节淹没。")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-0.5">
          {SORT_OPTIONS.map(option => <button key={option.key} onClick={() => setSortBy(option.key)} className={'rounded-md px-3 py-1.5 text-xs font-medium transition-colors ' + (sortBy === option.key ? 'bg-accent text-white shadow-sm' : 'text-muted hover:bg-background hover:text-foreground')}>
              {tx(option.label)}
            </button>)}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={tx("商机总额")} value={formatCurrency(teamStats.totalPipeline, currency)} icon={Target} iconBg="bg-positive/10" iconColor="text-positive" />
        <StatCard label={tx("已赢收入")} value={formatCurrency(teamStats.totalWon, currency)} icon={CheckCircle2} iconBg="bg-accent/8" iconColor="text-accent" />
        <StatCard label={tx("预测风险金额")} value={formatCurrency(teamStats.forecastRisk, currency)} icon={AlertTriangle} iconBg="bg-danger/10" iconColor="text-danger" />
        <StatCard label={tx("平均判断质量")} value={teamStats.avgJudgment} icon={ShieldCheck} iconBg="bg-warning/10" iconColor="text-warning" subtext={tx("满分100")} />
      </div>

      {scorecards.length > 0 ? <>
          <TeamVisualPanel reps={scorecards} />
          <TeamReviewPanel reps={scorecards} />
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-accent">{tx("经理动作队列")}</p>
                <h2 className="mt-1 text-sm font-semibold text-foreground">{tx("本周 1:1 优先级")}</h2>
              </div>
              <span className="text-xs text-muted">{tx(activeSortOption.queueLabel)}</span>
            </div>
            {oneOnOneQueue.length === 0 ? <div className="rounded-lg bg-background p-4 text-sm text-secondary">{tx("当前团队没有明显需要提前介入的辅导信号。")}</div> : <div className="grid gap-3 md:grid-cols-2">
                {oneOnOneQueue.map(rep => <div key={rep.userId} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{rep.name}</p>
                        <p className="mt-0.5 text-xs text-muted">{rep.activeDeals}{tx("个活跃商机 ·")}{formatCurrency(rep.pipelineValue, currency)}{tx("商机金额")}</p>
                      </div>
                      <span className={'rounded-full px-2 py-1 text-xs font-semibold ' + scoreTone(rep.overallScore)}>{rep.overallScore}</span>
                    </div>
                    <p className="mt-3 text-sm text-secondary">{rep.primaryCoachingFocus}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted">
                      <span className="rounded-full bg-card px-2 py-1">{tx("预测风险")}{formatCurrency(rep.forecastRiskAmount, currency)}</span>
                      <span className="rounded-full bg-card px-2 py-1">{tx("逾期动作")}{rep.tasksOverdue}</span>
                      <span className="rounded-full bg-card px-2 py-1">{tx("关系缺口")}{rep.coverageGaps}</span>
                    </div>
                  </div>)}
              </div>}
          </section>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">{tx("销售辅导卡片")} · {tx(activeSortOption.label)}</h2>
              <Link href="/leaderboard" className="text-xs font-semibold text-accent hover:underline">{tx("查看团队看板")}</Link>
            </div>
            {scorecards.map((rep, index) => <RepCoachingCard key={rep.userId} rep={rep} rank={index + 1} sortBy={sortBy} />)}
          </div>
        </> : <EmptyState icon={Users} title={tx("暂无团队成员数据")} description={tx("添加组织成员并设置客户/商机负责人后，Closr 会生成销售判断复盘。")} />}
    </div>;
}
