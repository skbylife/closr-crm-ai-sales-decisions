import { guardResponse, requireAccountAccess, requireAuth, requireRole } from '@/lib/api-guard';
import { loadCILAccountContextScoped } from '@/lib/compiled-intelligence/context';

export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, 'admin');

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return Response.json({ error: '缺少必填参数: accountId' }, { status: 400 });
    }

    await requireAccountAccess(ctx, accountId);

    const context = await loadCILAccountContextScoped({
      orgId: ctx.orgId,
      accountId,
      ctx,
    });

    if (!context) {
      return Response.json({ error: 'CIL context 加载失败' }, { status: 503 });
    }

    return Response.json(context);
  } catch (err) {
    return guardResponse(err);
  }
}
