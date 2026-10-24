import { requireAuth, requireAccountAccess, requireAdmin, guardResponse } from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';
import type { RfpCompetitorRow } from '@/lib/babel-engine/types';

export const dynamic = 'force-dynamic';

// GET — 列出 RFP 的竞对
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
      .from('rfp_competitors')
      .select('*')
      .eq('rfp_id', rfpId)
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[rfps/competitors] Query failed:', error);
      return Response.json({ competitors: [] });
    }

    const competitors = (data ?? []).map((r: RfpCompetitorRow) => mapCompetitorRow(r));
    return Response.json({ competitors });
  } catch (err) {
    console.error('[rfps/competitors] GET error:', err);
    return guardResponse(err);
  }
}

// POST — 添加/更新竞对（有 id 则更新，无 id 则新建）
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    const body = await request.json() as {
      id?: string;
      rfpId: string;
      name: string;
      strengths?: string[];
      weaknesses?: string[];
      estimatedPrice?: number;
      winProbability?: number;
      intelSource?: string;
      notes?: string;
    };

    if (!body.rfpId || !body.name) {
      return Response.json({ error: '缺少必填字段（rfpId, name）' }, { status: 400 });
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

    const row: Record<string, unknown> = {
      org_id: ctx.orgId,
      rfp_id: body.rfpId,
      name: body.name,
      strengths: body.strengths ?? [],
      weaknesses: body.weaknesses ?? [],
      estimated_price: body.estimatedPrice ?? null,
      win_probability: body.winProbability ?? null,
      intel_source: body.intelSource ?? null,
      notes: body.notes ?? null,
    };

    let data;
    let error;

    if (body.id) {
      // Update: verify record belongs to this org + rfp
      const { data: existing } = await admin
        .from('rfp_competitors')
        .select('id')
        .eq('id', body.id)
        .eq('org_id', ctx.orgId)
        .eq('rfp_id', body.rfpId)
        .single();
      if (!existing) return Response.json({ error: '竞对不存在' }, { status: 404 });

      const result = await admin
        .from('rfp_competitors')
        .update(row)
        .eq('id', body.id)
        .eq('org_id', ctx.orgId)
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else {
      // Insert
      const result = await admin
        .from('rfp_competitors')
        .insert(row)
        .select()
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error('[rfps/competitors] Upsert failed:', error);
      return Response.json({ error: '保存竞对信息失败' }, { status: 500 });
    }

    return Response.json({ competitor: mapCompetitorRow(data as RfpCompetitorRow) });
  } catch (err) {
    console.error('[rfps/competitors] POST error:', err);
    return guardResponse(err);
  }
}

// DELETE — 删除竞对
export async function DELETE(request: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(request.url);
    const competitorId = searchParams.get('competitorId');

    if (!competitorId) return Response.json({ error: '缺少 competitorId' }, { status: 400 });

    const admin = requireAdmin();

    const { data: comp } = await admin
      .from('rfp_competitors')
      .select('rfp_id, name')
      .eq('id', competitorId)
      .eq('org_id', ctx.orgId)
      .single();

    if (!comp) return Response.json({ error: '竞对不存在' }, { status: 404 });

    const { data: rfp } = await admin
      .from('rfps')
      .select('account_id')
      .eq('id', comp.rfp_id)
      .eq('org_id', ctx.orgId)
      .single();

    if (!rfp) return Response.json({ error: 'RFP 不存在' }, { status: 404 });
    await requireAccountAccess(ctx, rfp.account_id);

    const { error } = await admin
      .from('rfp_competitors')
      .delete()
      .eq('id', competitorId)
      .eq('org_id', ctx.orgId);

    if (error) return Response.json({ error: '删除失败' }, { status: 500 });
    await recordComplianceAudit({
      admin,
      ctx,
      action: 'rfp_competitor_deleted',
      objectType: 'rfp_competitor',
      recordId: competitorId,
      recordName: (comp.name as string | null) ?? competitorId,
      request,
      changes: { rfpId: comp.rfp_id, accountId: rfp.account_id },
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[rfps/competitors] DELETE error:', err);
    return guardResponse(err);
  }
}

// ─── Helper ──────────────────────────────────────────────────────────

function mapCompetitorRow(row: RfpCompetitorRow) {
  return {
    id: row.id,
    rfpId: row.rfp_id,
    name: row.name,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    estimatedPrice: row.estimated_price,
    winProbability: row.win_probability,
    intelSource: row.intel_source,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
