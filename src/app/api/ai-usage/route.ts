import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getUserContext } from '@/lib/permissions-server';
import { canManagePlatform } from '@/lib/permissions';

interface AIInvocationLogRow {
  id: string;
  org_id: string | null;
  user_id: string | null;
  account_id: string | null;
  opportunity_id: string | null;
  route: string | null;
  use_case: string | null;
  tier: string | null;
  model: string | null;
  provider: string | null;
  status: 'success' | 'error' | 'degraded';
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  duration_ms: number | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

type WindowKey = '1h' | '24h' | '7d';
type GroupByKey = 'route' | 'use_case' | 'model' | 'provider' | 'status';

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

const SELECT_FIELDS = 'id, org_id, user_id, account_id, opportunity_id, route, use_case, tier, model, provider, status, prompt_tokens, completion_tokens, total_tokens, duration_ms, error_message, metadata, created_at';
const SUMMARY_FETCH_LIMIT = 10000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const BACKGROUND_TOKEN_ALERT_THRESHOLD_24H = 1000;
const TOTAL_TOKEN_ALERT_THRESHOLD_24H = 100000;
const BACKGROUND_ROUTE_MARKERS = ['/api/agent/', 'daily-analysis', 'intelligence/scan', 'morning-briefing'];
const GROUP_BY_KEYS: GroupByKey[] = ['route', 'use_case', 'model', 'provider', 'status'];

function clampLimit(raw: string | null): number {
  const parsed = Number(raw ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT);
}

function parseWindow(raw: string | null): WindowKey {
  return raw === '1h' || raw === '7d' ? raw : '24h';
}

function parseGroupBy(raw: string | null): GroupByKey {
  return GROUP_BY_KEYS.includes(raw as GroupByKey) ? (raw as GroupByKey) : 'route';
}

function windowStart(window: WindowKey, now = new Date()): Date {
  const start = new Date(now);
  if (window === '1h') start.setHours(start.getHours() - 1);
  if (window === '24h') start.setDate(start.getDate() - 1);
  if (window === '7d') start.setDate(start.getDate() - 7);
  return start;
}

function normalizeKey(value: string | null | undefined): string {
  return value?.trim() || 'unknown';
}

function numericValue(value: number | null): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isTruthyMetadataFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === 'background' || value === 'cron' || value === 'scheduled';
}

function isBackgroundSuspected(row: AIInvocationLogRow): boolean {
  const haystack = `${row.route ?? ''} ${row.use_case ?? ''}`.toLowerCase();
  if (BACKGROUND_ROUTE_MARKERS.some(marker => haystack.includes(marker))) return true;

  const metadata = row.metadata ?? {};
  return [
    metadata.background,
    metadata.is_background,
    metadata.cron,
    metadata.scheduled,
    metadata.jobType,
    metadata.executionType,
    metadata.source,
    metadata.trigger,
  ].some(isTruthyMetadataFlag);
}

function summarizeRows(rows: AIInvocationLogRow[]): MetricSummary {
  const durations: number[] = [];
  let totalTokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let errors = 0;
  let degraded = 0;

  for (const row of rows) {
    totalTokens += numericValue(row.total_tokens);
    promptTokens += numericValue(row.prompt_tokens);
    completionTokens += numericValue(row.completion_tokens);
    if (row.status === 'error') errors += 1;
    if (row.status === 'degraded') degraded += 1;
    if (typeof row.duration_ms === 'number' && Number.isFinite(row.duration_ms)) durations.push(row.duration_ms);
  }

  durations.sort((a, b) => a - b);
  const durationTotal = durations.reduce((sum, value) => sum + value, 0);
  const p95Index = durations.length > 0 ? Math.min(Math.ceil(durations.length * 0.95) - 1, durations.length - 1) : -1;

  return {
    calls: rows.length,
    totalTokens,
    promptTokens,
    completionTokens,
    errors,
    degraded,
    avgDurationMs: durations.length > 0 ? Math.round(durationTotal / durations.length) : null,
    p95DurationMs: p95Index >= 0 ? durations[p95Index] : null,
  };
}

