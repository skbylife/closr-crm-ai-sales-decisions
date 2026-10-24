import { requireAuth, requireContactAccess, requireAdmin, guardResponse } from '@/lib/api-guard';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    const { id: contactId } = await params;
    const { searchParams } = new URL(request.url);

    const limitParam = parseInt(searchParams.get('limit') ?? '50', 10);
    const limit = Math.min(Math.max(limitParam || 50, 1), 100);

    await requireContactAccess(ctx, contactId);

    const admin = requireAdmin();

    const { data, error } = await admin
      .from('contact_enrichment_log')
      .select('id, action, field_name, old_value, new_value, confidence, source, evidence, created_at')
      .eq('contact_id', contactId)
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ history: data });
  } catch (err) {
    return guardResponse(err);
  }
}
