import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';
import { dbLogActivity } from '@/lib/db-server';
import { safeCatch } from '@/lib/error-monitor';

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const body = await request.json();
    const { name, email, phone, title, company, role, department, linkedin, notes } = body;

    if (!name) return Response.json({ error: '缺少姓名' }, { status: 400 });

    // 查找或创建 account
    let accountId: string | null = null;
    if (company) {
      const { data: existing } = await admin
        .from('accounts')
        .select('id')
        .eq('org_id', ctx.orgId)
        .ilike('name', company)
        .limit(1)
        .single();

      if (existing) {
        accountId = existing.id;
      } else {
        const { data: newAccount } = await admin
          .from('accounts')
          .insert({ org_id: ctx.orgId, name: company, owner_id: ctx.userId })
          .select('id')
          .single();
        accountId = newAccount?.id ?? null;
      }
    }

    // 创建联系人
    const { error } = await admin.from('contacts').insert({
      org_id: ctx.orgId,
      account_id: accountId,
      name,
      email: email || null,
      phone: phone || null,
      title: title || null,
      role: role || null,
      department: department || null,
      linkedin: linkedin || null,
      personal_notes: notes || null,
    });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // 审计日志
    dbLogActivity({
      userId: ctx.userId,
      orgId: ctx.orgId,
      actionType: 'data_imported',
      entityType: 'contact',
      entityName: name,
      summary: `导入联系人: ${name}`,
    }).catch(safeCatch('contacts-import', 'audit-log', { contactName: name }));

    return Response.json({ success: true });
  } catch (err) {
    return guardResponse(err);
  }
}
