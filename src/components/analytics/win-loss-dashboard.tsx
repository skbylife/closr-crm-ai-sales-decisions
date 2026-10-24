'use client';

import { useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts';
import {
  Trophy, XCircle, TrendingUp, AlertTriangle,
  ChevronDown, ChevronUp, Target, Building2, Loader2,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { formatCurrency, type CurrencyCode } from '@/lib/format-currency';
import type { Opportunity } from '@/lib/babel-engine/types';
import { useLocale } from '@/lib/i18n';

// ─── Types ────────────────────────────────────────────────────────────

interface KeyFactor {
  factor: string;
  impact: 'decisive' | 'contributing' | 'minor';
}

interface WinLossResult {
  result: 'won' | 'lost';
  summary: string;
  winFactors: KeyFactor[];
  lossFactors: KeyFactor[];
  missedSignals: string[];
  competitorInsight: string;
  turningPoint: string;
  lessonsLearned: string[];
  recommendations: string[];
}

// ─── Constants ────────────────────────────────────────────────────────

const PIE_COLORS = ['#10b981', '#ef4444']; // green=won, red=lost
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [, m] = key.split('-');
  return MONTH_NAMES[parseInt(m, 10) - 1] || key;
}

// ─── Main Dashboard ──────────────────────────────────────────────────

export function WinLossDashboard() {
  const { locale } = useLocale();
  const en = locale === 'en';
  const opportunities = useStore((s) => s.opportunities);
  const accounts = useStore((s) => s.accounts);
  const currency = useStore((s) => s.currencyCode);

  const closedOpps = useMemo(() =>
    opportunities.filter((o) => o.stage === 'closed_won' || o.stage === 'closed_lost'),
    [opportunities],
  );

  const wonOpps = useMemo(() => closedOpps.filter((o) => o.stage === 'closed_won'), [closedOpps]);
  const lostOpps = useMemo(() => closedOpps.filter((o) => o.stage === 'closed_lost'), [closedOpps]);

  // ── A. Win/Loss ratio pie ──────────────────────────────────────────
  const pieData = useMemo(() => [
    { name: '赢单', value: wonOpps.length, amount: wonOpps.reduce((s, o) => s + o.value, 0) },
    { name: '丢单', value: lostOpps.length, amount: lostOpps.reduce((s, o) => s + o.value, 0) },
  ], [wonOpps, lostOpps]);

  const winRate = closedOpps.length > 0
    ? Math.round((wonOpps.length / closedOpps.length) * 100)
    : 0;

  // ── B. Monthly win rate trend (last 6 months) ─────────────────────
  const monthlyTrend = useMemo(() => {
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

      const closedInMonth = closedOpps.filter((o) => {
        const d = o.stage === 'closed_won' && o.wonDate
          ? new Date(o.wonDate)
          : new Date(o.updatedAt);
        return d >= start && d <= end;
      });

      const won = closedInMonth.filter((o) => o.stage === 'closed_won').length;
      const total = closedInMonth.length;
      const rate = total > 0 ? Math.round((won / total) * 100) : 0;

      return { month: mk, label: monthLabel(mk), won, lost: total - won, total, rate };
    });
  }, [closedOpps]);

  // ── C. Win/Loss by industry ───────────────────────────────────────
  const industryStats = useMemo(() => {
    const map: Record<string, { won: number; lost: number; wonValue: number; lostValue: number }> = {};
    for (const o of closedOpps) {
      const acct = accounts.find((a) => a.id === o.accountId);
      const ind = acct?.industry || '未分类';
      if (!map[ind]) map[ind] = { won: 0, lost: 0, wonValue: 0, lostValue: 0 };
      if (o.stage === 'closed_won') {
        map[ind].won++;
        map[ind].wonValue += o.value;
      } else {
        map[ind].lost++;
        map[ind].lostValue += o.value;
      }
    }
    return Object.entries(map)
      .map(([ind, data]) => ({
        industry: ind,
        ...data,
        total: data.won + data.lost,
        rate: data.won + data.lost > 0 ? Math.round((data.won / (data.won + data.lost)) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [closedOpps, accounts]);

  // ── D. Top win/loss factors from MEDDICC ──────────────────────────
  const meddiccInsights = useMemo(() => {
    const wonScores = wonOpps.map((o) => o.meddicc?.overallScore ?? 0);
    const lostScores = lostOpps.map((o) => o.meddicc?.overallScore ?? 0);
    const avgWonScore = wonScores.length > 0 ? Math.round(wonScores.reduce((a, b) => a + b, 0) / wonScores.length) : 0;
    const avgLostScore = lostScores.length > 0 ? Math.round(lostScores.reduce((a, b) => a + b, 0) / lostScores.length) : 0;

    // Champion strength comparison
    const wonChampion = wonOpps.map((o) => o.meddicc?.champion?.strength ?? 0);
    const lostChampion = lostOpps.map((o) => o.meddicc?.champion?.strength ?? 0);
    const avgWonChampion = wonChampion.length > 0 ? (wonChampion.reduce((a, b) => a + b, 0) / wonChampion.length).toFixed(1) : '0';
    const avgLostChampion = lostChampion.length > 0 ? (lostChampion.reduce((a, b) => a + b, 0) / lostChampion.length).toFixed(1) : '0';

    // Lost reasons
    const lostReasons: Record<string, number> = {};
    for (const o of lostOpps) {
      const reason = o.lostReason || '未记录';
      lostReasons[reason] = (lostReasons[reason] ?? 0) + 1;
    }
    const topLostReasons = Object.entries(lostReasons).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { avgWonScore, avgLostScore, avgWonChampion, avgLostChampion, topLostReasons };
  }, [wonOpps, lostOpps]);

  // ── E. Recent reviews ─────────────────────────────────────────────
  const recentClosed = useMemo(
    () => closedOpps
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 8),
    [closedOpps],
  );

  if (closedOpps.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Trophy className="h-8 w-8 text-muted mx-auto mb-3" />
        <p className="text-sm text-muted">{en ? 'No closed opportunity data yet' : '暂无已结束的商机数据'}</p>
        <p className="text-xs text-muted mt-1">{en ? 'Win/loss analysis will appear here after opportunities are closed' : '商机关闭后，赢丢单分析将在此展示'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Row 1: KPI Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="总赢率" value={`${winRate}%`} sub={`${wonOpps.length}/${closedOpps.length}`} color="text-emerald-500" />
        <KpiCard label="赢单总额" value={formatCurrency(wonOpps.reduce((s, o) => s + o.value, 0), currency)} sub={`${wonOpps.length} 单`} color="text-emerald-500" />
        <KpiCard label="丢单总额" value={formatCurrency(lostOpps.reduce((s, o) => s + o.value, 0), currency)} sub={`${lostOpps.length} 单`} color="text-red-500" />
        <KpiCard
          label="方法论差异"
          value={`${meddiccInsights.avgWonScore} vs ${meddiccInsights.avgLostScore}`}
          sub="赢单 vs 丢单均分"
          color="text-accent"
        />
      </div>

      {/* ── Row 2: Pie + Monthly Trend ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie Chart */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
            <Target className="h-4 w-4 text-accent" /> 赢单 vs 丢单
          </h3>
          <div className="flex items-center gap-6">
            <div className="w-40 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={65} dataKey="value" stroke="none">
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [`${value} 单`, name as string]}
                    contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3 text-xs">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: PIE_COLORS[i] }} />
                  <span className="text-secondary">{d.name}:</span>
                  <span className="font-bold text-foreground">{d.value} 单</span>
                  <span className="text-muted">({formatCurrency(d.amount, currency)})</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Monthly Trend */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-accent" /> 月度赢率趋势
          </h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--color-muted)' }} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(value) => [`${value}%`, '赢率']}
                />
                <Line type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} dot={{ r: 4, fill: '#10b981' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* ── Row 3: By Industry + Lost Reasons ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Industry breakdown */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
            <Building2 className="h-4 w-4 text-accent" /> 按行业赢率
          </h3>
          {industryStats.length === 0 ? (
            <p className="text-xs text-muted">暂无数据</p>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={industryStats.slice(0, 6)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} />
                  <YAxis type="category" dataKey="industry" width={80} tick={{ fontSize: 11, fill: 'var(--color-muted)' }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="won" name="赢单" fill="#10b981" stackId="a" />
                  <Bar dataKey="lost" name="丢单" fill="#ef4444" stackId="a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Lost reasons + MEDDICC insights */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" /> 丢单分析
          </h3>

          {/* Champion comparison */}
          <div className="flex gap-4">
            <div className="flex-1 rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3 text-center">
              <p className="text-lg font-bold text-emerald-500">{meddiccInsights.avgWonChampion}</p>
              <p className="text-[11px] text-muted">赢单支持者强度</p>
            </div>
            <div className="flex-1 rounded-lg bg-red-500/5 border border-red-500/15 p-3 text-center">
              <p className="text-lg font-bold text-red-500">{meddiccInsights.avgLostChampion}</p>
              <p className="text-[11px] text-muted">丢单支持者强度</p>
            </div>
          </div>

          {/* Top lost reasons */}
          {meddiccInsights.topLostReasons.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-secondary mb-2">主要丢单原因</h4>
              <div className="space-y-1.5">
                {meddiccInsights.topLostReasons.map(([reason, count]) => (
                  <div key={reason} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                    <span className="text-xs text-secondary truncate mr-2">{reason}</span>
                    <span className="text-xs font-bold text-red-500 shrink-0">{count} 单</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── Row 4: Recent closed deals ───────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold text-foreground mb-4">最近复盘列表</h3>
        <div className="space-y-2">
          {recentClosed.map((opp) => (
            <RecentDealRow key={opp.id} opp={opp} accounts={accounts} currency={currency} />
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <p className="text-[11px] text-muted font-medium">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
      <p className="text-[11px] text-muted mt-0.5">{sub}</p>
    </div>
  );
}

function RecentDealRow({
  opp,
  accounts,
  currency,
}: {
  opp: Opportunity;
  accounts: { id: string; name: string }[];
  currency: CurrencyCode;
}) {
  const { locale } = useLocale();
  const [analysis, setAnalysis] = useState<WinLossResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isWon = opp.stage === 'closed_won';
  const acctName = accounts.find((a) => a.id === opp.accountId)?.name ?? '未知';

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/win-loss-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId: opp.id, outputLocale: locale }),
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysis(data);
        setExpanded(true);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex items-center gap-3 px-3 py-2.5">
        {isWon ? (
          <Trophy className="h-4 w-4 text-emerald-500 shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{opp.name}</p>
          <p className="text-[11px] text-muted">{acctName} · {formatCurrency(opp.value, currency)}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${isWon ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
          {isWon ? '赢单' : '丢单'}
        </span>
        {!analysis && (
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="rounded-lg bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent/20 disabled:opacity-50 flex items-center gap-1"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Target className="h-3 w-3" />}
            {loading ? '分析中' : '智能复盘'}
          </button>
        )}
        {analysis && (
          <button onClick={() => setExpanded(!expanded)} className="text-muted hover:text-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>

      {analysis && expanded && (
        <div className="border-t border-border px-3 py-3 space-y-2">
          <p className="text-xs text-secondary leading-relaxed">{analysis.summary}</p>
          {analysis.missedSignals.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-muted mb-1">被忽略的信号:</p>
              <ul className="space-y-0.5">
                {analysis.missedSignals.map((s, i) => (
                  <li key={i} className="text-[11px] text-secondary flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {analysis.competitorInsight && (
            <p className="text-[11px] text-muted"><span className="font-medium text-secondary">竞品:</span> {analysis.competitorInsight}</p>
          )}
        </div>
      )}
    </div>
  );
}
