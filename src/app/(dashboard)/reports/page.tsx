'use client';

import Link from 'next/link';
import { useState, useMemo } from 'react';
import {
  BarChart3,
  ChevronRight,
  TrendingUp,
  Users,
  Activity,
  Mail,
  UserPlus,
  CheckSquare,
  Lightbulb,
  Download,
  Trophy,
  Filter,
  AlertTriangle,
  Target,
  ShieldCheck,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { useRoleFilteredData } from '@/hooks/use-role-filtered-data';
import { downloadCsv } from '@/lib/export-csv';
import { formatCurrency } from '@/lib/format-currency';
import { useLocale } from '@/lib/i18n';
import type { DealHealth, Opportunity, OpportunityStage } from '@/lib/babel-engine/types';
import { StageConversionFunnel } from '@/components/dashboard/stage-conversion-funnel';
import { WinLossDashboard } from '@/components/analytics/win-loss-dashboard';
import { PatternInsights } from '@/components/analytics/pattern-insights';

// ─── 时间范围 ────────────────────────────────────────────────────────

type TimeRange = 'month' | 'quarter' | 'year' | 'all';

const TIME_RANGE_OPTIONS: { key: TimeRange; label: string; labelEn: string }[] = [
  { key: 'month', label: '本月', labelEn: 'This month' },
  { key: 'quarter', label: '本季度', labelEn: 'This quarter' },
  { key: 'year', label: '本年', labelEn: 'This year' },
  { key: 'all', label: '全部', labelEn: 'All' },
];

const REPORT_HUB_LINKS = [
  {
    href: '/reports',
    label: '综合报表',
    labelEn: 'Overview',
    description: '商机趋势、阶段转化、客户画像、销售活动和赢丢单分析。',
    descriptionEn: 'Opportunity trend, stage conversion, account profile, sales activity, and win/loss analysis.',
    icon: BarChart3,
  },
  {
    href: '/performance',
    label: '绩效看板',
    labelEn: 'Performance',
    description: '团队判断质量、预测校准、执行可靠性和辅导重点。',
    descriptionEn: 'Team judgment quality, forecast calibration, execution reliability, and coaching priorities.',
    icon: Activity,
  },
  {
    href: '/leaderboard',
    label: '排行榜',
    labelEn: 'Leaderboard',
    description: '按综合判断、关系覆盖、执行和商机规模排序销售成员。',
    descriptionEn: 'Rank sellers by judgment, relationship coverage, execution, and opportunity scale.',
    icon: Trophy,
  },
  {
    href: '/forecast',
    label: '销售预测',
    labelEn: 'Forecast',
    description: '配额缺口、四档预测、阶段构成和智能概率偏差。',
    descriptionEn: 'Quota gap, forecast categories, stage mix, and AI probability variance.',
    icon: TrendingUp,
  },
] as const;

function getTimeRangeStart(range: TimeRange): Date | null {
  if (range === 'all') return null;
  const now = new Date();
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === 'quarter') {
    const qm = Math.floor(now.getMonth() / 3) * 3;
    return new Date(now.getFullYear(), qm, 1);
  }
  // year
  return new Date(now.getFullYear(), 0, 1);
}

// ─── 月份名工具 ──────────────────────────────────────────────────────

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const MONTH_NAMES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string, en = false): string {
  const [, m] = key.split('-');
  return (en ? MONTH_NAMES_EN : MONTH_NAMES)[parseInt(m, 10) - 1] || key;
}

// ─── 健康度标签 ──────────────────────────────────────────────────────

const HEALTH_LABELS: Record<DealHealth, string> = {
  healthy: '健康',
  at_risk: '风险',
  critical: '危险',
};
const HEALTH_LABELS_EN: Record<DealHealth, string> = {
  healthy: 'Healthy',
  at_risk: 'At risk',
  critical: 'Critical',
};

const HEALTH_COLORS: Record<DealHealth, string> = {
  healthy: 'bg-positive/15 text-positive',
  at_risk: 'bg-warning/15 text-warning',
  critical: 'bg-danger/15 text-danger',
};

