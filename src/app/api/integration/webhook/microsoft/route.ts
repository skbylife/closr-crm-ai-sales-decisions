/**
 * Microsoft Graph Webhook 回调
 *
 * POST — 接收变更通知（新邮件到达）
 * 1. 验证 validationToken（首次订阅验证）
 * 2. 验证 clientState
 * 3. 获取对应 connection 的 token
 * 4. 读取新邮件详情 → 走现有同步流程
 * 5. 返回 202 Accepted
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guard';
import { syncEmails } from '@/lib/integration/email-sync';
import { logAudit } from '@/lib/integration/audit-logger';
import { logError } from '@/lib/error-monitor';

// ─── Types ──────────────────────────────────────────────────────────

interface GraphNotification {
  subscriptionId: string;
  changeType: string;
  clientState: string;
  resource: string;
  subscriptionExpirationDateTime: string;
  resourceData?: {
    '@odata.type': string;
    '@odata.id': string;
    '@odata.etag': string;
    id: string;
  };
  tenantId?: string;
}

interface NotificationPayload {
  value: GraphNotification[];
}

// ─── POST: 接收通知 ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. 首次订阅验证：Microsoft 发送 validationToken
  const validationToken = req.nextUrl.searchParams.get('validationToken');
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // 2. 解析通知 payload
  let payload: NotificationPayload;
  try {
    payload = (await req.json()) as NotificationPayload;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  if (!payload.value?.length) {
    return new NextResponse(null, { status: 202 });
  }

  const expectedState = process.env.WEBHOOK_SECRET;
  if (!expectedState) {
    console.error('[graph-webhook] WEBHOOK_SECRET not configured');
    return new NextResponse(null, { status: 500 });
  }

  // 3. 同步验证 clientState（必须在返回 202 之前）
  const notifications = payload.value;
  const validNotifications = notifications.filter((n) => n.clientState === expectedState);

  if (validNotifications.length === 0) {
    console.warn('[graph-webhook] All notifications failed clientState validation');
    return new NextResponse(null, { status: 403 });
  }

  // 4. 后台处理已验证的通知（Graph 要求 <3 秒返回 202）
  processNotifications(validNotifications).catch((err) => {
    logError('graph-webhook', err, { action: 'background-process', notificationCount: validNotifications.length });
  });

  return new NextResponse(null, { status: 202 });
}

// ─── 异步处理通知 ───────────────────────────────────────────────────

async function processNotifications(
  notifications: GraphNotification[],
): Promise<void> {
  let supabase: ReturnType<typeof requireAdmin>;
  try {
    supabase = requireAdmin();
  } catch {
    return;
  }

  // 按 subscriptionId 分组，避免重复同步
  const subscriptionIds = [...new Set(notifications.map((n) => n.subscriptionId))];

  for (const subId of subscriptionIds) {
    const notification = notifications.find((n) => n.subscriptionId === subId);
    if (!notification) continue;

    try {
      // 查找对应的 connection（subscription 信息存在 sync_state.cursor 里）
      const { data: syncStates } = await supabase
        .from('integration_sync_state')
        .select('connection_id, cursor')
        .eq('object_type', 'email');

      if (!syncStates) continue;

      // 在 cursor 中查找 subscriptionId 匹配的 connection
      const matchedState = syncStates.find((s) => {
        const cursor = s.cursor as Record<string, string> | null;
        return cursor?.subscriptionId === subId;
      });

      if (!matchedState) {
        console.warn('[graph-webhook] No connection found for subscription:', subId);
        continue;
      }

      const connectionId = matchedState.connection_id as string;

      // 获取 connection 信息
      const { data: conn } = await supabase
        .from('integration_connections')
        .select('id, org_id, status')
        .eq('id', connectionId)
        .single();

      if (!conn || conn.status !== 'connected') continue;

      const orgId = conn.org_id as string;

      // 触发增量同步（使用现有 deltaLink）
      await syncEmails(connectionId, orgId);

      await logAudit({
        orgId,
        connectionId,
        connectorId: 'outlook',
        action: 'sync_complete',
        objectType: 'email',
        details: { trigger: 'webhook', subscriptionId: subId },
        status: 'success',
      });
    } catch (err) {
      logError('graph-webhook', err, { action: 'process-subscription', subscriptionId: subId });
    }
  }
}
