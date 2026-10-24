/**
 * GET /api/integration/wecom/groups — 客户群列表
 * GET /api/integration/wecom/groups?chatId=xxx — 群详情
 */

import { NextRequest } from 'next/server';
import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';

export async function GET(req: NextRequest) {
  try {
  const ctx = await requireAuth();
  const orgId = ctx.orgId;

  const chatId = req.nextUrl.searchParams.get('chatId');

  const supabase = requireAdmin();

  const { data: connection, error: connectionError } = await supabase
    .from('integration_connections')
    .select('id, status')
    .eq('org_id', orgId)
    .eq('connector_id', 'wecom')
    .maybeSingle();

  if (connectionError) {
    return Response.json({ error: connectionError.message }, { status: 500 });
  }
  if (!connection || connection.status !== 'connected') {
    return Response.json({ groups: [], total: 0, integrationAvailable: false }, { status: 200 });
  }

  let query = supabase
    .from('integration_wecom_groups')
    .select('id, chat_id, name, owner_userid, create_time, member_count, external_member_count, member_list, created_at')
    .eq('org_id', orgId)
    .order('create_time', { ascending: false, nullsFirst: false });

  if (chatId) {
    query = query.eq('chat_id', chatId);
  }

  const { data, error } = await query;

  if (error) {
    // Table not found — wecom integration not set up yet
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      return Response.json({ groups: [], total: 0 }, { status: 200 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  const groups = (data ?? []).map((row) => ({
    id: row.id,
    chatId: row.chat_id,
    name: row.name,
    ownerUserid: row.owner_userid,
    createTime: row.create_time,
    memberCount: row.member_count,
    externalMemberCount: row.external_member_count,
    memberList: row.member_list ?? [],
  }));

  return Response.json({ groups, total: groups.length });
  } catch (err) {
    return guardResponse(err);
  }
}
