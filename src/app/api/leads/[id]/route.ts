import { requireAdmin, requireAuth, requireOwnership, guardResponse, ApiError } from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';
import { dbLogActivity } from '@/lib/db-server';
import { safeCatch } from '@/lib/error-monitor';
import { buildLeadPatch, rowToLead, type LeadInput, type LeadRow } from '@/lib/leads';

function canManageLead(ctx: Awaited<ReturnType<typeof requireAuth>>, lead: LeadRow) {
  if (ctx.orgRole === 'owner' || ctx.orgRole === 'admin' || ctx.jobLevel >= 2) return;
  const ownerId = lead.owner_id ?? lead.user_id;
  if (!ownerId) return;
  requireOwnership(ctx, ownerId);
}

async function assertOrgMember(admin: ReturnType<typeof requireAdmin>, orgId: string, userId: string | null | undefined) {
  if (!userId) return true;
  const { data } = await admin
    .from('org_memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(data);
}

async function loadLead(admin: ReturnType<typeof requireAdmin>, orgId: string, id: string) {
  const { data, error } = await admin
    .from('leads')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, '线索不存在');
  return data as LeadRow;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const { id } = await params;
    const lead = await loadLead(admin, ctx.orgId, id);
    canManageLead(ctx, lead);

    const body = await request.json().catch(() => ({})) as LeadInput;
    const built = buildLeadPatch(body);
    if ('error' in built) return Response.json({ error: built.error }, { status: 400 });
    if (Object.keys(built.row).length <= 1) return Response.json({ error: '没有可更新字段' }, { status: 400 });

    if ('owner_id' in built.row && !(await assertOrgMember(admin, ctx.orgId, built.row.owner_id as string | null))) {
      return Response.json({ error: '负责人不属于当前组织' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('leads')
      .update(built.row)
      .eq('org_id', ctx.orgId)
      .eq('id', id)
      .select('*')
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const updated = rowToLead(data as LeadRow);
    dbLogActivity({
      userId: ctx.userId,
      orgId: ctx.orgId,
      actionType: 'lead_updated',
      entityType: 'lead',
      entityId: updated.id,
      entityName: updated.companyName,
      summary: `更新线索: ${updated.companyName}`,
      metadata: { status: updated.status, priority: updated.priority },
    }).catch(safeCatch('leads', 'audit-log', { leadId: updated.id }));

    return Response.json({ success: true, lead: updated });
  } catch (err) {
    return guardResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const { id } = await params;
    const lead = await loadLead(admin, ctx.orgId, id);
    canManageLead(ctx, lead);

    const { error } = await admin
      .from('leads')
      .delete()
      .eq('org_id', ctx.orgId)
      .eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    dbLogActivity({
      userId: ctx.userId,
      orgId: ctx.orgId,
      actionType: 'lead_deleted',
      entityType: 'lead',
      entityId: id,
      entityName: lead.company_name,
      summary: `删除线索: ${lead.company_name}`,
    }).catch(safeCatch('leads', 'audit-log', { leadId: id }));

    await recordComplianceAudit({
      admin,
      ctx,
      action: 'lead_deleted',
      objectType: 'lead',
      recordId: id,
      recordName: lead.company_name,
      changes: { status: lead.status, ownerId: lead.owner_id ?? lead.user_id ?? null },
    });

    return Response.json({ success: true });
  } catch (err) {
    return guardResponse(err);
  }
}
