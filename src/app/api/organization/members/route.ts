import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';

const ORG_ROLES = new Set(['owner', 'admin', 'manager', 'member']);
const JOB_LEVELS = new Set([0, 1, 2, 3, 4]);

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const url = new URL(request.url);
    const orgId = url.searchParams.get('orgId');
    if (!orgId) return NextResponse.json({ error: '缺少 orgId' }, { status: 400 });

    // Verify caller is in this org
    const { data: callerMembership, error: callerMembershipError } = await supabase
      .from('org_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle();
    if (callerMembershipError) throw callerMembershipError;

    if (!callerMembership) {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    // Get all members of this org
    const { data: members } = await supabase
      .from('org_memberships')
      .select('user_id')
      .eq('org_id', orgId);

    if (!members) return NextResponse.json([]);

    // Fetch emails for just this org's members (avoid listing all platform users —
    // which both leaks size information and grows O(N) with total user count).
    const admin = requireAdmin();
    const memberIds = members.map(m => m.user_id as string);
    const userLookups = await Promise.all(
      memberIds.map(id =>
        admin.auth.admin.getUserById(id).then(
          res => [id, res.data?.user?.email ?? ''] as const,
          () => [id, ''] as const,
        ),
      ),
    );
    const userMap = Object.fromEntries(userLookups);

    return NextResponse.json(
      members.map(m => ({
        userId: m.user_id,
        email: userMap[m.user_id as string] ?? '',
      }))
    );
  } catch (e) {
    console.error('[api/organization/members] GET failed:', e);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}



export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = await request.json();
    const { orgId, userId: targetUserId, role, jobTitle, jobLevel, teamId } = body;
    // teamId 可以是 null（取消分配），所以用 undefined 判断是否传了该字段
    const hasTeamId = teamId !== undefined;
    const hasJobLevel = jobLevel !== undefined;
    // 如果没有传 targetUserId，默认操作自己（settings 页面场景）
    const effectiveTargetUserId = targetUserId ?? user.id;
    const isSelfUpdate = effectiveTargetUserId === user.id;
    if (!orgId || (!role && !jobTitle && !hasTeamId && !hasJobLevel)) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }
    if (role && !ORG_ROLES.has(role)) {
      return NextResponse.json({ error: '无效角色' }, { status: 400 });
    }
    if (hasJobLevel && (!Number.isInteger(jobLevel) || !JOB_LEVELS.has(jobLevel))) {
      return NextResponse.json({ error: '无效职级' }, { status: 400 });
    }

    // Check caller's permission
    const { data: callerMembership } = await supabase
      .from('org_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single();

    // 允许用户自己更新 jobTitle（显示名称），其他操作需要 admin/owner
    if (!callerMembership || (!['owner', 'admin'].includes(callerMembership.role) && !(isSelfUpdate && jobTitle && !role && !hasJobLevel && !hasTeamId))) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }

    // Cannot change owner role
    const { data: targetMembership, error: targetMembershipError } = await supabase
      .from('org_memberships')
      .select('role')
      .eq('user_id', effectiveTargetUserId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (targetMembershipError) throw targetMembershipError;

    if (!targetMembership) {
      return NextResponse.json({ error: '成员不存在' }, { status: 404 });
    }
    if (targetMembership.role === 'owner' && role) {
      return NextResponse.json({ error: '无法修改 Owner 角色' }, { status: 403 });
    }
    // 只有 owner 能授予 owner/admin，避免 admin 横向提权或互相提权。
    if (role && ['owner', 'admin'].includes(role) && callerMembership.role !== 'owner') {
      return NextResponse.json({ error: '只有 Owner 可以授予高权限角色' }, { status: 403 });
    }
    // admin 不能修改其他 admin 的角色/职级/团队，防止同级互相降权或权限漂移。
    if (callerMembership.role === 'admin' && targetMembership.role === 'admin' && !isSelfUpdate) {
      return NextResponse.json({ error: 'Admin 不能修改其他 Admin' }, { status: 403 });
    }
    if (hasTeamId && teamId !== null) {
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .select('id')
        .eq('id', teamId)
        .eq('org_id', orgId)
        .maybeSingle();
      if (teamError) throw teamError;
      if (!team) return NextResponse.json({ error: '团队不存在或不属于该组织' }, { status: 404 });
    }

    const updateFields: Record<string, string | number | null> = {};
    if (role) updateFields.role = role;
    if (jobTitle) updateFields.job_title = jobTitle;
    if (hasJobLevel) {
      updateFields.job_level = jobLevel;
      updateFields.role_level = jobLevel; // 同步旧列
      // 同步 job_title 字符串
      if (!jobTitle) {
        const levelToTitle: Record<number, string> = { 0: 'ae', 1: 'manager', 2: 'executive', 3: 'executive', 4: 'executive' };
        updateFields.job_title = levelToTitle[jobLevel as number] ?? 'ae';
      }
    }
    if (hasTeamId) updateFields.team_id = teamId;

    const adminClient = requireAdmin();
    const { data: updatedMembership, error: updateError } = await adminClient
      .from('org_memberships')
      .update(updateFields)
      .eq('user_id', effectiveTargetUserId)
      .eq('org_id', orgId)
      .select('user_id, org_id, role, job_title, job_level, role_level, team_id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updatedMembership) {
      return NextResponse.json({ error: '成员更新未写入数据库' }, { status: 500 });
    }

    // Invalidate permission cache for the target user so revoked privileges
    // take effect immediately (otherwise old role persists for up to 5 min).
    const { permissionCache } = await import('@/lib/cache');
    permissionCache.delete(`user_ctx:${effectiveTargetUserId}`);

    await recordComplianceAudit({
      admin: adminClient,
      ctx: { orgId, userId: user.id },
      action: 'permission_changed',
      objectType: 'org_membership',
      recordId: effectiveTargetUserId,
      recordName: effectiveTargetUserId,
      request,
      changes: {
        targetUserId: effectiveTargetUserId,
        before: targetMembership,
        after: updatedMembership,
        updatedFields: Object.keys(updateFields),
      },
    });

    return NextResponse.json({
      ok: true,
      member: {
        userId: updatedMembership.user_id,
        orgId: updatedMembership.org_id,
        role: updatedMembership.role,
        jobTitle: updatedMembership.job_title,
        jobLevel: updatedMembership.job_level ?? updatedMembership.role_level ?? null,
        teamId: updatedMembership.team_id,
      },
    });
  } catch (e) {
    console.error('[api/organization/members] PATCH failed:', e);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { orgId, userId: targetUserId } = await request.json();
    if (!orgId || !targetUserId) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }

    // Check caller's permission
    const { data: callerMembership } = await supabase
      .from('org_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single();

    if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }

    // Cannot remove owner or self
    if (targetUserId === user.id) {
      return NextResponse.json({ error: '不能移除自己' }, { status: 400 });
    }
    const { data: targetMembership } = await supabase
      .from('org_memberships')
      .select('role')
      .eq('user_id', targetUserId)
      .eq('org_id', orgId)
      .single();

    if (targetMembership?.role === 'owner') {
      return NextResponse.json({ error: '无法移除 Owner' }, { status: 403 });
    }
    if (targetMembership?.role === 'admin' && callerMembership.role !== 'owner') {
      return NextResponse.json({ error: '只有 Owner 可以移除 Admin' }, { status: 403 });
    }

    const adminClient = requireAdmin();
    await adminClient
      .from('org_memberships')
      .delete()
      .eq('user_id', targetUserId)
      .eq('org_id', orgId);

    // Invalidate permission cache for the removed user immediately.
    const { permissionCache } = await import('@/lib/cache');
    permissionCache.delete(`user_ctx:${targetUserId}`);

    await recordComplianceAudit({
      admin: adminClient,
      ctx: { orgId, userId: user.id },
      action: 'member_removed',
      objectType: 'org_membership',
      recordId: targetUserId,
      recordName: targetUserId,
      request,
      changes: {
        targetUserId,
        removedRole: targetMembership?.role ?? null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[api/organization/members] DELETE failed:', e);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
