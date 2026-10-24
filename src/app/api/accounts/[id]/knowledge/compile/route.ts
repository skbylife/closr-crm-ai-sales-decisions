import { requireAuth, requireAccountAccess, requireAdmin, guardResponse } from '@/lib/api-guard';
import { runCILIngest } from '@/lib/compiled-intelligence/ingest';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const { itemId } = await request.json();

    if (!itemId) {
      return Response.json({ error: 'itemId is required' }, { status: 400 });
    }

    await requireAccountAccess(ctx, id);

    const admin = requireAdmin();

    const { data: account, error: accountError } = await admin
      .from('accounts')
      .select('id, name')
      .eq('id', id)
      .eq('org_id', ctx.orgId)
      .single();

    if (accountError || !account) {
      return Response.json({ error: 'Account not found' }, { status: 404 });
    }

    const { data: item, error: itemError } = await admin
      .from('knowledge_base')
      .select('id, title, content, category, updated_at, created_at')
      .eq('id', itemId)
      .eq('account_id', id)
      .eq('org_id', ctx.orgId)
      .single();

    if (itemError || !item) {
      return Response.json({ error: 'Knowledge item not found' }, { status: 404 });
    }

    const ingestResult = await runCILIngest({
      orgId: ctx.orgId,
      accountId: id,
      accountName: account.name as string,
      sourceId: `knowledge:${item.id}`,
      sourceType: 'note',
      rawText: `${item.title ?? '知识条目'}\n\n分类：${item.category ?? 'other'}\n\n${item.content ?? ''}`,
      context: `来源：knowledge_base\n标题：${item.title ?? '知识条目'}\n分类：${item.category ?? 'other'}`,
      occurredAt: (item.updated_at as string | null) ?? (item.created_at as string | null) ?? new Date().toISOString(),
    });

    return Response.json({ ok: true, result: ingestResult });
  } catch (err) {
    return guardResponse(err);
  }
}
