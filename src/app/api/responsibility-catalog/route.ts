import { guardResponse, requireAdmin, requireAuth } from '@/lib/api-guard';
import { mapResponsibility } from '@/lib/account-team/mappers';
import type { ResponsibilityCatalogRow } from '@/lib/account-team/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const { data, error } = await admin
      .from('responsibility_catalog')
      .select('id, org_id, key, label, description, category, is_system, created_by, created_at')
      .or(`is_system.eq.true,org_id.eq.${ctx.orgId}`)
      .order('is_system', { ascending: false })
      .order('category', { ascending: true })
      .order('label', { ascending: true });
    if (error) throw new Error(error.message);
    return Response.json({ responsibilities: ((data ?? []) as ResponsibilityCatalogRow[]).map(mapResponsibility) });
  } catch (err) {
    return guardResponse(err);
  }
}
