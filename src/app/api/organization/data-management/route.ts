import { ApiError, requireAuth, requireAdmin, requireOwnerForDestructiveOrgData, guardResponse } from '@/lib/api-guard';

// A preview only. No reset, seed, backup download or destructive handler is exposed.
const tables = ['accounts', 'contacts', 'opportunities', 'products', 'quotes'] as const;
export async function GET() {
  try {
    const ctx = await requireAuth();
    requireOwnerForDestructiveOrgData(ctx);
    const db = requireAdmin();
    // The legacy context chooses the first membership. Never silently accept
    // that ambiguity for an organization-wide management workflow.
    const memberships = await db.from('org_memberships').select('org_id,role').eq('user_id', ctx.userId);
    if (memberships.error) throw new ApiError(500, 'Unable to verify organization');
    if (memberships.data?.length !== 1 || memberships.data[0].org_id !== ctx.orgId || memberships.data[0].role !== 'owner') {
      throw new ApiError(409, 'An unambiguous owner organization is required');
    }
    const counts = await Promise.all(tables.map(async table => {
      const result = await db.from(table).select('id', { count: 'exact', head: true }).eq('org_id', ctx.orgId);
      if (result.error || result.count === null) throw new ApiError(500, 'Unable to count organization records');
      return { table, count: result.count };
    }));
    return Response.json({ orgId: ctx.orgId, counts, previewOnly: true, deletionEnabled: false }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return guardResponse(error); }
}
