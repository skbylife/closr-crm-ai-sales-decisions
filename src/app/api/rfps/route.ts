import { requireAuth, requireAccountAccess, requireAdmin, guardResponse } from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';
import type { RfpStatus, RfpRow, RfpCompetitorRow, RfpAnalysisRow, RfpJudgment } from '@/lib/babel-engine/types';

export const dynamic = 'force-dynamic';

// GET — 按 opportunityId 获取 RFP 列表（含竞对 + 最新分析）
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(request.url);
    const opportunityId = searchParams.get('opportunityId');
    const rfpId = searchParams.get('rfpId');

    const admin = requireAdmin();

    // 单个 RFP 查询
    if (rfpId) {
      const { data: row, error } = await admin
        .from('rfps')
        .select('*')
        .eq('id', rfpId)
        .eq('org_id', ctx.orgId)
        .single();

      if (error || !row) {
        return Response.json({ error: 'RFP 不存在' }, { status: 404 });
      }

      await requireAccountAccess(ctx, row.account_id);

      const [{ data: competitors }, { data: analyses }, { data: docs }, { data: milestones }] = await Promise.all([
        admin.from('rfp_competitors').select('*').eq('rfp_id', rfpId).eq('org_id', ctx.orgId),
        admin.from('rfp_ai_analyses').select('*').eq('rfp_id', rfpId).eq('org_id', ctx.orgId).order('created_at', { ascending: false }).limit(1),
        admin.from('rfp_documents').select('*').eq('rfp_id', rfpId).eq('org_id', ctx.orgId),
        admin.from('rfp_milestones').select('*').eq('rfp_id', rfpId).eq('org_id', ctx.orgId).order('due_date', { ascending: true }),
      ]);

      return Response.json({
        rfp: mapRfpRow(row as RfpRow, (competitors ?? []) as RfpCompetitorRow[], (analyses ?? [])[0] as RfpAnalysisRow | undefined, docs ?? [], milestones ?? []),
      });
    }

    // 列表查询：需要 opportunityId
    if (!opportunityId) {
      return Response.json({ error: '缺少 opportunityId 参数' }, { status: 400 });
    }

    // 验证 opportunity 的 account 权限
    const { data: opp } = await admin
      .from('opportunities')
      .select('account_id')
      .eq('id', opportunityId)
      .eq('org_id', ctx.orgId)
      .single();

    if (!opp) {
      return Response.json({ error: '商机不存在' }, { status: 404 });
    }
    await requireAccountAccess(ctx, opp.account_id);

    const { data: rows, error } = await admin
      .from('rfps')
      .select('*')
      .eq('org_id', ctx.orgId)
      .eq('opportunity_id', opportunityId)
      .order('due_date', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('[rfps] Query failed:', error);
      return Response.json({ rfps: [] });
    }

    if (!rows || rows.length === 0) {
      return Response.json({ rfps: [] });
    }

    const rfpIds = rows.map((r: RfpRow) => r.id);

    const [{ data: allCompetitors }, { data: allAnalyses }, { data: allDocuments }, { data: allMilestones }] = await Promise.all([
      admin.from('rfp_competitors').select('*').eq('org_id', ctx.orgId).in('rfp_id', rfpIds),
      admin.from('rfp_ai_analyses').select('id, rfp_id, analysis_type, win_probability, strengths, weaknesses, recommendations, competitor_analysis, raw_output, ai_model, created_at').eq('org_id', ctx.orgId).in('rfp_id', rfpIds).order('created_at', { ascending: false }),
      admin.from('rfp_documents').select('*').eq('org_id', ctx.orgId).in('rfp_id', rfpIds),
      admin.from('rfp_milestones').select('*').eq('org_id', ctx.orgId).in('rfp_id', rfpIds).order('due_date', { ascending: true }),
    ]);

    // Group competitors by rfp_id
    const competitorsByRfp = new Map<string, RfpCompetitorRow[]>();
    for (const c of (allCompetitors ?? []) as RfpCompetitorRow[]) {
      const arr = competitorsByRfp.get(c.rfp_id) ?? [];
      arr.push(c);
      competitorsByRfp.set(c.rfp_id, arr);
    }

    const documentsByRfp = new Map<string, Record<string, unknown>[]>();
    for (const d of (allDocuments ?? []) as Record<string, unknown>[]) {
      const rfpId = String(d.rfp_id);
      const arr = documentsByRfp.get(rfpId) ?? [];
      arr.push(d);
      documentsByRfp.set(rfpId, arr);
    }

    const milestonesByRfp = new Map<string, Record<string, unknown>[]>();
    for (const m of (allMilestones ?? []) as Record<string, unknown>[]) {
      const rfpId = String(m.rfp_id);
      const arr = milestonesByRfp.get(rfpId) ?? [];
      arr.push(m);
      milestonesByRfp.set(rfpId, arr);
    }

    // Latest analysis per rfp_id (already ordered desc by created_at)
    const latestAnalysisByRfp = new Map<string, RfpAnalysisRow>();
    for (const a of (allAnalyses ?? []) as RfpAnalysisRow[]) {
      if (!latestAnalysisByRfp.has(a.rfp_id)) {
        latestAnalysisByRfp.set(a.rfp_id, a);
      }
    }

    const rfps = rows.map((r: RfpRow) =>
      mapRfpRow(
        r,
        competitorsByRfp.get(r.id) ?? [],
        latestAnalysisByRfp.get(r.id),
        documentsByRfp.get(r.id) ?? [],
        milestonesByRfp.get(r.id) ?? [],
      ),
    );

    return Response.json({ rfps });
  } catch (err) {
    console.error('[rfps] GET error:', err);
    return guardResponse(err);
  }
}

