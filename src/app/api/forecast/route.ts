import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';

// GET: 获取 forecast 数据（含 AI 预测）
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const url = new URL(request.url);
    const periodStart = url.searchParams.get('start') || getQuarterStart();
    const periodEnd = url.searchParams.get('end') || getQuarterEnd();

    // 获取 opportunities 按阶段分类
    const { data: opps } = await admin
      .from('opportunities')
      .select('id, name, value, stage, account_id, expected_close_date')
      .eq('org_id', ctx.orgId)
      .neq('stage', 'closed_lost');

    // 获取 quotas
    const { data: quotas } = await admin
      .from('quotas')
      .select('*')
      .eq('org_id', ctx.orgId)
      .lte('period_start', periodEnd)
      .gte('period_end', periodStart);

    // 获取已有 forecast
    const { data: forecasts } = await admin
      .from('forecasts')
      .select('*')
      .eq('org_id', ctx.orgId)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd);

    // 计算 AI 预测
    const stageWeights: Record<string, number> = {
      closed_won: 1.0,
      contract_sent: 0.85,
      negotiation: 0.7,
      proposal_sent: 0.6,
      solution_presented: 0.5,
      proposal: 0.5,
      evaluation: 0.3,
      needs_analysis: 0.25,
      qualification: 0.15,
      discovery: 0.1,
      lead_identified: 0.05,
      prospecting: 0.05,
    };

    const closed = (opps ?? []).filter(o => o.stage === 'closed_won').reduce((s, o) => s + (o.value || 0), 0);
    const commitOpps = (opps ?? []).filter(o => ['negotiation', 'contract_sent'].includes(o.stage));
    const bestCaseOpps = (opps ?? []).filter(o => ['proposal', 'proposal_sent', 'solution_presented', 'evaluation'].includes(o.stage));
    const pipelineOpps = (opps ?? []).filter(o => ['qualification', 'needs_analysis', 'discovery', 'lead_identified', 'prospecting'].includes(o.stage));

    const commitValue = commitOpps.reduce((s, o) => s + (o.value || 0), 0);
    const bestCaseValue = bestCaseOpps.reduce((s, o) => s + (o.value || 0), 0);
    const pipelineValue = pipelineOpps.reduce((s, o) => s + (o.value || 0), 0);

    const aiPredicted = (opps ?? []).reduce((s, o) => {
      const weight = stageWeights[o.stage] ?? 0.1;
      return s + (o.value || 0) * weight;
    }, 0);

    const totalQuota = (quotas ?? []).reduce((s, q) => s + (q.target_amount || 0), 0);

    return Response.json({
      forecast: {
        periodStart,
        periodEnd,
        closed,
        commit: closed + commitValue,
        bestCase: closed + commitValue + bestCaseValue,
        pipeline: closed + commitValue + bestCaseValue + pipelineValue,
        aiPredicted: Math.round(aiPredicted),
        quota: totalQuota,
        attainment: totalQuota > 0 ? Math.round((closed / totalQuota) * 100) : 0,
        opportunities: opps ?? [],
        byStage: {
          closed_won: { count: (opps ?? []).filter(o => o.stage === 'closed_won').length, value: closed },
          negotiation: { count: commitOpps.length, value: commitValue },
          proposal: { count: (opps ?? []).filter(o => o.stage === 'proposal').length, value: (opps ?? []).filter(o => o.stage === 'proposal').reduce((s, o) => s + (o.value || 0), 0) },
          evaluation: { count: (opps ?? []).filter(o => o.stage === 'evaluation').length, value: (opps ?? []).filter(o => o.stage === 'evaluation').reduce((s, o) => s + (o.value || 0), 0) },
          qualification: { count: (opps ?? []).filter(o => o.stage === 'qualification').length, value: (opps ?? []).filter(o => o.stage === 'qualification').reduce((s, o) => s + (o.value || 0), 0) },
          discovery: { count: (opps ?? []).filter(o => o.stage === 'discovery').length, value: (opps ?? []).filter(o => o.stage === 'discovery').reduce((s, o) => s + (o.value || 0), 0) },
        },
        forecasts: forecasts ?? [],
        quotas: quotas ?? [],
      },
    });
  } catch (err) {
    return guardResponse(err);
  }
}

function getQuarterStart(): string {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  return `${now.getFullYear()}-${String(q * 3 + 1).padStart(2, '0')}-01`;
}

function getQuarterEnd(): string {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const endMonth = (q + 1) * 3;
  const endDate = new Date(now.getFullYear(), endMonth, 0);
  return endDate.toISOString().split('T')[0];
}
