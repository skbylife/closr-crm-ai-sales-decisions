import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';

function isMissingTable(error: unknown, table: string) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes(`relation \"public.${table}\" does not exist`) || message.includes(`Could not find the table 'public.${table}'`);
}

// GET — 获取评论列表
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entity_type'); // account | opportunity | contact
    const entityId = searchParams.get('entity_id');

    if (!entityType || !entityId) {
      return Response.json({ error: 'Missing entity_type or entity_id' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('comments')
      .select('*')
      .eq('org_id', ctx.orgId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: true });

    if (error) {
      if (isMissingTable(error, 'comments')) return Response.json([], { status: 200 });
      console.error('[comments] GET fallback:', error);
      return Response.json([], { status: 200 });
    }
    return Response.json(data || []);
  } catch (err) {
    return guardResponse(err);
  }
}

// POST — 创建评论
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const { entity_type, entity_id, content, mentions } = await request.json();

    if (!entity_type || !entity_id || !content?.trim()) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('comments')
      .insert({
        org_id: ctx.orgId,
        entity_type,
        entity_id,
        user_id: ctx.userId,
        content: content.trim(),
        mentions: mentions || [],
      })
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } catch (err) { return guardResponse(err); }
}

// PATCH — 更新评论
export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const { id, content } = await request.json();
    if (!id || !content?.trim()) {
      return Response.json({ error: 'Missing id or content' }, { status: 400 });
    }

    // 只能编辑自己的评论
    const { data, error } = await admin
      .from('comments')
      .update({ content: content.trim(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', ctx.orgId)
      .eq('user_id', ctx.userId)
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } catch (err) { return guardResponse(err); }
}

// DELETE — 删除评论
export async function DELETE(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

    const { data: existing } = await admin
      .from('comments')
      .select('id, entity_type, entity_id')
      .eq('id', id)
      .eq('org_id', ctx.orgId)
      .eq('user_id', ctx.userId)
      .maybeSingle();

    // 只能删除自己的评论
    const { error } = await admin
      .from('comments')
      .delete()
      .eq('id', id)
      .eq('org_id', ctx.orgId)
      .eq('user_id', ctx.userId);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    await recordComplianceAudit({
      admin,
      ctx,
      action: 'comment_deleted',
      objectType: 'comment',
      recordId: id,
      recordName: id,
      request,
      changes: {
        entityType: existing?.entity_type ?? null,
        entityId: existing?.entity_id ?? null,
      },
    });
    return Response.json({ success: true });
  } catch (err) { return guardResponse(err); }
}
