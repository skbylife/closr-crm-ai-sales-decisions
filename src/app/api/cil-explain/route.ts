import { guardResponse, requireAdmin, requireAuth, requireRole } from '@/lib/api-guard';
import { getClaimExplainability, getAccountHealthReport } from '@/lib/compiled-intelligence/explain';

export const maxDuration = 60;

/**
 * POST /api/cil-explain
 *
 * Two modes:
 *   - { accountId, claimId } → claim-level explainability (supporting/counter evidence, affected pages, staleness)
 *   - { accountId }          → account-level health report (lint findings, evidence coverage, refresh targets)
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, 'admin');
    requireAdmin();

    const body = (await request.json().catch(() => ({}))) as {
      accountId?: string;
      claimId?: string;
      nowIso?: string;
    };

    if (!body.accountId) {
      return Response.json({ error: '缺少必填参数: accountId' }, { status: 400 });
    }

    // Claim-level explainability
    if (body.claimId) {
      const result = await getClaimExplainability({
        orgId: ctx.orgId,
        accountId: body.accountId,
        claimId: body.claimId,
        nowIso: body.nowIso,
      });

      if (!result) {
        return Response.json({ error: 'Claim 未找到或 CIL 加载失败' }, { status: 404 });
      }

      return Response.json({ type: 'claim', data: result });
    }

    // Account-level health report
    const result = await getAccountHealthReport({
      orgId: ctx.orgId,
      accountId: body.accountId,
      nowIso: body.nowIso,
    });

    if (!result) {
      return Response.json({ error: 'CIL 加载失败' }, { status: 500 });
    }

    return Response.json({ type: 'account', data: result });
  } catch (err) {
    return guardResponse(err);
  }
}
