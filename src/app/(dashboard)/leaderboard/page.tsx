'use client';

import { visibleBusinessText } from "@/lib/visible-business-text";
import { useLocale } from "@/lib/i18n";
import Link from 'next/link';
import { useState } from 'react';
import { BarChart3, LineChart, ListChecks, Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency } from '@/lib/format-currency';
import { useStore } from '@/lib/store';
import { useAuth } from '@/lib/auth-context';
import { useRepScorecards } from '@/hooks/use-rep-scorecards';
import type { RepScorecard, RepScorecardSortKey } from '@/lib/sales-management/rep-scorecard';
const SORT_OPTIONS: Array<{
  key: RepScorecardSortKey;
  label: string;
  hint: string;
}> = [{
  key: 'overall',
  label: '综合判断',
  hint: '收入、证据、执行、覆盖'
}, {
  key: 'judgment',
  label: '判断质量',
  hint: '销售方法论与证据缺口'
}, {
  key: 'forecast',
  label: '预测校准',
  hint: '乐观预测与证据偏差'
}, {
  key: 'execution',
  label: '执行可靠性',
  hint: '任务与谋局推进'
}, {
  key: 'coverage',
  label: '关系覆盖',
  hint: '关键人与支持者'
}, {
  key: 'pipeline',
  label: '商机金额',
  hint: '开放商机金额'
}];
function scoreTone(score: number): string {
  if (score >= 75) return 'border-positive/20 bg-positive/10 text-positive';
  if (score >= 50) return 'border-warning/20 bg-warning/10 text-warning';
  return 'border-danger/20 bg-danger/10 text-danger';
}
function ScorePill({
  score
}: {
  score: number;
}) {
  return <span className={'inline-flex min-w-12 items-center justify-center rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums ' + scoreTone(score)}>
      {score}
    </span>;
}
function Metric({
  label,
  value,
  tone = 'text-foreground'
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={'mt-1 text-sm font-semibold tabular-nums ' + tone}>{value}</p>
    </div>;
}
function averageScore(scorecards: RepScorecard[], pick: (rep: RepScorecard) => number): number {
  if (scorecards.length === 0) return 0;
  return Math.round(scorecards.reduce((sum, rep) => sum + pick(rep), 0) / scorecards.length);
}
function BoardVisualSummary({
  scorecards
}: {
  scorecards: RepScorecard[];
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const scoreBands = [{
    label: '75+',
    value: scorecards.filter(rep => rep.overallScore >= 75).length,
    tone: 'bg-positive'
  }, {
    label: '50-74',
    value: scorecards.filter(rep => rep.overallScore >= 50 && rep.overallScore < 75).length,
    tone: 'bg-warning'
  }, {
    label: '<50',
    value: scorecards.filter(rep => rep.overallScore < 50).length,
    tone: 'bg-danger'
  }];
  const dimensions = [{
    label: '判断质量',
    value: averageScore(scorecards, rep => rep.judgmentQualityScore),
    tone: 'bg-warning'
  }, {
    label: '预测校准',
    value: averageScore(scorecards, rep => rep.forecastCalibrationScore),
    tone: 'bg-accent'
  }, {
    label: '执行可靠',
    value: averageScore(scorecards, rep => rep.executionReliabilityScore),
    tone: 'bg-positive'
  }, {
    label: '关系覆盖',
    value: averageScore(scorecards, rep => rep.relationshipCoverageScore),
    tone: 'bg-blue-500'
  }];
  const total = Math.max(1, scorecards.length);
  const signalReps = scorecards.filter(rep => rep.reviewSignals.length > 0).length;
  return <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr_1fr]">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{tx("分数分布")}</p>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-background">
          {scoreBands.map(band => <div key={band.label} className={band.tone} style={{
          width: band.value / total * 100 + '%'
        }} />)}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {scoreBands.map(band => <div key={band.label} className="rounded-lg bg-background px-2 py-2 text-center">
              <p className="text-[11px] text-muted">{band.label}</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-foreground">{band.value}</p>
            </div>)}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{tx("判断维度")}</p>
          <span className="text-xs text-secondary">{scorecards.length}{tx("人")}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {dimensions.map(item => <div key={item.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-secondary">{item.label}</span>
                <span className="font-semibold tabular-nums text-foreground">{item.value}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-background">
                <div className={'h-full rounded-full ' + item.tone} style={{
              width: Math.max(4, item.value) + '%'
            }} />
              </div>
            </div>)}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{tx("管理焦点")}</p>
        <div className="mt-4 flex items-end gap-3">
          <p className="text-4xl font-semibold leading-none tabular-nums text-foreground">{signalReps}</p>
          <p className="pb-1 text-sm text-secondary">{tx("人需要复盘")}</p>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-background">
          <div className="h-full rounded-full bg-warning" style={{
          width: signalReps / total * 100 + '%'
        }} />
        </div>
        <p className="mt-3 text-xs text-muted">{tx("默认只展示第一管理焦点；证据解释留在辅导页展开。")}</p>
      </div>
    </div>;
}
function SignalBadge({
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
    return <span className="rounded-full bg-positive/10 px-2 py-1 text-[11px] font-medium text-positive">{tx("暂无明显介入信号")}</span>;
  }
  const signal = rep.reviewSignals[0];
  const tone = signal.severity === 'critical' ? 'bg-danger/10 text-danger' : signal.severity === 'warning' ? 'bg-warning/10 text-warning' : 'bg-accent/10 text-accent';
  return <span className={'rounded-full px-2 py-1 text-[11px] font-medium ' + tone}>
      {signal.label}
      {rep.hiddenSignalCount > 0 ? ' +' + rep.hiddenSignalCount : ''}
    </span>;
}
function TopRepCard({
  rep,
  rank
}: {
  rep: RepScorecard;
  rank: number;
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const currency = useStore(state => state.currencyCode);
  const medal = rank === 1 ? '01' : rank === 2 ? '02' : '03';
  return <div className={'rounded-xl border p-4 ' + (rank === 1 ? 'border-accent/30 bg-accent/[0.04]' : 'border-border bg-card')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-muted">{tx("排名")}{medal}</p>
          <h2 className="mt-1 text-sm font-semibold text-foreground">{rep.name}</h2>
          <p className="mt-0.5 text-xs text-secondary">{rep.role ?? '销售'}</p>
        </div>
        <ScorePill score={rep.overallScore} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Metric label={tx("商机金额")} value={formatCurrency(rep.pipelineValue, currency)} />
        <Metric label={tx("判断质量")} value={rep.judgmentQualityScore} tone={rep.judgmentQualityScore >= 60 ? 'text-positive' : 'text-warning'} />
        <Metric label={tx("预测风险")} value={formatCurrency(rep.forecastRiskAmount, currency)} tone={rep.forecastRiskAmount > 0 ? 'text-danger' : 'text-positive'} />
        <Metric label={tx("覆盖缺口")} value={rep.coverageGaps} tone={rep.coverageGaps > 0 ? 'text-warning' : 'text-positive'} />
      </div>
      <div className="mt-3 flex items-start justify-between gap-3 rounded-lg bg-background px-3 py-2">
        <p className="min-w-0 text-xs text-secondary">{rep.primaryCoachingFocus}</p>
        <SignalBadge rep={rep} />
      </div>
    </div>;
}
function RepRow({
  rep,
  rank
}: {
  rep: RepScorecard;
  rank: number;
}) {
  const currency = useStore(state => state.currencyCode);
  return <div className="hidden border-b border-border last:border-0 md:block">
      <div className="grid grid-cols-[44px_minmax(160px,1fr)_90px_90px_90px_110px_110px_minmax(190px,1.2fr)] items-center gap-3 px-4 py-3 text-sm">
        <span className="font-semibold tabular-nums text-secondary">{rank}</span>
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{rep.name}</p>
          <p className="truncate text-[12px] text-muted">{rep.email ?? rep.role ?? '团队成员'}</p>
        </div>
        <div className="text-right">
          <ScorePill score={rep.overallScore} />
        </div>
        <span className="text-right font-semibold tabular-nums text-foreground">{rep.judgmentQualityScore}</span>
        <span className="text-right font-semibold tabular-nums text-foreground">{rep.forecastCalibrationScore}</span>
        <span className="text-right font-semibold tabular-nums text-foreground">{formatCurrency(rep.pipelineValue, currency)}</span>
        <span className={rep.forecastRiskAmount > 0 ? 'text-right font-semibold tabular-nums text-danger' : 'text-right font-semibold tabular-nums text-positive'}>
          {formatCurrency(rep.forecastRiskAmount, currency)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-secondary">{rep.primaryCoachingFocus}</p>
          <SignalBadge rep={rep} />
        </div>
      </div>
    </div>;
}
function RepMobileCard({
  rep,
  rank
}: {
  rep: RepScorecard;
  rank: number;
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const currency = useStore(state => state.currencyCode);
  return <div className="rounded-xl border border-border bg-card p-4 md:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-muted">{tx("排名")}{rank}</p>
          <h2 className="mt-1 truncate text-sm font-semibold text-foreground">{rep.name}</h2>
          <p className="mt-0.5 truncate text-xs text-secondary">{rep.email ?? rep.role ?? '团队成员'}</p>
        </div>
        <ScorePill score={rep.overallScore} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Metric label={tx("判断")} value={rep.judgmentQualityScore} />
        <Metric label={tx("预测校准")} value={rep.forecastCalibrationScore} />
        <Metric label={tx("商机金额")} value={formatCurrency(rep.pipelineValue, currency)} />
        <Metric label={tx("风险金额")} value={formatCurrency(rep.forecastRiskAmount, currency)} tone={rep.forecastRiskAmount > 0 ? 'text-danger' : 'text-positive'} />
      </div>
      <div className="mt-3 rounded-lg bg-background px-3 py-2">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{tx("默认管理焦点")}</p>
        <p className="text-xs text-secondary">{rep.primaryCoachingFocus}</p>
      </div>
    </div>;
}
export default function LeaderboardPage() {
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
    scorecards,
    loadingContext
  } = useRepScorecards(sortBy);
  const totals = scorecards.reduce((acc, rep) => ({
    pipeline: acc.pipeline + rep.pipelineValue,
    forecastRisk: acc.forecastRisk + rep.forecastRiskAmount,
    judgmentGaps: acc.judgmentGaps + rep.judgmentGaps,
    coverageGaps: acc.coverageGaps + rep.coverageGaps
  }), {
    pipeline: 0,
    forecastRisk: 0,
    judgmentGaps: 0,
    coverageGaps: 0
  });
  const benchmark = {
    bestJudgment: [...scorecards].sort((a, b) => b.judgmentQualityScore - a.judgmentQualityScore)[0],
    bestForecast: [...scorecards].sort((a, b) => b.forecastCalibrationScore - a.forecastCalibrationScore)[0],
    mostNeedsSupport: [...scorecards].sort((a, b) => b.forecastRiskAmount + b.coverageGaps * 100000 - (a.forecastRiskAmount + a.coverageGaps * 100000))[0]
  };
  return <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-accent">{tx("销售判断管理")}</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">{tx("团队判断看板")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-secondary">
            {orgName ? orgName + ' · ' : ''}{tx("先看需要管理介入的判断信号，再按需展开证据；这里不按填表数量排名。")}</p>
        </div>
        {loadingContext && <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">{tx("正在同步配额 / 谋局上下文")}</span>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label={tx("开放商机金额")} value={formatCurrency(totals.pipeline, currency)} />
        <Metric label={tx("预测风险金额")} value={formatCurrency(totals.forecastRisk, currency)} tone={totals.forecastRisk > 0 ? 'text-danger' : 'text-positive'} />
        <Metric label={tx("判断缺口")} value={totals.judgmentGaps} tone={totals.judgmentGaps > 0 ? 'text-warning' : 'text-positive'} />
        <Metric label={tx("关系覆盖缺口")} value={totals.coverageGaps} tone={totals.coverageGaps > 0 ? 'text-warning' : 'text-positive'} />
      </div>

      {scorecards.length > 0 && <BoardVisualSummary scorecards={scorecards} />}

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {SORT_OPTIONS.map(option => <button key={option.key} onClick={() => setSortBy(option.key)} className={'rounded-lg border px-3 py-2 text-left transition-colors ' + (sortBy === option.key ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-background text-secondary hover:text-foreground')}>
              <span className="block text-xs font-semibold">{option.label}</span>
              <span className="mt-0.5 block text-[11px] text-muted">{option.hint}</span>
            </button>)}
        </div>
      </div>

      {scorecards.length === 0 ? <EmptyState icon={Users} title={tx("还没有可评估的销售成员")} description={tx("先在组织里添加成员，并给客户或商机设置负责人；Closr 会自动生成判断质量排行。")} /> : <>
          <div className="grid gap-3 lg:grid-cols-3">
            {scorecards.slice(0, 3).map((rep, index) => <TopRepCard key={rep.userId} rep={rep} rank={index + 1} />)}
          </div>

          <section className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-accent">{tx("最佳判断样本")}</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{benchmark.bestJudgment?.name ?? '暂无'}</p>
              <p className="mt-1 text-xs text-secondary">{tx("判断质量")}{benchmark.bestJudgment?.judgmentQualityScore ?? 0}{tx("，适合作为团队复盘口径样本。")}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-accent">{tx("预测最稳样本")}</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{benchmark.bestForecast?.name ?? '暂无'}</p>
              <p className="mt-1 text-xs text-secondary">{tx("预测校准")}{benchmark.bestForecast?.forecastCalibrationScore ?? 0}{tx("，适合对照承诺口径。")}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-accent">{tx("优先支持对象")}</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{benchmark.mostNeedsSupport?.name ?? '暂无'}</p>
              <p className="mt-1 text-xs text-secondary">{tx("风险金额")}{formatCurrency(benchmark.mostNeedsSupport?.forecastRiskAmount ?? 0, currency)}{tx("，先看关系缺口和下一步动作。")}</p>
            </div>
          </section>

          <div className="space-y-3 md:space-y-0 md:rounded-xl md:border md:border-border md:bg-card">
            <div className="hidden grid-cols-[44px_minmax(160px,1fr)_90px_90px_90px_110px_110px_minmax(190px,1.2fr)] gap-3 border-b border-border px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-secondary md:grid">
              <span>#</span>
              <span>{tx("销售")}</span>
              <span className="text-right">{tx("综合")}</span>
              <span className="text-right">{tx("判断")}</span>
              <span className="text-right">{tx("预测校准")}</span>
              <span className="text-right">{tx("商机金额")}</span>
              <span className="text-right">{tx("风险金额")}</span>
              <span>{tx("默认只显示管理焦点")}</span>
            </div>
            {scorecards.map((rep, index) => <div key={rep.userId}>
                <RepMobileCard rep={rep} rank={index + 1} />
                <RepRow rep={rep} rank={index + 1} />
              </div>)}
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Link href="/performance" className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/40">
              <ListChecks className="h-5 w-5 text-accent" />
              <p className="mt-3 text-sm font-semibold text-foreground">{tx("进入团队辅导")}</p>
              <p className="mt-1 text-xs text-secondary">{tx("把看板信号转成经理复盘动作。")}</p>
            </Link>
            <Link href="/horizon" className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/40">
              <BarChart3 className="h-5 w-5 text-accent" />
              <p className="mt-3 text-sm font-semibold text-foreground">{tx("查看管理判断队列")}</p>
              <p className="mt-1 text-xs text-secondary">{tx("按客户和机会查看停滞商机与责任缺口。")}</p>
            </Link>
            <Link href="/forecast" className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/40">
              <LineChart className="h-5 w-5 text-accent" />
              <p className="mt-3 text-sm font-semibold text-foreground">{tx("校准预测")}</p>
              <p className="mt-1 text-xs text-secondary">{tx("对照证据和智能概率检查承诺口径。")}</p>
            </Link>
          </div>
        </>}
    </div>;
}