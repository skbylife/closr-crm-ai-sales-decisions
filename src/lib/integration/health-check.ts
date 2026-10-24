/**
 * Integration Health Check — 检查所有连接的健康状态
 *
 * - Token 过期预警（3 天内过期 → high，已过期 → high + 建议重新授权）
 * - 同步状态检查（失败 → high，超 24h 没同步 → medium）
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createNotification } from './notification-service';

// ─── Types ──────────────────────────────────────────────────────────

export interface HealthIssue {
  connectionId: string;
  connectorId: string;
  issue: 'token_expiring' | 'token_expired' | 'sync_failed' | 'sync_stuck' | 'rate_limited';
  severity: 'high' | 'medium' | 'low';
  message: string;
}

// ─── Main ───────────────────────────────────────────────────────────

export async function checkIntegrationHealth(orgId: string): Promise<HealthIssue[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const issues: HealthIssue[] = [];

  // 1. 获取该组织所有活跃连接
  const { data: connections } = await supabase
    .from('integration_connections')
    .select('id, connector_id, status, last_sync_at, sync_status')
    .eq('org_id', orgId)
    .in('status', ['active', 'connected', 'error']);

  if (!connections || connections.length === 0) return [];

  const now = Date.now();
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const STUCK_THRESHOLD_MS = 30 * 60 * 1000;

  for (const conn of connections) {
    const connectionId = conn.id as string;
    const connectorId = conn.connector_id as string;

    // 2. 检查 token 过期
    const { data: tokenRow } = await supabase
      .from('integration_tokens')
      .select('expires_at')
      .eq('connection_id', connectionId)
      .single();

    if (tokenRow) {
      const expiresAt = new Date(tokenRow.expires_at as string).getTime();
      if (expiresAt < now) {
        issues.push({
          connectionId,
          connectorId,
          issue: 'token_expired',
          severity: 'high',
          message: `${connectorId} 授权已过期，请重新授权`,
        });
      } else if (expiresAt - now < THREE_DAYS_MS) {
        const daysLeft = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));
        issues.push({
          connectionId,
          connectorId,
          issue: 'token_expiring',
          severity: 'high',
          message: `${connectorId} 授权将在 ${daysLeft} 天内过期，建议尽快刷新`,
        });
      }
    }

    // 3. 检查同步状态
    const syncStatus = conn.sync_status as string | null;
    const lastSyncAt = conn.last_sync_at as string | null;

    // Stuck sync detection: syncing for > 30 minutes
    if (syncStatus === 'syncing' && lastSyncAt) {
      const syncStartedAt = new Date(lastSyncAt).getTime();
      if (now - syncStartedAt > STUCK_THRESHOLD_MS) {
        issues.push({
          connectionId,
          connectorId,
          issue: 'sync_stuck',
          severity: 'high',
          message: `${connectorId} 同步已运行超过30分钟，可能卡住了`,
        });
      }
    }

    if (syncStatus === 'failed' || syncStatus === 'error') {
      issues.push({
        connectionId,
        connectorId,
        issue: 'sync_failed',
        severity: 'high',
        message: `${connectorId} 最近一次同步失败，请检查连接状态`,
      });
    } else if (lastSyncAt) {
      const lastSync = new Date(lastSyncAt).getTime();
      if (now - lastSync > TWENTY_FOUR_HOURS_MS) {
        const hoursAgo = Math.floor((now - lastSync) / (60 * 60 * 1000));
        issues.push({
          connectionId,
          connectorId,
          issue: 'sync_failed',
          severity: 'medium',
          message: `${connectorId} 已超过 ${hoursAgo} 小时未同步`,
        });
      }
    }
  }

  return issues;
}

/**
 * 运行健康检查并自动创建通知
 */
export async function runHealthCheckWithNotifications(
  orgId: string,
  userId?: string,
): Promise<HealthIssue[]> {
  const issues = await checkIntegrationHealth(orgId);

  for (const issue of issues) {
    const isAuthIssue = issue.issue === 'token_expired' || issue.issue === 'token_expiring';
    const actions = isAuthIssue
      ? [
          {
            id: `reauth-${issue.connectionId}`,
            label: '重新授权',
            style: 'primary' as const,
            action: {
              type: 'reply',
              text: `请帮我重新授权 ${issue.connectorId}`,
            },
          },
        ]
      : [
          {
            id: `retry-sync-${issue.connectionId}`,
            label: '重新同步',
            style: 'primary' as const,
            action: {
              type: 'reply',
              text: `请帮我重新同步 ${issue.connectorId}`,
            },
          },
        ];

    await createNotification({
      orgId,
      userId,
      type: 'integration_alert',
      priority: issue.severity,
      title: issue.message,
      body: `连接: ${issue.connectorId} | 问题: ${issue.issue}`,
      actions,
    });
  }

  return issues;
}
