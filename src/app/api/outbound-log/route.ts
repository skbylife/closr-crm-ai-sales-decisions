import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';

interface OutboundLogBody {
  contactId: string;
  emailText: string;
  date: string;
  summary?: string;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = (await request.json()) as OutboundLogBody;

    if (!body.contactId || !body.emailText) {
      return Response.json({ error: '缺少必填字段' }, { status: 400 });
    }

    const admin = requireAdmin();

    // Look up account_id from contacts (scoped to caller's org)
    const { data: contact } = await admin
      .from('contacts')
      .select('account_id')
      .eq('id', body.contactId)
      .eq('org_id', ctx.orgId)
      .single();

    if (!contact) {
      return Response.json({ error: '联系人不存在' }, { status: 404 });
    }

    const id = `outbound_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const { error: insertError } = await admin.from('email_decodes').insert({
      id,
      user_id: ctx.userId,
      org_id: ctx.orgId,
      account_id: contact.account_id,
      matched_contact_id: body.contactId,
      email_text: body.summary || body.emailText,
      direction: 'outbound',
      date: body.date,
      decode: null,
    });

    if (insertError) {
      console.error('[outbound-log] Insert failed:', insertError);
      return Response.json({ error: '保存失败' }, { status: 500 });
    }

    // Update last_contacted_at on the contact (scoped to org)
    await admin
      .from('contacts')
      .update({ last_contacted_at: body.date })
      .eq('id', body.contactId)
      .eq('org_id', ctx.orgId);

    return Response.json({ ok: true, id });
  } catch (err) {
    return guardResponse(err);
  }
}
