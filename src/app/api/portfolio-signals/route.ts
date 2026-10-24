/**
 * GET /api/portfolio-signals
 *
 * Returns cross-account conflicts and open questions for the dashboard.
 * Used to surface structural contradictions and unresolved blockers on the first screen.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-guard';
import { requireAdmin } from '@/lib/api-guard';
import {
  getVisiblePortfolioIds,
  restrictQueryToIds,
  restrictQueryToVisibleAccounts,
  restrictQueryToVisiblePortfolio,
} from '@/lib/portfolio-scope';
import { normalizeInterventionSourceRow } from '@/lib/judgment/intervention';
import { normalizeInterventionOutcomeSourceRow } from '@/lib/judgment/intervention-learning';
import { buildJudgmentPatternLibrary } from '@/lib/judgment/pattern-library';
import { buildPatternAwarePortfolioSignals } from '@/lib/judgment/pattern-aware-portfolio-signals';
import { buildPortfolioJudgmentView, type PortfolioAccountInput, type PortfolioOpportunityInput, type PortfolioPursuitTeamInput, type PortfolioTaskInput } from '@/lib/judgment/portfolio-view';
import { buildPublicWebPortfolioSignals } from '@/lib/judgment/public-web-portfolio-signals';
import { normalizePlayExecutionEventSourceRow, PLAY_EXECUTION_STATUS_LABEL, type PlayExecutionEvent } from '@/lib/strategic-play-execution';

const PATTERN_SOURCE_KINDS = ['manager_intervention', 'executive_intervention', 'intervention_outcome', 'play_execution_event'] as const;

function isSourceRecordsUnavailable(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? '';
  return message.includes('source_records') || message.includes('schema cache') || message.includes('does not exist');
}

type PlayExecutionPortfolioSignal = {
  id: string;
  accountId: string;
  accountName: string;
  opportunityId?: string;
  opportunityName?: string;
  playId: string;
  stepIndex: number;
  status: PlayExecutionEvent['status'];
  severity: 'critical' | 'warning' | 'focus' | 'positive';
  title: string;
  summary: string;
  occurredAt: string;
  evidenceRefs: Array<{ sourceKind: 'source_record'; sourceId: string; sourceTable: string; sourceRowId: string; title?: string }>;
  drilldownHref: string;
};

type PursuitTeamRow = {
  id: string;
  account_id: string;
  opportunity_id: string | null;
  strategic_play_id?: string | null;
  name: string | null;
  status: string | null;
};

type PursuitTeamMemberRow = {
  id: string;
  pursuit_team_id: string;
  user_id: string | null;
  is_lead: boolean | null;
};

type ResponsibilityLinkRow = {
  pursuit_team_member_id: string;
  responsibility_id: string;
};

type ResponsibilityRow = {
  id: string;
  key: string | null;
  label: string | null;
};

type OrgMemberRow = {
  user_id: string;
  display_name: string | null;
};

function buildPlayExecutionPortfolioSignals(params: {
  events: PlayExecutionEvent[];
  accounts: PortfolioAccountInput[];
  opportunities: PortfolioOpportunityInput[];
  limit?: number;
}): PlayExecutionPortfolioSignal[] {
  const accountById = new Map(params.accounts.map((account) => [account.id, account]));
  const opportunityById = new Map(params.opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const limit = Math.max(0, Math.min(Math.floor(params.limit ?? 6), 20));

  return [...params.events]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit)
    .map((event) => {
      const account = accountById.get(event.accountId);
      const opportunity = event.opportunityId ? opportunityById.get(event.opportunityId) : undefined;
      const statusLabel = PLAY_EXECUTION_STATUS_LABEL[event.status];
      const severity = event.status === 'invalidated'
        ? 'critical'
        : event.status === 'blocked'
          ? 'warning'
          : event.status === 'done'
            ? 'positive'
            : 'focus';
      const summary = event.status === 'blocked'
        ? (event.blockerReason ?? event.executionNote ?? event.stepTitle ?? '谋局执行受阻，需要复盘。')
        : event.status === 'invalidated'
          ? (event.executionNote ?? event.actualOutcome ?? '谋局假设或打法已失效，需要调整。')
          : (event.actualOutcome ?? event.executionNote ?? event.stepTitle ?? '谋局执行结果已记录。');
      const sourceId = event.sourceRecordId ?? event.id;

      return {
        id: `play-execution:${event.id}`,
        accountId: event.accountId,
        accountName: account?.name ?? '未知客户',
        ...(event.opportunityId ? { opportunityId: event.opportunityId } : {}),
        ...(opportunity?.name ? { opportunityName: opportunity.name } : {}),
        playId: event.playId,
        stepIndex: event.stepIndex,
        status: event.status,
        severity,
        title: `谋局执行 · ${statusLabel}`,
        summary,
        occurredAt: event.occurredAt,
        evidenceRefs: [{ sourceKind: 'source_record' as const, sourceId, sourceTable: 'source_records', sourceRowId: sourceId, title: event.stepTitle }],
        drilldownHref: `/accounts/${encodeURIComponent(event.accountId)}?tab=plays`,
      };
    });
}

function isOptionalAccountTeamTableUnavailable(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? '';
  return message.includes('pursuit_teams')
    || message.includes('pursuit_team_members')
    || message.includes('pursuit_team_member_responsibilities')
    || message.includes('responsibility_catalog')
    || message.includes('org_memberships')
    || message.includes('schema cache')
    || message.includes('does not exist');
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export async function GET() {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const visibility = await getVisiblePortfolioIds(admin, ctx);

    let conflictsQuery = admin
      .from('account_knowledge_pages')
      .select('account_id, content_json, updated_at')
      .eq('org_id', ctx.orgId)
      .eq('page_type', 'memory_snapshot')
      .order('updated_at', { ascending: false })
      .limit(20);

    let questionsQuery = admin
      .from('account_open_questions')
      .select('id, account_id, question, context, priority, status, created_at, updated_at')
      .eq('org_id', ctx.orgId)
      .eq('status', 'open')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);

    let accountsQuery = admin
      .from('accounts')
      .select('id, name, owner_id, user_id, business_team_id, deal_value, deal_health, last_activity')
      .eq('org_id', ctx.orgId)
      .limit(200);

    let opportunitiesQuery = admin
      .from('opportunities')
      .select('id, name, account_id, value, stage, probability, expected_close_date, updated_at, meddicc, mutual_action_plan')
      .eq('org_id', ctx.orgId)
      .limit(300);

    let tasksQuery = admin
      .from('tasks')
      .select('id, title, status, priority, due_date, account_id, opportunity_id, updated_at')
      .eq('org_id', ctx.orgId)
      .neq('status', 'done')
      .limit(500);

    let patternRowsQuery = admin
      .from('source_records')
      .select('id, org_id, account_id, source_kind, source_table, source_row_id, occurred_at, created_at, metadata')
      .eq('org_id', ctx.orgId)
      .in('source_kind', [...PATTERN_SOURCE_KINDS])
      .order('occurred_at', { ascending: false })
      .limit(220);

    let publicWebRowsQuery = admin
      .from('source_records')
      .select('id, account_id, source_kind, source_table, source_row_id, title, summary, occurred_at, created_at, metadata')
      .eq('org_id', ctx.orgId)
      .eq('source_kind', 'public_web')
      .order('occurred_at', { ascending: false })
      .limit(80);

    let pursuitTeamsQuery = admin
      .from('pursuit_teams')
      .select('id, account_id, opportunity_id, strategic_play_id, name, status')
      .eq('org_id', ctx.orgId)
      .eq('status', 'active')
      .limit(300);

    conflictsQuery = restrictQueryToVisibleAccounts(conflictsQuery, visibility);
    questionsQuery = restrictQueryToVisibleAccounts(questionsQuery, visibility);
    accountsQuery = restrictQueryToIds(accountsQuery, visibility, 'id', visibility.accountIds);
    opportunitiesQuery = restrictQueryToIds(opportunitiesQuery, visibility, 'id', visibility.opportunityIds);
    tasksQuery = restrictQueryToVisiblePortfolio(tasksQuery, visibility, { accountField: 'account_id', opportunityField: 'opportunity_id' });
    patternRowsQuery = restrictQueryToVisibleAccounts(patternRowsQuery, visibility);
    publicWebRowsQuery = restrictQueryToVisibleAccounts(publicWebRowsQuery, visibility);
    pursuitTeamsQuery = restrictQueryToVisibleAccounts(pursuitTeamsQuery, visibility);

    // Fetch conflicts (from memory_conflicts or inline in memory snapshots)
    // and open questions in parallel, after server-side role scoping.
    const [conflictsResult, questionsResult, accountsResult, opportunitiesResult, tasksResult, patternRowsResult, publicWebRowsResult, pursuitTeamsResult] = await Promise.all([
      conflictsQuery,
      questionsQuery,
      accountsQuery,
      opportunitiesQuery,
      tasksQuery,
      patternRowsQuery,
      publicWebRowsQuery,
      pursuitTeamsQuery,
    ]);

    // Extract conflicts from memory snapshots
    type ConflictItem = {
      id: string;
      accountId: string;
      summary: string;
      kind: string;
      severity: string;
      detectedAt: string;
    };

    const conflicts: ConflictItem[] = [];
    if (conflictsResult.data) {
      for (const row of conflictsResult.data) {
        const content = row.content_json as Record<string, unknown> | null;
        if (!content) continue;
        const rawConflicts = content.conflicts as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(rawConflicts)) continue;
        for (const c of rawConflicts) {
          if ((c.status as string) === 'resolved') continue;
          conflicts.push({
            id: (c.id as string) || `${row.account_id}-${conflicts.length}`,
            accountId: row.account_id as string,
            summary: (c.summary as string) || '',
            kind: (c.kind as string) || 'unknown',
            severity: (c.severity as string) || 'medium',
            detectedAt: (c.detectedAt as string) || row.updated_at as string,
          });
        }
      }
    }

    // Also try fetching from dedicated memory_conflicts table (if exists)
    try {
      const dedicatedConflictsQuery = restrictQueryToVisibleAccounts(
        admin
          .from('memory_conflicts')
          .select('id, account_id, summary, kind, severity, detected_at, status')
          .eq('org_id', ctx.orgId)
          .eq('status', 'open')
          .order('severity', { ascending: true }) // high first
          .order('detected_at', { ascending: false })
          .limit(15),
        visibility,
      );
      const { data: dedicatedConflicts } = await dedicatedConflictsQuery;

      if (dedicatedConflicts) {
        for (const c of dedicatedConflicts) {
          // Avoid duplicates
          if (conflicts.some(existing => existing.id === c.id)) continue;
          conflicts.push({
            id: c.id,
            accountId: c.account_id,
            summary: c.summary,
            kind: c.kind || 'unknown',
            severity: c.severity || 'medium',
            detectedAt: c.detected_at,
          });
        }
      }
    } catch {
      // Table may not exist yet — ignore
    }

    // Sort: high severity first, then by date
    const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    conflicts.sort((a, b) => {
      const sa = severityOrder[a.severity] ?? 1;
      const sb = severityOrder[b.severity] ?? 1;
      if (sa !== sb) return sa - sb;
      return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
    });

    // Format open questions
    type QuestionItem = {
      id: string;
      accountId: string;
      question: string;
      context: string;
      priority: number;
      createdAt: string;
    };

    const questions: QuestionItem[] = (questionsResult.data ?? []).map((q: Record<string, unknown>) => ({
      id: q.id as string,
      accountId: q.account_id as string,
      question: q.question as string,
      context: (q.context as string) || '',
      priority: (q.priority as number) || 0,
      createdAt: q.created_at as string,
    }));

    // Fetch account names for the referenced accounts
    const accountIds = [...new Set([
      ...conflicts.map(c => c.accountId),
      ...questions.map(q => q.accountId),
    ])];

    const portfolioAccounts: PortfolioAccountInput[] = (accountsResult.data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      name: (row.name as string) ?? '未知账户',
      ownerId: (row.owner_id as string | null) ?? null,
      userId: (row.user_id as string | null) ?? null,
      businessTeamId: (row.business_team_id as string | null) ?? null,
      dealValue: typeof row.deal_value === 'number' ? row.deal_value : null,
      dealHealth: row.deal_health as PortfolioAccountInput['dealHealth'],
      lastActivity: (row.last_activity as string | null) ?? null,
    }));

    const portfolioOpportunities: PortfolioOpportunityInput[] = (opportunitiesResult.data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      accountId: row.account_id as string,
      name: (row.name as string) ?? '未命名商机',
      value: typeof row.value === 'number' ? row.value : null,
      stage: (row.stage as string | null) ?? null,
      probability: typeof row.probability === 'number' ? row.probability : null,
      expectedCloseDate: (row.expected_close_date as string | null) ?? null,
      updatedAt: (row.updated_at as string | null) ?? null,
      meddicc: (row.meddicc as PortfolioOpportunityInput['meddicc']) ?? null,
      mutualActionPlan: (row.mutual_action_plan as PortfolioOpportunityInput['mutualActionPlan']) ?? null,
    }));

    const portfolioTasks: PortfolioTaskInput[] = (tasksResult.data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      accountId: (row.account_id as string | null) ?? null,
      opportunityId: (row.opportunity_id as string | null) ?? null,
      title: (row.title as string) ?? '未命名任务',
      status: (row.status as string | null) ?? null,
      priority: (row.priority as string | null) ?? null,
      dueDate: (row.due_date as string | null) ?? null,
      updatedAt: (row.updated_at as string | null) ?? null,
    }));

    if (pursuitTeamsResult.error && !isOptionalAccountTeamTableUnavailable(pursuitTeamsResult.error)) {
      throw new Error(pursuitTeamsResult.error.message ?? 'pursuit_teams query failed');
    }
    const pursuitTeamRows = (pursuitTeamsResult.error ? [] : (pursuitTeamsResult.data ?? [])) as PursuitTeamRow[];
    const pursuitTeamIds = pursuitTeamRows.map((team) => team.id).filter(Boolean);

    let pursuitMemberRows: PursuitTeamMemberRow[] = [];
    let responsibilityLinks: ResponsibilityLinkRow[] = [];
    let responsibilityRows: ResponsibilityRow[] = [];

    if (pursuitTeamIds.length > 0) {
      const membersResult = await admin
        .from('pursuit_team_members')
        .select('id, pursuit_team_id, user_id, is_lead')
        .eq('org_id', ctx.orgId)
        .in('pursuit_team_id', pursuitTeamIds)
        .limit(500);
      if (membersResult.error && !isOptionalAccountTeamTableUnavailable(membersResult.error)) {
        throw new Error(membersResult.error.message ?? 'pursuit_team_members query failed');
      }
      pursuitMemberRows = (membersResult.error ? [] : (membersResult.data ?? [])) as PursuitTeamMemberRow[];

      const memberIds = pursuitMemberRows.map((member) => member.id).filter(Boolean);
      if (memberIds.length > 0) {
        const linksResult = await admin
          .from('pursuit_team_member_responsibilities')
          .select('pursuit_team_member_id, responsibility_id')
          .eq('org_id', ctx.orgId)
          .in('pursuit_team_member_id', memberIds)
          .limit(800);
        if (linksResult.error && !isOptionalAccountTeamTableUnavailable(linksResult.error)) {
          throw new Error(linksResult.error.message ?? 'pursuit_team_member_responsibilities query failed');
        }
        responsibilityLinks = (linksResult.error ? [] : (linksResult.data ?? [])) as ResponsibilityLinkRow[];

        const responsibilityIds = [...new Set(responsibilityLinks.map((link) => link.responsibility_id).filter(Boolean))];
        if (responsibilityIds.length > 0) {
          const responsibilitiesResult = await admin
            .from('responsibility_catalog')
            .select('id, key, label')
            .in('id', responsibilityIds)
            .limit(800);
          if (responsibilitiesResult.error && !isOptionalAccountTeamTableUnavailable(responsibilitiesResult.error)) {
            throw new Error(responsibilitiesResult.error.message ?? 'responsibility_catalog query failed');
          }
          responsibilityRows = (responsibilitiesResult.error ? [] : (responsibilitiesResult.data ?? [])) as ResponsibilityRow[];
        }
      }
    }

    const accountOwnerIds = portfolioAccounts.flatMap((account) => [account.ownerId, account.userId]).filter((id): id is string => Boolean(id));
    const teamLeadIds = pursuitMemberRows.filter((member) => member.is_lead).map((member) => member.user_id).filter((id): id is string => Boolean(id));
    const displayUserIds = [...new Set([...accountOwnerIds, ...teamLeadIds])];
    let memberNamesByUserId = new Map<string, string>();
    if (displayUserIds.length > 0) {
      const membersResult = await admin
        .from('org_memberships')
        .select('user_id, display_name')
        .eq('org_id', ctx.orgId)
        .in('user_id', displayUserIds)
        .limit(500);
      if (membersResult.error && !isOptionalAccountTeamTableUnavailable(membersResult.error)) {
        throw new Error(membersResult.error.message ?? 'org_memberships query failed');
      }
      memberNamesByUserId = new Map(((membersResult.error ? [] : (membersResult.data ?? [])) as OrgMemberRow[])
        .map((member) => [member.user_id, cleanText(member.display_name) || member.user_id]));
    }

    for (const account of portfolioAccounts) {
      const ownerId = account.ownerId ?? account.userId ?? null;
      if (ownerId) account.ownerName = memberNamesByUserId.get(ownerId) ?? ownerId;
    }

    const membersByTeam = new Map<string, PursuitTeamMemberRow[]>();
    for (const member of pursuitMemberRows) {
      const list = membersByTeam.get(member.pursuit_team_id) ?? [];
      list.push(member);
      membersByTeam.set(member.pursuit_team_id, list);
    }
    const responsibilityLabelById = new Map(responsibilityRows.map((row) => [row.id, cleanText(row.label) || cleanText(row.key)]));
    const responsibilityIdsByMember = new Map<string, string[]>();
    for (const link of responsibilityLinks) {
      const ids = responsibilityIdsByMember.get(link.pursuit_team_member_id) ?? [];
      ids.push(link.responsibility_id);
      responsibilityIdsByMember.set(link.pursuit_team_member_id, ids);
    }
    const portfolioPursuitTeams: PortfolioPursuitTeamInput[] = pursuitTeamRows.map((team) => {
      const members = membersByTeam.get(team.id) ?? [];
      const lead = members.find((member) => member.is_lead) ?? members[0];
      const responsibilityLabels = [...new Set(members.flatMap((member) => (responsibilityIdsByMember.get(member.id) ?? [])
        .map((id) => responsibilityLabelById.get(id))
        .filter((label): label is string => Boolean(label))))];
      return {
        id: team.id,
        accountId: team.account_id,
        opportunityId: team.opportunity_id,
        name: team.name ?? '项目推进组',
        status: team.status ?? 'active',
        leadUserId: lead?.user_id ?? null,
        leadName: lead?.user_id ? memberNamesByUserId.get(lead.user_id) ?? lead.user_id : null,
        memberCount: members.length,
        responsibilityLabels,
      };
    });

    const portfolioJudgment = buildPortfolioJudgmentView({
      accounts: portfolioAccounts,
      opportunities: portfolioOpportunities,
      tasks: portfolioTasks,
      pursuitTeams: portfolioPursuitTeams,
      conflicts,
      questions,
    });

    if (patternRowsResult.error && !isSourceRecordsUnavailable(patternRowsResult.error)) {
      throw new Error(patternRowsResult.error.message ?? 'source_records query failed');
    }
    const patternRows = patternRowsResult.error ? [] : (patternRowsResult.data ?? []);
    const interventions = patternRows
      .map((row: Record<string, unknown>) => normalizeInterventionSourceRow(row))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const interventionOutcomes = patternRows
      .map((row: Record<string, unknown>) => normalizeInterventionOutcomeSourceRow(row))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const playExecutionEvents = patternRows
      .map((row: Record<string, unknown>) => normalizePlayExecutionEventSourceRow(row))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const judgmentPatterns = buildJudgmentPatternLibrary({ interventions, interventionOutcomes, limit: 12 });
    const patternAware = buildPatternAwarePortfolioSignals({
      accounts: portfolioAccounts,
      opportunities: portfolioOpportunities,
      patterns: judgmentPatterns,
      portfolioJudgment,
      limit: 6,
    });
    const playExecutionSignals = buildPlayExecutionPortfolioSignals({
      events: playExecutionEvents,
      accounts: portfolioAccounts,
      opportunities: portfolioOpportunities,
      limit: 6,
    });

    if (publicWebRowsResult.error && !isSourceRecordsUnavailable(publicWebRowsResult.error)) {
      throw new Error(publicWebRowsResult.error.message ?? 'public web source_records query failed');
    }
    const publicWeb = buildPublicWebPortfolioSignals({
      rows: publicWebRowsResult.error ? [] : (publicWebRowsResult.data ?? []),
      accountNames: Object.fromEntries(portfolioAccounts.map((account) => [account.id, account.name])),
      limit: 6,
    });

    let accountNames: Record<string, string> = Object.fromEntries(portfolioAccounts.map((account) => [account.id, account.name]));
    if (accountIds.length > 0) {
      const { data: accts } = await restrictQueryToIds(
        admin
          .from('accounts')
          .select('id, name')
          .eq('org_id', ctx.orgId)
          .in('id', accountIds),
        visibility,
        'id',
        accountIds,
      );
      if (accts) {
        accountNames = { ...accountNames, ...Object.fromEntries(accts.map((a: { id: string; name: string }) => [a.id, a.name])) };
      }
    }

    return NextResponse.json({
      conflicts: conflicts.slice(0, 10),
      questions: questions.slice(0, 10),
      accountNames,
      portfolioJudgment,
      patternAwareSignals: patternAware.signals,
      patternSignalSummary: patternAware.summary,
      playExecutionSignals,
      playExecutionSignalSummary: {
        status: playExecutionEvents.length > 0 ? 'ready' : 'no_events',
        totalEvents: playExecutionEvents.length,
        emittedSignals: playExecutionSignals.length,
        blockedOrInvalidated: playExecutionEvents.filter((event) => event.status === 'blocked' || event.status === 'invalidated').length,
        calibrationNote: playExecutionEvents.length > 0
          ? ''
          : '暂无谋局执行 source_records；组合视图不会伪造执行闭环。',
      },
      publicWebSignals: publicWeb.signals,
      publicWebSignalSummary: publicWeb.summary,
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) {
      const apiErr = err as { status: number; message: string };
      return NextResponse.json({ error: apiErr.message }, { status: apiErr.status });
    }
    console.error('[portfolio-signals] Error:', err);
    return NextResponse.json({ error: '加载失败' }, { status: 500 });
  }
}
