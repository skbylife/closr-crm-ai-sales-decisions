import { requireAuth, requireAdmin, requireAccountAccess, guardResponse } from '@/lib/api-guard';
import type { DecodeOutput, RfpJudgment, SavedDecode, StrategicPlay } from '@/lib/babel-engine/types';
import { getUnifiedMemoryPayload } from '@/lib/evidence-memory/server';
import { loadAIAnalysis } from '@/lib/evidence-memory/ai-analysis';
import {
  JUDGMENT_MEMORY_SOURCE_LABELS,
  mergeJudgmentMemorySourcesPreferPersisted,
  normalizeJudgmentMemorySourceRow,
  type JudgmentMemorySourceItem,
} from '@/lib/judgment/memory-sources';
import {
  buildJudgmentMemoryFromDecode,
  buildJudgmentMemoryFromRfpAnalysis,
  buildJudgmentMemoryFromStrategicPlay,
  type JudgmentMemoryInput,
  type JudgmentMemorySourceKind,
} from '@/lib/judgment/memory';
import { buildAccountMomentumSnapshot } from '@/lib/judgment/momentum';
import { buildAccountOpenQuestions } from '@/lib/judgment/open-questions';
import { buildStakeholderInterpretations, type StakeholderContactInput } from '@/lib/judgment/stakeholder';
import { normalizeJudgmentFeedbackSourceRow } from '@/lib/judgment/feedback';
import { normalizeTaskOutcomeSourceRow } from '@/lib/judgment/task-outcome';
import { normalizeWinLossCalibrationSourceRow } from '@/lib/judgment/win-loss-calibration';
import { normalizeInterventionSourceRow } from '@/lib/judgment/intervention';
import { buildJudgmentLearningSummary, normalizeInterventionOutcomeSourceRow } from '@/lib/judgment/intervention-learning';
import { buildDecodeStabilityMetadata, buildDecodeStabilityTimeline, type DecodeStabilityMetadata } from '@/lib/judgment/decode-stability';
import { buildJudgmentActionPanelModel } from '@/lib/judgment/action-panel';
import { buildRoleView, parseRoleViewRole, roleViewRoleFromJobLevel, type RoleViewRole } from '@/lib/judgment/role-view';
import { buildJudgmentTimeline } from '@/lib/judgment/timeline';
import { normalizePlayExecutionEventSourceRow } from '@/lib/strategic-play-execution';
import { DEMO_USER_ID } from '@/lib/demo';
import { normalizeOutputLocale } from '@/lib/output-locale';

export const dynamic = 'force-dynamic';

type AdminClient = ReturnType<typeof requireAdmin>;

type DecodeMemoryRow = {
  id?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  client_name?: string | null;
  date?: string | null;
  decode?: unknown;
};

type StrategicPlayMemoryRow = {
  id?: string | null;
  account_id?: string | null;
  goal_description?: string | null;
  steps?: unknown;
  confidence?: unknown;
  assumptions?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
};

type RfpAnalysisMemoryRow = {
  id?: string | null;
  rfp_id?: string | null;
  created_at?: string | null;
  win_probability?: number | null;
  weaknesses?: unknown;
  recommendations?: unknown;
  raw_output?: unknown;
};

type RfpMemoryRow = {
  id?: string | null;
  account_id?: string | null;
  title?: string | null;
};