function buildBreakdown(rows: AIInvocationLogRow[], groupBy: GroupByKey): BreakdownRow[] {
  const buckets = new Map<string, AIInvocationLogRow[]>();
  for (const row of rows) {
    const key = normalizeKey(row[groupBy]);
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .map(([key, bucket]) => ({
      key,
      ...summarizeRows(bucket),
      backgroundSuspected: bucket.filter(isBackgroundSuspected).length,
    }))
    .sort((a, b) => b.calls - a.calls || b.totalTokens - a.totalTokens)
    .slice(0, 50);
}

function buildBreakdowns(rows: AIInvocationLogRow[]) {
  return {
    route: buildBreakdown(rows, 'route'),
    use_case: buildBreakdown(rows, 'use_case'),
    model: buildBreakdown(rows, 'model'),
    provider: buildBreakdown(rows, 'provider'),
    status: buildBreakdown(rows, 'status'),
  };
}

function buildUnattributedCounts(rows: AIInvocationLogRow[]) {
  return {
    route: rows.filter(row => !row.route).length,
    useCase: rows.filter(row => !row.use_case).length,
    user: rows.filter(row => !row.user_id).length,
    account: rows.filter(row => !row.account_id).length,
    opportunity: rows.filter(row => !row.opportunity_id).length,
  };
}

function buildAlerts(last24hRows: AIInvocationLogRow[]) {
  const backgroundRows = last24hRows.filter(isBackgroundSuspected);
  const backgroundSummary = summarizeRows(backgroundRows);
  const totalSummary = summarizeRows(last24hRows);
  const alerts: Array<{ code: string; severity: 'info' | 'warning'; message: string; value: number; threshold?: number }> = [];

  if (backgroundSummary.calls > 0) {
    alerts.push({
      code: 'background_calls_detected',
      severity: 'warning',
      message: '过去 24h 检测到疑似后台/定时 AI 调用，请确认是否符合预期。',
      value: backgroundSummary.calls,
    });
  }

  if (backgroundSummary.totalTokens > BACKGROUND_TOKEN_ALERT_THRESHOLD_24H) {
    alerts.push({
      code: 'background_tokens_high',
      severity: 'warning',
      message: '过去 24h 疑似后台/定时 AI token 消耗超过观察阈值。',
      value: backgroundSummary.totalTokens,
      threshold: BACKGROUND_TOKEN_ALERT_THRESHOLD_24H,
    });
  }

  if (totalSummary.totalTokens > TOTAL_TOKEN_ALERT_THRESHOLD_24H) {
    alerts.push({
      code: 'total_tokens_high',
      severity: 'info',
      message: '过去 24h AI token 总消耗较高，建议检查 top routes / expensive calls。',
      value: totalSummary.totalTokens,
      threshold: TOTAL_TOKEN_ALERT_THRESHOLD_24H,
    });
  }

  return alerts;
}

function redactLog(row: AIInvocationLogRow) {
  return {
    ...row,
    background_suspected: isBackgroundSuspected(row),
  };
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const ctx = await getUserContext(user.id);
    if (!ctx || !canManagePlatform(ctx.orgRole)) {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Supabase admin client 未配置' }, { status: 500 });
    }

    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get('limit'));
    const selectedWindow = parseWindow(url.searchParams.get('window'));
    const groupBy = parseGroupBy(url.searchParams.get('groupBy'));
    const since = url.searchParams.get('since');
    const now = new Date();
    const sevenDaysAgo = windowStart('7d', now);
    const selectedWindowStart = since ? new Date(since) : windowStart(selectedWindow, now);

    if (Number.isNaN(selectedWindowStart.getTime())) {
      return NextResponse.json({ error: 'since 必须是有效日期' }, { status: 400 });
    }

    const analysisStart = selectedWindowStart < sevenDaysAgo ? selectedWindowStart : sevenDaysAgo;

    const { data: summaryData, error: summaryError } = await admin
      .from('ai_invocation_logs')
      .select(SELECT_FIELDS)
      .eq('org_id', ctx.orgId)
      .gte('created_at', analysisStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(SUMMARY_FETCH_LIMIT);

    if (summaryError) {
      console.error('[api/ai-usage] summary query failed:', summaryError);
      return NextResponse.json({ error: '查询 AI 用量失败' }, { status: 500 });
    }

    const allRows = (summaryData ?? []) as AIInvocationLogRow[];
    const rowsFor1h = allRows.filter(row => new Date(row.created_at) >= windowStart('1h', now));
    const rowsFor24h = allRows.filter(row => new Date(row.created_at) >= windowStart('24h', now));
    const rowsFor7d = allRows.filter(row => new Date(row.created_at) >= sevenDaysAgo);
    const selectedRows = allRows.filter(row => new Date(row.created_at) >= selectedWindowStart);
    const backgroundRows = selectedRows.filter(isBackgroundSuspected);

    const { data: recentData, error: recentError } = await admin
      .from('ai_invocation_logs')
      .select(SELECT_FIELDS)
      .eq('org_id', ctx.orgId)
      .gte('created_at', selectedWindowStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit);

    if (recentError) {
      console.error('[api/ai-usage] recent query failed:', recentError);
      return NextResponse.json({ error: '查询 AI 调用明细失败' }, { status: 500 });
    }

    const { data: highTokenData, error: highTokenError } = await admin
      .from('ai_invocation_logs')
      .select(SELECT_FIELDS)
      .eq('org_id', ctx.orgId)
      .gte('created_at', selectedWindowStart.toISOString())
      .order('total_tokens', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (highTokenError) {
      console.error('[api/ai-usage] high token query failed:', highTokenError);
      return NextResponse.json({ error: '查询高 token 调用失败' }, { status: 500 });
    }

    const { data: slowData, error: slowError } = await admin
      .from('ai_invocation_logs')
      .select(SELECT_FIELDS)
      .eq('org_id', ctx.orgId)
      .gte('created_at', selectedWindowStart.toISOString())
      .order('duration_ms', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (slowError) {
      console.error('[api/ai-usage] slow query failed:', slowError);
      return NextResponse.json({ error: '查询慢调用失败' }, { status: 500 });
    }

    return NextResponse.json({
      query: {
        window: selectedWindow,
        since: selectedWindowStart.toISOString(),
        limit,
        groupBy,
      },
      summary: {
        windows: {
          '1h': summarizeRows(rowsFor1h),
          '24h': summarizeRows(rowsFor24h),
          '7d': summarizeRows(rowsFor7d),
        },
        backgroundSuspected: {
          selectedWindow: summarizeRows(backgroundRows),
          last24h: summarizeRows(rowsFor24h.filter(isBackgroundSuspected)),
          markers: BACKGROUND_ROUTE_MARKERS,
        },
        alerts: buildAlerts(rowsFor24h),
        unattributed: {
          selectedWindow: buildUnattributedCounts(selectedRows),
          last24h: buildUnattributedCounts(rowsFor24h),
        },
        truncated: allRows.length >= SUMMARY_FETCH_LIMIT,
        summaryFetchLimit: SUMMARY_FETCH_LIMIT,
      },
      breakdown: buildBreakdown(selectedRows, groupBy),
      breakdowns: buildBreakdowns(selectedRows),
      highCost: {
        byTokens: ((highTokenData ?? []) as AIInvocationLogRow[]).map(redactLog),
        byDuration: ((slowData ?? []) as AIInvocationLogRow[]).map(redactLog),
      },
      logs: ((recentData ?? []) as AIInvocationLogRow[]).map(redactLog),
    });
  } catch (e) {
    console.error('[api/ai-usage] GET failed:', e);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
