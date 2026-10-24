// AI Event Hub — 统一事件处理入口
// 所有数据变化通过 emitEvent() 进入，由处理器链自动分析

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { logError } from '@/lib/error-monitor';
import type { AIEventType, AIEntityType, InsightType, AIEventStatus } from '@/lib/babel-engine/types';
import { markAIInsightAsNonAuthoritative } from '@/lib/judgment/source-record-taxonomy';
import {
  handleDecodeCompleted,
  handleIntelCreated,
  handleDealStageChanged,
  handleContactUpdated,
  handleContactProfileUpdated,
  handleNewsDiscovered,
} from '@/lib/ai-event-handlers';

// ─── Emit Event ─────────────────────────────────────────────────────

export interface EmitEventInput {
  orgId: string;
  userId?: string;
  eventType: AIEventType;
  entityType: AIEntityType;
  entityId: string;
  payload?: Record<string, unknown>;
}

/**
 * 写入一条事件到 ai_events 表。
 * 调用方不等待处理完成（fire-and-forget），后续由 processEvent 或 cron 消费。
 */
export async function emitEvent(input: EmitEventInput): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    console.error('[ai-event-hub] No admin client');
    return null;
  }

  try {
    const { data, error } = await admin
      .from('ai_events')
      .insert({
        org_id: input.orgId,
        user_id: input.userId ?? null,
        event_type: input.eventType,
        entity_type: input.entityType,
        entity_id: input.entityId,
        payload: input.payload ?? {},
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) throw error;

    // Fire-and-forget: 立即尝试处理（不阻塞调用方）
    processEvent(data.id).catch((err) => {
      logError('ai-event-hub', err, { action: 'background-process', eventId: data.id, eventType: input.eventType, entityId: input.entityId });
    });

    return data.id;
  } catch (err) {
    logError('ai-event-hub', err, { action: 'emit-event', eventType: input.eventType, entityId: input.entityId, orgId: input.orgId });
    return null;
  }
}

// ─── Process Event ──────────────────────────────────────────────────

/**
 * 处理单个事件：标记 processing → 执行处理器链 → 标记 completed/failed
 */
export async function processEvent(eventId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  try {
    // 1. 获取事件并标记 processing
    const { data: event, error: fetchErr } = await admin
      .from('ai_events')
      .update({ status: 'processing' as AIEventStatus })
      .eq('id', eventId)
      .eq('status', 'pending')
      .select('*')
      .single();

    if (fetchErr || !event) return; // 已被其他 worker 抢走或不存在

    // 2. 根据事件类型分发处理
    const handlers = getHandlersForEvent(event.event_type as AIEventType);

    let hasFailure = false;

    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (err) {
        hasFailure = true;
        logError('ai-event-hub', err, { action: 'handler-execute', eventType: event.event_type, eventId: eventId });
        // 单个 handler 失败不阻止其他 handler
      }
    }

    // 3. 标记完成（如有部分 handler 失败则标记 partial_failure）
    await admin
      .from('ai_events')
      .update({
        status: (hasFailure ? 'partial_failure' : 'completed') as AIEventStatus,
        processed_at: new Date().toISOString(),
      })
      .eq('id', eventId);
  } catch (err) {
    // 标记失败
    const admin2 = getSupabaseAdmin();
    if (admin2) {
      await admin2
        .from('ai_events')
        .update({
          status: 'failed' as AIEventStatus,
          error: err instanceof Error ? err.message : String(err),
          processed_at: new Date().toISOString(),
        })
        .eq('id', eventId);
    }
    logError('ai-event-hub', err, { action: 'process-event', eventId });
  }
}

// ─── Handler Registry ───────────────────────────────────────────────

type EventHandler = (event: Record<string, unknown>) => Promise<void>;

/**
 * 事件类型 → 处理器链映射。
 */
function getHandlersForEvent(eventType: AIEventType): EventHandler[] {
  const registry: Record<string, EventHandler[]> = {
    'decode.completed': [
      handleDecodeCompleted,
    ],
    'intel.created': [
      handleIntelCreated,
    ],
    'deal.stage_changed': [
      handleDealStageChanged,
    ],
    'contact.updated': [
      handleContactUpdated,
    ],
    'contact.profile_updated': [
      handleContactProfileUpdated,
    ],
    'news.discovered': [
      handleNewsDiscovered,
    ],
    'meeting.scheduled': [],     // Phase 2
    'no_reply.detected': [],     // Phase 2
  };

  return registry[eventType] ?? [];
}

// ─── Insight CRUD ───────────────────────────────────────────────────

/**
 * 读取实体的 AI 洞察缓存
 */
export async function getInsight(
  orgId: string,
  entityType: AIEntityType,
  entityId: string,
  insightType: InsightType
): Promise<Record<string, unknown> | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from('ai_insights')
    .select('data, version, updated_at')
    .eq('org_id', orgId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('insight_type', insightType)
    .single();

  if (error || !data) return null;
  return data.data as Record<string, unknown>;
}

/**
 * 批量读取某实体的所有洞察
 */
export async function getInsightsForEntity(
  orgId: string,
  entityType: AIEntityType,
  entityId: string
): Promise<Record<InsightType, Record<string, unknown>>> {
  const admin = getSupabaseAdmin();
  const result = {} as Record<InsightType, Record<string, unknown>>;
  if (!admin) return result;

  const { data, error } = await admin
    .from('ai_insights')
    .select('insight_type, data')
    .eq('org_id', orgId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId);

  if (error || !data) return result;

  for (const row of data) {
    result[row.insight_type as InsightType] = row.data as Record<string, unknown>;
  }
  return result;
}

/**
 * 写回/更新 AI 洞察缓存（upsert）
 */
export async function upsertInsight(
  orgId: string,
  entityType: AIEntityType,
  entityId: string,
  insightType: InsightType,
  data: Record<string, unknown>,
  trigger?: string
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const { error } = await admin
    .from('ai_insights')
    .upsert(
      {
        org_id: orgId,
        entity_type: entityType,
        entity_id: entityId,
        insight_type: insightType,
        // ai_insights is cache/display output only. Judgment memory must be projected
        // from source_records or core business tables, not from this persisted AI blob.
        data: markAIInsightAsNonAuthoritative(data),
        last_trigger: trigger ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,entity_type,entity_id,insight_type' }
    );

  if (error) {
    logError('ai-event-hub', error, { action: 'upsert-insight', orgId, entityType, entityId, insightType });
  }
}

/**
 * 批量获取某类型的所有洞察（如：所有 deal 的 health）
 */
export async function getInsightsByType(
  orgId: string,
  insightType: InsightType,
  entityType?: AIEntityType
): Promise<{ entityId: string; data: Record<string, unknown> }[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  let query = admin
    .from('ai_insights')
    .select('entity_id, data')
    .eq('org_id', orgId)
    .eq('insight_type', insightType);

  if (entityType) {
    query = query.eq('entity_type', entityType);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((row) => ({
    entityId: row.entity_id,
    data: row.data as Record<string, unknown>,
  }));
}
