/**
 * GET /api/play-suggestions
 *
 * 返回建议发起新谋局的客户列表。
 * 逻辑：有活跃商机但无活跃谋局的客户，按商机金额排序。
 */

import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';

export async function GET() {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    // 获取所有活跃商机的 account_id
    const { data: opps } = await admin
      .from('opportunities')
      .select('account_id, value')
      .eq('org_id', ctx.orgId)
      .not('stage', 'in', '(closed_won,closed_lost)');

    // 获取所有有活跃谋局的 account_id
    const { data: activePlays } = await admin
      .from('strategic_plays')
      .select('account_id')
      .eq('org_id', ctx.orgId)
      .in('status', ['active', 'in_progress']);

    const playAccountIds = new Set((activePlays ?? []).map(p => p.account_id));

    // 找到有商机但无谋局的客户
    const accountValues = new Map<string, number>();
    for (const o of opps ?? []) {
      if (!o.account_id || playAccountIds.has(o.account_id)) continue;
      accountValues.set(o.account_id, (accountValues.get(o.account_id) ?? 0) + (o.value ?? 0));
    }

    if (accountValues.size === 0) {
      return Response.json({ suggestions: [] });
    }

    // 获取客户名称
    const accountIds = [...accountValues.keys()].slice(0, 10);
    const { data: accounts } = await admin
      .from('accounts')
      .select('id, name')
      .in('id', accountIds);

    const nameMap = new Map((accounts ?? []).map(a => [a.id, a.name]));

    // 按金额排序
    const suggestions = accountIds
      .map(id => ({
        accountId: id,
        accountName: nameMap.get(id) ?? '未知客户',
        reason: `有活跃商机（¥${((accountValues.get(id) ?? 0) / 10000).toFixed(0)}万）但尚无谋局规划`,
      }))
      .sort((a, b) => (accountValues.get(b.accountId) ?? 0) - (accountValues.get(a.accountId) ?? 0))
      .slice(0, 5);

    return Response.json({ suggestions });
  } catch (err) {
    return guardResponse(err);
  }
}
