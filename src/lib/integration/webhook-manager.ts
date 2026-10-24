/**
 * Webhook Manager — 管理所有 Webhook 订阅的生命周期
 *
 * - setupWebhook: 为 connection 创建 Graph 订阅
 * - renewAllWebhooks: 批量续期即将过期的订阅
 * - cleanupWebhook: 断连时清理订阅
 *
 * 订阅信息存储在 integration_sync_state.cursor:
 *   { deltaLink, subscriptionId, expirationDateTime }
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getToken } from './token-vault';
import { createGraphClient } from '@/lib/microsoft/graph';
import {
  createSubscription,
  renewSubscription,
  deleteSubscription,
} from '@/lib/microsoft/webhook';
import { logAudit } from './audit-logger';

// ─── Setup Webhook ──────────────────────────────────────────────────

/**
 * 为 Outlook 连接创建 Webhook 订阅
 */
export async function setupWebhook(
  connectionId: string,
  orgId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const token = await getToken(connectionId);
  if (!token) {
    throw new Error('Token not found for connection');
  }

  const client = createGraphClient(token.accessToken);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.VERCEL_URL ?? '';
  const notificationUrl = `${baseUrl}/api/integration/webhook/microsoft`;

  const { subscriptionId, expirationDateTime } = await createSubscription(
    client,
    notificationUrl,
  );

  // 将 subscriptionId 存入 sync_state 的 cursor 字段（合并现有 deltaLink）
  const { data: existing } = await supabase
    .from('integration_sync_state')
    .select('cursor')
    .eq('connection_id', connectionId)
    .eq('object_type', 'email')
    .single();

  const currentCursor = (existing?.cursor as Record<string, string>) ?? {};

  await supabase
    .from('integration_sync_state')
    .upsert(
      {
        connection_id: connectionId,
        object_type: 'email',
        cursor: {
          ...currentCursor,
          subscriptionId,
          expirationDateTime,
        },
      },
      { onConflict: 'connection_id,object_type' },
    );

  await logAudit({
    orgId,
    connectionId,
    connectorId: 'outlook',
    action: 'webhook_setup',
    details: { subscriptionId, expirationDateTime },
    status: 'success',
  });
}

// ─── Renew All Webhooks ─────────────────────────────────────────────

/**
 * 查找所有即将过期的订阅（<12h），自动续期
 * 适合放在 cron job 中每小时运行
 */
export async function renewAllWebhooks(): Promise<{
  renewed: number;
  failed: number;
  errors: string[];
}> {
  const result = { renewed: 0, failed: 0, errors: [] as string[] };

  const supabase = getSupabaseAdmin();
  if (!supabase) return result;

  // 获取所有 outlook 连接的 email sync_state
  const { data: syncStates } = await supabase
    .from('integration_sync_state')
    .select('connection_id, cursor')
    .eq('object_type', 'email');

  if (!syncStates) return result;

  const twelveHoursFromNow = new Date(Date.now() + 12 * 60 * 60 * 1000);

  for (const state of syncStates) {
    const cursor = state.cursor as Record<string, string> | null;
    if (!cursor?.subscriptionId || !cursor?.expirationDateTime) continue;

    const expiration = new Date(cursor.expirationDateTime);
    if (expiration > twelveHoursFromNow) continue; // 还没到续期时间

    const connectionId = state.connection_id as string;

    try {
      const token = await getToken(connectionId);
      if (!token) {
        result.errors.push(`No token for connection ${connectionId}`);
        result.failed++;
        continue;
      }

      const client = createGraphClient(token.accessToken);
      const { expirationDateTime } = await renewSubscription(
        client,
        cursor.subscriptionId,
      );

      // 更新 cursor 中的过期时间
      await supabase
        .from('integration_sync_state')
        .update({
          cursor: { ...cursor, expirationDateTime },
        })
        .eq('connection_id', connectionId)
        .eq('object_type', 'email');

      // 获取 orgId 用于审计
      const { data: conn } = await supabase
        .from('integration_connections')
        .select('org_id')
        .eq('id', connectionId)
        .single();

      if (conn) {
        await logAudit({
          orgId: conn.org_id as string,
          connectionId,
          connectorId: 'outlook',
          action: 'webhook_renew',
          details: { subscriptionId: cursor.subscriptionId, expirationDateTime },
          status: 'success',
        });
      }

      result.renewed++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Renewal failed for ${connectionId}: ${errMsg}`);
      result.failed++;

      // 续期失败 → 写通知
      const { data: conn } = await supabase
        .from('integration_connections')
        .select('org_id, connected_by')
        .eq('id', connectionId)
        .single();

      if (conn) {
        await supabase.from('agent_notifications').insert({
          org_id: conn.org_id,
          user_id: conn.connected_by,
          type: 'webhook_renewal_failed',
          priority: 'high',
          title: 'Outlook 实时通知续期失败',
          body: `邮件实时通知订阅续期失败，可能需要重新连接。原因: ${errMsg}`,
        });

        await logAudit({
          orgId: conn.org_id as string,
          connectionId,
          connectorId: 'outlook',
          action: 'webhook_renew',
          status: 'failure',
          errorMessage: errMsg,
        });
      }
    }
  }

  return result;
}

// ─── Cleanup Webhook ────────────────────────────────────────────────

/**
 * 删除 connection 的 Webhook 订阅（断连时调用）
 */
export async function cleanupWebhook(connectionId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  // 读取 subscriptionId
  const { data: syncState } = await supabase
    .from('integration_sync_state')
    .select('cursor')
    .eq('connection_id', connectionId)
    .eq('object_type', 'email')
    .single();

  const cursor = syncState?.cursor as Record<string, string> | null;
  if (!cursor?.subscriptionId) return;

  try {
    const token = await getToken(connectionId);
    if (token) {
      const client = createGraphClient(token.accessToken);
      await deleteSubscription(client, cursor.subscriptionId);
    }
  } catch (err) {
    // 删除失败不阻塞断连流程（订阅会自动过期）
    console.warn('[webhook-manager] Failed to delete subscription:', err);
  }

  // 清除 cursor 中的 subscription 信息（保留 deltaLink）
  const { deltaLink } = cursor;
  await supabase
    .from('integration_sync_state')
    .update({
      cursor: deltaLink ? { deltaLink } : {},
    })
    .eq('connection_id', connectionId)
    .eq('object_type', 'email');
}
