'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, Clock, Database, ShieldAlert, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

type WindowKey = '1h' | '24h' | '7d';

interface MetricSummary {
  calls: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  errors: number;
  degraded: number;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
}

interface BreakdownRow extends MetricSummary {
  key: string;
  backgroundSuspected: number;
}

interface AlertItem {
  code: string;
  severity: 'info' | 'warning';
  message: string;
  value: number;
  threshold?: number;
}

interface AIUsageLog {
  id: string;
  route: string | null;
  use_case: string | null;
  model: string | null;
  provider: string | null;
  status: 'success' | 'error' | 'degraded';
  total_tokens: number | null;
  duration_ms: number | null;
  created_at: string;
  background_suspected: boolean;
}

interface AIUsageResponse {
  query: {
    window: WindowKey;
    since: string;
    limit: number;
    groupBy: string;
  };
  summary: {
    windows: Record<WindowKey, MetricSummary>;
    backgroundSuspected: {
      selectedWindow: MetricSummary;
      last24h: MetricSummary;
      markers: string[];
    };
    alerts: AlertItem[];
    truncated: boolean;
    summaryFetchLimit: number;
  };
  breakdowns: {
    route: BreakdownRow[];
    use_case: BreakdownRow[];
    model: BreakdownRow[];
    provider: BreakdownRow[];
    status: BreakdownRow[];
  };
  highCost: {
    byTokens: AIUsageLog[];
    byDuration: AIUsageLog[];
  };
  logs: AIUsageLog[];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDuration(value: number | null): string {
  if (value === null) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${value}ms`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function metricCard(label: string, value: string, detail: string, tone: 'default' | 'warning' = 'default') {
  return (
    <div className={`rounded-xl border p-4 ${tone === 'warning' ? 'border-amber-300 bg-amber-50/80 dark:bg-amber-950/20' : 'border-border bg-card'}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}

function BreakdownTable({ title, rows, valueLabel }: { title: string; rows: BreakdownRow[]; valueLabel: string }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="divide-y divide-border">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">暂无数据</p>
        ) : rows.slice(0, 8).map(row => (
          <div key={row.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{row.key}</p>
              <p className="text-xs text-muted">
                {formatNumber(row.totalTokens)} tokens · avg {formatDuration(row.avgDurationMs)} · p95 {formatDuration(row.p95DurationMs)}
              </p>
            </div>
            <span className="text-xs text-muted">{formatNumber(row.calls)} {valueLabel}</span>
            {row.backgroundSuspected > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                BG {row.backgroundSuspected}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CallsTable({ title, rows, mode }: { title: string; rows: AIUsageLog[]; mode: 'tokens' | 'duration' }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">时间</th>
              <th className="px-4 py-2 font-medium">Route / Use case</th>
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">{mode === 'tokens' ? 'Tokens' : 'Duration'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">暂无数据</td></tr>
            ) : rows.slice(0, 10).map(row => (
              <tr key={`${mode}-${row.id}`} className="hover:bg-background/70">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{formatDate(row.created_at)}</td>
                <td className="max-w-[360px] px-4 py-3">
                  <p className="truncate text-foreground">{row.route || 'unknown'}</p>
                  <p className="truncate text-xs text-muted">{row.use_case || 'unknown'}{row.background_suspected ? ' · suspected background' : ''}</p>
                </td>
                <td className="px-4 py-3 text-xs text-muted">{row.provider || 'unknown'} / {row.model || 'unknown'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs ${row.status === 'success' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : row.status === 'degraded' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-medium text-foreground">
                  {mode === 'tokens' ? formatNumber(row.total_tokens ?? 0) : formatDuration(row.duration_ms)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AIUsageAuditPage() {
  const { orgRole, isLoading } = useAuth();
  const [data, setData] = useState<AIUsageResponse | null>(null);
  const [windowKey, setWindowKey] = useState<WindowKey>('24h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = orgRole === 'owner' || orgRole === 'admin';

  useEffect(() => {
    if (isLoading || !canView) return;

    const controller = new AbortController();

    fetch(`/api/ai-usage?window=${windowKey}&limit=50`, { signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || '查询 AI 用量失败');
        return body as AIUsageResponse;
      })
      .then(body => {
        setData(body);
        setError(null);
      })
      .catch(err => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : '查询 AI 用量失败');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [canView, isLoading, windowKey]);

  function handleWindowChange(key: WindowKey) {
    setLoading(true);
    setError(null);
    setWindowKey(key);
  }

  const summary24h = data?.summary.windows['24h'];
  const background24h = data?.summary.backgroundSuspected.last24h;
  const topRoutes = useMemo(() => data?.breakdowns.route.slice(0, 8) ?? [], [data]);
  const topModels = useMemo(() => data?.breakdowns.model.slice(0, 8) ?? [], [data]);

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" /></div>;
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-muted" />
          <h1 className="text-xl font-semibold text-foreground">无权限查看 AI Usage</h1>
          <p className="mt-2 text-sm text-muted">此页面仅限 organization owner/admin，用于排查组织级 AI 调用与 token 消耗。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-accent" />
            <h1 className="text-2xl font-bold text-foreground">AI Usage Audit</h1>
          </div>
          <p className="mt-1 text-sm text-muted">P0 观察页：只展示 metadata / token / duration，不展示 prompt 或 completion 原文。</p>
        </div>
        <div className="flex rounded-lg border border-border bg-card p-1">
          {(['1h', '24h', '7d'] as WindowKey[]).map(key => (
            <button
              key={key}
              onClick={() => handleWindowChange(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${windowKey === key ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/20 dark:text-red-200">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {loading && <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted">加载中…</div>}

      {data && summary24h && background24h && (
        <>
          {data.summary.alerts.length > 0 && (
            <div className="space-y-2">
              {data.summary.alerts.map(alert => (
                <div key={alert.code} className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">{alert.message}</p>
                    <p className="text-xs opacity-80">value={formatNumber(alert.value)}{alert.threshold ? ` · threshold=${formatNumber(alert.threshold)}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {metricCard('24h Calls', formatNumber(summary24h.calls), `${summary24h.errors} errors · ${summary24h.degraded} degraded`, summary24h.errors > 0 || summary24h.degraded > 0 ? 'warning' : 'default')}
            {metricCard('24h Tokens', formatNumber(summary24h.totalTokens), `${formatNumber(summary24h.promptTokens)} prompt · ${formatNumber(summary24h.completionTokens)} completion`)}
            {metricCard('Background suspected', formatNumber(background24h.calls), `${formatNumber(background24h.totalTokens)} tokens in last 24h`, background24h.calls > 0 ? 'warning' : 'default')}
            {metricCard('Latency', formatDuration(summary24h.avgDurationMs), `p95 ${formatDuration(summary24h.p95DurationMs)}`)}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownTable title="Top Routes" rows={topRoutes} valueLabel="calls" />
            <BreakdownTable title="Top Models" rows={topModels} valueLabel="calls" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownTable title="By Provider" rows={data.breakdowns.provider} valueLabel="calls" />
            <BreakdownTable title="By Status" rows={data.breakdowns.status} valueLabel="calls" />
          </div>

          <CallsTable title="Recent high-cost calls · by tokens" rows={data.highCost.byTokens} mode="tokens" />
          <CallsTable title="Recent slow calls · by duration" rows={data.highCost.byDuration} mode="duration" />

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground"><Clock className="h-4 w-4" /> Window</div>
              <p className="mt-2 text-xs text-muted">当前查询：{data.query.window} · since {formatDate(data.query.since)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground"><Database className="h-4 w-4" /> Summary cap</div>
              <p className="mt-2 text-xs text-muted">最多读取近 7d {formatNumber(data.summary.summaryFetchLimit)} 条用于聚合{data.summary.truncated ? '（已截断）' : ''}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground"><Zap className="h-4 w-4" /> Background markers</div>
              <p className="mt-2 text-xs text-muted">{data.summary.backgroundSuspected.markers.join(', ')}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
