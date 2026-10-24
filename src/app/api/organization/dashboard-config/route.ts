import { requireAuth, requireRole, requireAdmin, guardResponse } from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';
import type { DashboardRole } from '@/lib/dashboard-layout';

export const dynamic = 'force-dynamic';

const VALID_ROLES: DashboardRole[] = ['ae', 'ae-lead', 'director', 'executive', 'owner'];

// GET — 获取组织的 dashboard 配置
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const { searchParams } = new URL(request.url);
    const roleLevel = searchParams.get('roleLevel') as DashboardRole | null;

    let query = admin
      .from('org_dashboard_configs')
      .select('*')
      .eq('org_id', ctx.orgId);

    if (roleLevel && VALID_ROLES.includes(roleLevel)) {
      query = query.eq('role_level', roleLevel);
    }

    const { data, error } = await query;
    if (error) throw error;

    return Response.json({ data });
  } catch (err) {
    return guardResponse(err);
  }
}

// PUT — 创建或更新某角色的 dashboard 配置（需 admin+）
export async function PUT(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, 'admin');
    const admin = requireAdmin();

    const body = await request.json() as {
      roleLevel: DashboardRole;
      moduleConfigs: unknown[];
    };

    if (!body.roleLevel || !VALID_ROLES.includes(body.roleLevel)) {
      return Response.json({ error: '无效的角色级别' }, { status: 400 });
    }

    if (!Array.isArray(body.moduleConfigs)) {
      return Response.json({ error: 'moduleConfigs 必须是数组' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('org_dashboard_configs')
      .upsert(
        {
          org_id: ctx.orgId,
          role_level: body.roleLevel,
          module_configs: body.moduleConfigs,
          updated_by: ctx.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,role_level' }
      )
      .select()
      .single();

    if (error) throw error;

    return Response.json({ data });
  } catch (err) {
    return guardResponse(err);
  }
}

// DELETE — 删除某角色的 dashboard 配置（恢复默认）
export async function DELETE(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, 'admin');
    const admin = requireAdmin();

    const { searchParams } = new URL(request.url);
    const roleLevel = searchParams.get('roleLevel') as DashboardRole | null;

    if (!roleLevel || !VALID_ROLES.includes(roleLevel)) {
      return Response.json({ error: '无效的角色级别' }, { status: 400 });
    }

    const { error } = await admin
      .from('org_dashboard_configs')
      .delete()
      .eq('org_id', ctx.orgId)
      .eq('role_level', roleLevel);

    if (error) throw error;

    await recordComplianceAudit({
      admin,
      ctx,
      action: 'dashboard_config_deleted',
      objectType: 'org_dashboard_config',
      recordName: roleLevel,
      request,
      changes: { roleLevel },
    });

    return Response.json({ success: true });
  } catch (err) {
    return guardResponse(err);
  }
}
