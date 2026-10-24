import { guardResponse, requireAdmin, requireAuth, ApiError } from '@/lib/api-guard';
import { requireRelationshipAccountAccess } from '@/lib/relationship-intelligence/access';
import { buildRelationshipIntelligencePayload } from '@/lib/relationship-intelligence/loaders';
import { isExternalAdvisorRole } from '@/lib/relationship-intelligence/external-advisor';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const admin = requireAdmin();
    const account = await requireRelationshipAccountAccess(admin, ctx, id);
    const payload = await buildRelationshipIntelligencePayload({ admin, account });
    return Response.json(payload);
  } catch (err) {
    return guardResponse(err);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const admin = requireAdmin();
    const account = await requireRelationshipAccountAccess(admin, ctx, id);
    const body = await request.json().catch(() => ({})) as {
      contactId?: string;
      summary?: string;
      influenceDomain?: string;
      biasDirection?: string;
      accessMode?: string;
    };

    const contactId = String(body.contactId ?? '').trim();
    const summary = String(body.summary ?? '').trim();
    if (!contactId) throw new ApiError(400, '请选择外部顾问');
    if (summary.length < 8) throw new ApiError(400, '请补充足够的顾问信号内容');

    const { data: contact, error: contactError } = await admin
      .from('contacts')
      .select('id, role')
      .eq('org_id', ctx.orgId)
      .eq('account_id', account.id)
      .eq('id', contactId)
      .single();
    if (contactError || !contact) throw new ApiError(404, '外部顾问不存在');
    if (!isExternalAdvisorRole((contact as { role?: string | null }).role)) throw new ApiError(400, '该联系人不是外部顾问类型');

    const metadata = {
      externalAdvisor: true,
      influenceDomain: body.influenceDomain ?? 'other',
      biasDirection: body.biasDirection ?? 'unknown',
      accessMode: body.accessMode ?? 'via_internal_owner',
      doesNotGrantAccess: true,
    };

    const { data, error } = await admin
      .from('relationship_signals')
      .insert({
        org_id: ctx.orgId,
        account_id: account.id,
        contact_id: contactId,
        actor_user_id: ctx.userId,
        signal_kind: 'manual_note',
        valence: 'mixed',
        strength: 50,
        confidence: 0.65,
        summary,
        metadata,
        occurred_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    return Response.json({ ok: true, signalId: (data as { id: string }).id });
  } catch (err) {
    return guardResponse(err);
  }
}
