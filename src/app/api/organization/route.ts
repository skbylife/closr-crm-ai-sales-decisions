import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { dbCreateOrganization, dbMigrateUserDataToOrg } from '@/lib/db-server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { name, domain } = await request.json();
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: '组织名称不能为空' }, { status: 400 });
    }

    // 检查用户是否已有组织
    const { data: existing } = await supabase
      .from('org_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: '你已经属于一个组织' }, { status: 400 });
    }

    const org = await dbCreateOrganization(name.trim(), user.id, typeof domain === 'string' ? domain.trim() : undefined);
    if (!org) {
      return NextResponse.json({ error: '创建组织失败' }, { status: 500 });
    }

    // 迁移用户已有数据到新组织
    await dbMigrateUserDataToOrg(user.id, org.id);

    return NextResponse.json({ id: org.id, name: org.name });
  } catch (e) {
    console.error('[api/organization] POST failed:', e);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
