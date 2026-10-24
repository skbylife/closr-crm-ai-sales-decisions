import { requireAuth, requireAdmin, requireAccountAccess, guardResponse } from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';
import { generateEmbedding } from '@/lib/knowledge-engine';

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
      .from('knowledge_base')
      .select('id, category, title, content, applicable_scenarios, created_at, updated_at, source, source_type, source_id')
      .eq('account_id', id)
      .eq('org_id', ctx.orgId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[api/accounts/knowledge] GET failed:', error);
      return Response.json({ items: [] });
    }

    return Response.json({ items: data ?? [] });
  } catch (err) {
    console.error('[api/accounts/knowledge] GET error:', err);
    return guardResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await requireAccountAccess(ctx, id);
    const { title, content, category } = await request.json();

    if (!title || typeof title !== 'string' || !content || typeof content !== 'string') {
      return Response.json({ error: 'title and content are required' }, { status: 400 });
    }

    // Input length limits
    const VALID_CATEGORIES = ['product_proposal', 'company_info', 'competitor', 'industry', 'sales_tools', 'methodology', 'case_study', 'ai_insight', 'product_solution', 'competitor_intel', 'deal_lesson', 'other'];
    const safeTitle = title.slice(0, 500);
    const safeContent = content.slice(0, 10000);
    const safeCategory = VALID_CATEGORIES.includes(category) ? category : 'other';

    const admin = requireAdmin();

    // 尝试生成 embedding（失败不影响入库）
    let embedding: number[] | null = null;
    try {
      embedding = await generateEmbedding(`${safeTitle}\n${safeContent}`);
    } catch (e) {
      console.warn('[api/accounts/knowledge] Embedding generation failed:', e);
    }

    const { data, error } = await admin
      .from('knowledge_base')
      .insert({
        org_id: ctx.orgId,
        account_id: id,
        title: safeTitle,
        content: safeContent,
        category: safeCategory,
        applicable_scenarios: [],
        ...(embedding ? { embedding: JSON.stringify(embedding) } : {}),
      })
      .select()
      .single();

    if (error) {
      console.error('[api/accounts/knowledge] POST failed:', error);
      return Response.json({ error: 'Insert failed' }, { status: 500 });
    }

    return Response.json({ item: data });
  } catch (err) {
    console.error('[api/accounts/knowledge] POST error:', err);
    return guardResponse(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await requireAccountAccess(ctx, id);
    const url = new URL(request.url);
    const itemId = url.searchParams.get('itemId');

    if (!itemId) {
      return Response.json({ error: 'itemId is required' }, { status: 400 });
    }

    const admin = requireAdmin();

    const { data: existing } = await admin
      .from('knowledge_base')
      .select('id, title, category')
      .eq('id', itemId)
      .eq('account_id', id)
      .eq('org_id', ctx.orgId)
      .maybeSingle();

    const { error } = await admin
      .from('knowledge_base')
      .delete()
      .eq('id', itemId)
      .eq('account_id', id)
      .eq('org_id', ctx.orgId);

    if (error) {
      console.error('[api/accounts/knowledge] DELETE failed:', error);
      return Response.json({ error: 'Delete failed' }, { status: 500 });
    }

    await recordComplianceAudit({
      admin,
      ctx,
      action: 'knowledge_deleted',
      objectType: 'knowledge_base',
      recordId: itemId,
      recordName: (existing?.title as string | undefined) ?? itemId,
      request,
      changes: { accountId: id, category: existing?.category ?? null },
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/accounts/knowledge] DELETE error:', err);
    return guardResponse(err);
  }
}
