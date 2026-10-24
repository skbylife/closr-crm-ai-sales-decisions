import { NextRequest } from 'next/server';
import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const accountId = req.nextUrl.searchParams.get('accountId');
    const contactId = req.nextUrl.searchParams.get('contactId');
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10) || 50, 200);
    const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10) || 0;

    if (!accountId && !contactId) {
      return Response.json({ error: 'accountId or contactId is required' }, { status: 400 });
    }

    let query = admin
      .from('activity_logs')
      .select('id, action_type, summary, contact_name, created_at, account_id, contact_id')
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (accountId) {
      query = query.eq('account_id', accountId);
    } else if (contactId) {
      query = query.eq('contact_id', contactId);
    }

    const { data, error } = await query;
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const logs = (data ?? []).map((row) => ({
      id: row.id,
      actionType: row.action_type,
      summary: row.summary,
      contactName: row.contact_name,
      createdAt: row.created_at,
      accountId: row.account_id,
      contactId: row.contact_id,
    }));

    return Response.json({ logs, total: logs.length });
  } catch (err) {
    return guardResponse(err);
  }
}
