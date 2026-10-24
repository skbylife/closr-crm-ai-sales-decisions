import { ApiError, requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';

export async function GET() {
  try {
    const ctx = await requireAuth();
    // A pool account has neither an explicit owner nor a legacy creator-owner.
    // Never expose assigned accounts merely because owner_id is null.
    const { data, error } = await requireAdmin().from('accounts')
      .select('id,name,industry,last_activity_at,last_activity')
      .eq('org_id', ctx.orgId).is('owner_id', null).is('user_id', null).order('name');
    if (error) throw new ApiError(500, 'Unable to load unassigned accounts');
    return Response.json({ accounts: data ?? [], userId: ctx.userId });
  } catch (error) { return guardResponse(error); }
}
