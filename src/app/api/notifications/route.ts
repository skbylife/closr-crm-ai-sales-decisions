import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, guardResponse } from '@/lib/api-guard';
import {
  getUnreadNotifications,
  markAsRead,
  markAllAsRead,
} from '@/lib/integration/notification-service';

/**
 * GET /api/notifications → 当前用户的未读通知列表
 */
export async function GET() {
  try {
    const ctx = await requireAuth();
    const notifications = await getUnreadNotifications(ctx.orgId, ctx.userId);
    return NextResponse.json({ notifications });
  } catch (err) { return guardResponse(err); }
}

/**
 * PATCH /api/notifications → 标记已读
 * Body: { ids: string[] } 或 { all: true }
 */
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    const body = await req.json();

    if (body.all === true) {
      await markAllAsRead(ctx.orgId, ctx.userId);
    } else if (Array.isArray(body.ids)) {
      await Promise.all(body.ids.map((id: string) => markAsRead(id)));
    }

    return NextResponse.json({ ok: true });
  } catch (err) { return guardResponse(err); }
}