const STAGE_LABELS: Record<string, string> = {
  lead_identified: '线索确认',
  discovery: '发现',
  needs_analysis: '需求分析',
  qualification: '资格确认',
  evaluation: '评估',
  proposal: '方案',
  solution_presented: '方案呈现',
  proposal_sent: '报价发送',
  negotiation: '谈判',
  contract_review: '合同审核',
  closed_won: '已赢单',
  closed_lost: '已丢单',
};
const STAGE_LABELS_EN: Record<string, string> = {
  lead_identified: 'Lead identified',
  discovery: 'Discovery',
  needs_analysis: 'Needs analysis',
  qualification: 'Qualification',
  evaluation: 'Evaluation',
  proposal: 'Proposal',
  solution_presented: 'Solution presented',
  proposal_sent: 'Proposal sent',
  negotiation: 'Negotiation',
  contract_review: 'Contract review',
  closed_won: 'Closed won',
  closed_lost: 'Closed lost',
};

function stageLabel(stage: string, en = false): string {
  return (en ? STAGE_LABELS_EN : STAGE_LABELS)[stage as OpportunityStage] ?? stage;
}

function isOpenOpportunity(opp: Opportunity): boolean {
  return opp.stage !== 'closed_won' && opp.stage !== 'closed_lost';
}

function isStaleOpportunity(opp: Opportunity): boolean {
  if (!isOpenOpportunity(opp) || !opp.expectedCloseDate) return false;
  return new Date(opp.expectedCloseDate).getTime() < Date.now();
}

function weightedValue(opp: Opportunity): number {
  return Math.round((opp.value || 0) * ((opp.probability || 0) / 100));
}

// ═════════════════════════════════════════════════════════════════════
// 主页面
// ═════════════════════════════════════════════════════════════════════

