import { requireAuth, requireAccountAccess, requireAdmin, guardResponse } from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';

export const dynamic = 'force-dynamic';

// GET — 列出 RFP 的里程碑
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(request.url);
    const rfpId = searchParams.get('rfpId');

    if (!rfpId) return Response.json({ error: '缺少 rfpId' }, { status: 400 });

    const admin = requireAdmin();

    const { data: rfp } = await admin
      .from('rfps')
      .select('account_id')
      .eq('id', rfpId)
      .eq('org_id', ctx.orgId)
      .single();

    if (!rfp) return Response.json({ error: 'RFP 不存在' }, { status: 404 });
    await requireAccountAccess(ctx, rfp.account_id);

    const { data, error } = await admin
      .from('rfp_milestones')
      .select('*')
      .eq('rfp_id', rfpId)
      .eq('org_id', ctx.orgId)
      .order('due_date', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('[rfps/milestones] Query failed:', error);
      return Response.json({ milestones: [] });
    }

    const milestones = (data ?? []).map(mapMilestoneRow);
    return Response.json({ milestones });
  } catch (err) {
    console.error('[rfps/milestones] GET error:', err);
    return guardResponse(err);
  }
}

// POST — 创建里程碑
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    const body = await request.json() as {
      rfpId: string;
      title: string;
      dueDate?: string;
      status?: 'pending' | 'completed' | 'overdue';
      assignedTo?: string;
      notes?: string;
    };

    if (!body.rfpId || !body.title) {
      return Response.json({ error: '缺少必填字段（rfpId, title）' }, { status: 400 });
    }

    const admin = requireAdmin();

    const { data: rfp } = await admin
      .from('rfps')
      .select('account_id')
      .eq('id', body.rfpId)
      .eq('org_id', ctx.orgId)
      .single();

    if (!rfp) return Response.json({ error: 'RFP 不存在' }, { status: 404 });
    await requireAccountAccess(ctx, rfp.account_id);

    const { data, error } = await admin
      .from('rfp_milestones')
      .insert({
        org_id: ctx.orgId,
        rfp_id: body.rfpId,
        title: body.title,
        due_date: body.dueDate || null,
        status: body.status ?? 'pending',
        assigned_to: body.assignedTo ?? null,
        notes: body.notes ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('[rfps/milestones] Insert failed:', error);
      return Response.json({ error: '创建里程碑失败' }, { status: 500 });
    }

    return Response.json({ milestone: mapMilestoneRow(data) });
  } catch (err) {
    console.error('[rfps/milestones] POST error:', err);
    return guardResponse(err);
  }
}

// PATCH — 更新里程碑
export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();

    const body = await request.json() as {
      milestoneId: string;
      title?: string;
      dueDate?: string;
      status?: 'pending' | 'completed' | 'overdue';
      assignedTo?: string | null;
      notes?: string | null;
    };

    if (!body.milestoneId) {
      return Response.json({ error: '缺少 milestoneId' }, { status: 400 });
    }

    const admin = requireAdmin();

    // 校验里程碑存在 + 权限
    const { data: milestone } = await admin
      .from('rfp_milestones')
      .select('rfp_id, title')
      .eq('id', body.milestoneId)
      .eq('org_id', ctx.orgId)
      .single();

    if (!milestone) return Response.json({ error: '里程碑不存在' }, { status: 404 });

    const { data: rfp } = await admin
      .from('rfps')
      .select('account_id')
      .eq('id', milestone.rfp_id)
      .eq('org_id', ctx.orgId)
      .single();

    if (!rfp) return Response.json({ error: 'RFP 不存在' }, { status: 404 });
    await requireAccountAccess(ctx, rfp.account_id);

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.dueDate !== undefined) updates.due_date = body.dueDate || null;
    if (body.status !== undefined) updates.status = body.status;
    if (body.assignedTo !== undefined) updates.assigned_to = body.assignedTo;
    if (body.notes !== undefined) updates.notes = body.notes;

    const { data, error } = await admin
      .from('rfp_milestones')
      .update(updates)
      .eq('id', body.milestoneId)
      .eq('org_id', ctx.orgId)
      .select()
      .single();

    if (error) {
      console.error('[rfps/milestones] Update failed:', error);
      return Response.json({ error: '更新里程碑失败' }, { status: 500 });
    }

    return Response.json({ milestone: mapMilestoneRow(data) });
  } catch (err) {
    console.error('[rfps/milestones] PATCH error:', err);
    return guardResponse(err);
  }
}

// DELETE — 删除里程碑
export async function DELETE(request: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(request.url);
    const milestoneId = searchParams.get('milestoneId');

    if (!milestoneId) return Response.json({ error: '缺少 milestoneId' }, { status: 400 });

    const admin = requireAdmin();

    const { data: milestone } = await admin
      .from('rfp_milestones')
      .select('rfp_id')
      .eq('id', milestoneId)
      .eq('org_id', ctx.orgId)
      .single();

    if (!milestone) return Response.json({ error: '里程碑不存在' }, { status: 404 });

    const { data: rfp } = await admin
      .from('rfps')
      .select('account_id')
      .eq('id', milestone.rfp_id)
      .eq('org_id', ctx.orgId)
      .single();

    if (!rfp) return Response.json({ error: 'RFP 不存在' }, { status: 404 });
    await requireAccountAccess(ctx, rfp.account_id);

    const { error } = await admin
      .from('rfp_milestones')
      .delete()
      .eq('id', milestoneId)
      .eq('org_id', ctx.orgId);

    if (error) return Response.json({ error: '删除失败' }, { status: 500 });
    await recordComplianceAudit({
      admin,
      ctx,
      action: 'rfp_milestone_deleted',
      objectType: 'rfp_milestone',
      recordId: milestoneId,
      recordName: milestoneId,
      request,
      changes: { rfpId: milestone.rfp_id, accountId: rfp.account_id },
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[rfps/milestones] DELETE error:', err);
    return guardResponse(err);
  }
}

// ─── Helper ──────────────────────────────────────────────────────────

function mapMilestoneRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    rfpId: row.rfp_id,
    title: row.title,
    dueDate: (row.due_date as string) ?? '',
    status: row.status,
    assignedTo: row.assigned_to ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
