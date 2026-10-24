/**
 * GET  /api/agent/morning-briefing  — 返回当天简报（有缓存则直接返回）
 * POST /api/agent/morning-briefing  — 强制重新生成（用户手动刷新）
 *
 * 缓存策略：同一天（UTC+8）内只生成一次，存储在进程内存缓存中。
 * 生产环境由阿里云节点/部署层定时任务携带 CRON_SECRET 触发 GET，预生成简报。
 */

import { timingSafeEqual } from 'crypto';
import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';
import { MemoryCache } from '@/lib/cache';
import { generateMorningBriefing, type MorningBriefing } from '@/lib/agent/morning-briefing';
import { createNotification } from '@/lib/integration/notification-service';

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

// 内存缓存：key = `{orgId}:{date}`, TTL = 当天结束前（最多24小时）
const briefingCache = new MemoryCache<MorningBriefing>();

function getCacheKey(orgId: string, date: string): string {
  return `morning-briefing:${orgId}:${date}`;
}

function getTodayDate(): string {
  // 使用 UTC+8 时区的日期作为 "今天"
  const now = new Date();
  const cst = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return cst.toISOString().split('T')[0];
}

function getDayEndTtlMs(): number {
  // TTL = 距离今天 UTC+8 结束还有多少毫秒（最少5分钟）
  const now = new Date();
  const cst = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const endOfDay = new Date(cst);
  endOfDay.setHours(23, 59, 59, 999);
  const ttl = endOfDay.getTime() - cst.getTime();
  return Math.max(ttl, 5 * 60 * 1000);
}

// ─── GET: 获取或生成今天的简报 ──────────────────────────────────────────

export async function GET(request: Request) {
  try {
    // ── 定时任务验证 (timing-safe) ──
    // 调度器模式下，预生成所有活跃用户的简报；不返回具体数据。
    const authHeader = request.headers.get('Authorization') ?? '';
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader && safeEqual(authHeader, `Bearer ${cronSecret}`)) {
      return await handleCronPrewarm();
    }

    const ctx = await requireAuth();
    const today = getTodayDate();

    // 从 query 获取 roleLevel，映射为 jobLevel
    const url = new URL(request.url);
    const roleLevel = url.searchParams.get('roleLevel') ?? 'ae';
    const jobLevel = roleLevel === 'executive' ? 4
      : roleLevel === 'director' ? 2
      : 0;

    // 缓存按 orgId + date + jobLevel 分层（不同职级看到不同内容）
    const cacheKey = getCacheKey(ctx.orgId, `${today}:jl${jobLevel}`);

    // 检查缓存
    const cached = briefingCache.get(cacheKey);
    if (cached) {
      return Response.json({ briefing: cached, cached: true });
    }

    // 生成新的简报
    const briefing = await generateMorningBriefing(ctx.userId, ctx.orgId, jobLevel);

    // 存入缓存，TTL 到今天结束
    briefingCache.set(cacheKey, briefing, getDayEndTtlMs());

    return Response.json({ briefing, cached: false });
  } catch (err) {
    return guardResponse(err);
  }
}

// ─── POST: 强制重新生成 ─────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const today = getTodayDate();

    const url = new URL(request.url);
    const roleLevel = url.searchParams.get('roleLevel') ?? 'ae';
    const jobLevel = roleLevel === 'executive' ? 4
      : roleLevel === 'director' ? 2
      : 0;

    const cacheKey = getCacheKey(ctx.orgId, `${today}:jl${jobLevel}`);

    // 清除缓存，强制重新生成
    briefingCache.delete(cacheKey);

    const briefing = await generateMorningBriefing(ctx.userId, ctx.orgId, jobLevel);

    // 存入新缓存
    briefingCache.set(cacheKey, briefing, getDayEndTtlMs());

    return Response.json({ briefing, cached: false });
  } catch (err) {
    return guardResponse(err);
  }
}

// ─── Scheduled job: 预热活跃用户的简报缓存 ────────────────────────────────
//
// 由阿里云节点/部署层调度器调用，扫描最近活跃的 org，预先生成 L0/L2/L4 三档简报放入
// 进程内缓存，降低用户首次访问时的延迟。
async function handleCronPrewarm(): Promise<Response> {
  try {
    const admin = requireAdmin();
    const today = getTodayDate();

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from('contacts')
      .select('user_id, org_id')
      .gte('updated_at', since)
      .limit(200);

    // 按 org 去重，并保留一个代表用户（用于调用 generateMorningBriefing）。
    const orgToUser = new Map<string, string>();
    for (const row of (recent ?? []) as Array<{ user_id: string | null; org_id: string | null }>) {
      if (!row.org_id || !row.user_id) continue;
      if (!orgToUser.has(row.org_id)) orgToUser.set(row.org_id, row.user_id);
    }

    let warmed = 0;
    const notifiedOrgs = new Set<string>();

    for (const [orgId, userId] of orgToUser) {
      for (const jobLevel of [0, 2, 4] as const) {
        const cacheKey = getCacheKey(orgId, `${today}:jl${jobLevel}`);
        if (briefingCache.get(cacheKey)) continue;
        try {
          const briefing = await generateMorningBriefing(userId, orgId, jobLevel);
          briefingCache.set(cacheKey, briefing, getDayEndTtlMs());
          warmed++;

          // 每个 org 只发一次通知（避免 L0/L2/L4 重复通知）
          if (!notifiedOrgs.has(orgId)) {
            notifiedOrgs.add(orgId);
            createNotification({
              orgId,
              type: 'insight',
              priority: 'low',
              title: '今日简报已生成',
              body: briefing.summary || '点击查看今日客户动态与推进建议。',
            }).catch(() => {}); // fire-and-forget
          }
        } catch (err) {
          console.error('[morning-briefing] prewarm failed', { orgId, jobLevel, err });
        }
      }
    }

    return Response.json({ ok: true, orgs: orgToUser.size, warmed });
  } catch (err) {
    console.error('[morning-briefing] cron error', err);
    return Response.json({ ok: false }, { status: 500 });
  }
}
