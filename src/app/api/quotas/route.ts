import { requireAuth, requireRole, requireAdmin, guardResponse } from '@/lib/api-guard';

// GET: 获取配额列表
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const url = new URL(request.url);
    const periodType = url.searchParams.get('period') || 'quarterly';
    const year = parseInt(url.searchParams.get('year') || new Date().getFullYear().toString());

    const { data } = await admin
      .from('quotas')
      .select('*')
      .eq('org_id', ctx.orgId)
      .eq('period_type', periodType)
      .gte('period_start', `${year}-01-01`)
      .lte('period_end', `${year}-12-31`)
      .order('period_start');

    return Response.json({ quotas: data ?? [] });
  } catch (err) {
    return guardResponse(err);
  }
}

// POST: 创建/更新配额 — 仅 admin+
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, 'admin');

    const admin = requireAdmin();

    const body = await request.json();
    const { userId, teamId, periodType, periodStart, periodEnd, targetAmount, currency } = body;

    const { data, error } = await admin
      .from('quotas')
      .upsert({
        org_id: ctx.orgId,
        user_id: userId || null,
        team_id: teamId || null,
        period_type: periodType,
        period_start: periodStart,
        period_end: periodEnd,
        target_amount: targetAmount,
        currency: currency || 'USD',
        created_by: ctx.userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ quota: data });
  } catch (err) {
    return guardResponse(err);
  }
}
