import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';

// GET — 获取渠道伙伴和报备
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'partners' | 'registrations'

    if (type === 'registrations') {
      const { data } = await admin.from('deal_registrations').select('*').eq('org_id', ctx.orgId).order('created_at', { ascending: false });
      return Response.json({ registrations: data ?? [] });
    }

    // Default: partners
    const { data } = await admin.from('channel_partners').select('*').eq('org_id', ctx.orgId).order('tier', { ascending: true });
    return Response.json({ partners: data ?? [] });
  } catch (err) {
    return guardResponse(err);
  }
}

// POST — 创建伙伴或报备
// 白名单允许写入的字段，防止 mass assignment (如 id/created_at/user_id 被覆盖)
const PARTNER_ALLOWED_FIELDS = [
  'name', 'tier', 'region', 'contact_name', 'contact_email', 'contact_phone',
  'status', 'commission_rate', 'notes', 'url', 'metadata',
] as const;
const REGISTRATION_ALLOWED_FIELDS = [
  'partner_id', 'customer_name', 'deal_name', 'deal_value', 'deal_stage',
  'expected_close_date', 'status', 'notes', 'metadata',
] as const;

function pickFields<T extends Record<string, unknown>>(obj: T, allowed: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const body = await request.json() as Record<string, unknown>;
    const isRegistration = body._type === 'registration';
    const table = isRegistration ? 'deal_registrations' : 'channel_partners';
    const allowedFields = isRegistration ? REGISTRATION_ALLOWED_FIELDS : PARTNER_ALLOWED_FIELDS;

    const sanitized = pickFields(body, allowedFields);
    const row = { ...sanitized, org_id: ctx.orgId, user_id: ctx.userId };
    const { data, error } = await admin.from(table).insert(row).select().single();
    if (error) return Response.json({ error: 'Insert failed' }, { status: 400 });
    return Response.json({ data });
  } catch (err) {
    return guardResponse(err);
  }
}

// PATCH — 更新伙伴或报备状态
export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const body = await request.json() as Record<string, unknown>;
    const { id, _type } = body;
    if (!id || typeof id !== 'string') {
      return Response.json({ error: 'Missing id' }, { status: 400 });
    }
    const isRegistration = _type === 'registration';
    const table = isRegistration ? 'deal_registrations' : 'channel_partners';
    const allowedFields = isRegistration ? REGISTRATION_ALLOWED_FIELDS : PARTNER_ALLOWED_FIELDS;
    const updates = pickFields(body, allowedFields);

    const { error } = await admin.from(table).update(updates).eq('id', id).eq('org_id', ctx.orgId);
    if (error) return Response.json({ error: 'Update failed' }, { status: 400 });
    return Response.json({ ok: true });
  } catch (err) {
    return guardResponse(err);
  }
}

// DELETE — 删除伙伴
export async function DELETE(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type');
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

    const table = type === 'registration' ? 'deal_registrations' : 'channel_partners';
    const { error } = await admin.from(table).delete().eq('id', id).eq('org_id', ctx.orgId);
    if (error) return Response.json({ error: error.message }, { status: 400 });
    await recordComplianceAudit({
      admin,
      ctx,
      action: type === 'registration' ? 'deal_registration_deleted' : 'channel_partner_deleted',
      objectType: table,
      recordId: id,
      recordName: id,
      request,
      changes: { type: type ?? 'partner' },
    });
    return Response.json({ ok: true });
  } catch (err) {
    return guardResponse(err);
  }
}
