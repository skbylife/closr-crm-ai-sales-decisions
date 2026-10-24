/**
 * Notification Service — Agent 通知管理
 *
 * 创建、查询、标记已读通知。
 * 通知存储在 agent_notifications 表。
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUUID(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`Invalid ${label}: must be a valid UUID`);
  }
}

// ─── Types ──────────────────────────────────────────────────────────

export interface CreateNotificationParams {
  orgId: string;
  userId?: string;         // null = 通知所有 Admin
  type: 'integration_alert' | 'discovery' | 'reminder' | 'insight' | 'play_assumption_alert';
  priority: 'high' | 'medium' | 'low';
  title: string;
  body?: string;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  id: string;
  label: string;
  style: 'primary' | 'secondary' | 'danger';
  action: { type: string; [key: string]: unknown };
}

export interface AgentNotification {
  id: string;
  orgId: string;
  userId: string | null;
  type: string;
  priority: string;
  title: string;
  body: string | null;
  actions: NotificationAction[];
  read: boolean;
  createdAt: string;
}

// ─── Create ─────────────────────────────────────────────────────────

export async function createNotification(params: CreateNotificationParams): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Supabase admin client not configured');

  const { data, error } = await supabase
    .from('agent_notifications')
    .insert({
      org_id: params.orgId,
      user_id: params.userId ?? null,
      type: params.type,
      priority: params.priority,
      title: params.title,
      body: params.body ?? null,
      actions: params.actions ?? [],
      read: false,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create notification: ${error.message}`);
  return data.id as string;
}

// ─── Read ───────────────────────────────────────────────────────────

export async function getUnreadNotifications(
  orgId: string,
  userId: string,
): Promise<AgentNotification[]> {
  assertUUID(userId, 'userId');
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  // 获取发给该用户 或 发给所有人 (user_id IS NULL) 的未读通知
  const { data, error } = await supabase
    .from('agent_notifications')
    .select('*')
    .eq('org_id', orgId)
    .eq('read', false)
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map(mapRow);
}

export async function getUnreadCount(
  orgId: string,
  userId: string,
): Promise<number> {
  assertUUID(userId, 'userId');
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from('agent_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('read', false)
    .or(`user_id.eq.${userId},user_id.is.null`);

  if (error) return 0;
  return count ?? 0;
}

// ─── Update ─────────────────────────────────────────────────────────

export async function markAsRead(notificationId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  await supabase
    .from('agent_notifications')
    .update({ read: true })
    .eq('id', notificationId);
}

export async function markAllAsRead(orgId: string, userId: string): Promise<void> {
  assertUUID(userId, 'userId');
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  await supabase
    .from('agent_notifications')
    .update({ read: true })
    .eq('org_id', orgId)
    .eq('read', false)
    .or(`user_id.eq.${userId},user_id.is.null`);
}

// ─── Helpers ────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): AgentNotification {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    userId: (row.user_id as string) ?? null,
    type: row.type as string,
    priority: row.priority as string,
    title: row.title as string,
    body: (row.body as string) ?? null,
    actions: (row.actions as NotificationAction[]) ?? [],
    read: row.read as boolean,
    createdAt: row.created_at as string,
  };
}
