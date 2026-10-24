import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const params = await request.json();
    const admin = requireAdmin();

    // Always use authoritative server-side org_id. Never trust client-supplied orgId
    await admin.from('activity_logs').insert({
      user_id: ctx.userId,
      org_id: ctx.orgId,
      user_display_name: params.userDisplayName ?? null,
      action_type: params.actionType,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      entity_name: params.entityName ?? null,
      account_id: params.accountId ?? null,
      account_name: params.accountName ?? null,
      contact_id: params.contactId ?? null,
      contact_name: params.contactName ?? null,
      opportunity_id: params.opportunityId ?? null,
      summary: params.summary,
      metadata: params.metadata ?? {},
    });

    return Response.json({ ok: true });
  } catch (err) {
    return guardResponse(err);
  }
}
