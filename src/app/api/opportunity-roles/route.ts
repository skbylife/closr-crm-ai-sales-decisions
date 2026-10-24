import {
  guardResponse,
  requireAdmin,
  requireAuth,
  requireContactAccess,
  requireOpportunityAccess,
} from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';
import { dbLogActivity } from '@/lib/db-server';
import {
  buildContactOpportunityRoleInsert,
  rowToPersistedOpportunityRole,
  type ContactOpportunityRoleInput,
  type ContactOpportunityRoleRow,
} from '@/lib/crm-foundation/contact-opportunity-roles';
import { safeCatch } from '@/lib/error-monitor';

async function assertSameAccount(params: {
  admin: ReturnType<typeof requireAdmin>;
  orgId: string;
  contactId: string;
  opportunityId: string;
}) {
  const [{ data: contact }, { data: opportunity }] = await Promise.all([
    params.admin
      .from('contacts')
      .select('id, account_id')
      .eq('org_id', params.orgId)
      .eq('id', params.contactId)
      .maybeSingle(),
    params.admin
      .from('opportunities')
      .select('id, account_id, name')
      .eq('org_id', params.orgId)
      .eq('id', params.opportunityId)
      .maybeSingle(),
  ]);

  if (!contact) return { error: '联系人不存在' };
  if (!opportunity) return { error: '商机不存在' };
  const contactAccount = (contact as { account_id?: string | null }).account_id;
  const opportunityAccount = (opportunity as { account_id?: string | null }).account_id;
  if (contactAccount && opportunityAccount && contactAccount !== opportunityAccount) {
    return { error: '联系人与商机不属于同一客户' };
  }
  return { opportunityName: (opportunity as { name?: string | null }).name ?? params.opportunityId };
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const url = new URL(request.url);
    const opportunityId = url.searchParams.get('opportunityId');
    const contactId = url.searchParams.get('contactId');

    if (!opportunityId && !contactId) {
      return Response.json({ error: '需要 opportunityId 或 contactId' }, { status: 400 });
    }
    if (opportunityId) await requireOpportunityAccess(ctx, opportunityId);
    if (contactId) await requireContactAccess(ctx, contactId);

    let query = admin
      .from('contact_opportunity_roles')
      .select('*, contacts(name, title)')
      .eq('org_id', ctx.orgId);
    if (opportunityId) query = query.eq('opportunity_id', opportunityId);
    if (contactId) query = query.eq('contact_id', contactId);

    const { data, error } = await query.order('updated_at', { ascending: false }).limit(100);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as ContactOpportunityRoleRow[];
    return Response.json({
      roles: rows.map(rowToPersistedOpportunityRole),
      rows,
    });
  } catch (err) {
    return guardResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const body = await request.json().catch(() => ({})) as ContactOpportunityRoleInput;
    await requireOpportunityAccess(ctx, body.opportunityId);
    await requireContactAccess(ctx, body.contactId);

    const accountCheck = await assertSameAccount({
      admin,
      orgId: ctx.orgId,
      contactId: body.contactId,
      opportunityId: body.opportunityId,
    });
    if ('error' in accountCheck) return Response.json({ error: accountCheck.error }, { status: 400 });

    let row: Record<string, unknown>;
    try {
      row = buildContactOpportunityRoleInsert(body, { orgId: ctx.orgId, userId: ctx.userId });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : '角色数据无效' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('contact_opportunity_roles')
      .upsert(row, { onConflict: 'contact_id,opportunity_id' })
      .select('*, contacts(name, title)')
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const saved = data as ContactOpportunityRoleRow;
    dbLogActivity({
      userId: ctx.userId,
      orgId: ctx.orgId,
      actionType: 'opportunity_role_upserted',
      entityType: 'opportunity_role',
      entityId: saved.id,
      opportunityId: saved.opportunity_id,
      contactId: saved.contact_id,
      summary: '更新商机联系人角色: ' + saved.role_type,
      metadata: { roleType: saved.role_type, influence: saved.influence_level, stance: saved.stance },
    }).catch(safeCatch('opportunity-roles', 'activity-log', { roleId: saved.id }));

    await recordComplianceAudit({
      admin,
      ctx,
      action: 'opportunity_role_upserted',
      objectType: 'opportunity_role',
      recordId: saved.id,
      recordName: saved.role_type,
      request,
      changes: { contactId: saved.contact_id, opportunityId: saved.opportunity_id, roleType: saved.role_type },
    });

    return Response.json({ success: true, role: rowToPersistedOpportunityRole(saved), row: saved });
  } catch (err) {
    return guardResponse(err);
  }
}