// POST — 创建新 RFP
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    const body = await request.json() as {
      opportunityId: string;
      accountId: string;
      title: string;
      issuer?: string;
      issuedDate?: string;
      dueDate?: string;
      status?: RfpStatus;
      budget?: number;
      currency?: string;
      requirements?: string[];
      notes?: string;
    };

    if (!body.opportunityId || !body.accountId || !body.title) {
      return Response.json({ error: '缺少必填字段（opportunityId, accountId, title）' }, { status: 400 });
    }

    await requireAccountAccess(ctx, body.accountId);

    const admin = requireAdmin();

    const { data, error } = await admin
      .from('rfps')
      .insert({
        org_id: ctx.orgId,
        opportunity_id: body.opportunityId,
        account_id: body.accountId,
        title: body.title,
        issuer: body.issuer ?? '',
        issued_date: body.issuedDate || null,
        due_date: body.dueDate || null,
        status: body.status ?? 'identified',
        budget: body.budget ?? null,
        currency: body.currency ?? 'CNY',
        requirements: body.requirements ?? [],
        notes: body.notes ?? '',
        created_by: ctx.userId,
      })
      .select()
      .single();

    if (error) {
      console.error('[rfps] Insert failed:', error);
      return Response.json({ error: '创建 RFP 失败' }, { status: 500 });
    }

    return Response.json({ rfp: mapRfpRow(data as RfpRow) });
  } catch (err) {
    console.error('[rfps] POST error:', err);
    return guardResponse(err);
  }
}

// PATCH — 更新 RFP 字段
export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();

    const body = await request.json() as {
      rfpId: string;
      title?: string;
      issuer?: string;
      issuedDate?: string;
      dueDate?: string;
      status?: RfpStatus;
      budget?: number;
      currency?: string;
      requirements?: string[];
      notes?: string;
      linkedPlayId?: string | null;
    };

    if (!body.rfpId) {
      return Response.json({ error: '缺少 rfpId' }, { status: 400 });
    }

    const admin = requireAdmin();

    // 校验存在 + 权限
    const { data: existing } = await admin
      .from('rfps')
      .select('account_id')
      .eq('id', body.rfpId)
      .eq('org_id', ctx.orgId)
      .single();

    if (!existing) return Response.json({ error: 'RFP 不存在' }, { status: 404 });
    await requireAccountAccess(ctx, existing.account_id);

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.issuer !== undefined) updates.issuer = body.issuer;
    if (body.issuedDate !== undefined) updates.issued_date = body.issuedDate || null;
    if (body.dueDate !== undefined) updates.due_date = body.dueDate || null;
    if (body.status !== undefined) updates.status = body.status;
    if (body.budget !== undefined) updates.budget = body.budget;
    if (body.currency !== undefined) updates.currency = body.currency;
    if (body.requirements !== undefined) updates.requirements = body.requirements;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.linkedPlayId !== undefined) updates.linked_play_id = body.linkedPlayId;

    const { data, error } = await admin
      .from('rfps')
      .update(updates)
      .eq('id', body.rfpId)
      .eq('org_id', ctx.orgId)
      .select()
      .single();

    if (error) {
      console.error('[rfps] Update failed:', error);
      return Response.json({ error: '更新 RFP 失败' }, { status: 500 });
    }

    return Response.json({ rfp: mapRfpRow(data as RfpRow) });
  } catch (err) {
    console.error('[rfps] PATCH error:', err);
    return guardResponse(err);
  }
}

