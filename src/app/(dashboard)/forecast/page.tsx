'use client';

import { visibleBusinessText } from "@/lib/visible-business-text";
import { useLocale } from "@/lib/i18n";
import Link from 'next/link';
import { formatCurrency, type CurrencyCode } from '@/lib/format-currency';
import { useStore } from '@/lib/store';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { TrendingUp, Target, DollarSign, Brain, Settings, Calendar, BarChart3, X, ChevronDown, ChevronRight, AlertTriangle, Loader2, RefreshCw, Filter, Zap } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useAuth } from '@/lib/auth-context';
import { useEffectiveJobLevel } from '@/hooks/use-effective-job-level';
import { AIProbabilityBar } from '@/components/forecast/ai-probability-bar';
interface Opportunity {
  id: string;
  name: string;
  value: number;
  stage: string;
  account_id: string;
  expected_close_date?: string;
}
interface ForecastData {
  periodStart: string;
  periodEnd: string;
  closed: number;
  commit: number;
  bestCase: number;
  pipeline: number;
  aiPredicted: number;
  quota: number;
  attainment: number;
  byStage: Record<string, {
    count: number;
    value: number;
  }>;
  opportunities: Opportunity[];
}
interface AIForecastResult {
  aiProbability: number;
  salesProbability: number;
  gap: number;
  factors: {
    name: string;
    impact: 'positive' | 'negative' | 'neutral';
    detail: string;
  }[];
  risks: {
    label: string;
    severity: 'high' | 'medium' | 'low';
    detail: string;
  }[];
  reasoning: string;
  dwellDays: number;
}
type ViewMode = 'monthly' | 'quarterly' | 'yearly';
const FORECAST_FETCH_TIMEOUT_MS = 15_000;
const STAGE_LABELS: Record<string, string> = {
  closed_won: '已签约',
  closed_lost: '已丢单',
  contract_review: '合同审核',
  negotiation: '谈判中',
  proposal_sent: '方案已发送',
  solution_presented: '方案已讲解',
  proposal: '方案阶段',
  evaluation: '评估阶段',
  qualification: '资质确认',
  needs_analysis: '需求分析',
  discovery: '需求发现',
  lead_identified: '线索识别',
  prospecting: '初步接触'
};
const STAGE_COLORS: Record<string, string> = {
  closed_won: 'bg-positive',
  closed_lost: 'bg-slate-500',
  contract_review: 'bg-rose-500',
  negotiation: 'bg-accent',
  proposal_sent: 'bg-amber-500',
  solution_presented: 'bg-cyan-500',
  proposal: 'bg-blue-500',
  evaluation: 'bg-amber-500',
  qualification: 'bg-orange-500',
  needs_analysis: 'bg-violet-500',
  discovery: 'bg-gray-400',
  lead_identified: 'bg-slate-400',
  prospecting: 'bg-slate-500'
};
const STAGE_WEIGHTS: Record<string, number> = {
  closed_won: 1.0,
  contract_sent: 0.85,
  negotiation: 0.7,
  proposal_sent: 0.6,
  solution_presented: 0.5,
  proposal: 0.5,
  evaluation: 0.3,
  needs_analysis: 0.25,
  qualification: 0.15,
  discovery: 0.1,
  lead_identified: 0.05,
  prospecting: 0.05
};
function getStageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? '未知阶段';
}
function getQuarterForDate(date: Date): number {
  return Math.floor(date.getMonth() / 3);
}
function ForecastVisualSummary({
  forecast,
  currency
}: {
  forecast: ForecastData;
  currency: CurrencyCode;
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const quota = forecast.quota || 0;
  const gap = Math.max(0, quota - forecast.aiPredicted);
  const coverage = quota > 0 ? Math.round(forecast.pipeline / quota * 100) : 0;
  const aiQuotaPct = quota > 0 ? Math.round(forecast.aiPredicted / quota * 100) : 0;
  const forecastRows = [{
    label: '已签',
    value: forecast.closed,
    color: 'bg-positive'
  }, {
    label: '承诺',
    value: forecast.commit,
    color: 'bg-accent'
  }, {
    label: '最佳',
    value: forecast.bestCase,
    color: 'bg-blue-500'
  }, {
    label: '管道',
    value: forecast.pipeline,
    color: 'bg-warning'
  }];
  const maxValue = Math.max(1, quota, forecast.pipeline, forecast.bestCase, forecast.commit, forecast.closed, forecast.aiPredicted);
  const stageRows = Object.entries(forecast.byStage ?? {}).map(([stage, item]) => ({
    stage,
    label: getStageLabel(stage),
    count: item.count,
    value: item.value
  })).filter(item => item.count > 0 || item.value > 0).sort((a, b) => b.value - a.value).slice(0, 5);
  const maxStage = Math.max(1, ...stageRows.map(item => item.value));
  return <section className="grid gap-3 lg:grid-cols-[0.85fr_1.15fr_1fr]">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground">{tx("配额缺口")}</p>
        <div className="mt-4 flex items-end gap-3">
          <p className={gap > 0 ? 'text-3xl font-semibold tabular-nums text-danger' : 'text-3xl font-semibold tabular-nums text-positive'}>
            {formatCurrency(gap, currency)}
          </p>
          <p className="pb-1 text-xs text-secondary">{tx("智能预测 / 配额")}</p>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-background">
          <div className="h-full rounded-full bg-accent" style={{
          width: Math.max(4, Math.min(100, aiQuotaPct)) + '%'
        }} />
        </div>
        <p className="mt-2 text-xs text-muted">{tx("智能预测覆盖")}{aiQuotaPct}{tx("% · 商机覆盖")}{coverage}%</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">{tx("四档预测条")}</p>
          <span className="text-xs text-muted">{tx("红线=配额")}</span>
        </div>
        <div className="space-y-3">
          {forecastRows.map(row => <div key={row.label} className="flex items-center gap-3">
              <span className="w-10 text-right text-xs text-secondary">{row.label}</span>
              <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-background">
                <div className={'h-full rounded-full ' + row.color} style={{
              width: Math.max(4, Math.min(100, row.value / maxValue * 100)) + '%'
            }} />
                {quota > 0 && <div className="absolute bottom-0 top-0 w-0.5 bg-danger" style={{
              left: Math.min(100, quota / maxValue * 100) + '%'
            }} />}
              </div>
              <span className="w-20 text-right text-xs font-semibold tabular-nums text-foreground">{formatCurrency(row.value, currency)}</span>
            </div>)}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">{tx("阶段构成")}</p>
          <span className="text-xs text-muted">{forecast.opportunities.length}{tx("个商机")}</span>
        </div>
        <div className="space-y-3">
          {stageRows.map(row => <div key={row.stage}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-secondary">{row.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">{formatCurrency(row.value, currency)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-accent" style={{
              width: Math.max(5, row.value / maxStage * 100) + '%'
            }} />
              </div>
            </div>)}
        </div>
      </div>
    </section>;
}
export default function ForecastPage() {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const currency = useStore(s => s.currencyCode);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showQuotaForm, setShowQuotaForm] = useState(false);
  const [quotaAmount, setQuotaAmount] = useState('');
  const [quotaType, setQuotaType] = useState<'company' | 'team' | 'personal'>('company');
  const [quotaPeriod, setQuotaPeriod] = useState<'monthly' | 'quarterly' | 'yearly'>('quarterly');
  const [pipelineCoverage, setPipelineCoverage] = useState('3');
  const [view, setView] = useState<ViewMode>('quarterly');
  const [year, setYear] = useState(new Date().getFullYear());
  const {
    orgRole
  } = useAuth();
  const jobLevel = useEffectiveJobLevel();

  // Filters
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [minValue, setMinValue] = useState<string>('');
  const [maxValue, setMaxValue] = useState<string>('');

  // AI per-deal forecast state
  const [aiForecasts, setAiForecasts] = useState<Record<string, AIForecastResult>>({});
  const [aiLoadingIds, setAiLoadingIds] = useState<Set<string>>(new Set());
  const [expandedDealId, setExpandedDealId] = useState<string | null>(null);
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const fetchForecast = useCallback(async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), FORECAST_FETCH_TIMEOUT_MS);
    try {
      const r = await fetch('/api/forecast', {
        signal: controller.signal
      });
      if (!r.ok) throw new Error('加载预测数据失败');
      const d = await r.json();
      setForecast(d.forecast);
    } catch (err) {
      setError(err instanceof DOMException && err.name === 'AbortError' ? '销售预测加载超时，请重试' : err instanceof Error ? err.message : '加载失败');
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);
  const fetchAIForecast = useCallback(async (oppId: string) => {
    if (aiForecasts[oppId] || aiLoadingIds.has(oppId)) return;
    setAiLoadingIds(prev => new Set(prev).add(oppId));
    try {
      const res = await fetch('/api/ai-forecast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          opportunityId: oppId
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAiForecasts(prev => ({
          ...prev,
          [oppId]: data
        }));
      }
    } catch {
      // silently fail
    } finally {
      setAiLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(oppId);
        return next;
      });
    }
  }, [aiForecasts, aiLoadingIds]);
  const batchAnalyzeAll = useCallback(async () => {
    if (!forecast) return;
    const activeOpps = (forecast.opportunities ?? []).filter(o => o.stage !== 'closed_won');
    if (activeOpps.length === 0) return;
    setBatchAnalyzing(true);
    const batchSize = 3; // 并发限制
    for (let i = 0; i < activeOpps.length; i += batchSize) {
      const batch = activeOpps.slice(i, i + batchSize);
      await Promise.all(batch.map(opp => fetchAIForecast(opp.id)));
    }
    setBatchAnalyzing(false);
  }, [forecast, fetchAIForecast]);

  // Compute quarterly breakdown from opportunities
  const quarters = useMemo(() => {
    if (!forecast) return [];
    const opps = forecast.opportunities ?? [];
    const currentQ = getQuarterForDate(new Date());
    return [0, 1, 2, 3].map(qi => {
      const qStart = new Date(year, qi * 3, 1);
      const qEnd = new Date(year, (qi + 1) * 3, 0, 23, 59, 59);
      const qOpps = opps.filter(o => {
        if (!o.expected_close_date) return qi === currentQ;
        const d = new Date(o.expected_close_date);
        return d >= qStart && d <= qEnd;
      });
      const closed = qOpps.filter(o => o.stage === 'closed_won').reduce((s, o) => s + (o.value || 0), 0);
      const pipeline = qOpps.reduce((s, o) => s + (o.value || 0), 0);
      const aiPredicted = qOpps.reduce((s, o) => s + (o.value || 0) * (STAGE_WEIGHTS[o.stage] ?? 0.1), 0);
      const quota = forecast.quota; // per-quarter quota

      return {
        closed,
        pipeline,
        aiPredicted: Math.round(aiPredicted),
        quota
      };
    });
  }, [forecast, year]);

  // Compute monthly breakdown for trend chart
  const months = useMemo(() => {
    if (!forecast) return [];
    const opps = forecast.opportunities ?? [];
    const currentMonth = new Date().getMonth();
    return Array.from({
      length: 12
    }, (_, mi) => {
      const mStart = new Date(year, mi, 1);
      const mEnd = new Date(year, mi + 1, 0, 23, 59, 59);
      const mOpps = opps.filter(o => {
        if (!o.expected_close_date) return mi === currentMonth;
        const d = new Date(o.expected_close_date);
        return d >= mStart && d <= mEnd;
      });
      const closed = mOpps.filter(o => o.stage === 'closed_won').reduce((s, o) => s + (o.value || 0), 0);
      const pipeline = mOpps.reduce((s, o) => s + (o.value || 0), 0);
      const aiPredicted = mOpps.reduce((s, o) => s + (o.value || 0) * (STAGE_WEIGHTS[o.stage] ?? 0.1), 0);
      return {
        month: mi,
        closed,
        pipeline,
        aiPredicted: Math.round(aiPredicted)
      };
    });
  }, [forecast, year]);

  // AI Forecast total: sum of value * aiProbability for all deals that have AI forecasts
  const aiForecastTotal = useMemo(() => {
    if (!forecast) return 0;
    const opps = forecast.opportunities ?? [];
    return opps.reduce((sum, o) => {
      const af = aiForecasts[o.id];
      if (af) {
        return sum + Math.round(o.value * (af.aiProbability / 100));
      }
      return sum;
    }, 0);
  }, [forecast, aiForecasts]);
  const aiAnalyzedCount = Object.keys(aiForecasts).length;

  // Unique stages for filter dropdown
  const uniqueStages = useMemo(() => {
    if (!forecast) return [];
    const stages = new Set((forecast.opportunities ?? []).map(o => o.stage));
    return Array.from(stages).filter(s => s !== 'closed_won');
  }, [forecast]);

  // Filtered opportunities
  const filteredOpps = useMemo(() => {
    if (!forecast) return [];
    let opps = forecast.opportunities ?? [];

    // Stage filter
    if (stageFilter !== 'all') {
      opps = opps.filter(o => o.stage === stageFilter);
    }

    // Value filter
    const min = minValue ? parseFloat(minValue) : 0;
    const max = maxValue ? parseFloat(maxValue) : Infinity;
    if (minValue || maxValue) {
      opps = opps.filter(o => o.value >= min && o.value <= max);
    }
    return opps;
  }, [forecast, stageFilter, minValue, maxValue]);
  const handleSetQuota = async () => {
    const amount = parseFloat(quotaAmount);
    if (!amount) return;
    const now = new Date();
    let periodStart: string;
    let periodEnd: string;
    if (quotaPeriod === 'monthly') {
      periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      periodEnd = endDate.toISOString().split('T')[0];
    } else if (quotaPeriod === 'yearly') {
      periodStart = `${now.getFullYear()}-01-01`;
      periodEnd = `${now.getFullYear()}-12-31`;
    } else {
      const q = Math.floor(now.getMonth() / 3);
      periodStart = `${now.getFullYear()}-${String(q * 3 + 1).padStart(2, '0')}-01`;
      const endMonth = (q + 1) * 3;
      const endDate = new Date(now.getFullYear(), endMonth, 0);
      periodEnd = endDate.toISOString().split('T')[0];
    }
    await fetch('/api/quotas', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        periodType: quotaPeriod,
        periodStart,
        periodEnd,
        targetAmount: amount
      })
    });
    const r = await fetch('/api/forecast');
    const d = await r.json();
    setForecast(d.forecast);
    setShowQuotaForm(false);
  };
  const forecastData = forecast ?? {
    periodStart: '',
    periodEnd: '',
    closed: 0,
    commit: 0,
    bestCase: 0,
    pipeline: 0,
    aiPredicted: 0,
    quota: 0,
    attainment: 0,
    byStage: {},
    opportunities: []
  };
  const maxBar = Math.max(forecastData.pipeline, forecastData.quota || 1);
  const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const VIEW_LABELS: Record<ViewMode, string> = {
    monthly: '月度',
    quarterly: '季度',
    yearly: '年度'
  };

  // Non-closed opps for AI analysis section (apply filters)
  const activeOpps = filteredOpps.filter(o => o.stage !== 'closed_won');
  const forecastReviewItems = [...activeOpps].map(opp => {
    const af = aiForecasts[opp.id];
    const salesProbability = af?.salesProbability ?? 0;
    const gap = af ? Math.abs((af.aiProbability ?? 0) - salesProbability) : 0;
    const isPastClose = opp.expected_close_date ? new Date(opp.expected_close_date).getTime() < Date.now() : false;
    const reasons = [isPastClose ? '预计关闭日期已过' : '', gap >= 20 ? '销售概率与智能概率偏差较大' : '', salesProbability >= 70 && !['negotiation', 'contract_review'].includes(opp.stage) ? '高概率但阶段证据不足' : ''].filter(Boolean);
    return {
      opp,
      gap,
      reasons,
      score: reasons.length * 100000000 + (opp.value || 0)
    };
  }).filter(item => item.reasons.length > 0).sort((a, b) => b.score - a.score).slice(0, 5);
  const scenarioForecasts = [{
    label: '保守',
    value: forecastData.closed + forecastData.commit,
    hint: '只看已签和承诺'
  }, {
    label: '基准',
    value: forecastData.aiPredicted,
    hint: '按当前概率加权'
  }, {
    label: '乐观',
    value: forecastData.aiPredicted + Math.round(forecastData.bestCase * 0.35),
    hint: '计入部分最佳情况'
  }];
  if (loading) return <div className="flex h-full items-center justify-center"><LoadingSpinner /></div>;
  if (error) return <div className="flex h-full items-center justify-center">
      <div className="text-center max-w-md">
        <AlertTriangle className="mx-auto h-12 w-12 text-danger mb-4" />
        <p className="text-lg font-semibold text-foreground">{error}</p>
        <button onClick={fetchForecast} className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover">{tx("重试")}</button>
      </div>
    </div>;
  if (!forecast) return <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <TrendingUp className="mx-auto h-12 w-12 text-muted mb-4" />
        <p className="text-lg font-semibold text-foreground">{tx("暂无预测数据")}</p>
        <p className="text-sm text-muted mt-1">{tx("添加商机后即可查看销售预测")}</p>
      </div>
    </div>;
  return <div className="mx-auto max-w-6xl space-y-6 px-3 py-4 sm:px-6 sm:py-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{tx("销售预测")}</h1>
          <p className="text-sm text-muted mt-1">
            {forecast.periodStart} — {forecast.periodEnd}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['monthly', 'quarterly', 'yearly'] as ViewMode[]).map(v => <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === v ? 'bg-accent text-white' : 'bg-card text-secondary hover:bg-background'}`}>
                {VIEW_LABELS[v]}
              </button>)}
          </div>

          {/* Year Selector */}
          <div className="flex items-center gap-1 rounded-lg border border-border overflow-hidden">
            <Calendar className="h-3.5 w-3.5 text-muted ml-2" />
            {[2025, 2026, 2027].map(y => <button key={y} onClick={() => setYear(y)} className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${year === y ? 'bg-accent text-white' : 'bg-card text-secondary hover:bg-background'}`}>
                {y}
              </button>)}
          </div>

          <button onClick={fetchForecast} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50" title={tx("刷新数据")}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{tx("刷新")}</button>

          {(orgRole === 'owner' || orgRole === 'admin' || jobLevel >= 1) && <button onClick={() => setShowQuotaForm(!showQuotaForm)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-background">
              <Settings className="h-4 w-4" />{tx("目标管理")}</button>}
        </div>
      </div>

      {/* Quota Form */}
      {showQuotaForm && <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-foreground">{tx("目标管理")}</p>
              <p className="text-[12px] text-muted">{tx("设定销售目标，自动追踪完成进度")}</p>
            </div>
            <button onClick={() => setShowQuotaForm(false)} className="text-secondary hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 目标类型选择 */}
          <div className="flex gap-1 rounded-lg bg-sidebar p-1">
            {(['company', 'team', 'personal'] as const).map(t => <button key={t} onClick={() => setQuotaType(t)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${quotaType === t ? 'bg-card text-foreground shadow-sm' : 'text-secondary hover:text-foreground'}`}>
                {t === 'company' ? '公司目标' : t === 'team' ? '团队目标' : '个人目标'}
              </button>)}
          </div>

          {/* 时间周期 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[12px] text-muted font-medium">{tx("周期")}</label>
              <select value={quotaPeriod} onChange={e => setQuotaPeriod(e.target.value as 'monthly' | 'quarterly' | 'yearly')} className="form-input mt-1">
                <option value="monthly">{tx("月度")}</option>
                <option value="quarterly">{tx("季度")}</option>
                <option value="yearly">{tx("年度")}</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] text-muted font-medium">{tx("目标金额 ($)")}</label>
              <input type="number" value={quotaAmount} onChange={e => setQuotaAmount(e.target.value)} placeholder={quotaPeriod === 'yearly' ? '20,000,000' : quotaPeriod === 'quarterly' ? '5,000,000' : '1,500,000'} className="form-input mt-1" />
            </div>
          </div>

          {/* 管线覆盖率 */}
          <div>
            <label className="text-[12px] text-muted font-medium">{tx("管线覆盖率目标 (倍数)")}</label>
            <div className="flex items-center gap-2 mt-1">
              <input type="number" value={pipelineCoverage} onChange={e => setPipelineCoverage(e.target.value)} placeholder="3" min="1" max="10" step="0.5" className="form-input w-24" />
              <span className="text-xs text-muted">{tx("x 目标金额 = 所需管线")}</span>
            </div>
          </div>

          {/* 自动拆分提示 */}
          {quotaPeriod === 'yearly' && quotaAmount && <div className="rounded-lg bg-accent/5 border border-accent/20 p-3">
              <p className="text-xs text-accent font-medium">{tx("自动拆分")}</p>
              <p className="text-[12px] text-muted mt-1">{tx("年度")}{formatCurrency(parseFloat(quotaAmount), currency)}{tx("→ 季度")}{formatCurrency(parseFloat(quotaAmount) / 4, currency)}{tx("→ 月度")}{formatCurrency(parseFloat(quotaAmount) / 12, currency)}
              </p>
            </div>}

          <button onClick={handleSetQuota} className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover">{tx("保存目标")}</button>
        </div>}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted"><Target className="h-4 w-4" />{tx("本季配额")}</div>
          <p className="mt-2 text-2xl font-bold text-foreground">{forecast.quota ? formatCurrency(forecast.quota, currency) : '未设定'}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted"><DollarSign className="h-4 w-4" />{tx("已签金额")}</div>
          <p className="mt-2 text-2xl font-bold text-positive">{formatCurrency(forecast.closed, currency)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted"><TrendingUp className="h-4 w-4" />{tx("完成率")}</div>
          <p className={`mt-2 text-2xl font-bold ${forecast.attainment >= 100 ? 'text-positive' : forecast.attainment >= 50 ? 'text-warning' : 'text-danger'}`}>
            {forecast.attainment}%
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted"><Brain className="h-4 w-4" />{tx("智能预测")}</div>
          <p className="mt-2 text-2xl font-bold text-accent">{formatCurrency(forecast.aiPredicted, currency)}</p>
          <p className="text-[12px] text-muted mt-0.5">{tx("基于阶段加权")}</p>
        </div>
      </div>

      <ForecastVisualSummary forecast={forecast} currency={currency} />

      <section className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-accent">{tx("预测复盘")}</p>
              <h2 className="mt-1 text-sm font-semibold text-foreground">{tx("本周需要校准的商机")}</h2>
            </div>
            <span className="text-xs text-muted">{forecastReviewItems.length}{tx("个信号")}</span>
          </div>
          {forecastReviewItems.length === 0 ? <div className="rounded-lg bg-background p-4 text-sm text-secondary">{tx("当前没有明显预测校准信号。")}</div> : <div className="space-y-2">
              {forecastReviewItems.map(({
            opp,
            reasons,
            gap
          }) => <Link key={opp.id} href={'/pipeline/' + opp.id} className="block rounded-lg border border-border bg-background p-3 transition-colors hover:border-accent/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{opp.name}</p>
                      <p className="mt-0.5 text-xs text-muted">{getStageLabel(opp.stage)}{tx("· 销售概率")}{aiForecasts[opp.id]?.salesProbability ?? '未分析'}{aiForecasts[opp.id] ? '%' : ''}{gap > 0 ? ' · 偏差 ' + gap + '%' : ''}</p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-foreground">{formatCurrency(opp.value, currency)}</span>
                  </div>
                  <p className="mt-2 text-xs text-warning">{reasons.join(' / ')}</p>
                </Link>)}
            </div>}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4">
            <p className="text-xs font-semibold text-accent">{tx("场景预测")}</p>
            <h2 className="mt-1 text-sm font-semibold text-foreground">{tx("保守 / 基准 / 乐观")}</h2>
          </div>
          <div className="space-y-3">
            {scenarioForecasts.map(item => {
            const pct = forecastData.quota > 0 ? Math.min(100, Math.round(item.value / forecastData.quota * 100)) : 0;
            return <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-secondary">{item.label}</span>
                    <span className="font-semibold text-foreground">{formatCurrency(item.value, currency)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-background">
                    <div className="h-full rounded-full bg-accent" style={{
                  width: Math.max(4, pct) + '%'
                }} />
                  </div>
                  <p className="mt-1 text-[11px] text-muted">{item.hint}{forecastData.quota > 0 ? ' · 覆盖配额 ' + pct + '%' : ''}</p>
                </div>;
          })}
          </div>
        </div>
      </section>

      {/* 智能预测总额（有分析结果时显示） */}
      {aiAnalyzedCount > 0 && <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-accent" />
              <div>
                <p className="text-sm font-semibold text-foreground">{tx("智能预测总额")}</p>
                <p className="text-[11px] text-muted">{tx("基于")}{aiAnalyzedCount}{tx("个商机的智能概率加权")}</p>
              </div>
            </div>
            <p className="text-2xl font-bold text-accent">{formatCurrency(aiForecastTotal, currency)}</p>
          </div>

          {/* Probability Distribution */}
          <div className="mt-4 pt-4 border-t border-accent/20">
            <p className="text-xs font-medium text-foreground mb-2">{tx("概率分布")}</p>
            <div className="grid grid-cols-5 gap-1.5">
              {[{
            label: '0-20%',
            range: [0, 20],
            color: 'bg-danger'
          }, {
            label: '20-40%',
            range: [20, 40],
            color: 'bg-warning'
          }, {
            label: '40-60%',
            range: [40, 60],
            color: 'bg-amber-500'
          }, {
            label: '60-80%',
            range: [60, 80],
            color: 'bg-accent'
          }, {
            label: '80-100%',
            range: [80, 100],
            color: 'bg-positive'
          }].map(({
            label,
            range,
            color
          }) => {
            const count = Object.values(aiForecasts).filter(af => af.aiProbability >= range[0] && af.aiProbability < range[1]).length;
            const totalAnalyzed = Object.keys(aiForecasts).length;
            const percentage = totalAnalyzed > 0 ? Math.round(count / totalAnalyzed * 100) : 0;
            return <div key={label} className="flex flex-col items-center">
                    <div className="w-full bg-sidebar rounded-full h-16 flex items-end justify-center overflow-hidden">
                      <div className={`${color} w-full transition-all duration-500 rounded-t flex items-center justify-center text-white text-xs font-bold`} style={{
                  height: `${percentage}%`
                }}>
                        {count > 0 && <span className="text-[10px]">{count}</span>}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted mt-1">{label}</span>
                  </div>;
          })}
            </div>
          </div>
        </div>}

      {/* 预测条 */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground mb-4">{tx("四档预测")}</p>
        <div className="space-y-3">
          {[{
          label: '已签',
          value: forecast.closed,
          color: 'bg-positive'
        }, {
          label: '承诺',
          value: forecast.commit,
          color: 'bg-accent'
        }, {
          label: '最佳',
          value: forecast.bestCase,
          color: 'bg-blue-500'
        }, {
          label: '管道',
          value: forecast.pipeline,
          color: 'bg-amber-500'
        }].map(item => <div key={item.label} className="flex items-center gap-3">
              <span className="w-12 text-xs font-medium text-secondary text-right">{item.label}</span>
              <div className="flex-1 h-6 rounded-full bg-sidebar relative overflow-hidden">
                <div className={`h-full rounded-full ${item.color} transition-all duration-400`} style={{
              width: `${Math.min(item.value / maxBar * 100, 100)}%`
            }} />
                {forecast.quota > 0 && <div className="absolute top-0 bottom-0 w-0.5 bg-danger" style={{
              left: `${Math.min(forecast.quota / maxBar * 100, 100)}%`
            }} title={`配额: ${formatCurrency(forecast.quota, currency)}`} />}
              </div>
              <span className="w-16 text-xs font-bold text-foreground text-right">{formatCurrency(item.value, currency)}</span>
            </div>)}
        </div>
        {forecast.quota > 0 && <p className="text-[12px] text-muted mt-2 text-right">{tx("红线 = 配额")}{formatCurrency(forecast.quota, currency)}</p>}
      </div>

      {/* 单商机智能预测 */}
      {(forecast.opportunities ?? []).filter(o => o.stage !== 'closed_won').length > 0 && <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold text-foreground">{tx("商机智能概率分析")}</p>
              <span className="text-[11px] text-muted">({activeOpps.length}{tx("个)")}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Stage filter */}
              <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground">
                <option value="all">{tx("全部阶段")}</option>
                {uniqueStages.map(stage => <option key={stage} value={stage}>
                    {getStageLabel(stage)}
                  </option>)}
              </select>

              {/* Value range filter */}
              <div className="flex items-center gap-1">
                <input type="number" placeholder={tx("最小金额")} value={minValue} onChange={e => setMinValue(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground w-24" />
                <span className="text-xs text-muted">-</span>
                <input type="number" placeholder={tx("最大金额")} value={maxValue} onChange={e => setMaxValue(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg border border-border bg-card text-foreground w-24" />
              </div>

              {/* Reset filters */}
              {(stageFilter !== 'all' || minValue || maxValue) && <button onClick={() => {
            setStageFilter('all');
            setMinValue('');
            setMaxValue('');
          }} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs font-medium text-secondary hover:text-foreground hover:bg-background" title={tx("重置筛选")}>
                  <X className="h-3.5 w-3.5" />{tx("重置")}</button>}

              {/* Batch analyze button */}
              <button onClick={batchAnalyzeAll} disabled={batchAnalyzing || activeOpps.every(o => aiForecasts[o.id])} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                {batchAnalyzing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{tx("批量分析中...")}</> : <><Zap className="h-3.5 w-3.5" />{tx("一键分析全部")}</>}
              </button>
            </div>
          </div>

          {activeOpps.length === 0 ? <div className="py-8 text-center">
              <Filter className="mx-auto h-8 w-8 text-muted mb-2" />
              <p className="text-sm text-muted">{tx("没有符合条件的商机")}</p>
              <button onClick={() => {
          setStageFilter('all');
          setMinValue('');
          setMaxValue('');
        }} className="mt-2 text-xs text-accent hover:underline">{tx("重置筛选条件")}</button>
            </div> : <div className="space-y-2">
            {activeOpps.sort((a, b) => b.value - a.value).map(opp => {
          const af = aiForecasts[opp.id];
          const isLoading = aiLoadingIds.has(opp.id);
          const isExpanded = expandedDealId === opp.id;
          return <div key={opp.id} className={`rounded-lg border transition-colors ${af && af.gap > 20 ? 'border-danger/40 bg-danger/5' : 'border-border'}`}>
                    {/* 商机行 */}
                    <button className="w-full flex items-center gap-3 p-3 text-left hover:bg-background/50 transition-colors rounded-lg" onClick={() => {
              if (!af && !isLoading) {
                fetchAIForecast(opp.id);
              }
              setExpandedDealId(isExpanded ? null : opp.id);
            }}>
                      {/* Expand icon */}
                      <div className="shrink-0">
                        {isLoading ? <Loader2 className="h-4 w-4 text-accent animate-spin" /> : isExpanded ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
                      </div>

                      {/* 商机信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{opp.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${STAGE_COLORS[opp.stage] ?? 'bg-gray-400'} text-white`}>
                            {getStageLabel(opp.stage)}
                          </span>
                          {af && af.gap > 20 && <AlertTriangle className="h-3.5 w-3.5 text-danger shrink-0" />}
                        </div>
                        <span className="text-[11px] text-muted">{formatCurrency(opp.value, currency)}</span>
                      </div>

                      {/* Probability bars (compact) */}
                      <div className="w-48 shrink-0 hidden sm:block">
                        {af ? <AIProbabilityBar salesProbability={af.salesProbability} aiProbability={af.aiProbability} showLabels={false} /> : <div className="text-[11px] text-muted text-center">
                            {isLoading ? '分析中...' : '点击分析'}
                          </div>}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && af && <div className="px-3 pb-3 pt-0 space-y-3 border-t border-border/50 mx-3">
                        {/* Full probability bar on mobile */}
                        <div className="sm:hidden pt-3">
                          <AIProbabilityBar salesProbability={af.salesProbability} aiProbability={af.aiProbability} />
                        </div>

                        {/* Detailed probability comparison */}
                        <div className="pt-3 hidden sm:block">
                          <AIProbabilityBar salesProbability={af.salesProbability} aiProbability={af.aiProbability} />
                        </div>

                        {/* Dwell time */}
                        {af.dwellDays > 0 && <p className={`text-[11px] ${af.dwellDays > 30 ? 'text-warning' : 'text-muted'}`}>{tx("当前阶段停留")}{af.dwellDays}{tx("天")}{af.dwellDays > 60 && ' — 严重停滞'}
                            {af.dwellDays > 30 && af.dwellDays <= 60 && ' — 推进缓慢'}
                          </p>}

                        {/* 智能建议 */}
                        {af.reasoning && <div className="rounded-lg bg-accent/5 border border-accent/20 p-2.5">
                            <p className="text-[11px] font-medium text-accent mb-1">{tx("智能建议")}</p>
                            <p className="text-[12px] text-foreground">{af.reasoning}</p>
                          </div>}

                        {/* Factors */}
                        {af.factors.length > 0 && <div className="space-y-1">
                            <p className="text-[11px] font-medium text-secondary">{tx("影响因素")}</p>
                            {af.factors.map((f, i) => <div key={i} className="flex items-start gap-2 text-[12px]">
                                <span className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${f.impact === 'positive' ? 'bg-positive' : f.impact === 'negative' ? 'bg-danger' : 'bg-gray-400'}`} />
                                <span className="text-foreground">
                                  <strong>{f.name}</strong>: {f.detail}
                                </span>
                              </div>)}
                          </div>}

                        {/* Risks */}
                        {af.risks.length > 0 && <div className="space-y-1">
                            <p className="text-[11px] font-medium text-danger">{tx("风险标记")}</p>
                            {af.risks.map((r, i) => <div key={i} className="flex items-start gap-2 text-[12px]">
                                <span className={`text-[10px] px-1 py-0.5 rounded shrink-0 ${r.severity === 'high' ? 'bg-danger/10 text-danger' : r.severity === 'medium' ? 'bg-warning/10 text-warning' : 'bg-muted/10 text-muted'}`}>
                                  {r.severity === 'high' ? '高' : r.severity === 'medium' ? '中' : '低'}
                                </span>
                                <span className="text-foreground">
                                  <strong>{r.label}</strong>: {r.detail}
                                </span>
                              </div>)}
                          </div>}

                        {/* Link to deal */}
                        <Link href={`/pipeline/${opp.id}`} className="inline-block text-[12px] text-accent hover:underline">{tx("查看商机详情 →")}</Link>
                      </div>}
                  </div>;
        })}
            </div>}
        </div>}

      {/* Yearly Overview Table */}
      {view === 'yearly' && quarters.length === 4 && <div className="rounded-xl border border-border bg-card p-3 sm:p-5">
          <p className="text-sm font-semibold text-foreground mb-4">{year}{tx("年度总览")}</p>
          <div className="overflow-x-auto -mx-3 sm:mx-0">
            <div className="min-w-[600px] px-3 sm:px-0">
              <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-secondary">
                <th className="text-left py-2 pr-4">{tx("指标")}</th>
                <th className="text-right py-2 px-3">Q1</th>
                <th className="text-right py-2 px-3">Q2</th>
                <th className="text-right py-2 px-3">Q3</th>
                <th className="text-right py-2 px-3">Q4</th>
                <th className="text-right py-2 px-3 font-bold">{tx("全年")}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4 text-secondary">{tx("配额")}</td>
                {quarters.map((q, i) => <td key={i} className="text-right py-2 px-3">{formatCurrency(q.quota, currency)}</td>)}
                <td className="text-right py-2 px-3 font-bold">{formatCurrency(quarters.reduce((s, q) => s + q.quota, 0), currency)}</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4 text-positive">{tx("已签")}</td>
                {quarters.map((q, i) => <td key={i} className="text-right py-2 px-3 text-positive font-medium">{formatCurrency(q.closed, currency)}</td>)}
                <td className="text-right py-2 px-3 font-bold text-positive">{formatCurrency(quarters.reduce((s, q) => s + q.closed, 0), currency)}</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4 text-secondary">{tx("管道")}</td>
                {quarters.map((q, i) => <td key={i} className="text-right py-2 px-3">{formatCurrency(q.pipeline, currency)}</td>)}
                <td className="text-right py-2 px-3 font-bold">{formatCurrency(quarters.reduce((s, q) => s + q.pipeline, 0), currency)}</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4 text-accent">{tx("智能预测")}</td>
                {quarters.map((q, i) => <td key={i} className="text-right py-2 px-3 text-accent">{formatCurrency(q.aiPredicted, currency)}</td>)}
                <td className="text-right py-2 px-3 font-bold text-accent">{formatCurrency(quarters.reduce((s, q) => s + q.aiPredicted, 0), currency)}</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 text-secondary">{tx("完成率")}</td>
                {quarters.map((q, i) => {
                  const att = q.quota > 0 ? Math.round(q.closed / q.quota * 100) : 0;
                  return <td key={i} className={`text-right py-2 px-3 font-medium ${att >= 100 ? 'text-positive' : att >= 50 ? 'text-warning' : 'text-danger'}`}>{att}%</td>;
                })}
                {(() => {
                  const totalQ = quarters.reduce((s, q) => s + q.quota, 0);
                  const totalC = quarters.reduce((s, q) => s + q.closed, 0);
                  const att = totalQ > 0 ? Math.round(totalC / totalQ * 100) : 0;
                  return <td className={`text-right py-2 px-3 font-bold ${att >= 100 ? 'text-positive' : att >= 50 ? 'text-warning' : 'text-danger'}`}>{att}%</td>;
                })()}
              </tr>
            </tbody>
              </table>
            </div>
          </div>
          <p className="text-[11px] text-muted mt-2 sm:hidden">{tx("👈 左右滑动查看更多")}</p>
        </div>}

      {/* Monthly Trend Chart (CSS bar chart) */}
      {<div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-muted" />
            <p className="text-sm font-semibold text-foreground">{year}{tx("月度趋势")}</p>
          </div>
          <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: '4px',
        height: '160px',
        alignItems: 'end'
      }}>
            {months.map((m, i) => {
          const maxVal = Math.max(...months.map(mo => Math.max(mo.pipeline, mo.closed)), 1);
          const pH = Math.round(m.pipeline / maxVal * 140);
          const cH = Math.round(m.closed / maxVal * 140);
          return <div key={i} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
            height: '100%'
          }}>
                  <div style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              flex: 1
            }}>
                    {m.pipeline > 0 && <div style={{
                width: '100%',
                height: Math.max(pH, 6) + 'px',
                backgroundColor: 'rgba(96,165,250,0.5)',
                borderRadius: '3px 3px 0 0'
              }} />}
                    {m.closed > 0 && <div style={{
                width: '100%',
                height: Math.max(cH, 6) + 'px',
                backgroundColor: '#22c55e',
                borderRadius: '3px 3px 0 0',
                marginTop: m.pipeline > 0 ? '-' + Math.max(cH, 6) + 'px' : '0'
              }} />}
                  </div>
                  <span style={{
              fontSize: '9px',
              color: '#999',
              marginTop: '4px'
            }}>{MONTH_NAMES[i]}</span>
                </div>;
        })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[12px] text-muted">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded bg-positive" />{tx("已签")}</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded bg-blue-500/20" />{tx("管道")}</span>
          </div>
        </div>}

      {/* By Stage */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground mb-4">{tx("按阶段分布")}</p>
        <div className="space-y-2">
          {Object.entries(forecast.byStage).filter(([, v]) => v.count > 0).sort(([, a], [, b]) => b.value - a.value).map(([stage, data]) => {
          const maxStage = Math.max(...Object.values(forecast.byStage).map(s => s.value), 1);
          return <div key={stage} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-secondary text-right">{getStageLabel(stage)}</span>
                  <div className="flex-1 h-5 rounded bg-sidebar overflow-hidden">
                    <div className={`h-full rounded ${STAGE_COLORS[stage] ?? 'bg-gray-400'}`} style={{
                width: `${data.value / maxStage * 100}%`
              }} />
                  </div>
                  <span className="w-10 text-[12px] text-muted">{data.count}{tx("个")}</span>
                  <span className="w-16 text-xs font-medium text-foreground text-right">{formatCurrency(data.value, currency)}</span>
                </div>;
        })}
        </div>
      </div>

      {/* AI Insight */}
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
        <p className="text-sm font-semibold text-accent mb-3">{tx("智能预测分析")}</p>
        <div className="space-y-3 text-xs text-foreground">
          {/* 预测结论 */}
          <div className="rounded-lg bg-card border border-border p-3">
            <p className="font-semibold text-sm text-foreground mb-1">{tx("预测结论")}</p>
            <p>{tx("基于当前商机阶段加权，智能预测本季可签约")}<strong className="text-accent">{formatCurrency(forecast.aiPredicted, currency)}</strong></p>
            {forecast.quota > 0 && forecast.aiPredicted < forecast.quota && <p className="text-danger mt-1">{tx("预测低于配额，缺口")}{formatCurrency(forecast.quota - forecast.aiPredicted, currency)}</p>}
            {forecast.quota > 0 && forecast.aiPredicted >= forecast.quota && <p className="text-positive mt-1">{tx("预测达标，继续保持当前节奏")}</p>}
          </div>

          {/* 预测依据 */}
          <div className="rounded-lg bg-card border border-border p-3">
            <p className="font-semibold text-sm text-foreground mb-2">{tx("预测依据（阶段加权法）")}</p>
            <p className="text-muted mb-2">{tx("每个商机的预测贡献 = 金额 x 阶段转化权重。权重越高表示越接近签约。")}</p>
            <div className="space-y-1">
              {Object.entries(forecast.byStage || {}).filter(([, v]) => v.count > 0).sort(([, a], [, b]) => b.value - a.value).map(([stage, data]) => {
              const weight = STAGE_WEIGHTS[stage] ?? 0.1;
              const weighted = Math.round(data.value * weight);
              const stageLabel = getStageLabel(stage);
              return <div key={stage} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                      <span className="text-secondary">{stageLabel}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted">{data.count}{tx("个 ·")}{formatCurrency(data.value, currency)}</span>
                        <span className="text-muted">x {(weight * 100).toFixed(0)}%</span>
                        <span className="font-medium text-foreground w-24 text-right">= {formatCurrency(weighted, currency)}</span>
                      </div>
                    </div>;
            })}
            </div>
          </div>

          {/* 关键商机 */}
          {forecast.byStage?.negotiation?.count > 0 && <div className="rounded-lg bg-card border border-border p-3">
              <p className="font-semibold text-sm text-foreground mb-2">{tx("关键商机（谈判阶段）")}</p>
              <p className="text-muted mb-2">{tx("这些商机距离签约最近，权重 70%，是本季达标的关键：")}</p>
              {(forecast.opportunities ?? []).filter((o: Opportunity) => o.stage === 'negotiation').map((d: Opportunity) => <Link key={d.id} href={`/pipeline/${d.id}`} className="flex items-center justify-between py-1.5 hover:bg-background rounded px-2 -mx-2 transition-colors">
                  <span className="text-accent hover:underline">→ {d.name}</span>
                  <span className="text-foreground font-medium">{formatCurrency(d.value, currency)} <span className="text-muted font-normal">{tx("→ 贡献")}{formatCurrency(Math.round(d.value * 0.7), currency)}</span></span>
                </Link>)}
            </div>}

          {/* 建议 */}
          {forecast.quota > 0 && forecast.aiPredicted < forecast.quota && <div className="rounded-lg bg-danger/5 border border-danger/20 p-3">
              <p className="font-semibold text-sm text-danger mb-1">{tx("建议行动")}</p>
              <ul className="space-y-1 text-secondary">
                <li>{tx("- 加速推进谈判/报价阶段的商机，缩短决策周期")}</li>
                <li>{tx("- 发现/需求阶段的商机尽快推进到方案阶段")}</li>
                <li>{tx("- 考虑激活公海池中的历史客户，补充商机金额")}</li>
                {forecast.byStage?.discovery?.count > 3 && <li>{tx("- 发现阶段积压")}{forecast.byStage.discovery.count}{tx("个商机，需要筛选优先级")}</li>}
              </ul>
            </div>}
        </div>
      </div>
    </div>;
}