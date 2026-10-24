import { requireAuth, requireAccountAccess, requireAdmin, guardResponse } from '@/lib/api-guard';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;

    await requireAccountAccess(ctx, id);

    const admin = requireAdmin();

    const { data, error } = await admin
      .from('accounts')
      .select('competitors')
      .eq('id', id)
      .eq('org_id', ctx.orgId)
      .single();

    if (error || !data) {
      return Response.json({ competitors: [] });
    }

    return Response.json({ competitors: data.competitors ?? [] });
  } catch (err) {
    console.error('[api/accounts/competitors] GET error:', err);
    return guardResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const { competitors } = await request.json();

    if (!Array.isArray(competitors)) {
      return Response.json({ error: 'competitors must be an array' }, { status: 400 });
    }

    await requireAccountAccess(ctx, id);

    const admin = requireAdmin();

    const { error } = await admin
      .from('accounts')
      .update({ competitors, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', ctx.orgId);

    if (error) {
      console.error('[api/accounts/competitors] PATCH failed:', error);
      return Response.json({ error: 'Update failed' }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/accounts/competitors] PATCH error:', err);
    return guardResponse(err);
  }
}
