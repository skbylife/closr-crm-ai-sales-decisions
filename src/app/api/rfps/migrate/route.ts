import { requireAuth, requireAccountAccess, requireAdmin, guardResponse } from '@/lib/api-guard';
import type { RfpStatus } from '@/lib/babel-engine/types';

export const dynamic = 'force-dynamic';

// localStorage 旧格式（前端传入）
interface OldRfp {
  id?: string;
  title: string;
  issuer?: string;
  issuedDate?: string;
  dueDate?: string;
  status?: RfpStatus;
  budget?: number;
  currency?: string;
  competitors?: string[];
  requirements?: string[];
  documents?: {
    name: string;
    type?: 'rfp' | 'response' | 'clarification' | 'amendment' | 'other';
    url?: string;
  }[];
  milestones?: {
    id?: string;
    title: string;
    dueDate?: string;
    status?: 'pending' | 'completed' | 'overdue';
    assignedTo?: string;
  }[];
  aiAnalysis?: {
    winProbability?: number;
    strengths?: string[];
    weaknesses?: string[];
    recommendations?: string[];
    competitorAnalysis?: string;
  };
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// POST — 从 localStorage 迁移 RFP 数据到 DB（幂等）
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    const body = await request.json() as {
      opportunityId: string;
      accountId: string;
      rfps: OldRfp[];
    };

    if (!body.opportunityId || !body.accountId || !body.rfps?.length) {
      return Response.json({ error: '缺少必填字段（opportunityId, accountId, rfps）' }, { status: 400 });
    }

    await requireAccountAccess(ctx, body.accountId);

    const admin = requireAdmin();
    const results: { oldTitle: string; newId: string; status: string }[] = [];

    for (const oldRfp of body.rfps) {
      try {
        // 幂等检查：如果同名 RFP 已存在（同 opportunity），跳过
        const { data: existing } = await admin
          .from('rfps')
          .select('id')
          .eq('org_id', ctx.orgId)
          .eq('opportunity_id', body.opportunityId)
          .eq('title', oldRfp.title)
          .limit(1)
          .maybeSingle();

        if (existing) {
          results.push({ oldTitle: oldRfp.title, newId: existing.id, status: 'skipped' });
          continue;
        }

        // 插入 RFP 主表
        const { data: newRfp, error: rfpError } = await admin
          .from('rfps')
          .insert({
            org_id: ctx.orgId,
            opportunity_id: body.opportunityId,
            account_id: body.accountId,
            title: oldRfp.title,
            issuer: oldRfp.issuer ?? '',
            issued_date: oldRfp.issuedDate || null,
            due_date: oldRfp.dueDate || null,
            status: oldRfp.status ?? 'identified',
            budget: oldRfp.budget ?? null,
            currency: oldRfp.currency ?? 'CNY',
            requirements: oldRfp.requirements ?? [],
            notes: oldRfp.notes ?? '',
            created_by: ctx.userId,
            created_at: oldRfp.createdAt ?? new Date().toISOString(),
          })
          .select('id')
          .single();

        if (rfpError || !newRfp) {
          console.error('[rfps/migrate] Insert RFP failed:', rfpError);
          results.push({ oldTitle: oldRfp.title, newId: '', status: 'error' });
          continue;
        }

        const rfpId = newRfp.id;

        // 迁移文档
        if (oldRfp.documents?.length) {
          const docRows = oldRfp.documents.map(d => ({
            org_id: ctx.orgId,
            rfp_id: rfpId,
            name: d.name,
            doc_type: d.type ?? 'other',
            url: d.url ?? null,
            uploaded_by: ctx.userId,
          }));
          const { error: docErr } = await admin.from('rfp_documents').insert(docRows);
          if (docErr) console.error('[rfps/migrate] Insert documents failed:', docErr);
        }

        // 迁移里程碑
        if (oldRfp.milestones?.length) {
          const milRows = oldRfp.milestones.map(m => ({
            org_id: ctx.orgId,
            rfp_id: rfpId,
            title: m.title,
            due_date: m.dueDate || null,
            status: m.status ?? 'pending',
            assigned_to: m.assignedTo ?? null,
          }));
          const { error: milErr } = await admin.from('rfp_milestones').insert(milRows);
          if (milErr) console.error('[rfps/migrate] Insert milestones failed:', milErr);
        }

        // 迁移竞对（旧格式只有名字数组）
        if (oldRfp.competitors?.length) {
          const compRows = oldRfp.competitors.map(name => ({
            org_id: ctx.orgId,
            rfp_id: rfpId,
            name,
            strengths: [],
            weaknesses: [],
          }));
          const { error: compErr } = await admin.from('rfp_competitors').insert(compRows);
          if (compErr) console.error('[rfps/migrate] Insert competitors failed:', compErr);
        }

        // 迁移 AI 分析
        if (oldRfp.aiAnalysis) {
          const a = oldRfp.aiAnalysis;
          const { error: analysisErr } = await admin.from('rfp_ai_analyses').insert({
            org_id: ctx.orgId,
            rfp_id: rfpId,
            analysis_type: 'full',
            win_probability: a.winProbability ?? null,
            strengths: a.strengths ?? [],
            weaknesses: a.weaknesses ?? [],
            recommendations: a.recommendations ?? [],
            competitor_analysis: a.competitorAnalysis ?? null,
            raw_output: a,
            ai_model: 'migrated',
          });
          if (analysisErr) console.error('[rfps/migrate] Insert analysis failed:', analysisErr);
        }

        results.push({ oldTitle: oldRfp.title, newId: rfpId, status: 'migrated' });
      } catch (innerErr) {
        console.error('[rfps/migrate] Error migrating RFP:', oldRfp.title, innerErr);
        results.push({ oldTitle: oldRfp.title, newId: '', status: 'error' });
      }
    }

    return Response.json({
      ok: true,
      total: body.rfps.length,
      migrated: results.filter(r => r.status === 'migrated').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
      results,
    });
  } catch (err) {
    console.error('[rfps/migrate] POST error:', err);
    return guardResponse(err);
  }
}
