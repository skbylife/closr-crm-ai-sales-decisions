/**
 * AI Daily Cache — 每天第一次访问时计算，当日后续请求直接读缓存。
 *
 * 复用 ai_insights 表（org_id, entity_type, entity_id, insight_type, data, updated_at）。
 * 以 UTC+8（北京时间）日历日为缓存边界，午夜过后自动失效。
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { upsertInsight } from '@/lib/ai-event-hub';
import { buildFreshnessMeta, type FreshnessMeta } from '@/lib/ai-freshness';
import type { AIEntityType, InsightType } from '@/lib/babel-engine/types';
import { markAIInsightAsNonAuthoritative } from '@/lib/judgment/source-record-taxonomy';

// ── UTC+8 same-day check ─────────────────────────────────────────────

const BJ_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Returns true if `isoTimestamp` falls on the same calendar date as "now" in UTC+8.
 */
export function isSameDayUTC8(isoTimestamp: string): boolean {
  const cached = new Date(new Date(isoTimestamp).getTime() + BJ_OFFSET_MS);
  const now = new Date(Date.now() + BJ_OFFSET_MS);
  return (
    cached.getUTCFullYear() === now.getUTCFullYear() &&
    cached.getUTCMonth() === now.getUTCMonth() &&
    cached.getUTCDate() === now.getUTCDate()
  );
}

// ── Core utility ─────────────────────────────────────────────────────

export interface DailyCacheOptions<T> {
  orgId: string;
  entityType: AIEntityType;
  entityId: string;
  insightType: InsightType;
  forceRefresh?: boolean;
  compute: () => Promise<T>;
  trigger?: string;
}

export type CachedResult<T> = T & FreshnessMeta & { fromCache: boolean };

/**
 * Cache wrapper: check ai_insights for today's result → compute if stale → upsert → return.
 *
 * Usage:
 *   const result = await withDailyCache({
 *     orgId, entityType: 'account', entityId: accountId,
 *     insightType: 'cil_health',
 *     compute: () => getAccountHealthReport({ orgId, accountId }),
 *   });
 */
export async function withDailyCache<T extends Record<string, unknown>>(
  opts: DailyCacheOptions<T>,
): Promise<CachedResult<T>> {
  const admin = getSupabaseAdmin();

  // 1. Cache lookup (skip if forceRefresh)
  if (!opts.forceRefresh && admin) {
    const { data: cached } = await admin
      .from('ai_insights')
      .select('data, updated_at')
      .eq('org_id', opts.orgId)
      .eq('entity_type', opts.entityType)
      .eq('entity_id', opts.entityId)
      .eq('insight_type', opts.insightType)
      .maybeSingle();

    if (cached?.data && cached.updated_at && isSameDayUTC8(cached.updated_at)) {
      return {
        ...markAIInsightAsNonAuthoritative(cached.data as T),
        ...buildFreshnessMeta(cached.updated_at),
        fromCache: true,
      };
    }
  }

  // 2. Compute fresh
  const result = markAIInsightAsNonAuthoritative(await opts.compute());

  // 3. Persist (fire-and-forget — don't let a DB failure break the response)
  void upsertInsight(
    opts.orgId,
    opts.entityType,
    opts.entityId,
    opts.insightType,
    result,
    opts.trigger ?? 'daily_cache',
  );

  // 4. Return with freshness meta
  return {
    ...result,
    ...buildFreshnessMeta(new Date().toISOString()),
    fromCache: false,
  };
}
