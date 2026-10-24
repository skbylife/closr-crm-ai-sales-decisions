import { guardResponse, requireAdmin, requireAuth, requireRole } from '@/lib/api-guard';
import { getAccountHealthReport } from '@/lib/compiled-intelligence/explain';
import type { CILAccountHealthReport } from '@/lib/compiled-intelligence/explain';
import { withDailyCache } from '@/lib/ai-cache';

export const maxDuration = 60;

/**
 * POST /api/cil-explain-batch
 *
 * Accepts { accountIds: string[], forceRefresh?: boolean } and returns health
 * reports for all accounts. Results are cached in ai_insights per UTC+8 day;
 * first request of the day computes fresh, subsequent requests read from cache.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, 'admin');
    requireAdmin();

    const body = (await request.json().catch(() => ({}))) as {
      accountIds?: string[];
      nowIso?: string;
      forceRefresh?: boolean;
    };

    if (!Array.isArray(body.accountIds) || body.accountIds.length === 0) {
      return Response.json({ error: '缺少必填参数: accountIds (非空数组)' }, { status: 400 });
    }

    // Cap at 20 accounts per batch to avoid excessive server load
    const ids = body.accountIds.slice(0, 20);

    const results = await Promise.allSettled(
      ids.map(async (accountId) => {
        const cached = await withDailyCache<Record<string, unknown>>({
          orgId: ctx.orgId,
          entityType: 'account',
          entityId: accountId,
          insightType: 'cil_health',
          forceRefresh: body.forceRefresh,
          trigger: 'cil_explain_batch',
          compute: async () => {
            const report = await getAccountHealthReport({
              orgId: ctx.orgId,
              accountId,
              nowIso: body.nowIso,
            });
            if (!report) return null as unknown as Record<string, unknown>;
            return report as unknown as Record<string, unknown>;
          },
        });
        // Treat empty/null cached results as no report
        const report = (cached && typeof cached === 'object' && 'healthScore' in cached)
          ? cached as unknown as CILAccountHealthReport
          : null;
        return { accountId, report };
      })
    );

    const reports: Record<string, CILAccountHealthReport | null> = {};
    for (const r of results) {
      if (r.status === 'fulfilled') {
        reports[r.value.accountId] = r.value.report;
      }
    }

    return Response.json({ reports });
  } catch (err) {
    return guardResponse(err);
  }
}
