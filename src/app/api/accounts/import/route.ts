import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';
import { dbLogActivity } from '@/lib/db-server';
import { safeCatch } from '@/lib/error-monitor';

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const body = await request.json();
    const { name, industry, website, notes, allowDuplicate } = body;

    if (!name) return Response.json({ error: '缺少公司名称' }, { status: 400 });

    // 检查是否已存在同名客户
    const { data: existing } = await admin
      .from('accounts')
      .select('id')
      .eq('org_id', ctx.orgId)
      .ilike('name', name)
      .limit(1)
      .single();

    if (existing && allowDuplicate !== true && allowDuplicate !== 'true') {
      return Response.json({ error: '客户 "' + name + '" 已存在' }, { status: 409 });
    }

    const { error } = await admin.from('accounts').insert({
      org_id: ctx.orgId,
      owner_id: ctx.userId,
      name,
      industry: industry || null,
      website: website || null,
      notes: notes || null,
    });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // 审计日志
    dbLogActivity({
      userId: ctx.userId,
      orgId: ctx.orgId,
      actionType: 'data_imported',
      entityType: 'account',
      entityName: name,
      summary: `导入客户: ${name}`,
    }).catch(safeCatch('accounts-import', 'audit-log', { accountName: name }));

    return Response.json({ success: true });
  } catch (err) {
    return guardResponse(err);
  }
}
