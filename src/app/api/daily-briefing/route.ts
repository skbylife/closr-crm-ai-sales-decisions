import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';
import {
  getVisiblePortfolioIds,
  resolveDashboardScope,
  restrictQueryToIds,
  restrictQueryToVisibleEntities,
  restrictQueryToVisiblePortfolio,
} from '@/lib/portfolio-scope';

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();

    const admin = requireAdmin();

    const today = new Date().toISOString().split('T')[0];

    // scope: personal (AE), team (Director), global (Executive). Server clamps by jobLevel.
    const url = new URL(request.url);
    const scope = resolveDashboardScope(ctx, url.searchParams.get('scope'));
    const visibility = await getVisiblePortfolioIds(admin, ctx, scope);

    // Build queries with server-side account/opportunity visibility filters.
    let healthQuery = admin.from('ai_insights').select('entity_id, data').eq('org_id', ctx.orgId).eq('insight_type', 'health');
    let actionQuery = admin.from('ai_insights').select('entity_id, data').eq('org_id', ctx.orgId).eq('insight_type', 'action');
    let impactQuery = admin.from('ai_insights').select('entity_id, data').eq('org_id', ctx.orgId).eq('insight_type', 'impact');
    let oppsQuery = admin.from('opportunities').select('id, name, stage, value, account_id').eq('org_id', ctx.orgId).not('stage', 'in', '(closed_won,closed_lost)');
    let accountsQuery = admin.from('accounts').select('id, name').eq('org_id', ctx.orgId);
    let tasksQuery = admin.from('tasks').select('id, title, priority, account_id, opportunity_id').eq('org_id', ctx.orgId).neq('status', 'done').lte('due_date', today);
    let overdueQuery = admin.from('tasks').select('id, account_id, opportunity_id').eq('org_id', ctx.orgId).neq('status', 'done').lt('due_date', today);

    healthQuery = restrictQueryToVisibleEntities(healthQuery, visibility);
    actionQuery = restrictQueryToVisibleEntities(actionQuery, visibility);
    impactQuery = restrictQueryToVisibleEntities(impactQuery, visibility);
    oppsQuery = restrictQueryToIds(oppsQuery, visibility, 'id', visibility.opportunityIds);
    accountsQuery = restrictQueryToIds(accountsQuery, visibility, 'id', visibility.accountIds);
    tasksQuery = restrictQueryToVisiblePortfolio(tasksQuery, visibility, { accountField: 'account_id', opportunityField: 'opportunity_id' });
    overdueQuery = restrictQueryToVisiblePortfolio(overdueQuery, visibility, { accountField: 'account_id', opportunityField: 'opportunity_id' });

    // 获取所有数据（并行）
    const [healthRes, actionRes, impactRes, { data: deals }, { data: accounts }, { data: dueTasks }, { data: overdueTasks }] = await Promise.all([
      healthQuery,
      actionQuery,
      impactQuery,
      oppsQuery,
      accountsQuery,
      tasksQuery,
      overdueQuery,
    ]);

    // 统计
    const accountMap = new Map((accounts ?? []).map(a => [a.id, a.name]));

    const criticalDeals = (healthRes.data ?? []).filter(h => {
      const data = h.data as Record<string, unknown>;
      return data?.level === 'critical';
    });

    const atRiskDeals = (healthRes.data ?? []).filter(h => {
      const data = h.data as Record<string, unknown>;
      return data?.level === 'at_risk';
    });

    const opportunityMap = new Map((deals ?? []).map((deal) => [deal.id, deal]));

    // 收集所有行动建议（高优先级）
    const urgentActions: {
      title: string;
      accountName: string;
      dueInDays: number;
      accountId?: string;
      opportunityId?: string;
    }[] = [];
    for (const insight of (actionRes.data ?? [])) {
      const data = insight.data as Record<string, unknown>;
      const actions = (data?.actions as { title: string; priority: string; dueInDays: number }[]) ?? [];
      const opportunity = opportunityMap.get(insight.entity_id);
      const accountId = opportunity?.account_id ?? insight.entity_id;
      const accountName = accountMap.get(accountId) ?? '未知';
      for (const a of actions) {
        if (a.priority === 'high') {
          urgentActions.push({
            title: a.title,
            accountName,
            dueInDays: a.dueInDays,
            accountId,
            opportunityId: opportunity?.id,
          });
        }
      }
    }

    // 阶段分布统计
    const stageDistribution: Record<string, { count: number; value: number }> = {};
    for (const d of deals ?? []) {
      const stage = d.stage ?? 'unknown';
      if (!stageDistribution[stage]) stageDistribution[stage] = { count: 0, value: 0 };
      stageDistribution[stage].count++;
      stageDistribution[stage].value += d.value ?? 0;
    }

    const briefing = {
      date: today,
      summary: {
        totalActiveDeals: deals?.length ?? 0,
        totalPipelineValue: (deals ?? []).reduce((sum, d) => sum + (d.value ?? 0), 0),
        criticalDeals: criticalDeals.length,
        atRiskDeals: atRiskDeals.length,
        dueTasksToday: dueTasks?.length ?? 0,
        overdueTasks: overdueTasks?.length ?? 0,
      },
      stageDistribution,
      urgentActions: urgentActions.slice(0, 5),
      criticalDealNames: criticalDeals.map(d => {
        const deal = deals?.find(dl => dl.id === d.entity_id);
        return deal ? { name: deal.name, accountName: accountMap.get(deal.account_id) ?? '', stage: deal.stage, value: deal.value } : null;
      }).filter(Boolean),
      impactAlerts: (impactRes.data ?? []).length,
    };

    return Response.json({ briefing });
  } catch (err) {
    return guardResponse(err);
  }
}