export default function ReportsPage() {
  const { locale } = useLocale();
  const en = locale === 'en';
  const currency = useStore((s) => s.currencyCode);
  const { accounts, opportunities, tasks, intelItems, emailDecodes } = useRoleFilteredData();

  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [industryFilter, setIndustryFilter] = useState('all');

  const rangeStart = getTimeRangeStart(timeRange);
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);

  const stageOptions = useMemo(
    () => Array.from(new Set(opportunities.map((opp) => opp.stage))).filter(Boolean),
    [opportunities]
  );
  const ownerOptions = useMemo(
    () => Array.from(new Set(opportunities.map((opp) => opp.owner).filter(Boolean))).sort(),
    [opportunities]
  );
  const industryOptions = useMemo(
    () => Array.from(new Set(accounts.map((account) => account.industry || (en ? 'Uncategorized' : '未分类')))).sort(),
    [accounts, en]
  );

  // ── 按时间范围过滤商机 ────────────────────────────────────────
  const filteredOpps = useMemo(() => {
    return opportunities.filter((o) => {
      if (rangeStart && new Date(o.createdAt) < rangeStart) return false;
      if (stageFilter !== 'all' && o.stage !== stageFilter) return false;
      if (ownerFilter !== 'all' && o.owner !== ownerFilter) return false;
      const account = accountById.get(o.accountId);
      const industry = account?.industry || (en ? 'Uncategorized' : '未分类');
      if (industryFilter !== 'all' && industry !== industryFilter) return false;
      return true;
    });
  }, [opportunities, rangeStart, stageFilter, ownerFilter, industryFilter, accountById, en]);

  const filteredAccountIds = useMemo(() => new Set(filteredOpps.map((o) => o.accountId)), [filteredOpps]);
  const filteredAccounts = useMemo(
    () => accounts.filter((account) => {
      if (industryFilter !== 'all' && (account.industry || (en ? 'Uncategorized' : '未分类')) !== industryFilter) return false;
      if (filteredAccountIds.size === 0) return true;
      return filteredAccountIds.has(account.id);
    }),
    [accounts, filteredAccountIds, industryFilter, en]
  );

  const managementSummary = useMemo(() => {
    const openOpps = filteredOpps.filter(isOpenOpportunity);
    const wonOpps = filteredOpps.filter((o) => o.stage === 'closed_won');
    const staleOpps = openOpps.filter(isStaleOpportunity);
    const forecastTotal = openOpps.reduce((sum, opp) => sum + weightedValue(opp), 0);
    const openPipeline = openOpps.reduce((sum, opp) => sum + (opp.value || 0), 0);
    const wonValue = wonOpps.reduce((sum, opp) => sum + (opp.value || 0), 0);
    const lateStagePipeline = openOpps
      .filter((opp) => ['proposal_sent', 'negotiation', 'contract_review'].includes(opp.stage))
      .reduce((sum, opp) => sum + (opp.value || 0), 0);
    const highRiskOpps = openOpps.filter((opp) => {
      const accountHealth = accountById.get(opp.accountId)?.dealHealth;
      return accountHealth === 'critical' || accountHealth === 'at_risk' || isStaleOpportunity(opp);
    });
    const stageStats = Object.entries(openOpps.reduce<Record<string, { count: number; value: number }>>((acc, opp) => {
      acc[opp.stage] = acc[opp.stage] || { count: 0, value: 0 };
      acc[opp.stage].count += 1;
      acc[opp.stage].value += opp.value || 0;
      return acc;
    }, {})).sort((a, b) => b[1].value - a[1].value);
    const bottleneck = stageStats[0];
    return {
      openOpps,
      openPipeline,
      wonValue,
      forecastTotal,
      lateStagePipeline,
      highRiskOpps,
      staleOpps,
      stageStats,
      bottleneckLabel: bottleneck ? stageLabel(bottleneck[0], en) : (en ? 'None' : '暂无'),
      bottleneckValue: bottleneck?.[1].value ?? 0,
    };
  }, [filteredOpps, accountById, en]);

  const managementQueue = useMemo(() => {
    return [...managementSummary.openOpps]
      .map((opp) => {
        const account = accountById.get(opp.accountId);
        const reasons = [
          isStaleOpportunity(opp) ? (en ? 'Expected close date has passed' : '预计关闭日期已过') : '',
          account?.dealHealth === 'critical' ? (en ? 'Critical account health' : '客户健康度危险') : '',
          account?.dealHealth === 'at_risk' ? (en ? 'Account health at risk' : '客户健康度风险') : '',
          opp.probability >= 70 && !['negotiation', 'contract_review'].includes(opp.stage)
            ? (en ? 'Probability is ahead of stage evidence' : '概率高于阶段证据')
            : '',
        ].filter(Boolean);
        return { opp, account, reasons, score: reasons.length * 100000000 + (opp.value || 0) };
      })
      .filter((item) => item.reasons.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }, [managementSummary.openOpps, accountById, en]);

  // ══════════════════════════════════════════════════════════════════
  // A. 管线趋势 — 最近 6 个月
  // ══════════════════════════════════════════════════════════════════

  const pipelineTrend = useMemo(() => {
    const now = new Date();
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(monthKey(d));
    }

    return months.map((mk) => {
      const [y, m] = mk.split('-').map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0, 23, 59, 59, 999);

      // 当月创建的商机
      const created = filteredOpps.filter((o) => {
        const d = new Date(o.createdAt);
        return d >= start && d <= end;
      });

      // 当月所有活跃商机的总管线值（创建日 <= 该月底 且未在该月前关闭丢失）
      const activeInMonth = filteredOpps.filter((o) => {
        const cd = new Date(o.createdAt);
        if (cd > end) return false;
        // 排除当月之前关闭丢失的
        if (o.stage === 'closed_lost' && o.updatedAt && new Date(o.updatedAt) < start) return false;
        return true;
      });
      const pipelineValue = activeInMonth
        .filter((o) => o.stage !== 'closed_lost')
        .reduce((s, o) => s + o.value, 0);

      // 当月赢单
      const won = filteredOpps.filter((o) => {
        if (o.stage !== 'closed_won') return false;
        const wd = o.wonDate ? new Date(o.wonDate) : new Date(o.updatedAt);
        return wd >= start && wd <= end;
      });

      return {
        month: mk,
        label: monthLabel(mk, en),
        pipelineValue,
        newCount: created.length,
        wonCount: won.length,
      };
    });
  }, [filteredOpps, en]);

  const maxPipelineValue = Math.max(...pipelineTrend.map((m) => m.pipelineValue), 1);

  // ══════════════════════════════════════════════════════════════════
  // C. 客户画像分析
  // ══════════════════════════════════════════════════════════════════

  // C1. 按行业分组
  const industryStats = useMemo(() => {
    const map: Record<string, { count: number; oppValue: number }> = {};
    for (const a of filteredAccounts) {
      const ind = a.industry || (en ? 'Uncategorized' : '未分类');
      if (!map[ind]) map[ind] = { count: 0, oppValue: 0 };
      map[ind].count++;
      // 对应的商机总值
      const acctOpps = filteredOpps.filter((o) => o.accountId === a.id);
      map[ind].oppValue += acctOpps.reduce((s, o) => s + o.value, 0);
    }
    return Object.entries(map).sort((a, b) => b[1].oppValue - a[1].oppValue);
  }, [filteredAccounts, filteredOpps, en]);

  // C2. 按客户健康度分组
  const healthStats = useMemo(() => {
    const map: Record<string, { count: number; oppValue: number }> = {};
    const healthKeys: DealHealth[] = ['healthy', 'at_risk', 'critical'];
    for (const h of healthKeys) map[h] = { count: 0, oppValue: 0 };
    map['未评估'] = { count: 0, oppValue: 0 };

    for (const a of filteredAccounts) {
      const h = a.dealHealth || '未评估';
      const key = h as string;
      if (!map[key]) map[key] = { count: 0, oppValue: 0 };
      map[key].count++;
      const acctOpps = filteredOpps.filter((o) => o.accountId === a.id);
      map[key].oppValue += acctOpps.reduce((s, o) => s + o.value, 0);
    }
    return Object.entries(map).filter(([, v]) => v.count > 0);
  }, [filteredAccounts, filteredOpps]);

  // ══════════════════════════════════════════════════════════════════
  // D. 销售活动统计
  // ══════════════════════════════════════════════════════════════════

  const activityStats = useMemo(() => {
    const start = rangeStart || new Date(0);

    const filteredTasks = tasks.filter((t) => {
      if (new Date(t.createdAt) < start) return false;
      if (t.accountId && filteredAccountIds.size > 0) return filteredAccountIds.has(t.accountId);
      if (t.opportunityId) return filteredOpps.some((opp) => opp.id === t.opportunityId);
      return true;
    });
    const createdTaskCount = filteredTasks.length;
    const completedTaskCount = filteredTasks.filter((t) => t.status === 'done').length;

    const newIntelCount = intelItems.filter((i) => new Date(i.date) >= start && filteredAccountIds.has(i.accountId)).length;

    // 新增联系人：统计范围内 accounts 下的联系人数（无 createdAt 就统计全部联系人）
    const allContacts = filteredAccounts.flatMap((a) => a.contacts || []);
    // contacts 没有独立 createdAt，用总数近似
    const newContactCount = rangeStart
      ? allContacts.length
      : allContacts.length;

    const newDecodeCount = emailDecodes.filter((d) => new Date(d.date) >= start && (!d.accountId || filteredAccountIds.has(d.accountId))).length;

    return { createdTaskCount, completedTaskCount, newIntelCount, newContactCount, newDecodeCount };
  }, [tasks, intelItems, filteredAccounts, emailDecodes, rangeStart, filteredAccountIds, filteredOpps]);

  // ═══════════════════════════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* ── 页头 ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-accent">{en ? 'Reports' : '报表'}</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">{en ? 'Overview Reports' : '综合报表'}</h1>
          <p className="text-sm text-muted mt-1">{en ? 'A management entry point for revenue health, team execution, and forecast trust.' : '管理层复盘收入健康、团队执行和预测可信度的入口。'}</p>
        </div>

        {/* 时间范围选择器 */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
          {TIME_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setTimeRange(opt.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                timeRange === opt.key
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-muted hover:text-foreground hover:bg-background'
              }`}
            >
              {en ? opt.labelEn : opt.label}
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Filter className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-foreground">{en ? 'Unified filters' : '统一筛选'}</h2>
          <span className="text-xs text-muted">{en ? 'Current filters affect every metric and export on this page' : '当前筛选会影响本页所有指标和导出'}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs font-medium text-secondary">
            {en ? 'Opportunity stage' : '商机阶段'}
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
              <option value="all">{en ? 'All stages' : '全部阶段'}</option>
              {stageOptions.map((stage) => <option key={stage} value={stage}>{stageLabel(stage, en)}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-secondary">
            {en ? 'Owner' : '负责人'}
            <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
              <option value="all">{en ? 'All owners' : '全部负责人'}</option>
              {ownerOptions.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-secondary">
            {en ? 'Account industry' : '客户行业'}
            <select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
              <option value="all">{en ? 'All industries' : '全部行业'}</option>
              {industryOptions.map((industry) => <option key={industry} value={industry}>{industry}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-accent">{en ? 'Management cockpit' : '管理驾驶舱'}</p>
              <h2 className="mt-1 text-base font-semibold text-foreground">{en ? 'Revenue Health Overview' : '收入健康总览'}</h2>
            </div>
            <Link href="/forecast" className="text-xs font-medium text-accent hover:underline">{en ? 'Open forecast' : '进入销售预测'}</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-background p-3">
              <div className="flex items-center gap-2 text-xs text-secondary"><Target className="h-3.5 w-3.5" />{en ? 'Open pipeline value' : '开放商机金额'}</div>
              <p className="mt-2 text-xl font-semibold text-foreground">{formatCurrency(managementSummary.openPipeline, currency)}</p>
              <p className="mt-1 text-[11px] text-muted">{en ? managementSummary.openOpps.length + ' open opportunities' : managementSummary.openOpps.length + ' 个开放商机'}</p>
            </div>
            <div className="rounded-lg bg-background p-3">
              <div className="flex items-center gap-2 text-xs text-secondary"><TrendingUp className="h-3.5 w-3.5" />{en ? 'Weighted forecast' : '加权预测'}</div>
              <p className="mt-2 text-xl font-semibold text-accent">{formatCurrency(managementSummary.forecastTotal, currency)}</p>
              <p className="mt-1 text-[11px] text-muted">{en ? 'Weighted by sales probability' : '按销售概率加权'}</p>
            </div>
            <div className="rounded-lg bg-background p-3">
              <div className="flex items-center gap-2 text-xs text-secondary"><ShieldCheck className="h-3.5 w-3.5" />{en ? 'Late-stage pipeline' : '后期商机金额'}</div>
              <p className="mt-2 text-xl font-semibold text-positive">{formatCurrency(managementSummary.lateStagePipeline, currency)}</p>
              <p className="mt-1 text-[11px] text-muted">{en ? 'Proposal, negotiation, and contract stages' : '报价、谈判、合同阶段'}</p>
            </div>
            <div className="rounded-lg bg-background p-3">
              <div className="flex items-center gap-2 text-xs text-secondary"><AlertTriangle className="h-3.5 w-3.5" />{en ? 'Needs intervention' : '需要介入'}</div>
              <p className="mt-2 text-xl font-semibold text-danger">{managementSummary.highRiskOpps.length}</p>
              <p className="mt-1 text-[11px] text-muted">{en ? 'Risk accounts or expired close dates' : '风险客户或关闭日期已过'}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-accent">{en ? 'Management actions' : '管理动作'}</p>
              <h2 className="mt-1 text-base font-semibold text-foreground">{en ? 'Priority Review Queue This Week' : '本周优先复盘队列'}</h2>
            </div>
            <span className="text-xs text-muted">{en ? 'Bottleneck: ' : '瓶颈：'}{managementSummary.bottleneckLabel}</span>
          </div>
          {managementQueue.length === 0 ? (
            <div className="rounded-lg bg-background p-4 text-sm text-secondary">{en ? 'No clear management intervention signal under the current filters.' : '当前筛选下没有明显管理介入信号。'}</div>
          ) : (
            <div className="space-y-2">
              {managementQueue.map(({ opp, account, reasons }) => (
                <Link key={opp.id} href={'/pipeline/' + opp.id} className="block rounded-lg border border-border bg-background p-3 transition-colors hover:border-accent/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{opp.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">{account?.name ?? (en ? 'Unknown account' : '未知客户')} · {stageLabel(opp.stage, en)}</p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-foreground">{formatCurrency(opp.value, currency)}</span>
                  </div>
                  <p className="mt-2 text-xs text-warning">{reasons.join(' / ')}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {REPORT_HUB_LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/35 hover:bg-sidebar/50"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-accent">
                  <Icon className="h-4 w-4" />
                </span>
                <ChevronRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
              </div>
              <h2 className="mt-4 text-sm font-semibold text-foreground">{en ? item.labelEn : item.label}</h2>
              <p className="mt-1 min-h-[48px] text-xs leading-relaxed text-secondary">{en ? item.descriptionEn : item.description}</p>
            </Link>
          );
        })}
      </section>

      {/* ══════════════════════════════════════════════════════════
       *  A. 管线趋势 — 最近 6 个月
       * ══════════════════════════════════════════════════════════ */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-bold text-foreground">{en ? 'Opportunity Trend' : '商机趋势'}</h2>
            <span className="text-[12px] text-muted">{en ? '(last 6 months)' : '（最近 6 个月）'}</span>
          </div>
          <button
            onClick={() =>
              downloadCsv(
                'pipeline-trend',
                en ? ['Month', 'Pipeline value', 'New opportunities', 'Wins'] : ['月份', '商机总值', '新增商机', '赢单数'],
                pipelineTrend.map((m) => [m.label, m.pipelineValue, m.newCount, m.wonCount])
              )
            }
            className="flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <Download className="h-3 w-3" /> {en ? 'Export' : '导出'}
          </button>
        </div>

        {/* 趋势表格 + 条形图 */}
        <div className="space-y-2">
          {pipelineTrend.map((m) => (
            <div key={m.month} className="flex items-center gap-3">
              {/* 月份 */}
              <span className="w-10 text-xs font-medium text-secondary text-right shrink-0">
                {m.label}
              </span>
              {/* 水平条形 */}
              <div className="flex-1 h-7 rounded bg-sidebar overflow-hidden relative">
                <div
                  className="h-full rounded bg-accent/80 transition-all duration-400"
                  style={{ width: `${(m.pipelineValue / maxPipelineValue) * 100}%` }}
                />
                {m.pipelineValue > 0 && (
                  <span className="absolute inset-y-0 left-2 flex items-center text-[12px] font-medium text-white">
                    {formatCurrency(m.pipelineValue, currency)}
                  </span>
                )}
              </div>
              {/* 新增 / 赢单 */}
              <div className="flex gap-3 shrink-0">
                <span className="text-[12px] text-muted w-14 text-right">
                  +{m.newCount} {en ? 'new' : '新增'}
                </span>
                <span className="text-[12px] text-positive w-14 text-right">
                  🏆{m.wonCount} {en ? 'won' : '赢单'}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* 汇总 */}
        <div className="border-t border-border pt-3 flex gap-6 text-xs">
          <div>
            <span className="text-[12px] text-muted">{en ? '6-month new' : '6 个月新增'}</span>
            <p className="font-bold text-foreground">
              {pipelineTrend.reduce((s, m) => s + m.newCount, 0)} {en ? '' : '个'}
            </p>
          </div>
          <div>
            <span className="text-[12px] text-muted">{en ? '6-month won' : '6 个月赢单'}</span>
            <p className="font-bold text-positive">
              {pipelineTrend.reduce((s, m) => s + m.wonCount, 0)} {en ? '' : '个'}
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
       *  B. 阶段转化漏斗（复用共享组件）
       * ══════════════════════════════════════════════════════════ */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-bold text-foreground">{en ? 'Stage Conversion Funnel' : '阶段转化漏斗'}</h2>
        </div>
        <StageConversionFunnel opportunities={filteredOpps} />
      </section>

      {/* ══════════════════════════════════════════════════════════
       *  C. 客户画像分析
       * ══════════════════════════════════════════════════════════ */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-bold text-foreground">{en ? 'Account Profile Analysis' : '客户画像分析'}</h2>
        </div>

        {/* C1: 按行业 */}
        <div>
          <h3 className="text-xs font-semibold text-secondary mb-2">{en ? 'By industry' : '按行业分布'}</h3>
          {industryStats.length === 0 ? (
            <p className="text-xs text-muted">{en ? 'No account data yet' : '暂无客户数据'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-semibold text-secondary">{en ? 'Industry' : '行业'}</th>
                    <th className="text-right py-2 px-4 font-semibold text-secondary">{en ? 'Accounts' : '客户数'}</th>
                    <th className="text-right py-2 pl-4 font-semibold text-secondary">{en ? 'Opportunity value' : '商机总值'}</th>
                  </tr>
                </thead>
                <tbody>
                  {industryStats.map(([ind, data]) => (
                    <tr key={ind} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4 font-medium text-foreground">{ind}</td>
                      <td className="py-2 px-4 text-right text-muted">{data.count}</td>
                      <td className="py-2 pl-4 text-right font-medium text-foreground">
                        {formatCurrency(data.oppValue, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* C2: 按健康度 */}
        <div>
          <h3 className="text-xs font-semibold text-secondary mb-2">{en ? 'By account health' : '按客户健康度'}</h3>
          {healthStats.length === 0 ? (
            <p className="text-xs text-muted">{en ? 'No assessment data yet' : '暂无评估数据'}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {healthStats.map(([key, data]) => {
                const isDealHealth = key === 'healthy' || key === 'at_risk' || key === 'critical';
                const label = isDealHealth ? (en ? HEALTH_LABELS_EN[key as DealHealth] : HEALTH_LABELS[key as DealHealth]) : key;
                const colorCls = isDealHealth ? HEALTH_COLORS[key as DealHealth] : 'bg-sidebar text-muted';
                return (
                  <div
                    key={key}
                    className={`rounded-lg p-3 text-center ${colorCls}`}
                  >
                    <p className="text-lg font-bold">{data.count}</p>
                    <p className="text-[12px] font-medium">{label}</p>
                    <p className="text-[12px] mt-1 opacity-70">
                      {formatCurrency(data.oppValue, currency)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
       *  D. 销售活动统计
       * ══════════════════════════════════════════════════════════ */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-bold text-foreground">{en ? 'Sales Activity' : '销售活动统计'}</h2>
          <span className="text-[12px] text-muted">
            {en ? '(' + TIME_RANGE_OPTIONS.find((o) => o.key === timeRange)?.labelEn + ')' : '（' + TIME_RANGE_OPTIONS.find((o) => o.key === timeRange)?.label + '）'}
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 任务 */}
          <div className="rounded-xl border border-border bg-sidebar p-4 text-center">
            <div className="flex items-center justify-center gap-1 mb-2">
              <CheckSquare className="h-4 w-4 text-accent" />
            </div>
            <p className="text-2xl font-bold text-foreground">{activityStats.createdTaskCount}</p>
            <p className="text-[12px] text-muted mt-0.5">{en ? 'Tasks created' : '创建任务'}</p>
            <div className="mt-2 border-t border-border pt-2">
              <p className="text-sm font-semibold text-positive">{activityStats.completedTaskCount}</p>
              <p className="text-[12px] text-muted">{en ? 'Completed' : '已完成'}</p>
            </div>
          </div>

          {/* 情报 */}
          <div className="rounded-xl border border-border bg-sidebar p-4 text-center">
            <div className="flex items-center justify-center gap-1 mb-2">
              <Lightbulb className="h-4 w-4 text-warning" />
            </div>
            <p className="text-2xl font-bold text-foreground">{activityStats.newIntelCount}</p>
            <p className="text-[12px] text-muted mt-0.5">{en ? 'New intel' : '新增情报'}</p>
          </div>

          {/* 联系人 */}
          <div className="rounded-xl border border-border bg-sidebar p-4 text-center">
            <div className="flex items-center justify-center gap-1 mb-2">
              <UserPlus className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-foreground">{activityStats.newContactCount}</p>
            <p className="text-[12px] text-muted mt-0.5">{en ? 'Total contacts' : '联系人总数'}</p>
          </div>

          {/* 邮件解读 */}
          <div className="rounded-xl border border-border bg-sidebar p-4 text-center">
            <div className="flex items-center justify-center gap-1 mb-2">
              <Mail className="h-4 w-4 text-accent" />
            </div>
            <p className="text-2xl font-bold text-foreground">{activityStats.newDecodeCount}</p>
            <p className="text-[12px] text-muted mt-0.5">{en ? 'Email decodes' : '邮件解读'}</p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
       *  E. 赢丢单分析面板
       * ══════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-bold text-foreground">{en ? 'Win/Loss Analysis' : '赢丢单分析'}</h2>
        </div>
        <WinLossDashboard />
      </section>

      {/* ══════════════════════════════════════════════════════════
       *  F. 跨客户模式识别
       * ══════════════════════════════════════════════════════════ */}
      <PatternInsights />
    </div>
  );
}
