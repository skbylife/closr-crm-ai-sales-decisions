/**
 * GET /api/integration/emails?accountId=xxx — 获取 account 的邮件互动
 * GET /api/integration/emails?contactId=xxx — 获取 contact 的邮件互动
 */

import { NextRequest } from 'next/server';
import { requireAuth, requireAdmin, requireAccountAccess, requireContactAccess, guardResponse } from '@/lib/api-guard';

function isMissingTable(error: unknown, table: string) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes(`relation \"public.${table}\" does not exist`) || message.includes(`Could not find the table 'public.${table}'`);
}

export async function GET(req: NextRequest) {
  try {
  const ctx = await requireAuth();
  const orgId = ctx.orgId;

  const accountId = req.nextUrl.searchParams.get('accountId');
  const contactId = req.nextUrl.searchParams.get('contactId');
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10) || 50, 200);
  const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10) || 0;

  if (!accountId && !contactId) {
    return Response.json(
      { error: 'accountId or contactId is required' },
      { status: 400 },
    );
  }

  if (accountId) {
    await requireAccountAccess(ctx, accountId);
  } else if (contactId) {
    await requireContactAccess(ctx, contactId);
  }

  const supabase = requireAdmin();

  let query = supabase
    .from('integration_emails')
    .select('id, message_id, sender, to_recipients, cc_recipients, subject, received_at, summary, sentiment, intent, key_info, account_id, contact_id')
    .eq('org_id', orgId)
    .order('received_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (accountId) {
    query = query.eq('account_id', accountId);
  } else if (contactId) {
    query = query.eq('contact_id', contactId);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTable(error, 'integration_emails')) {
      return Response.json({ emails: [], total: 0, integrationAvailable: false }, { status: 200 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  const emails = (data ?? []).map((row) => ({
    id: row.id,
    messageId: row.message_id,
    sender: row.sender,
    toRecipients: row.to_recipients,
    ccRecipients: row.cc_recipients,
    subject: row.subject,
    receivedAt: row.received_at,
    summary: row.summary,
    sentiment: row.sentiment,
    intent: row.intent,
    keyInfo: row.key_info,
    accountId: row.account_id,
    contactId: row.contact_id,
  }));

  return Response.json({ emails, total: emails.length });
  } catch (err) {
    return guardResponse(err);
  }
}
