/**
 * GET /api/integration/wecom?accountId=xxx — 该 account 的企业微信外部联系人
 * GET /api/integration/wecom?contactId=xxx — 该 contact 的企业微信信息
 */

import { NextRequest } from 'next/server';
import { requireAuth, requireAdmin, requireAccountAccess, requireContactAccess, guardResponse } from '@/lib/api-guard';

function isMissingTable(error: unknown, table: string) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes(`relation \"public.${table}\" does not exist`) || message.includes(`Could not find the table 'public.${table}'`);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(req: NextRequest) {
  try {
  const ctx = await requireAuth();
  const orgId = ctx.orgId;

  const accountId = req.nextUrl.searchParams.get('accountId');
  const contactId = req.nextUrl.searchParams.get('contactId');

  if (!accountId && !contactId) {
    return Response.json(
      { error: 'accountId or contactId is required' },
      { status: 400 },
    );
  }

  if (accountId) {
    await requireAccountAccess(ctx, accountId);
    if (!isUuid(accountId)) {
      return Response.json({ contacts: [], total: 0, integrationAvailable: true });
    }
  } else if (contactId) {
    await requireContactAccess(ctx, contactId);
    if (!isUuid(contactId)) {
      return Response.json({ contacts: [], total: 0, integrationAvailable: true });
    }
  }

  const supabase = requireAdmin();

  let query = supabase
    .from('integration_wecom_contacts')
    .select('id, external_userid, name, corp_name, corp_full_name, position, avatar, follow_userid, follow_remark, follow_description, add_time, tags, account_id, contact_id, raw_data, created_at')
    .eq('org_id', orgId)
    .order('add_time', { ascending: false, nullsFirst: false });

  if (accountId) {
    query = query.eq('account_id', accountId);
  } else if (contactId) {
    query = query.eq('contact_id', contactId);
  }

  const { data, error } = await query;

  if (error) {
    // Table not found or relation doesn't exist — wecom not set up yet
    if (isMissingTable(error, 'integration_wecom_contacts') || error.code === '42P01' || error.code === 'PGRST204' || error.message?.includes('does not exist') || error.message?.includes('Could not find')) {
      return Response.json({ contacts: [], total: 0, integrationAvailable: false }, { status: 200 });
    }
    console.warn('[wecom] Query error:', error.code, error.message);
    return Response.json({ contacts: [], total: 0, integrationAvailable: false }, { status: 200 });
  }

  const contacts = (data ?? []).map((row) => ({
    id: row.id,
    externalUserid: row.external_userid,
    name: row.name,
    corpName: row.corp_name,
    corpFullName: row.corp_full_name,
    position: row.position,
    avatar: row.avatar,
    followUserid: row.follow_userid,
    followRemark: row.follow_remark,
    followDescription: row.follow_description,
    addTime: row.add_time,
    tags: row.tags ?? [],
    accountId: row.account_id,
    contactId: row.contact_id,
  }));

  return Response.json({ contacts, total: contacts.length });
  } catch (err) {
    return guardResponse(err);
  }
}