// DELETE — 删除 RFP
export async function DELETE(request: Request) {
  try {
    const ctx = await requireAuth();

    const { searchParams } = new URL(request.url);
    const rfpId = searchParams.get('rfpId');

    if (!rfpId) return Response.json({ error: '缺少 rfpId' }, { status: 400 });

    const admin = requireAdmin();

    const { data: existing } = await admin
      .from('rfps')
      .select('account_id, title')
      .eq('id', rfpId)
      .eq('org_id', ctx.orgId)
      .single();

    if (!existing) return Response.json({ error: 'RFP 不存在' }, { status: 404 });
    await requireAccountAccess(ctx, existing.account_id);

    // DB FK cascade handles child table cleanup automatically
    const { error } = await admin
      .from('rfps')
      .delete()
      .eq('id', rfpId)
      .eq('org_id', ctx.orgId);

    if (error) return Response.json({ error: '删除失败' }, { status: 500 });
    await recordComplianceAudit({
      admin,
      ctx,
      action: 'rfp_deleted',
      objectType: 'rfp',
      recordId: rfpId,
      recordName: (existing.title as string | null) ?? rfpId,
      request,
      changes: { accountId: existing.account_id },
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[rfps] DELETE error:', err);
    return guardResponse(err);
  }
}

// ─── Helper: snake_case row → camelCase response ─────────────────────

function mapRfpRow(
  row: RfpRow,
  competitors?: RfpCompetitorRow[],
  latestAnalysis?: RfpAnalysisRow,
  docs?: Record<string, unknown>[],
  milestones?: Record<string, unknown>[],
) {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    accountId: row.account_id,
    linkedPlayId: row.linked_play_id,
    title: row.title,
    issuer: row.issuer,
    issuedDate: row.issued_date ?? '',
    dueDate: row.due_date ?? '',
    status: row.status,
    budget: row.budget,
    currency: row.currency,
    requirements: row.requirements ?? [],
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    competitors: (competitors ?? []).map(mapCompetitorRow),
    latestAnalysis: latestAnalysis ? mapAnalysisRow(latestAnalysis) : null,
    documents: (docs ?? []).map(mapDocRow),
    milestones: (milestones ?? []).map(mapMilestoneRow),
  };
}

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

function mapAnalysisRow(row: RfpAnalysisRow) {
  return {
    id: row.id,
    rfpId: row.rfp_id,
    analysisType: row.analysis_type,
    winProbability: row.win_probability,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    recommendations: row.recommendations,
    competitorAnalysis: row.competitor_analysis,
    judgment: extractJudgment(row.raw_output),
    aiModel: row.ai_model,
    createdAt: row.created_at,
  };
}

function extractJudgment(rawOutput: unknown): RfpJudgment | null {
  if (!rawOutput || typeof rawOutput !== 'object' || !('judgment' in rawOutput)) return null;
  const judgment = (rawOutput as { judgment?: unknown }).judgment;
  if (!judgment || typeof judgment !== 'object') return null;
  return judgment as RfpJudgment;
}

function mapDocRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    rfpId: row.rfp_id,
    name: row.name,
    docType: row.doc_type,
    url: row.url ?? null,
    fileSize: row.file_size ?? null,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

function mapMilestoneRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    rfpId: row.rfp_id,
    title: row.title,
    dueDate: row.due_date ?? '',
    status: row.status,
    assignedTo: row.assigned_to ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
