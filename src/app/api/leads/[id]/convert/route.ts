import { ApiError, guardResponse, requireAdmin, requireAuth, requireOwnership } from '@/lib/api-guard';
import { buildTimelineEventInsert } from '@/lib/crm-foundation/timeline-events';
import { dbLogActivity } from '@/lib/db-server';
import { safeCatch } from '@/lib/error-monitor';
import { emptyMeddiccAssessment, emptyMutualActionPlan, rowToLead, type LeadRow } from '@/lib/leads';

function canManageLead(ctx: Awaited<ReturnType<typeof requireAuth>>, lead: LeadRow) {
  if (ctx.orgRole === 'owner' || ctx.orgRole === 'admin' || ctx.jobLevel >= 2) return;
  const ownerId = lead.owner_id ?? lead.user_id;
  if (!ownerId) return;
  requireOwnership(ctx, ownerId);
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

function newId() {
  return crypto.randomUUID();
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const { id } = await params;
    const lead = await loadLead(admin, ctx.orgId, id);
    canManageLead(ctx, lead);

    if (lead.status === 'converted' && lead.converted_opportunity_id) {
      return Response.json({
        success: true,
        lead: rowToLead(lead),
        accountId: lead.converted_account_id,
        contactId: lead.converted_contact_id,
        opportunityId: lead.converted_opportunity_id,
        alreadyConverted: true,
      });
    }

    const now = new Date().toISOString();
    const ownerId = lead.owner_id ?? lead.user_id ?? ctx.userId;

    const { data: existingAccount, error: accountLookupError } = await admin
      .from('accounts')
      .select('id, name, opportunity_ids')
      .eq('org_id', ctx.orgId)
      .ilike('name', lead.company_name)
      .limit(1)
      .maybeSingle();
    if (accountLookupError) return Response.json({ error: accountLookupError.message }, { status: 500 });

    let accountId = (existingAccount as { id?: string } | null)?.id;
    const previousOpportunityIds = ((existingAccount as { opportunity_ids?: string[] } | null)?.opportunity_ids ?? []) as string[];
    if (!accountId) {
      accountId = newId();
      const { error } = await admin.from('accounts').insert({
        id: accountId,
        org_id: ctx.orgId,
        user_id: ownerId,
        owner_id: ownerId,
        name: lead.company_name,
        deal_value: Number(lead.estimated_value ?? 0),
        deal_stage: 'lead_identified',
        deal_health: 'healthy',
        notes: lead.notes,
        opportunity_ids: [],
        last_activity: now,
        created_at: now,
      });
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }

    let contactId: string | null = null;
    if (lead.email) {
      const { data, error } = await admin
        .from('contacts')
        .select('id')
        .eq('org_id', ctx.orgId)
        .eq('account_id', accountId)
        .ilike('email', lead.email)
        .limit(1)
        .maybeSingle();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      contactId = (data as { id?: string } | null)?.id ?? null;
    }
    if (!contactId) {
      const { data, error } = await admin
        .from('contacts')
        .select('id')
        .eq('org_id', ctx.orgId)
        .eq('account_id', accountId)
        .ilike('name', lead.contact_name)
        .limit(1)
        .maybeSingle();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      contactId = (data as { id?: string } | null)?.id ?? null;
    }
    if (!contactId) {
      contactId = newId();
      const { error } = await admin.from('contacts').insert({
        id: contactId,
        org_id: ctx.orgId,
        user_id: ownerId,
        account_id: accountId,
        name: lead.contact_name,
        email: lead.email,
        phone: lead.phone,
        title: lead.title,
        role: 'unknown',
        personal_notes: lead.notes,
        created_at: now,
        updated_at: now,
      });
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }

    const opportunityId = newId();
    const { error: opportunityError } = await admin.from('opportunities').insert({
      id: opportunityId,
      org_id: ctx.orgId,
      user_id: ownerId,
      assigned_to: ownerId,
      account_id: accountId,
      name: lead.need || lead.company_name + ' 新线索',
      value: Number(lead.estimated_value ?? 0),
      currency: lead.currency || 'CNY',
      stage: 'lead_identified',
      probability: 10,
      expected_close_date: null,
      owner: lead.contact_name,
      source: lead.source,
      meddicc: emptyMeddiccAssessment(),
      mutual_action_plan: emptyMutualActionPlan(),
      competitor_ids: [],
      notes: lead.notes ?? lead.next_step ?? '',
      created_at: now,
      updated_at: now,
    });
    if (opportunityError) return Response.json({ error: opportunityError.message }, { status: 500 });

    const nextOpportunityIds = [...new Set([...previousOpportunityIds, opportunityId])];
    const { error: accountUpdateError } = await admin
      .from('accounts')
      .update({
        opportunity_ids: nextOpportunityIds,
        deal_stage: 'lead_identified',
        deal_value: Number(lead.estimated_value ?? 0),
        last_activity: now,
      })
      .eq('org_id', ctx.orgId)
      .eq('id', accountId);
    if (accountUpdateError) return Response.json({ error: accountUpdateError.message }, { status: 500 });

    const { data: updatedLead, error: leadUpdateError } = await admin
      .from('leads')
      .update({
        status: 'converted',
        converted_at: now,
        converted_account_id: accountId,
        converted_contact_id: contactId,
        converted_opportunity_id: opportunityId,
        updated_at: now,
      })
      .eq('org_id', ctx.orgId)
      .eq('id', id)
      .select('*')
      .single();
    if (leadUpdateError) return Response.json({ error: leadUpdateError.message }, { status: 500 });

    dbLogActivity({
      userId: ctx.userId,
      orgId: ctx.orgId,
      actionType: 'lead_converted',
      entityType: 'lead',
      entityId: id,
      entityName: lead.company_name,
      accountId,
      summary: `线索转化: ${lead.company_name}`,
      metadata: { contactId, opportunityId },
    }).catch(safeCatch('leads', 'audit-log', { leadId: id }));

    const timelineRow = buildTimelineEventInsert({
      accountId,
      contactId,
      opportunityId,
      type: 'intel',
      title: '线索转化为商机: ' + lead.company_name,
      detail: lead.need,
      sourceTable: 'leads',
      sourceRowId: id,
      metadata: { leadId: id, source: lead.source },
    }, { orgId: ctx.orgId, userId: ctx.userId });
    admin
      .from('timeline_events')
      .insert(timelineRow)
      .then(({ error: timelineError }) => {
        if (timelineError) safeCatch('leads', 'timeline-event', { leadId: id })(timelineError);
      });

    return Response.json({
      success: true,
      lead: rowToLead(updatedLead as LeadRow),
      accountId,
      contactId,
      opportunityId,
    });
  } catch (err) {
    return guardResponse(err);
  }
}
