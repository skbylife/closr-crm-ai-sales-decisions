import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';
import type { PlayRelationshipType } from '@/lib/babel-engine/types';

// GET — 获取谋局计划的关联关系
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();

    const { searchParams } = new URL(request.url);
    const sourcePlayId = searchParams.get('sourcePlayId');
    const targetPlayId = searchParams.get('targetPlayId');

    if (!sourcePlayId && !targetPlayId) {
      return Response.json({ error: '需要提供 sourcePlayId 或 targetPlayId' }, { status: 400 });
    }

    const admin = requireAdmin();

    let query = admin
      .from('play_relationships')
      .select('*')
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false });

    if (sourcePlayId) {
      query = query.eq('source_play_id', sourcePlayId);
    }
    if (targetPlayId) {
      query = query.eq('target_play_id', targetPlayId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[play-relationships] Query failed:', error);
      return Response.json({ relationships: [] });
    }

    const relationships = (data ?? []).map((row) => ({
      id: row.id,
      sourcePlayId: row.source_play_id,
      targetPlayId: row.target_play_id,
      relationship: row.relationship,
      note: row.note,
      createdAt: row.created_at,
    }));

    return Response.json({ relationships });
  } catch (err) {
    return guardResponse(err);
  }
}

// POST — 创建谋局计划关联关系
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    const body = await request.json() as {
      sourcePlayId?: string;
      targetPlayId?: string;
      relationship?: PlayRelationshipType;
      note?: string;
    };

    if (!body.sourcePlayId || !body.targetPlayId || !body.relationship) {
      return Response.json({ error: '缺少必填字段' }, { status: 400 });
    }

    const admin = requireAdmin();

    const { data, error } = await admin
      .from('play_relationships')
      .insert({
        org_id: ctx.orgId,
        source_play_id: body.sourcePlayId,
        target_play_id: body.targetPlayId,
        relationship: body.relationship,
        note: body.note ?? null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[play-relationships] Insert failed:', error);
      return Response.json({ error: '创建关联失败' }, { status: 500 });
    }

    return Response.json({ id: data.id });
  } catch (err) {
    return guardResponse(err);
  }
}

// DELETE — 删除谋局计划关联关系
export async function DELETE(request: Request) {
  try {
    const ctx = await requireAuth();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return Response.json({ error: '缺少 id' }, { status: 400 });

    const admin = requireAdmin();

    const { error } = await admin
      .from('play_relationships')
      .delete()
      .eq('id', id)
      .eq('org_id', ctx.orgId);

    if (error) return Response.json({ error: '删除失败' }, { status: 500 });
    await recordComplianceAudit({
      admin,
      ctx,
      action: 'play_relationship_deleted',
      objectType: 'play_relationship',
      recordId: id,
      recordName: id,
      request,
      changes: {},
    });
    return Response.json({ ok: true });
  } catch (err) {
    return guardResponse(err);
  }
}
