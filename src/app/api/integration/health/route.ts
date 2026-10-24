import { NextResponse } from 'next/server';
import { requireAuth, guardResponse } from '@/lib/api-guard';
import { runHealthCheckWithNotifications } from '@/lib/integration/health-check';

/**
 * GET /api/integration/health → 运行健康检查，返回问题列表 + 自动创建通知
 */
export async function GET() {
  try {
    const ctx = await requireAuth();

    const issues = await runHealthCheckWithNotifications(ctx.orgId, ctx.userId);
    return NextResponse.json({ issues, count: issues.length });
  } catch (err) {
    return guardResponse(err);
  }
}
