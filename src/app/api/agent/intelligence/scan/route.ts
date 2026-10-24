/**
 * POST /api/agent/intelligence/scan
 *
 * 触发 Intelligence Agent 扫描联系人动态。
 * 支持两种调用方式：
 *   1. 阿里云节点/部署层调度器：Authorization: Bearer {CRON_SECRET}
 *   2. 用户手动触发：需要登录 Session（Cookie Auth）
 *
 * Body: { contactIds?: string[] }  不传则扫描所有高优联系人
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { scanContactSignals } from '@/lib/agent/intelligence-agent';
import { getAuthUser } from '@/lib/api-auth';
import { requireAdmin, guardResponse } from '@/lib/api-guard';
import { logError, logWarn } from '@/lib/error-monitor';

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

interface ScanRequestBody {
  contactIds?: string[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let userId: string | null = null;
  try {

    // ── 1. 定时任务验证 (timing-safe) ───────────────────────────────
    const authHeader = request.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;
    const expectedHeader = cronSecret ? `Bearer ${cronSecret}` : '';

    if (authHeader && cronSecret && safeEqual(authHeader, expectedHeader)) {
      // 调度器调用：用 service role 扫描所有用户
      return await handleCronScan(request);
    }

    // ── 2. 用户手动触发（fire-and-forget）───────────────────────────
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }
    userId = authUser.id;

    const body = (await request.json().catch((e) => {
      logWarn('intelligence-scan', 'JSON parse failed, using defaults', { error: e instanceof Error ? e.message : String(e) });
      return {};
    })) as ScanRequestBody;
    const { contactIds } = body;

    // 后台异步执行，不阻塞响应
    const capturedUserId = userId;
    scanContactSignals(capturedUserId, contactIds).catch((err) =>
      logError('intelligence-scan', err, { action: 'user-scan-bg', userId: capturedUserId })
    );

    return NextResponse.json({
      success: true,
      message: '扫描已在后台启动',
    });
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      return guardResponse(err) as NextResponse;
    }
    logError('intelligence-scan', err, { action: 'user-scan', userId });
    return NextResponse.json(
      { error: '扫描失败，请稍后重试' },
      { status: 500 },
    );
  }
}

/**
 * 调度器模式：扫描所有活跃用户的联系人
 */
async function handleCronScan(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch((e) => {
    logWarn('intelligence-scan', 'Cron JSON parse failed, using defaults', { error: e instanceof Error ? e.message : String(e) });
    return {};
  })) as ScanRequestBody;
  const { contactIds } = body;

  const admin = requireAdmin();

  // 获取最近7天内登录过的用户 ID（活跃用户）
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: users } = await admin
    .from('contacts')
    .select('user_id')
    .gte('updated_at', since)
    .limit(100);

  const userIds = [...new Set((users ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean))];

  const summary: Record<string, { scanned: number; written: number }> = {};

  for (const uid of userIds) {
    try {
      const result = await scanContactSignals(uid as string, contactIds);
      summary[uid as string] = { scanned: result.scanned, written: result.written };
    } catch (err) {
      logError('intelligence-scan', err, { action: 'cron-scan', userId: uid });
    }
  }

  return NextResponse.json({ success: true, usersProcessed: userIds.length, summary });
}