type FeedbackSourceRecordRow = {
  id?: string | null;
  org_id?: string | null;
  account_id?: string | null;
  source_row_id?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type CalibrationSourceRecordRow = FeedbackSourceRecordRow & {
  source_kind?: string | null;
  source_table?: string | null;
};

const MEMORY_SOURCE_KINDS = new Set<JudgmentMemorySourceKind>(['decode', 'rfp_analysis', 'strategic_play']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function hasDecodeOutput(value: unknown): value is DecodeOutput {
  return Boolean(
    value
      && typeof value === 'object'
      && Array.isArray((value as DecodeOutput).messages)
      && (value as DecodeOutput).threadAnalysis,
  );
}

function normalizeStrategicPlayForJudgment(row: StrategicPlayMemoryRow): Pick<StrategicPlay, 'id' | 'accountId' | 'goalDescription' | 'steps' | 'confidence' | 'assumptions' | 'updatedAt' | 'createdAt'> | null {
  const id = typeof row.id === 'string' ? row.id : '';
  const accountId = typeof row.account_id === 'string' ? row.account_id : '';
  const goalDescription = typeof row.goal_description === 'string' ? row.goal_description.trim() : '';
  if (!id || !accountId || !goalDescription) return null;

  const now = new Date().toISOString();
  return {
    id,
    accountId,
    goalDescription,
    steps: Array.isArray(row.steps) ? row.steps as StrategicPlay['steps'] : [],
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : 0.5,
    assumptions: Array.isArray(row.assumptions) ? row.assumptions as StrategicPlay['assumptions'] : [],
    createdAt: row.created_at ?? row.updated_at ?? now,
    updatedAt: row.updated_at ?? row.created_at ?? now,
  };
}

function isJudgmentMemoryInput(value: unknown): value is JudgmentMemoryInput {
  const memory = asRecord(value);
  const sourceKind = memory?.sourceKind;
  return Boolean(
    memory
      && typeof sourceKind === 'string'
      && MEMORY_SOURCE_KINDS.has(sourceKind as JudgmentMemorySourceKind)
      && typeof memory.sourceId === 'string'
      && typeof memory.accountId === 'string'
      && typeof memory.currentJudgment === 'string'
      && typeof memory.risk === 'string'
      && typeof memory.nextAction === 'string',
  );
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function coerceRfpJudgment(value: unknown): RfpJudgment | null {
  const row = asRecord(value);
  if (!row) return null;
  const decision = row.decision;
  if (decision !== 'bid' && decision !== 'no_bid' && decision !== 'cautious_bid' && decision !== 'need_more_intel') return null;

  const confidence = typeof row.confidence === 'number' && Number.isFinite(row.confidence) ? row.confidence : 50;
  const rationale = typeof row.rationale === 'string' && row.rationale.trim() ? row.rationale.trim() : '基于当前 RFP 记录形成临时投标判断。';
  const uncertainty = typeof row.uncertainty === 'string' && row.uncertainty.trim() ? row.uncertainty.trim() : '仍需验证评分规则、关键决策人倾向、竞对报价和预算弹性。';

  return {
    decision,
    confidence,
    rationale,
    uncertainty,
    keyRisks: arrayOfStrings(row.keyRisks),
    tensions: arrayOfStrings(row.tensions),
    contradictions: arrayOfStrings(row.contradictions),
    evidenceSignals: Array.isArray(row.evidenceSignals) ? row.evidenceSignals as RfpJudgment['evidenceSignals'] : [],
    narrativeChange: typeof row.narrativeChange === 'string' ? row.narrativeChange : undefined,
  };
}

function memoryInputToSourceItem(input: JudgmentMemoryInput, params: {
  sourceTable?: string;
  sourceRowId?: string;
  sourceRecordId?: string;
  traceStatus?: JudgmentMemorySourceItem['traceStatus'];
  traceNote?: string;
  decodeStability?: DecodeStabilityMetadata | null;
} = {}): JudgmentMemorySourceItem {
  return {
    id: `${input.sourceKind}:${input.sourceId}`,
    sourceRecordId: params.sourceRecordId ?? `derived:${input.sourceKind}:${input.sourceId}`,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceTable: params.sourceTable,
    sourceRowId: params.sourceRowId ?? input.sourceId,
    title: input.title ?? JUDGMENT_MEMORY_SOURCE_LABELS[input.sourceKind],
    currentJudgment: input.currentJudgment,
    risk: input.risk,
    nextAction: input.nextAction,
    confidence: Number.isFinite(input.confidence) ? Math.max(0, Math.min(1, input.confidence > 1 ? input.confidence / 100 : input.confidence)) : null,
    uncertainty: input.uncertainty || undefined,
    provisional: input.provisional,
    evidenceRefs: input.evidenceRefs ?? [],
    updatedAt: input.createdAt || new Date(0).toISOString(),
    traceStatus: params.traceStatus,
    traceNote: params.traceNote,
    decodeStability: params.decodeStability ?? undefined,
  };
}

async function loadPersistedJudgmentMemorySources(admin: AdminClient, params: { accountId: string; orgId: string }) {
  const { accountId, orgId } = params;
  const { data, error } = await admin
    .from('source_records')
    .select('id, source_table, source_row_id, title, occurred_at, created_at, metadata')
    .eq('org_id', orgId)
    .eq('account_id', accountId)
    .order('occurred_at', { ascending: false })
    .limit(80);

  if (error) {
    const message = error.message ?? '';
    if (message.includes('source_records') || message.includes('schema cache')) return [];
    throw new Error(message);
  }

  return (data ?? [])
    .map((row) => normalizeJudgmentMemorySourceRow({
      id: row.id as string,
      source_table: row.source_table as string | null,
      source_row_id: row.source_row_id as string | null,
      title: row.title as string | null,
      occurred_at: row.occurred_at as string | null,
      created_at: row.created_at as string | null,
      metadata: row.metadata as Record<string, unknown> | null,
    }))
    .filter((item): item is JudgmentMemorySourceItem => Boolean(item))
    .map((item) => ({ ...item, traceStatus: 'persisted' as const }));
}

async function loadDerivedJudgmentMemorySources(admin: AdminClient, params: { accountId: string; orgId: string }) {
  const { accountId, orgId } = params;
  const traceNote = '历史数据尚未补种 source_records，当前卡片由原始 Decode / 谋局 / RFP 记录即时推导。';

  const [decodesResult, playsResult, rfpsResult] = await Promise.all([
    admin
      .from('email_decodes')
      .select('id, account_id, account_name, client_name, date, decode')
      .eq('org_id', orgId)
      .eq('account_id', accountId)
      .order('date', { ascending: false })
      .limit(5),
    admin
      .from('strategic_plays')
      .select('id, account_id, goal_description, steps, confidence, assumptions, created_at, updated_at')
      .eq('org_id', orgId)
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
      .limit(5),
    admin
      .from('rfps')
      .select('id, account_id, title')
      .eq('org_id', orgId)
      .eq('account_id', accountId)
      .limit(20),
  ]);

  for (const result of [decodesResult, playsResult, rfpsResult]) {
    if (result.error) {
      const message = result.error.message ?? '';
      if (!message.includes('schema cache') && !message.includes('does not exist')) throw new Error(message);
    }
  }

  const derived: JudgmentMemorySourceItem[] = [];

  for (const row of (decodesResult.data ?? []) as DecodeMemoryRow[]) {
    if (!row.id || !row.account_id || !hasDecodeOutput(row.decode)) continue;
    const savedDecode: Pick<SavedDecode, 'id' | 'accountId' | 'decode' | 'date' | 'clientName' | 'accountName'> = {
      id: row.id,
      accountId: row.account_id,
      accountName: row.account_name ?? undefined,
      clientName: row.client_name ?? undefined,
      date: row.date ?? new Date().toISOString(),
      decode: row.decode,
    };
    const memory = buildJudgmentMemoryFromDecode({ savedDecode });
    if (memory) {
      derived.push(memoryInputToSourceItem(memory, {
        sourceTable: 'email_decodes',
        sourceRowId: row.id,
        traceStatus: 'derived',
        traceNote,
        decodeStability: buildDecodeStabilityMetadata(row.decode),
      }));
    }
  }

  for (const row of (playsResult.data ?? []) as StrategicPlayMemoryRow[]) {
    const play = normalizeStrategicPlayForJudgment(row);
    if (!play) continue;
    derived.push(memoryInputToSourceItem(buildJudgmentMemoryFromStrategicPlay(play), {
      sourceTable: 'strategic_plays',
      sourceRowId: play.id,
      traceStatus: 'derived',
      traceNote,
    }));
  }

  const rfps = ((rfpsResult.data ?? []) as RfpMemoryRow[]).filter((row): row is Required<Pick<RfpMemoryRow, 'id' | 'account_id' | 'title'>> => Boolean(row.id && row.account_id && row.title));
  if (rfps.length > 0) {
    const rfpById = new Map(rfps.map((rfp) => [rfp.id, rfp]));
    const { data, error } = await admin
      .from('rfp_ai_analyses')
      .select('id, rfp_id, created_at, win_probability, weaknesses, recommendations, raw_output')
      .eq('org_id', orgId)
      .in('rfp_id', rfps.map((rfp) => rfp.id))
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      const message = error.message ?? '';
      if (!message.includes('schema cache') && !message.includes('does not exist')) throw new Error(message);
    }

    for (const analysis of (data ?? []) as RfpAnalysisMemoryRow[]) {
      if (!analysis.id || !analysis.rfp_id) continue;
      const rfp = rfpById.get(analysis.rfp_id);
      if (!rfp?.id || !rfp.account_id || !rfp.title) continue;
      const rfpId = rfp.id;
      const rfpAccountId = rfp.account_id;
      const rfpTitle = rfp.title;

      const rawOutput = asRecord(analysis.raw_output);
      let memory = rawOutput?.judgmentMemory;
      if (!isJudgmentMemoryInput(memory)) {
        const judgment = coerceRfpJudgment(rawOutput?.judgment);
        if (!judgment) continue;
        memory = buildJudgmentMemoryFromRfpAnalysis({
          rfp: {
            id: rfpId,
            account_id: rfpAccountId,
            title: rfpTitle,
            due_date: null,
          },
          analysis: {
            id: analysis.id,
            created_at: analysis.created_at ?? new Date().toISOString(),
          },
          judgment,
          recommendations: arrayOfStrings(analysis.recommendations),
          weaknesses: arrayOfStrings(analysis.weaknesses),
          winProbability: analysis.win_probability ?? null,
        });
      }

      if (!isJudgmentMemoryInput(memory)) continue;
      if (memory.accountId !== accountId || memory.sourceKind !== 'rfp_analysis' || memory.sourceId !== analysis.id) continue;
      derived.push(memoryInputToSourceItem({ ...memory, title: memory.title ?? `RFP判断 · ${rfpTitle}` }, {
        sourceTable: 'rfp_ai_analyses',
        sourceRowId: analysis.id,
        traceStatus: 'derived',
        traceNote,
      }));
    }
  }

  return derived;
}

async function loadAccountContactsForStakeholders(admin: AdminClient, params: { accountId: string; orgId: string }): Promise<StakeholderContactInput[]> {
  const { accountId, orgId } = params;
  const selectFull = 'id, name, title, role, relationship_strength, last_contacted_at, attitude_trend, job_level, role_confidence, updated_at';
  const selectMinimal = 'id, name, title, role, updated_at';

  const fullResult = await admin
    .from('contacts')
    .select(selectFull)
    .eq('org_id', orgId)
    .eq('account_id', accountId)
    .limit(40);

  if (!fullResult.error) return (fullResult.data ?? []) as StakeholderContactInput[];

  const message = fullResult.error.message ?? '';
  if (!message.includes('schema cache') && !message.includes('does not exist') && !message.includes('Could not find')) {
    throw new Error(message);
  }

  const minimalResult = await admin
    .from('contacts')
    .select(selectMinimal)
    .eq('org_id', orgId)
    .eq('account_id', accountId)
    .limit(40);

  if (minimalResult.error) {
    const minimalMessage = minimalResult.error.message ?? '';
    if (minimalMessage.includes('schema cache') || minimalMessage.includes('does not exist')) return [];
    throw new Error(minimalMessage);
  }

  return (minimalResult.data ?? []) as StakeholderContactInput[];
}

async function loadJudgmentMemorySources(admin: AdminClient, params: { accountId: string; orgId: string }) {
  const [persistedResult, derivedResult] = await Promise.allSettled([
    loadPersistedJudgmentMemorySources(admin, params),
    loadDerivedJudgmentMemorySources(admin, params),
  ]);

  const persisted = persistedResult.status === 'fulfilled' ? persistedResult.value : [];
  const derived = derivedResult.status === 'fulfilled' ? derivedResult.value : [];

  if (persistedResult.status === 'rejected') {
    console.warn('[memory-payload] persisted judgment memory sources unavailable:', persistedResult.reason);
  }
  if (derivedResult.status === 'rejected') {
    console.warn('[memory-payload] derived judgment memory sources unavailable:', derivedResult.reason);
  }

  return mergeJudgmentMemorySourcesPreferPersisted({ persisted, derived, limit: 12 });
}

async function loadJudgmentFeedbacks(admin: AdminClient, params: { accountId: string; orgId: string }) {
  const { data, error } = await admin
    .from('source_records')
    .select('id, org_id, account_id, source_row_id, occurred_at, created_at, metadata')
    .eq('org_id', params.orgId)
    .eq('account_id', params.accountId)
    .eq('source_kind', 'human_feedback')
    .order('occurred_at', { ascending: false })
    .limit(20);

  if (error) {
    const message = error.message ?? '';
    if (message.includes('source_records') || message.includes('schema cache') || message.includes('does not exist')) return [];
    throw new Error(message);
  }

  return ((data ?? []) as FeedbackSourceRecordRow[])
    .map((row) => normalizeJudgmentFeedbackSourceRow(row))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

async function loadWinLossCalibrations(admin: AdminClient, params: { accountId: string; orgId: string }) {
  const { data, error } = await admin
    .from('source_records')
    .select('id, org_id, account_id, source_kind, source_table, source_row_id, occurred_at, created_at, metadata')
    .eq('org_id', params.orgId)
    .eq('account_id', params.accountId)
    .eq('source_kind', 'win_loss_calibration')
    .order('occurred_at', { ascending: false })
    .limit(10);

  if (error) {
    const message = error.message ?? '';
    if (message.includes('source_records') || message.includes('schema cache') || message.includes('does not exist')) return [];
    throw new Error(message);
  }

  return ((data ?? []) as CalibrationSourceRecordRow[])
    .map((row) => normalizeWinLossCalibrationSourceRow(row))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}


async function loadTaskOutcomes(admin: AdminClient, params: { accountId: string; orgId: string }) {
  const { data, error } = await admin
    .from('source_records')
    .select('id, org_id, account_id, source_kind, source_table, source_row_id, occurred_at, created_at, metadata')
    .eq('org_id', params.orgId)
    .eq('account_id', params.accountId)
    .eq('source_kind', 'task_outcome')
    .order('occurred_at', { ascending: false })
    .limit(10);

  if (error) {
    const message = error.message ?? '';
    if (message.includes('source_records') || message.includes('schema cache') || message.includes('does not exist')) return [];
    throw new Error(message);
  }

  return ((data ?? []) as CalibrationSourceRecordRow[])
    .map((row) => normalizeTaskOutcomeSourceRow(row))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

async function loadInterventionOutcomes(admin: AdminClient, params: { accountId: string; orgId: string }) {
  const { data, error } = await admin
    .from('source_records')
    .select('id, org_id, account_id, source_kind, source_table, source_row_id, occurred_at, created_at, metadata')
    .eq('org_id', params.orgId)
    .eq('account_id', params.accountId)
    .eq('source_kind', 'intervention_outcome')
    .order('occurred_at', { ascending: false })
    .limit(20);

  if (error) {
    const message = error.message ?? '';
    if (message.includes('source_records') || message.includes('schema cache') || message.includes('does not exist')) return [];
    throw new Error(message);
  }

  return ((data ?? []) as CalibrationSourceRecordRow[])
    .map((row) => normalizeInterventionOutcomeSourceRow(row))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

async function loadInterventions(admin: AdminClient, params: { accountId: string; orgId: string }) {
  const { data, error } = await admin
    .from('source_records')
    .select('id, org_id, account_id, source_kind, source_table, source_row_id, occurred_at, created_at, metadata')
    .eq('org_id', params.orgId)
    .eq('account_id', params.accountId)
    .in('source_kind', ['manager_intervention', 'executive_intervention'])
    .order('occurred_at', { ascending: false })
    .limit(20);

  if (error) {
    const message = error.message ?? '';
    if (message.includes('source_records') || message.includes('schema cache') || message.includes('does not exist')) return [];
    throw new Error(message);
  }

  return ((data ?? []) as CalibrationSourceRecordRow[])
    .map((row) => normalizeInterventionSourceRow(row))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

async function loadPlayExecutionEvents(admin: AdminClient, params: { accountId: string; orgId: string }) {
  const { data, error } = await admin
    .from('source_records')
    .select('id, org_id, account_id, source_kind, source_table, source_row_id, occurred_at, created_at, metadata')
    .eq('org_id', params.orgId)
    .eq('account_id', params.accountId)
    .eq('source_kind', 'play_execution_event')
    .order('occurred_at', { ascending: false })
    .limit(20);

  if (error) {
    const message = error.message ?? '';
    if (message.includes('source_records') || message.includes('schema cache') || message.includes('does not exist')) return [];
    throw new Error(message);
  }

  return ((data ?? []) as CalibrationSourceRecordRow[])
    .map((row) => normalizePlayExecutionEventSourceRow(row))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function resolveRoleViewRole(ctx: Awaited<ReturnType<typeof requireAuth>>, requestedRole: RoleViewRole | null): RoleViewRole {
  const serverRole = roleViewRoleFromJobLevel(ctx.jobLevel);
  if (!requestedRole) return serverRole;

  const canPreviewRole = ctx.userId === DEMO_USER_ID || ctx.roleLevel === 'admin' || ctx.orgRole === 'owner' || ctx.orgRole === 'admin';
  return canPreviewRole ? requestedRole : serverRole;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await requireAccountAccess(ctx, id);
    const admin = requireAdmin();

    const { data: account, error } = await admin
      .from('accounts')
      .select('id, name')
      .eq('id', id)
      .eq('org_id', ctx.orgId)
      .single();

    if (error || !account) {
      return Response.json({ error: 'Account not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const windowDays = Math.max(7, Math.min(Number(searchParams.get('window') ?? 30), 180));
    const role = resolveRoleViewRole(ctx, parseRoleViewRole(searchParams.get('role')));
    const outputLocale = normalizeOutputLocale(searchParams.get('outputLocale') ?? searchParams.get('locale'));

    // Load AI analysis, memory payload, contacts, and traceable judgment sources in parallel
    const [memoryPayload, aiAnalysis, judgmentMemories, judgmentFeedbackRecords, winLossCalibrations, taskOutcomes, interventions, interventionOutcomes, playExecutionEvents, stakeholderContactsResult] = await Promise.all([
      getUnifiedMemoryPayload(
        account.id as string,
        account.name as string,
        ctx.orgId,
        windowDays,
        ctx,
      ),
      loadAIAnalysis(account.id as string, ctx.orgId, outputLocale),
      loadJudgmentMemorySources(admin, { accountId: account.id as string, orgId: ctx.orgId }),
      loadJudgmentFeedbacks(admin, { accountId: account.id as string, orgId: ctx.orgId }),
      loadWinLossCalibrations(admin, { accountId: account.id as string, orgId: ctx.orgId }),
      loadTaskOutcomes(admin, { accountId: account.id as string, orgId: ctx.orgId }),
      loadInterventions(admin, { accountId: account.id as string, orgId: ctx.orgId }),
      loadInterventionOutcomes(admin, { accountId: account.id as string, orgId: ctx.orgId }),
      loadPlayExecutionEvents(admin, { accountId: account.id as string, orgId: ctx.orgId }),
      loadAccountContactsForStakeholders(admin, { accountId: account.id as string, orgId: ctx.orgId })
        .then((contacts) => ({ status: 'fulfilled' as const, contacts }))
        .catch((reason) => ({ status: 'rejected' as const, reason })),
    ]);

    const { summary, conflicts, timelineItems, previousSummary, momentumShift, summaryHistory } = memoryPayload;

    // If AI analysis exists, override the JS-computed narrative with AI-generated one
    const enrichedSummary = aiAnalysis ? {
      ...summary,
      narrativeSummary: aiAnalysis.narrative,
      momentum: {
        ...summary.momentum,
        label: aiAnalysis.momentum.label,
        status: aiAnalysis.momentum.status as 'rising' | 'steady' | 'slowing' | 'stalled' | 'at_risk',
      },
    } : summary;

    if (stakeholderContactsResult.status === 'rejected') {
      console.warn('[memory-payload] stakeholder contacts unavailable:', stakeholderContactsResult.reason);
    }

    const accountMomentum = buildAccountMomentumSnapshot({
      accountId: account.id as string,
      summary: enrichedSummary,
      previousSummary,
      momentumShift,
      judgmentMemories,
      recentActivities: timelineItems,
      updatedAt: enrichedSummary.lastComputedAt,
    });

    const stakeholderInterpretations = buildStakeholderInterpretations({
      contacts: stakeholderContactsResult.status === 'fulfilled' ? stakeholderContactsResult.contacts : [],
      summaryPeople: enrichedSummary.people,
      judgmentMemories,
      recentActivities: timelineItems,
      updatedAt: enrichedSummary.lastComputedAt,
      limit: 8,
    });

    const openQuestions = buildAccountOpenQuestions({
      summary: enrichedSummary,
      conflicts,
      timelineItems,
      judgmentMemories,
      stakeholderInterpretations,
      accountMomentum,
      updatedAt: enrichedSummary.lastComputedAt,
      limit: 5,
    });

    const judgmentTimeline = buildJudgmentTimeline({
      accountId: account.id as string,
      judgmentMemories,
      feedbackRevisionRecords: judgmentFeedbackRecords,
      winLossCalibrations,
      taskOutcomes,
      interventions,
      interventionOutcomes,
      playExecutionEvents,
    });

    const judgmentLearning = buildJudgmentLearningSummary({
      interventionOutcomes,
      interventions,
      limit: 4,
    });

    const decodeStabilityTimeline = buildDecodeStabilityTimeline({
      items: judgmentMemories,
      limit: 8,
    });

    const actionPanel = buildJudgmentActionPanelModel({
      judgments: [],
      accountMomentum,
      judgmentMemories,
      feedbackRevisionRecords: judgmentFeedbackRecords,
      winLossCalibrations,
      judgmentTimeline,
    });

    const roleView = buildRoleView({
      role,
      judgmentMemories,
      actionPanel,
      accountMomentum,
      openQuestions,
      judgmentTimeline,
      decodeStabilityTimeline,
    });

    return Response.json({
      summary: enrichedSummary,
      conflicts,
      timelineItems,
      previousSummary,
      momentumShift,
      summaryHistory,
      windowDays,
      aiAnalysis,
      judgmentMemories,
      accountMomentum,
      stakeholderInterpretations,
      openQuestions,
      judgmentFeedbacks: judgmentFeedbackRecords.map((record) => record.feedback),
      revisedJudgmentPreviews: judgmentFeedbackRecords.map((record) => record.revisedPreview).filter(Boolean),
      feedbackRevisionRecords: judgmentFeedbackRecords,
      winLossCalibrations,
      taskOutcomes,
      interventions,
      interventionOutcomes,
      playExecutionEvents,
      judgmentLearning,
      judgmentTimeline,
      decodeStabilityTimeline,
      judgmentStabilityTimeline: decodeStabilityTimeline,
      actionPanel,
      roleView,
    });
  } catch (err) {
    return guardResponse(err);
  }
}
