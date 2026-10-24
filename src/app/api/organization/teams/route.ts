import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';

// 获取团队列表（含成员数）
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const url = new URL(request.url);
    const orgId = url.searchParams.get('orgId');
    if (!orgId) return NextResponse.json({ error: '缺少 orgId' }, { status: 400 });

    // 验证调用者属于该组织
    const { data: membership, error: membershipError } = await supabase
      .from('org_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return NextResponse.json({ error: '无权限' }, { status: 403 });

    // 查询团队
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id, name, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true });
    if (teamsError) throw teamsError;

    if (!teams || teams.length === 0) return NextResponse.json([]);

    // 统计每个团队的成员数
    const { data: memberships, error: membersError } = await supabase
      .from('org_memberships')
      .select('team_id')
      .eq('org_id', orgId)
      .not('team_id', 'is', null);
    if (membersError) throw membersError;

    const countMap: Record<string, number> = {};
    for (const m of memberships ?? []) {
      const tid = m.team_id as string;
      countMap[tid] = (countMap[tid] || 0) + 1;
    }

    return NextResponse.json(
      teams.map((t) => ({
        id: t.id,
        name: t.name,
        memberCount: countMap[t.id] || 0,
        createdAt: t.created_at,
      }))
    );
  } catch (e) {
    console.error('[api/organization/teams] GET failed:', e);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 创建团队
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { orgId, name } = await request.json();
    if (!orgId || !name?.trim()) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }

    // 验证 owner/admin 权限
    const { data: membership, error: membershipError } = await supabase
      .from('org_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }

    const admin = requireAdmin();
    const { data: team, error } = await admin
      .from('teams')
      .insert({ org_id: orgId, name: name.trim() })
      .select('id, name, created_at')
      .single();

    if (error) {
      console.error('[api/organization/teams] insert error:', error);
      return NextResponse.json({ error: '创建失败' }, { status: 500 });
    }

    return NextResponse.json({ id: team.id, name: team.name, memberCount: 0, createdAt: team.created_at });
  } catch (e) {
    console.error('[api/organization/teams] POST failed:', e);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 删除团队
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { orgId, teamId } = await request.json();
    if (!orgId || !teamId) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }

    // 验证 owner/admin 权限
    const { data: membership, error: membershipError } = await supabase
      .from('org_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }

    const admin = requireAdmin();
    // 先清除该团队成员的 team_id
    const { error: clearErr } = await admin
      .from('org_memberships')
      .update({ team_id: null })
      .eq('org_id', orgId)
      .eq('team_id', teamId);
    if (clearErr) throw clearErr;

    // 删除团队
    const { error: deleteErr } = await admin.from('teams').delete().eq('id', teamId).eq('org_id', orgId);
    if (deleteErr) throw deleteErr;

    await recordComplianceAudit({
      admin,
      ctx: { orgId, userId: user.id },
      action: 'team_deleted',
      objectType: 'team',
      recordId: teamId,
      recordName: teamId,
      request,
      changes: { clearedMemberTeamAssignments: true },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[api/organization/teams] DELETE failed:', e);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
