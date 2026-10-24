import { NextResponse } from 'next/server';
import { requireAuth, guardResponse } from '@/lib/api-guard';
import { getUnreadCount } from '@/lib/integration/notification-service';

/**
 * GET /api/notifications/count → { count: number }
 * 前端用来展示红点数字
 */
export async function GET() {
  try {
    const ctx = await requireAuth();

    const count = await getUnreadCount(ctx.orgId, ctx.userId);
    return NextResponse.json({ count });
  } catch (err) {
    return guardResponse(err);
  }
}
