import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';
import {
  getVisiblePortfolioIds,
  type PortfolioVisibility,
  resolveDashboardScope,
  restrictQueryToIds,
  restrictQueryToVisibleAccounts,
  restrictQueryToVisiblePortfolio,
} from '@/lib/portfolio-scope';
import { DEMO_USER_ID } from '@/lib/demo';
import { getDemoRoleVisibleUserIds } from '@/lib/demo-role-visibility';
import type { DailyAction } from '@/types/daily-action';

const DAY_MS = 86_400_000;

function parseDemoJobLevel(value: string | null): number | null {
  if (value !== '0' && value !== '1') return null;
  return Number(value);
}

async function getDemoRolePortfolioVisibility(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  ctx: Awaited<ReturnType<typeof requireAuth>>,
  demoJobLevel: number | null,
): Promise<PortfolioVisibility | null> {
  if (ctx.userId !== DEMO_USER_ID || demoJobLevel === null) return null;

  const { data: memberships } = await admin
    .from('org_memberships')
    .select('user_id, display_name, job_title, job_level')
    .eq('org_id', ctx.orgId);

  const visibleUserIds = getDemoRoleVisibleUserIds({
    isDemo: true,
    currentUserId: ctx.userId,
    jobLevel: demoJobLevel,
    orgMembers: (memberships ?? []).map((member: Record<string, unknown>) => ({
      userId: member.user_id as string,
      displayName: member.display_name as string | undefined,
      jobTitle: member.job_title as string | undefined,
      jobLevel: typeof member.job_level === 'number' ? member.job_level : undefined,
    })),
  });

  if (!visibleUserIds) return null;

  const { data: accounts } = await admin
    .from('accounts')
    .select('id')
    .eq('org_id', ctx.orgId)
    .or(`owner_id.in.(${visibleUserIds.join(',')}),and(owner_id.is.null,user_id.in.(${visibleUserIds.join(',')}))`)
    .limit(10_000);

  const accountIds = [...new Set((accounts ?? []).map((account: { id?: string }) => account.id).filter(Boolean))] as string[];

  const opportunityFilters = [
    `assigned_to.in.(${visibleUserIds.join(',')})`,
    `user_id.in.(${visibleUserIds.join(',')})`,
    accountIds.length > 0 ? `account_id.in.(${accountIds.join(',')})` : null,
  ].filter((value): value is string => Boolean(value));

  const { data: opportunities } = opportunityFilters.length > 0
    ? await admin
      .from('opportunities')
      .select('id, account_id')
      .eq('org_id', ctx.orgId)
      .or(opportunityFilters.join(','))
      .limit(10_000)
    : { data: [] };

  const opportunityIds = [...new Set((opportunities ?? []).map((opp: { id?: string }) => opp.id).filter(Boolean))] as string[];
  const accountIdsFromOpps = [...new Set((opportunities ?? []).map((opp: { account_id?: string | null }) => opp.account_id).filter(Boolean))] as string[];

  return {
    scope: demoJobLevel >= 1 ? 'team' : 'mine',
    restrict: true,
    accountIds: [...new Set([...accountIds, ...accountIdsFromOpps])],
    opportunityIds,
  };
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    // scope: personal (AE), team (Director), global (Executive). Server clamps by jobLevel.
    const url = new URL(request.url);
    const scope = resolveDashboardScope(ctx, url.searchParams.get('scope'));
    const demoVisibility = await getDemoRolePortfolioVisibility(admin, ctx, parseDemoJobLevel(url.searchParams.get('demoJobLevel')));
    const visibility = demoVisibility ?? await getVisiblePortfolioIds(admin, ctx, scope);

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // ── Parallel queries ──────────────────────────────────────────
    let contactsQuery = admin
      .from('contacts')
      .select('id, name, title, role, relationship_strength, last_contacted_at, attitude_trend, account_id')
      .eq('org_id', ctx.orgId);

    let tasksQuery = admin
      .from('tasks')
      .select('id, title, priority, due_date, status, account_id, opportunity_id')
      .eq('org_id', ctx.orgId)
      .neq('status', 'done')
      .lte('due_date', new Date(now.getTime() + 3 * DAY_MS).toISOString().split('T')[0]);

    let playsQuery = admin
      .from('strategic_plays')
      .select('id, account_id, goal_description, momentum, status, assumptions, days_since_progress, updated_at')
      .eq('org_id', ctx.orgId)
      .in('status', ['active', 'in_progress']);

    let oppsQuery = admin
      .from('opportunities')
      .select('id, name, account_id, expected_close_date, stage, value, meddicc')
      .eq('org_id', ctx.orgId)
      .not('stage', 'in', '(closed_won,closed_lost)');

    let intelQuery = admin
      .from('intel_items')
      .select('id, account_id, title, summary, date, analysis')
      .eq('org_id', ctx.orgId)
      .is('analysis', null)
      .order('date', { ascending: false })
      .limit(20);

    contactsQuery = restrictQueryToVisibleAccounts(contactsQuery, visibility);
    tasksQuery = restrictQueryToVisiblePortfolio(tasksQuery, visibility, { accountField: 'account_id', opportunityField: 'opportunity_id' });
    playsQuery = restrictQueryToVisibleAccounts(playsQuery, visibility);
    oppsQuery = restrictQueryToIds(oppsQuery, visibility, 'id', visibility.opportunityIds);
    intelQuery = restrictQueryToVisibleAccounts(intelQuery, visibility);

    const [contactsRes, tasksRes, playsRes, oppsRes, intelRes] = await Promise.all([
      contactsQuery,
      tasksQuery,
      playsQuery,
      oppsQuery,
      intelQuery,
    ]);

    // ── Account name lookup ────────────────────────────────────────
    const accountIds = new Set<string>();
    for (const c of contactsRes.data ?? []) if (c.account_id) accountIds.add(c.account_id);
    for (const t of tasksRes.data ?? []) if (t.account_id) accountIds.add(t.account_id);
    for (const p of playsRes.data ?? []) if (p.account_id) accountIds.add(p.account_id);
    for (const o of oppsRes.data ?? []) if (o.account_id) accountIds.add(o.account_id);
    for (const i of intelRes.data ?? []) if (i.account_id) accountIds.add(i.account_id);

    const { data: accountsData } = accountIds.size > 0
      ? await restrictQueryToIds(admin.from('accounts').select('id, name').eq('org_id', ctx.orgId).in('id', [...accountIds]), visibility, 'id', [...accountIds])
      : { data: [] };
    const acctMap = new Map((accountsData ?? []).map((a: { id: string; name: string }) => [a.id, a.name]));

    const actions: DailyAction[] = [];

    // ═══════════════════════════════════════════════════════════════
    // Rule 1: Contact >5 days without contact → '跟进提醒'
    // ═══════════════════════════════════════════════════════════════
    const fiveDaysAgo = new Date(now.getTime() - 5 * DAY_MS);
    for (const c of contactsRes.data ?? []) {
      if (!c.last_contacted_at) continue;
      const lastContact = new Date(c.last_contacted_at);
      if (lastContact >= fiveDaysAgo) continue;
      const daysSince = Math.floor((now.getTime() - lastContact.getTime()) / DAY_MS);
      const strength = c.relationship_strength ?? 0;
      // priority: 1 if >14 days + strong relationship, 2 if >7 days, 3 otherwise
      const priority = daysSince > 14 && strength > 60 ? 1 : daysSince > 7 ? 2 : 3;
      const acctName = acctMap.get(c.account_id) ?? '';
      actions.push({
        type: 'follow_up',
        priority,
        title: `跟进 ${c.name}`,
        description: `${acctName ? acctName + ' · ' : ''}${c.title ?? c.role ?? '联系人'} · 已 ${daysSince} 天未联系（关系强度 ${strength}）`,
        relatedContactId: c.id,
        relatedAccountId: c.account_id,
        suggestedAction: daysSince > 14 ? '建议立即电话或约见' : '发送简短问候或分享行业资讯',
        entityHref: c.account_id ? `/accounts/${c.account_id}` : `/contacts/${c.id}`,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // Rule 2: Stale/unverified assumptions → '验证假设'
    // ═══════════════════════════════════════════════════════════════
    const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
    for (const p of playsRes.data ?? []) {
      const assumptions = (p.assumptions ?? []) as { id?: string; description?: string; status?: string; createdAt?: string }[];
      const stale = assumptions.filter((a) => {
        if (a.status !== 'pending') return false;
        if (!a.createdAt) return true;
        return new Date(a.createdAt) < sevenDaysAgo;
      });
      if (stale.length === 0) continue;
      const acctName = acctMap.get(p.account_id) ?? '';
      actions.push({
        type: 'verify_assumption',
        priority: 3,
        title: `验证谋局假设 (${stale.length})`,
        description: `${acctName} · ${p.goal_description?.slice(0, 40) ?? '谋局'} · ${stale.length} 个假设待验证超过 7 天`,
        relatedAccountId: p.account_id,
        suggestedAction: '安排与内线/Champion 确认假设是否成立',
        entityHref: `/accounts/${p.account_id}`,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // Rule 3: Close date <14 days + MEDDPICC low → '风险预警'
    // ═══════════════════════════════════════════════════════════════
    const fourteenDaysFromNow = new Date(now.getTime() + 14 * DAY_MS);
    for (const o of oppsRes.data ?? []) {
      if (!o.expected_close_date) continue;
      const closeDate = new Date(o.expected_close_date);
      const meddicc = o.meddicc as { overallScore?: number } | null;
      const score = meddicc?.overallScore ?? 0;
      const daysUntilClose = Math.ceil((closeDate.getTime() - now.getTime()) / DAY_MS);

      // Strict rule: <14 days AND low score
      if (closeDate <= fourteenDaysFromNow && score < 60) {
        const acctName = acctMap.get(o.account_id) ?? '';
        const priority = daysUntilClose <= 0 ? 1 : score < 30 ? 1 : daysUntilClose <= 7 ? 2 : 3;
        actions.push({
          type: 'risk_alert',
          priority,
          title: `风险预警: ${o.name}`,
          description: `${acctName} · MEDDPICC ${score} 分 · ${daysUntilClose > 0 ? `仅剩 ${daysUntilClose} 天` : '已过预计关单日'}`,
          relatedOpportunityId: o.id,
          relatedAccountId: o.account_id,
          dueDate: o.expected_close_date,
          suggestedAction: score < 30 ? '紧急 review：确认 Champion 和 Economic Buyer' : '安排 Deal Review 推动 MEDDPICC 补全',
          entityHref: `/pipeline/${o.id}`,
        });
        continue; // avoid duplicate with the broader check below
      }

      // Broader: <30 days + MEDDICC < 60
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * DAY_MS);
      if (closeDate <= thirtyDaysFromNow && score < 60) {
        const acctName = acctMap.get(o.account_id) ?? '';
        actions.push({
          type: 'risk_alert',
          priority: 4,
          title: `推进 ${o.name}`,
          description: `${acctName} · MEDDPICC ${score} 分 · ${daysUntilClose} 天后到期 · ${o.stage}`,
          relatedOpportunityId: o.id,
          relatedAccountId: o.account_id,
          dueDate: o.expected_close_date,
          suggestedAction: '推进关键验证步骤，提升 MEDDPICC 评分',
          entityHref: `/pipeline/${o.id}`,
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Rule 4: Contact attitude declining → '关系预警'
    // ═══════════════════════════════════════════════════════════════
    for (const c of contactsRes.data ?? []) {
      const trend = c.attitude_trend as { date?: string; score?: number; label?: string }[] | null;
      if (!trend || trend.length < 3) continue;
      const recent = trend.slice(-3);
      const isDecreasing = recent.every((p, i) => i === 0 || (p.score ?? 50) < (recent[i - 1].score ?? 50));
      if (!isDecreasing) continue;
      const latestScore = recent[recent.length - 1].score ?? 50;
      const acctName = acctMap.get(c.account_id) ?? '';
      actions.push({
        type: 'relationship_alert',
        priority: latestScore < 30 ? 1 : latestScore < 50 ? 2 : 3,
        title: `关系预警: ${c.name}`,
        description: `${acctName ? acctName + ' · ' : ''}情绪连续下降 → ${recent.map(p => p.score).join(' → ')}`,
        relatedContactId: c.id,
        relatedAccountId: c.account_id,
        suggestedAction: '建议安排 1:1 沟通了解顾虑，或请高层介入修复关系',
        entityHref: c.account_id ? `/accounts/${c.account_id}` : `/contacts/${c.id}`,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // Rule 5: Unprocessed intel → '情报处理'
    // ═══════════════════════════════════════════════════════════════
    // Group by account
    type IntelRow = { id: string; account_id: string; title: string; summary: string; date: string; analysis: unknown };
    const intelByAccount = new Map<string, IntelRow[]>();
    for (const item of (intelRes.data ?? []) as IntelRow[]) {
      if (!item.account_id) continue;
      const arr = intelByAccount.get(item.account_id) ?? [];
      arr.push(item);
      intelByAccount.set(item.account_id, arr);
    }
    for (const [accountId, items] of intelByAccount) {
      const acctName = acctMap.get(accountId) ?? '';
      actions.push({
        type: 'intel_review',
        priority: items.length >= 3 ? 2 : 4,
        title: `处理新情报 (${items.length})`,
        description: `${acctName} · ${items.length} 条情报待分析：${items[0]?.title || items[0]?.summary?.slice(0, 30) || '新情报'}`,
        relatedAccountId: accountId,
        suggestedAction: '查看情报并标注对商机的影响',
        entityHref: `/accounts/${accountId}?tab=activity`,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // Rule 6: Tasks due soon (existing logic, upgraded priority)
    // ═══════════════════════════════════════════════════════════════
    for (const t of tasksRes.data ?? []) {
      if (!t.due_date) continue;
      const dueDate = new Date(t.due_date);
      const isOverdue = t.due_date < todayStr;
      const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / DAY_MS);
      const acctName = t.account_id ? acctMap.get(t.account_id) : null;
      const priority = isOverdue ? 1 : t.priority === 'urgent' ? 1 : t.priority === 'high' ? 2 : 3;
      actions.push({
        type: 'task',
        priority,
        title: isOverdue ? `逾期: ${t.title}` : t.title,
        description: `${acctName ? acctName + ' · ' : ''}${isOverdue ? '已逾期' : `${daysUntil} 天后到期`} · ${t.priority}`,
        relatedAccountId: t.account_id ?? undefined,
        relatedOpportunityId: t.opportunity_id ?? undefined,
        dueDate: t.due_date,
        suggestedAction: isOverdue ? '立即处理或重新安排' : '按计划完成',
        entityHref: '/pulse',
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // Rule 7: Stalled plays
    // ═══════════════════════════════════════════════════════════════
    for (const p of playsRes.data ?? []) {
      const dsp = p.days_since_progress ?? 0;
      const isStalled = p.momentum === 'stalled' || dsp > 7;
      if (!isStalled) continue;
      const acctName = acctMap.get(p.account_id) ?? '';
      actions.push({
        type: 'play_stalled',
        priority: dsp > 14 || p.momentum === 'stalled' ? 2 : 4,
        title: '推动谋局进展',
        description: `${acctName} · ${p.goal_description?.slice(0, 40) ?? '谋局'} · ${p.momentum === 'stalled' ? '动量停滞' : `${dsp} 天无进展`}`,
        relatedAccountId: p.account_id,
        suggestedAction: '更新谋局状态，推进下一步动作',
        entityHref: `/accounts/${p.account_id}`,
      });
    }

    // ── Sort by priority (ascending = most urgent first) ──────────
    actions.sort((a, b) => a.priority - b.priority);

    return Response.json({ actions: actions.slice(0, 15) });
  } catch (err) {
    return guardResponse(err);
  }
}
