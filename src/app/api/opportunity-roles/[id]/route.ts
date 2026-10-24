import {
  ApiError,
  guardResponse,
  requireAdmin,
  requireAuth,
  requireOpportunityAccess,
} from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';
import { dbLogActivity } from '@/lib/db-server';
import {
  buildContactOpportunityRoleUpdate,
  rowToPersistedOpportunityRole,
  type ContactOpportunityRolePatch,
  type ContactOpportunityRoleRow,
} from '@/lib/crm-foundation/contact-opportunity-roles';
import { safeCatch } from '@/lib/error-monitor';

async function loadRole(admin: ReturnType<typeof requireAdmin>, orgId: string, id: string): Promise<ContactOpportunityRoleRow> {
  const { data, error } = await admin
    .from('contact_opportunity_roles')
    .select('*, contacts(name, title)')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, '商机角色不存在');
  return data as ContactOpportunityRoleRow;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const { id } = await params;
    const existing = await loadRole(admin, ctx.orgId, id);
    await requireOpportunityAccess(ctx, existing.opportunity_id);

    const body = await request.json().catch(() => ({})) as ContactOpportunityRolePatch;
    let patch: Record<string, unknown>;
    try {
      patch = buildContactOpportunityRoleUpdate(body, { userId: ctx.userId });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : '角色数据无效' }, { status: 400 });
    }
    if (Object.keys(patch).length <= 2) return Response.json({ error: '没有可更新字段' }, { status: 400 });

    const { data, error } = await admin
      .from('contact_opportunity_roles')
      .update(patch)
      .eq('org_id', ctx.orgId)
      .eq('id', id)
      .select('*, contacts(name, title)')
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const updated = data as ContactOpportunityRoleRow;
    dbLogActivity({
      userId: ctx.userId,
      orgId: ctx.orgId,
      actionType: 'opportunity_role_updated',
      entityType: 'opportunity_role',
      entityId: updated.id,
      opportunityId: updated.opportunity_id,
      contactId: updated.contact_id,
      summary: '更新商机联系人角色: ' + updated.role_type,
      metadata: { before: existing.role_type, after: updated.role_type },
    }).catch(safeCatch('opportunity-roles', 'activity-log', { roleId: updated.id }));

    await recordComplianceAudit({
      admin,
      ctx,
      action: 'opportunity_role_updated',
      objectType: 'opportunity_role',
      recordId: updated.id,
      recordName: updated.role_type,
      request,
      changes: patch,
    });

    return Response.json({ success: true, role: rowToPersistedOpportunityRole(updated), row: updated });
  } catch (err) {
    return guardResponse(err);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const { id } = await params;
    const existing = await loadRole(admin, ctx.orgId, id);
    await requireOpportunityAccess(ctx, existing.opportunity_id);

    const { error } = await admin
      .from('contact_opportunity_roles')
      .delete()
      .eq('org_id', ctx.orgId)
      .eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    dbLogActivity({
      userId: ctx.userId,
      orgId: ctx.orgId,
      actionType: 'opportunity_role_deleted',
      entityType: 'opportunity_role',
      entityId: id,
      opportunityId: existing.opportunity_id,
      contactId: existing.contact_id,
      summary: '删除商机联系人角色: ' + existing.role_type,
    }).catch(safeCatch('opportunity-roles', 'activity-log', { roleId: id }));

    await recordComplianceAudit({
      admin,
      ctx,
      action: 'opportunity_role_deleted',
      objectType: 'opportunity_role',
      recordId: id,
      recordName: existing.role_type,
      request,
      changes: { contactId: existing.contact_id, opportunityId: existing.opportunity_id },
    });

    return Response.json({ success: true });
  } catch (err) {
    return guardResponse(err);
  }
}
