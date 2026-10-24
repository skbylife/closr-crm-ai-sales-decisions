/**
 * POST /api/integration/sync — 触发连接对应的同步
 * GET  /api/integration/sync?connectionId=xxx — 查询同步状态
 */

import { NextRequest } from 'next/server';
import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';
import { syncEmails } from '@/lib/integration/email-sync';
import { syncWeComData } from '@/lib/integration/wecom-sync';
import { isConnectorSupported, getSyncObjectType, getUnsupportedPlatform, type ConnectorId } from '@/lib/integration/connector-registry';

// ─── POST: 触发同步 ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
  const ctx = await requireAuth();
  const orgId = ctx.orgId;

  const body = await req.json() as {
    connectionId?: string;
    options?: { since?: string };
  };

  const { connectionId } = body;
  if (!connectionId) {
    return Response.json(
      { error: 'connectionId is required' },
      { status: 400 },
    );
  }

  // 验证 connection 归属
  const supabase = requireAdmin();

  const { data: conn } = await supabase
    .from('integration_connections')
    .select('id, org_id, status, connector_id')
    .eq('id', connectionId)
    .eq('org_id', orgId)
    .single();

  if (!conn) {
    return Response.json({ error: 'Connection not found' }, { status: 404 });
  }

  if (conn.status !== 'connected') {
    return Response.json(
      { error: `Connection status is "${conn.status}", not "connected"` },
      { status: 400 },
    );
  }

  // M4: 检查是否正在同步（防重入）
  const connectorId = conn.connector_id as string;
  const objectType = isConnectorSupported(connectorId)
    ? getSyncObjectType(connectorId as ConnectorId)
    : 'unknown';

  const { data: syncingStates } = await supabase
    .from('integration_sync_state')
    .select('status, last_sync_at')
    .eq('connection_id', connectionId)
    .eq('status', 'syncing');

  const activeSyncState = (syncingStates ?? [])[0];
  if (activeSyncState) {
    const startedAt = activeSyncState.last_sync_at
      ? new Date(activeSyncState.last_sync_at as string).getTime()
      : 0;
    const isStuckSync = startedAt > 0 && Date.now() - startedAt > 30 * 60 * 1000;

    if (!isStuckSync) {
      return Response.json({ error: '同步正在进行中，请稍后再试' }, { status: 409 });
    }

    await supabase
      .from('integration_sync_state')
      .update({
        status: 'error',
        error_message: '检测到卡住的同步，已自动重置后重新发起',
        last_sync_at: new Date().toISOString(),
      })
      .eq('connection_id', connectionId)
      .eq('status', 'syncing');

    // Also reset connection-level sync_status for consistency
    await supabase
      .from('integration_connections')
      .update({ sync_status: 'idle', updated_at: new Date().toISOString() })
      .eq('id', connectionId);
  }

  // 更新状态为 syncing，统一清理旧错误
  await supabase
    .from('integration_connections')
    .update({ sync_status: 'syncing', updated_at: new Date().toISOString() })
    .eq('id', connectionId);

  await supabase
    .from('integration_sync_state')
    .upsert(
      {
        connection_id: connectionId,
        object_type: objectType,
        status: 'syncing',
        last_sync_at: new Date().toISOString(),
        error_message: null,
      },
      { onConflict: 'connection_id,object_type' },
    );

  try {
    if (!isConnectorSupported(connectorId)) {
      // Reset sync_status since we won't actually sync
      await supabase
        .from('integration_connections')
        .update({ sync_status: 'idle' })
        .eq('id', connectionId);

      const unsupported = getUnsupportedPlatform(connectorId);
      const hint = unsupported
        ? `${unsupported.label} ${unsupported.roadmapNote}`
        : `连接器「${connectorId}」暂不支持同步，请联系管理员。`;
      return Response.json(
        { error: hint, connectorId, supported: false },
        { status: 400 },
      );
    }
    const result = connectorId === 'wecom'
      ? await syncWeComData(connectionId, orgId)
      : await syncEmails(connectionId, orgId, {
          since: body.options?.since ? new Date(body.options.since) : undefined,
          userId: ctx.userId,
        });

    return Response.json({ success: true, connectorId, result });
  } catch (syncErr) {
    // 恢复状态
    await supabase
      .from('integration_connections')
      .update({ sync_status: 'error', updated_at: new Date().toISOString() })
      .eq('id', connectionId);

    return Response.json(
      { error: syncErr instanceof Error ? syncErr.message : 'Sync failed' },
      { status: 500 },
    );
  }
  } catch (err) {
    return guardResponse(err);
  }
}

// ─── GET: 查询同步状态 ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
  const ctx = await requireAuth();

  const connectionId = req.nextUrl.searchParams.get('connectionId');
  if (!connectionId) {
    return Response.json({ error: 'connectionId is required' }, { status: 400 });
  }

  const supabase = requireAdmin();

  const { data: conn } = await supabase
    .from('integration_connections')
    .select('id, status, sync_status, last_sync_at, connector_id, org_id')
    .eq('id', connectionId)
    .eq('org_id', ctx.orgId)
    .single();

  if (!conn) {
    return Response.json({ error: 'Connection not found' }, { status: 404 });
  }

  const connId = conn.connector_id as string;
  const supported = isConnectorSupported(connId);
  const objectType = supported ? getSyncObjectType(connId as ConnectorId) : 'unknown';

  const { data: syncState } = await supabase
    .from('integration_sync_state')
    .select('last_sync_at, record_count, status, error_message')
    .eq('connection_id', connectionId)
    .eq('object_type', objectType)
    .single();

  return Response.json({
    connection: {
      id: conn.id,
      status: conn.status,
      syncStatus: conn.sync_status,
      lastSyncAt: conn.last_sync_at,
      connectorId: conn.connector_id,
      supported,
    },
    syncState: syncState
      ? {
          lastSyncAt: syncState.last_sync_at,
          recordCount: syncState.record_count,
          status: syncState.status,
          errorMessage: syncState.error_message,
        }
      : null,
  });
  } catch (err) {
    return guardResponse(err);
  }
}
