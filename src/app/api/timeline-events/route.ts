import {
  guardResponse,
  requireAccountAccess,
  requireAdmin,
  requireAuth,
  requireContactAccess,
  requireOpportunityAccess,
} from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';
import { dbLogActivity } from '@/lib/db-server';
import {
  buildTimelineEventInsert,
  rowToUnifiedTimelineEvent,
  type TimelineEventInput,
  type TimelineEventRow,
} from '@/lib/crm-foundation/timeline-events';
import { safeCatch } from '@/lib/error-monitor';

async function insertLinks(params: {
  admin: ReturnType<typeof requireAdmin>;
  orgId: string;
  eventId: string;
  input: TimelineEventInput;
}) {
  const links = [
    params.input.accountId ? { org_id: params.orgId, event_id: params.eventId, entity_type: 'account', entity_id: params.input.accountId } : null,
    params.input.opportunityId ? { org_id: params.orgId, event_id: params.eventId, entity_type: 'opportunity', entity_id: params.input.opportunityId } : null,
    params.input.contactId ? { org_id: params.orgId, event_id: params.eventId, entity_type: 'contact', entity_id: params.input.contactId } : null,
  ].filter((link): link is { org_id: string; event_id: string; entity_type: string; entity_id: string } => Boolean(link));
  if (!links.length) return;
  await params.admin.from('timeline_event_links').upsert(links, { onConflict: 'event_id,entity_type,entity_id' });
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const url = new URL(request.url);
    const opportunityId = url.searchParams.get('opportunityId');
    const accountId = url.searchParams.get('accountId');
    const contactId = url.searchParams.get('contactId');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '50') || 50, 1), 100);

    if (!opportunityId && !accountId && !contactId) {
      return Response.json({ error: '需要 opportunityId、accountId 或 contactId' }, { status: 400 });
    }
    if (opportunityId) await requireOpportunityAccess(ctx, opportunityId);
    if (accountId) await requireAccountAccess(ctx, accountId);
    if (contactId) await requireContactAccess(ctx, contactId);

    let query = admin.from('timeline_events').select('*').eq('org_id', ctx.orgId);
    if (opportunityId) query = query.eq('opportunity_id', opportunityId);
    else if (accountId) query = query.eq('account_id', accountId);
    else if (contactId) query = query.eq('contact_id', contactId);

    const { data, error } = await query.order('occurred_at', { ascending: false }).limit(limit);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []) as TimelineEventRow[];
    return Response.json({ events: rows.map(rowToUnifiedTimelineEvent), rows });
  } catch (err) {
    return guardResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const body = await request.json().catch(() => ({})) as TimelineEventInput;
    if (body.opportunityId) await requireOpportunityAccess(ctx, body.opportunityId);
    if (body.accountId) await requireAccountAccess(ctx, body.accountId);
    if (body.contactId) await requireContactAccess(ctx, body.contactId);

    let row: Record<string, unknown>;
    try {
      row = buildTimelineEventInsert(body, { orgId: ctx.orgId, userId: ctx.userId });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : '时间线事件无效' }, { status: 400 });
    }

    const { data, error } = await admin.from('timeline_events').insert(row).select('*').single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const saved = data as TimelineEventRow;
    await insertLinks({ admin, orgId: ctx.orgId, eventId: saved.id, input: body });

    dbLogActivity({
      userId: ctx.userId,
      orgId: ctx.orgId,
      actionType: 'timeline_event_created',
      entityType: 'timeline_event',
      entityId: saved.id,
      accountId: saved.account_id ?? undefined,
      contactId: saved.contact_id ?? undefined,
      opportunityId: saved.opportunity_id ?? undefined,
      summary: '记录销售时间线事件: ' + saved.title,
      metadata: { type: saved.type, occurredAt: saved.occurred_at },
    }).catch(safeCatch('timeline-events', 'activity-log', { eventId: saved.id }));

    await recordComplianceAudit({
      admin,
      ctx,
      action: 'timeline_event_created',
      objectType: 'timeline_event',
      recordId: saved.id,
      recordName: saved.title,
      request,
      changes: { type: saved.type, opportunityId: saved.opportunity_id, accountId: saved.account_id, contactId: saved.contact_id },
    });

    return Response.json({ success: true, event: rowToUnifiedTimelineEvent(saved), row: saved });
  } catch (err) {
    return guardResponse(err);
  }
}
