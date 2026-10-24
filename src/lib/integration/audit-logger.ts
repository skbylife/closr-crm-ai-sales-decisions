/**
 * Integration Audit Logger — 记录所有集成操作
 *
 * 写入 integration_audit_logs 表，用于问题排查和合规审计。
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';

// ─── Types ──────────────────────────────────────────────────────────

export type AuditAction =
  | 'connect'
  | 'disconnect'
  | 'sync_start'
  | 'sync_complete'
  | 'sync_error'
  | 'read'
  | 'mapping_change'
  | 'token_refresh'
  | 'token_revoke'
  | 'webhook_setup'
  | 'webhook_renew';

export interface AuditParams {
  orgId: string;
  userId?: string;
  connectionId?: string;
  connectorId: string;
  action: AuditAction;
  objectType?: string;
  recordCount?: number;
  details?: Record<string, unknown>;
  status: 'success' | 'failure';
  errorMessage?: string;
  durationMs?: number;
}

export interface AuditEntry {
  id: string;
  orgId: string;
  userId: string | null;
  connectionId: string | null;
  connectorId: string;
  action: AuditAction;
  objectType: string | null;
  recordCount: number | null;
  details: Record<string, unknown> | null;
  status: 'success' | 'failure';
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

// ─── Log Audit ──────────────────────────────────────────────────────

/**
 * 写入审计日志（fire-and-forget 安全，不抛异常）
 */
export async function logAudit(params: AuditParams): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return;

    await supabase.from('integration_audit_logs').insert({
      org_id: params.orgId,
      user_id: params.userId ?? null,
      connection_id: params.connectionId ?? null,
      connector_id: params.connectorId,
      action: params.action,
      object_type: params.objectType ?? null,
      record_count: params.recordCount ?? null,
      details: params.details ?? null,
      status: params.status,
      error_message: params.errorMessage ?? null,
      duration_ms: params.durationMs ?? null,
    });
  } catch (err) {
    // 审计日志写入失败不应阻塞业务流程
    console.error('[audit-logger] Failed to write audit log:', err);
  }
}

// ─── Query Audit Logs ───────────────────────────────────────────────

/**
 * 查询审计日志
 */
export async function getAuditLogs(
  orgId: string,
  options?: {
    connectionId?: string;
    connectorId?: string;
    action?: AuditAction;
    limit?: number;
    offset?: number;
  },
): Promise<AuditEntry[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  let query = supabase
    .from('integration_audit_logs')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (options?.connectionId) {
    query = query.eq('connection_id', options.connectionId);
  }
  if (options?.connectorId) {
    query = query.eq('connector_id', options.connectorId);
  }
  if (options?.action) {
    query = query.eq('action', options.action);
  }

  query = query.range(
    options?.offset ?? 0,
    (options?.offset ?? 0) + (options?.limit ?? 50) - 1,
  );

  const { data, error } = await query;

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    orgId: row.org_id as string,
    userId: row.user_id as string | null,
    connectionId: row.connection_id as string | null,
    connectorId: row.connector_id as string,
    action: row.action as AuditAction,
    objectType: row.object_type as string | null,
    recordCount: row.record_count as number | null,
    details: row.details as Record<string, unknown> | null,
    status: row.status as 'success' | 'failure',
    errorMessage: row.error_message as string | null,
    durationMs: row.duration_ms as number | null,
    createdAt: row.created_at as string,
  }));
}
