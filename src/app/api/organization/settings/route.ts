import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/api-guard';

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { orgId, name, settings } = await request.json();
    if (!orgId) {
      return NextResponse.json({ error: '缺少组织 ID' }, { status: 400 });
    }

    // Check caller is owner
    const { data: membership } = await supabase
      .from('org_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single();

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json({ error: '只有 Owner 可以修改组织设置' }, { status: 403 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (settings !== undefined) {
      // Merge with existing settings
      const { data: org } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', orgId)
        .single();
      updates.settings = { ...(org?.settings ?? {}), ...settings };
    }

    const admin = requireAdmin();
    await admin.from('organizations').update(updates).eq('id', orgId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[api/organization/settings] PATCH failed:', e);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
