import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';
import { emitEvent, upsertInsight } from '@/lib/ai-event-hub';
import type { AIEntityType, InsightType, AIEventType } from '@/lib/babel-engine/types';
import { buildFreshnessMeta } from '@/lib/ai-freshness';

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType') as AIEntityType | null;
    const entityId = searchParams.get('entityId');
    const insightType = searchParams.get('insightType') as InsightType | null;

    const admin = requireAdmin();

    let query = admin
      .from('ai_insights')
      .select('entity_type, entity_id, insight_type, data, version, updated_at')
      .eq('org_id', ctx.orgId);

    if (entityType) query = query.eq('entity_type', entityType);
    if (entityId) query = query.eq('entity_id', entityId);
    if (insightType) query = query.eq('insight_type', insightType);

    const { data, error } = await query.order('updated_at', { ascending: false }).limit(100);

    if (error) {
      console.error('[ai-insights] Query failed:', error);
      return Response.json({ insights: [] });
    }

    const insights = (data ?? []).map((row) => ({
      entityType: row.entity_type,
      entityId: row.entity_id,
      insightType: row.insight_type,
      data: row.updated_at
        ? { ...(row.data as Record<string, unknown>), ...buildFreshnessMeta(row.updated_at) }
        : row.data,
      version: row.version,
      updatedAt: row.updated_at,
    }));

    return Response.json({ insights });
  } catch (err) {
    return guardResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();

    const body = await request.json() as {
      entityType: AIEntityType;
      entityId: string;
      insightType: InsightType;
      patch: Record<string, unknown>;
    };

    if (!body.entityType || !body.entityId || !body.insightType) {
      return Response.json({ error: 'Missing entityType, entityId, or insightType' }, { status: 400 });
    }

    const admin = requireAdmin();

    // Read current data, merge patch, write back
    const { data: existing } = await admin
      .from('ai_insights')
      .select('data')
      .eq('org_id', ctx.orgId)
      .eq('entity_type', body.entityType)
      .eq('entity_id', body.entityId)
      .eq('insight_type', body.insightType)
      .single();

    if (!existing) {
      return Response.json({ error: 'Insight not found' }, { status: 404 });
    }

    const mergedData = { ...(existing.data as Record<string, unknown>), ...body.patch };

    const { error } = await admin
      .from('ai_insights')
      .update({ data: mergedData, updated_at: new Date().toISOString() })
      .eq('org_id', ctx.orgId)
      .eq('entity_type', body.entityType)
      .eq('entity_id', body.entityId)
      .eq('insight_type', body.insightType);

    if (error) {
      console.error('[ai-insights] PATCH failed:', error);
      return Response.json({ error: 'Update failed' }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    return guardResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    const body = await request.json() as {
      entityType: AIEntityType;
      entityId: string;
      action: 'refresh' | 'save';
      insightType?: InsightType;
      data?: Record<string, unknown>;
    };

    if (!body.entityType || !body.entityId) {
      return Response.json({ error: 'Missing entityType or entityId' }, { status: 400 });
    }

    // action: save — 直接保存洞察数据
    if (body.action === 'save') {
      if (!body.insightType || !body.data) {
        return Response.json({ error: 'Missing insightType or data for save' }, { status: 400 });
      }
      await upsertInsight(ctx.orgId, body.entityType, body.entityId, body.insightType, body.data);
      return Response.json({ ok: true });
    }

    // action: refresh — 触发事件重新生成
    const eventTypeMap: Record<string, AIEventType> = {
      opportunity: 'deal.stage_changed',
      contact: 'contact.updated',
      account: 'intel.created',
      email_decode: 'decode.completed',
      intel_item: 'intel.created',
    };

    const eventType = eventTypeMap[body.entityType] ?? 'decode.completed';

    const eventId = await emitEvent({
      orgId: ctx.orgId,
      userId: ctx.userId,
      eventType,
      entityType: body.entityType,
      entityId: body.entityId,
      payload: { manual: true, action: 'refresh' },
    });

    return Response.json({ ok: true, eventId });
  } catch (err) {
    return guardResponse(err);
  }
}
