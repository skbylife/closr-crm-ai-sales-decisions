import { guardResponse, requireAdmin, requireAuth, requireRole } from '@/lib/api-guard';
import { runCILClaimLintPass } from '@/lib/compiled-intelligence/ingest';
import { runComprehensiveLint } from '@/lib/compiled-intelligence/lint';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, 'admin');
    requireAdmin();

    const body = (await request.json().catch(() => ({}))) as {
      accountId?: string;
      nowIso?: string;
      mode?: 'legacy' | 'comprehensive';
    };

    if (!body.accountId) {
      return Response.json({ error: '缺少必填参数: accountId' }, { status: 400 });
    }

    // Default to comprehensive lint (P2); pass mode=legacy for P1 behavior
    if (body.mode === 'legacy') {
      const result = await runCILClaimLintPass({
        orgId: ctx.orgId,
        accountId: body.accountId,
        nowIso: body.nowIso,
      });
      return Response.json(result);
    }

    const result = await runComprehensiveLint({
      orgId: ctx.orgId,
      accountId: body.accountId,
      nowIso: body.nowIso,
    });

    return Response.json(result);
  } catch (err) {
    return guardResponse(err);
  }
}
