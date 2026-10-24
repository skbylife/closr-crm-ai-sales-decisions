/**
 * GET  /api/integration/connections?orgId=xxx — 列出所有集成连接
 * DELETE /api/integration/connections — 断开连接
 */

import { NextRequest } from 'next/server';
import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';
import { revokeToken } from '@/lib/integration/token-vault';
import { cleanupWebhook } from '@/lib/integration/webhook-manager';
import { logAudit } from '@/lib/integration/audit-logger';
import { recordComplianceAudit } from '@/lib/compliance-audit';

// ─── GET: 列出连接 ─────────────────────────────────────────────────

export async function GET() {
  try {
  const ctx = await requireAuth();
  const orgId = ctx.orgId;

  const supabase = requireAdmin();

  // 获取所有连接
  const { data: conns } = await supabase
    .from('integration_connections')
    .select('id, connector_id, status, sync_status, last_sync_at, connected_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (!conns) {
    return Response.json({ connections: [] });
  }

  // 获取每个连接的 sync_state 信息
  const connectionIds = conns.map((c) => c.id as string);
  const { data: syncStates } = await supabase
    .from('integration_sync_state')
    .select('connection_id, record_count, error_message, status, object_type, last_sync_at')
    .in('connection_id', connectionIds);

  const { data: tokenRows } = await supabase
    .from('integration_tokens')
    .select('connection_id, expires_at')
    .in('connection_id', connectionIds);

  const syncMap = new Map(
    (syncStates ?? []).map((s) => [s.connection_id as string, s]),
  );
  const tokenMap = new Map(
    (tokenRows ?? []).map((t) => [t.connection_id as string, t]),
  );

  const connections = conns.map((c) => {
    const sync = syncMap.get(c.id as string);
    const token = tokenMap.get(c.id as string);
    const expiresAt = (token?.expires_at as string | undefined) ?? null;
    const now = Date.now();
    const expiresMs = expiresAt ? new Date(expiresAt).getTime() : null;
    const expiresSoon = expiresMs ? expiresMs > now && expiresMs - now < 3 * 24 * 60 * 60 * 1000 : false;
    const expired = expiresMs ? expiresMs <= now : false;

    const syncStatus = (sync?.status as string | undefined) ?? (c.sync_status as string);
    const lastSyncAt = (sync && 'last_sync_at' in sync ? (sync as { last_sync_at?: string | null }).last_sync_at : null) ?? (c.last_sync_at as string | null);
    const lastSyncMs = lastSyncAt ? new Date(lastSyncAt).getTime() : 0;
    const isStuckSync = syncStatus === 'syncing' && lastSyncMs > 0 && (Date.now() - lastSyncMs) > 30 * 60 * 1000;

    return {
      id: c.id,
      connectorId: c.connector_id,
      status: c.status,
      syncStatus,
      lastSyncAt,
      connectedAt: c.connected_at,
      recordCount: (sync?.record_count as number) ?? 0,
      errorMessage: (sync?.error_message as string) ?? null,
      syncObjectType: (sync?.object_type as string) ?? null,
      syncStateStatus: (sync?.status as string) ?? null,
      tokenExpiresAt: expiresAt,
      tokenExpired: expired,
      tokenExpiringSoon: expiresSoon,
      isStuckSync,
    };
  });

  return Response.json({ connections });
  } catch (err) {
    return guardResponse(err);
  }
}

// ─── DELETE: 断开连接 ───────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
  const ctx = await requireAuth();
  const orgId = ctx.orgId;

  const body = (await req.json()) as { connectionId?: string };
  const { connectionId } = body;

  if (!connectionId) {
    return Response.json(
      { error: 'connectionId is required' },
      { status: 400 },
    );
  }

  const supabase = requireAdmin();

  // 验证 connection 归属
  const { data: conn } = await supabase
    .from('integration_connections')
    .select('id, connector_id, org_id')
    .eq('id', connectionId)
    .eq('org_id', orgId)
    .single();

  if (!conn) {
    return Response.json({ error: 'Connection not found' }, { status: 404 });
  }

  const connectorId = conn.connector_id as string;

  // 1. 清理 webhook（如果是 Outlook）
  if (connectorId === 'outlook') {
    try {
      await cleanupWebhook(connectionId);
    } catch {
      // 不阻塞断连
    }
  }

  // 2. 撤销 token
  try {
    await revokeToken(connectionId);
  } catch {
    // Token 可能已不存在
  }

  // 3. 更新 connection 状态
  await supabase
    .from('integration_connections')
    .update({
      status: 'disconnected',
      sync_status: 'idle',
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId);

  // 4. 审计日志
  await logAudit({
    orgId,
    userId: ctx.userId,
    connectionId,
    connectorId,
    action: 'disconnect',
    status: 'success',
  });

  await recordComplianceAudit({
    admin: supabase,
    ctx,
    action: 'integration_disconnected',
    objectType: 'integration_connection',
    recordId: connectionId,
    recordName: connectorId,
    request: req,
    changes: {
      connectionId,
      connectorId,
      status: 'disconnected',
    },
  });

  return Response.json({ success: true });
  } catch (err) {
    return guardResponse(err);
  }
}
