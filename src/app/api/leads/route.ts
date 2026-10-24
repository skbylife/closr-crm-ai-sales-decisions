import { requireAdmin, requireAuth, guardResponse } from '@/lib/api-guard';
import { dbLogActivity } from '@/lib/db-server';
import { safeCatch } from '@/lib/error-monitor';
import { buildLeadInsert, rowToLead, type LeadInput, type LeadRow } from '@/lib/leads';

function visibleUserIds(ctx: Awaited<ReturnType<typeof requireAuth>>): string[] | null {
  if (ctx.orgRole === 'owner' || ctx.orgRole === 'admin' || ctx.jobLevel >= 2) return null;
  if (ctx.jobLevel >= 1) return [...new Set([ctx.userId, ...ctx.teamMemberIds])];
  return [ctx.userId];
}

function applyVisibility<T extends { or: (filter: string) => T }>(query: T, ids: string[] | null): T {
  if (!ids) return query;
  const list = ids.join(',');
  return query.or(`owner_id.in.(${list}),and(owner_id.is.null,user_id.in.(${list}))`);
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

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const url = new URL(request.url);
    const status = url.searchParams.get('status');

    let query = admin
      .from('leads')
      .select('*')
      .eq('org_id', ctx.orgId);
    if (status && status !== 'all') query = query.eq('status', status);
    query = applyVisibility(query, visibleUserIds(ctx));

    const { data, error } = await query
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ leads: ((data ?? []) as LeadRow[]).map(rowToLead) });
  } catch (err) {
    return guardResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const body = await request.json().catch(() => ({})) as LeadInput;
    const built = buildLeadInsert(body, { orgId: ctx.orgId, userId: ctx.userId });
    if ('error' in built) return Response.json({ error: built.error }, { status: 400 });

    if (!(await assertOrgMember(admin, ctx.orgId, built.row.owner_id))) {
      return Response.json({ error: '负责人不属于当前组织' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('leads')
      .insert(built.row)
      .select('*')
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const lead = rowToLead(data as LeadRow);
    dbLogActivity({
      userId: ctx.userId,
      orgId: ctx.orgId,
      actionType: 'lead_created',
      entityType: 'lead',
      entityId: lead.id,
      entityName: lead.companyName,
      summary: `新建线索: ${lead.companyName}`,
      metadata: { source: lead.source, priority: lead.priority },
    }).catch(safeCatch('leads', 'audit-log', { leadId: lead.id }));

    return Response.json({ success: true, lead });
  } catch (err) {
    return guardResponse(err);
  }
}
