import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getAuthUser, unauthorizedResponse } from '@/lib/api-auth';
import { requireAdmin, requireRole } from '@/lib/api-guard';
import { getUserContext } from '@/lib/permissions-server';
import { inferEmailAccount, type IntegrationEmail, type AccountHint, type ConnectionHint } from '@/lib/evidence-memory/integration-attribution';
import { verifyJudgmentProvenance } from '@/lib/judgment/provenance-verifier';

const DEMO_USER_EMAIL = 'example-c39293aa15@example.invalid';

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

// POST: Verify demo access password (server-side only)
export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const expected = process.env.DEMO_ACCESS_PASSWORD;
    if (!expected) {
      return NextResponse.json({ ok: false, error: 'Demo 未配置' }, { status: 500 });
    }
    if (!password || typeof password !== 'string' || !safeEqual(password, expected)) {
      return NextResponse.json({ ok: false, error: '密码错误' }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: '服务器错误' }, { status: 500 });
  }
}

type CheckStatus = 'pass' | 'fail' | 'warn';

type CheckCategory =
  | 'accounts'
  | 'relations'
  | 'meddicc'
  | 'evidence-runtime'
  | 'memory'
  | 'judgment-chain'
  | 'ai'
  | 'summary';

interface CheckResult {
  key: string;
  name: string;
  category: CheckCategory;
  status: CheckStatus;
  detail: string;
  meta?: Record<string, unknown>;
}

interface DemoAccountExpectation {
  key: 'renewal' | 'rfp' | 'decodeRisk';
  id: string;
  name: string;
  requiredOpportunityIds: string[];
  minStrategicPlayCount: number;
  primaryOpportunityId: string;
}

interface StrategicPlayRow {
  id: string;
  account_id: string;
  opportunity_id: string | null;
  target_contact_id: string | null;
  goal_description?: string | null;
  situation_judgment?: string | null;
  strategic_objective?: string | null;
  stakeholder_path?: unknown;
  evidence_basis?: unknown;
  risk_counter_evidence?: unknown;
  knowledge_traces?: unknown;
  knowledge_gaps?: unknown;
  evidence_provenance?: Record<string, unknown> | null;
  assumptions?: unknown;
  learnings?: unknown;
  steps?: Array<Record<string, unknown>> | null;
  review?: Record<string, unknown> | null;
  situation_layers?: unknown;
  confidence_profile?: unknown;
  win_gaps?: unknown;
  next_verification_point?: string | null;
}


interface AiInsightRow {
  entity_id: string;
  entity_type: string;
  insight_type: string;
}

interface DecodeRow {
  id: string;
  account_id: string | null;
  opportunity_id: string | null;
  matched_contact_id: string | null;
  user_id: string | null;
  org_id: string | null;
}

interface IntegrationConnectionRow {
  id: string;
  config?: ConnectionHint['config'];
}

interface AiAdviceRow {
  account_id: string | null;
  opportunity_id: string | null;
}

interface AiForecastRow {
  opportunity_id: string | null;
}

interface SourceRecordRow {
  id: string;
  account_id: string | null;
  org_id?: string | null;
  source_kind?: string | null;
  source_table?: string | null;
  source_row_id?: string | null;
  occurred_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface KnowledgeUpdateLogRow {
  id: string;
  account_id: string | null;
}

interface AccountOpenQuestionRow {
  id: string;
  account_id: string | null;
  status?: string | null;
  question?: string | null;
}

interface RfpRow {
  id: string;
  account_id: string | null;
  linked_play_id?: string | null;
  org_id?: string | null;
}

interface RfpAnalysisRow {
  id: string;
  rfp_id: string | null;
  org_id?: string | null;
}

interface ContactOpportunityRoleRow {
  id: string;
  contact_id: string;
  opportunity_id: string;
  role_type: string;
  org_id?: string | null;
}

interface TimelineEventRow {
  id: string;
  account_id: string | null;
  opportunity_id: string | null;
  type: string;
  title: string;
  org_id?: string | null;
}

interface LeadRow {
  id: string;
  company_name: string;
  contact_name: string;
  status: string;
  priority: string;
  estimated_value: number | string | null;
  converted_opportunity_id?: string | null;
  org_id?: string | null;
}

const REQUIRED_DEMO_ACCOUNTS: DemoAccountExpectation[] = [
  {
    key: 'renewal',
    id: 'acc_eastchina_platform_001',
    name: '华东某头部互联网平台',
    requiredOpportunityIds: ['opp_platform_cloud_001', 'opp_platform_test_002'],
    minStrategicPlayCount: 2,
    primaryOpportunityId: 'opp_platform_cloud_001',
  },
  {
    key: 'rfp',
    id: 'acc_chinamobile_002',
    name: '某全国性通信运营商集团',
    requiredOpportunityIds: ['opp_cmcc_5g_003'],
    minStrategicPlayCount: 1,
    primaryOpportunityId: 'opp_cmcc_5g_003',
  },
  {
    key: 'decodeRisk',
    id: 'acc_national_bank_003',
    name: '某全国性股份制银行',
    requiredOpportunityIds: ['opp_bank_app_005'],
    minStrategicPlayCount: 1,
    primaryOpportunityId: 'opp_bank_app_005',
  },
];

const REQUIRED_MEDDICC_FIELDS = [
  'metrics.status',
  'economicBuyer.status',
  'decisionCriteria',
  'decisionProcess',
  'identifiedPain',
  'champion.strength',
  'competition',
  'overallScore',
] as const;

const DEMO_READINESS_CHECKLIST = [
  '运行 POST /api/seed-data 重置当前 demo 数据，确认主展示只有3个Enterprise scenario account',
  '运行 GET /api/verify-demo，确认 failed=0，并重点查看 judgment-chain / Polanyi 主链路',
  'Scenario A：打开华东某头部互联网平台，确认续约/扩容 Account Judgment、Momentum、Tension、Evidence Trace、Strategic Play 可演示',
  'Scenario B：打开某全国性股份制银行，确认Decode保存来源、关系张力、沉默误判修正与win/loss calibration样例可演示',
  'Scenario C：打开某全国性通信运营商 / opp_cmcc_5g_003 RFP tab，确认RFP、竞品、里程碑、证据链、linked Strategic Play 可演示',
  '确认supporting accounts不再进入主demo路径；Dashboard指标应来自3条主线而非十几个杂客户',
] as const;

function emptyGroupedChecks(): Record<CheckCategory, CheckResult[]> {
  return {
    accounts: [],
    relations: [],
    meddicc: [],
    'evidence-runtime': [],
    memory: [],
    'judgment-chain': [],
    ai: [],
    summary: [],
  };
}

function groupChecks(checks: CheckResult[]) {
  return checks.reduce<Record<CheckCategory, CheckResult[]>>(
    (acc, check) => {
      acc[check.category].push(check);
      return acc;
    },
    emptyGroupedChecks(),
  );
}

function isStrategicPlaySchemaError(message: string) {
  return /strategic_plays\.(situation_judgment|strategic_objective|stakeholder_path|evidence_basis|risk_counter_evidence|knowledge_traces|knowledge_gaps|evidence_provenance)|column strategic_plays\.|Could not find the '.*' column of 'strategic_plays'/i.test(message);
}

function buildEarlyFailureResponse(checks: CheckResult[]) {
  const passed = checks.filter((check) => check.status === 'pass').length;
  const warned = checks.filter((check) => check.status === 'warn').length;
  const failed = checks.filter((check) => check.status === 'fail').length;

  return Response.json({
    summary: {
      total: checks.length,
      passed,
      warned,
      failed,
      ready: false,
      overallStatus: 'fail',
      scope: 'Closr current demo assets verification',
    },
    demoAssets: {
      requiredAccounts: REQUIRED_DEMO_ACCOUNTS,
      demoReadinessChecklist: DEMO_READINESS_CHECKLIST,
      evidenceRuntimeTables: [],
      integration: {
        connections: 0,
        emails: 0,
      },
    },
    checks,
    grouped: groupChecks(checks),
  });
}

async function queryOptionalOrgTable<T>(
  orgId: string | null,
  query: () => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
) {
  if (!orgId) {
    return { data: [] as T[], error: null };
  }

  try {
    return await query();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return { data: [] as T[], error: { message } };
  }
}

function toStatus(ok: boolean, warn = false): CheckStatus {
  if (ok) return 'pass';
  return warn ? 'warn' : 'fail';
}

function hasNonEmptyArray(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function hasNumber(value: unknown) {
  return typeof value === 'number' && !Number.isNaN(value);
}

function toUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringifyForReadiness(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(stringifyForReadiness).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(stringifyForReadiness).join(' ');
  return '';
}

function hasStrategicPlayEnterpriseShape(play: StrategicPlayRow | undefined) {
  if (!play) {
    return {
      ready: false,
      stakeholderMap: false,
      customerPains: false,
      solutionFit: false,
      evidenceTrace: false,
      calibrationLoop: false,
      dealPath: false,
      signalLoopQuestion: false,
    };
  }

  const text = stringifyForReadiness([
    play.goal_description,
    play.situation_judgment,
    play.strategic_objective,
    play.stakeholder_path,
    play.evidence_basis,
    play.risk_counter_evidence,
    play.knowledge_traces,
    play.knowledge_gaps,
    play.evidence_provenance,
    play.assumptions,
    play.learnings,
    play.review,
    play.steps,
  ]);
  const review = play.review && typeof play.review === 'object' ? play.review : null;
  const hasCalibration = Boolean(review && 'calibration' in review);
  const stakeholderMap = toUnknownArray(play.stakeholder_path).length > 0 || /stakeholder|关键人|关系局|Champion|采购中心|CTO|经济买家/.test(text);
  const customerPains = /customer pains|客户痛点|痛点|需求局|采购动因|MTTR|SLA|合规|成本|体验/.test(text);
  const solutionFit = /solution fit|value hypothesis|方案局|我方方案|方案fit|价值假设|ROI|AIOps|Flutter|OSS\/BSS|自愈|自动派单/.test(text);
  const evidenceTrace = toUnknownArray(play.evidence_basis).length > 0 || toUnknownArray(play.knowledge_traces).length > 0 || Boolean(play.evidence_provenance) || /Evidence Trace|证据局|证据链|evidenceTrace|source_records/.test(text);
  const calibrationLoop = hasCalibration || toUnknownArray(play.learnings).length > 0 || /calibration|校正|复盘|corrected|判断 → 证据 → 行动 → 复盘/.test(text);
  const steps = Array.isArray(play.steps) ? play.steps : [];
  const dealPath = steps.some((step) => {
    if (!step || typeof step !== 'object') return false;
    const item = step as Record<string, unknown>;
    return typeof item.who === 'string'
      && typeof item.target === 'string'
      && typeof item.expectedOutcome === 'string'
      && (typeof item.assumptionBeingTested === 'string' || typeof item.risk === 'string' || typeof item.fallback === 'string');
  });
  const signalLoopQuestion = toUnknownArray(play.assumptions).some((assumption) => {
    if (!assumption || typeof assumption !== 'object') return false;
    const item = assumption as Record<string, unknown>;
    const assumptionText = stringifyForReadiness(item);
    return /待验证/.test(assumptionText) && /来源 (decode|rfp_analysis):/.test(assumptionText);
  });

  return {
    ready: stakeholderMap && customerPains && solutionFit && evidenceTrace && calibrationLoop && dealPath && signalLoopQuestion,
    stakeholderMap,
    customerPains,
    solutionFit,
    evidenceTrace,
    calibrationLoop,
    dealPath,
    signalLoopQuestion,
  };
}

function getJudgmentMemorySourceKind(row: SourceRecordRow): string | null {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const judgmentMemory = metadata.judgmentMemory;
  if (!judgmentMemory || typeof judgmentMemory !== 'object' || Array.isArray(judgmentMemory)) return null;
  const sourceKind = (judgmentMemory as { sourceKind?: unknown }).sourceKind;
  return typeof sourceKind === 'string' ? sourceKind : null;
}

function getMissingMeddiccFields(meddicc: Record<string, unknown> | null | undefined) {
  if (!meddicc || typeof meddicc !== 'object') return [...REQUIRED_MEDDICC_FIELDS];

  const metrics = meddicc.metrics as { status?: unknown } | undefined;
  const economicBuyer = meddicc.economicBuyer as { status?: unknown } | undefined;
  const champion = meddicc.champion as { strength?: unknown } | undefined;

  const missing: string[] = [];
  if (!metrics?.status) missing.push('metrics.status');
  if (!economicBuyer?.status) missing.push('economicBuyer.status');
  if (!hasNonEmptyArray(meddicc.decisionCriteria)) missing.push('decisionCriteria');
  if (!hasNonEmptyArray(meddicc.decisionProcess)) missing.push('decisionProcess');
  if (!hasNonEmptyArray(meddicc.identifiedPain)) missing.push('identifiedPain');
  if (!hasNumber(champion?.strength)) missing.push('champion.strength');
  if (!hasNonEmptyArray(meddicc.competition)) missing.push('competition');
  if (!hasNumber(meddicc.overallScore)) missing.push('overallScore');

  return missing;
}

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return unauthorizedResponse();

    const userId = authUser.id;
    const ctx = await getUserContext(userId);
    if (!ctx) {
      return Response.json({ error: '未加入组织或组织信息无效' }, { status: 403 });
    }

    const isDemoUser = authUser.email === DEMO_USER_EMAIL;
    let isAdmin = false;
    try {
      requireRole(ctx, 'admin');
      isAdmin = true;
    } catch {
      isAdmin = false;
    }

    if (!isDemoUser && !isAdmin) {
      return Response.json({ error: '仅 demo 账号或管理员可查看 demo 验收摘要' }, { status: 403 });
    }

    const orgId = ctx.orgId;
    const admin = requireAdmin();

    const checks: CheckResult[] = [];

    const [
      { data: accounts, error: accountsError },
      { data: opportunities, error: opportunitiesError },
      { data: contacts, error: contactsError },
      { data: strategicPlays, error: playsError },
      { data: aiInsights, error: insightsError },
      { data: intelItems, error: intelError },
      { data: emailDecodes, error: decodesError },
      { data: meetingPreps, error: meetingError },
      { data: activityLogs, error: activityError },
      { data: tasks, error: tasksError },
      { data: discoveryNotes, error: discoveryNotesError },
      { data: aiAdvices, error: aiAdvicesError },
      { data: aiForecasts, error: aiForecastsError },
      { data: integrationConnections, error: integrationConnectionError },
      { data: integrationEmails, error: integrationError },
      { data: rfps, error: rfpsError },
      { data: rfpAnalyses, error: rfpAnalysesError },
      { data: sourceRecords, error: sourceRecordsError },
      { data: knowledgeUpdateLog, error: knowledgeUpdateLogError },
      { data: accountOpenQuestions, error: accountOpenQuestionsError },
      { data: contactOpportunityRoles, error: contactOpportunityRolesError },
      { data: timelineEvents, error: timelineEventsError },
      { data: leads, error: leadsError },
    ] = await Promise.all([
      admin.from('accounts').select('id, name, industry, deal_stage, deal_health, notes, opportunity_ids, last_activity, user_id, org_id').eq('user_id', userId),
      admin.from('opportunities').select('id, account_id, name, stage, meddicc, user_id, org_id').eq('user_id', userId),
      admin.from('contacts').select('id, account_id, name, role, contact_profile, reports_to, user_id, org_id').eq('user_id', userId),
      queryOptionalOrgTable<StrategicPlayRow>(orgId, () =>
        admin
          .from('strategic_plays')
          .select('id, account_id, opportunity_id, target_contact_id, status, goal_description, confidence, situation_judgment, strategic_objective, stakeholder_path, evidence_basis, risk_counter_evidence, knowledge_traces, knowledge_gaps, evidence_provenance, assumptions, learnings, steps, review, situation_layers, confidence_profile, win_gaps, next_verification_point, org_id, user_id')
          .eq('org_id', orgId!),
      ),
      queryOptionalOrgTable<AiInsightRow>(orgId, () =>
        admin.from('ai_insights').select('id, entity_type, entity_id, insight_type, org_id').eq('org_id', orgId!),
      ),
      admin.from('intel_items').select('id, account_id, opportunity_id, related_contact_ids, user_id, org_id').eq('user_id', userId),
      queryOptionalOrgTable<DecodeRow>(orgId, () =>
        admin
          .from('email_decodes')
          .select('id, account_id, opportunity_id, matched_contact_id, user_id, org_id')
          .eq('org_id', orgId!),
      ),
      admin.from('meeting_preps').select('id, account_id, user_id, org_id').eq('user_id', userId),
      admin.from('activity_logs').select('id, account_id, contact_id, user_id, org_id').eq('user_id', userId),
      admin.from('tasks').select('id, account_id, opportunity_id, user_id, org_id').eq('user_id', userId),
      admin.from('discovery_notes').select('id, opportunity_id, user_id, org_id').eq('user_id', userId),
      queryOptionalOrgTable<AiAdviceRow>(orgId, () =>
        admin.from('ai_advices').select('id, account_id, opportunity_id, org_id').eq('org_id', orgId!),
      ),
      queryOptionalOrgTable<AiForecastRow>(orgId, () =>
        admin.from('ai_forecasts').select('id, opportunity_id, org_id').eq('org_id', orgId!),
      ),
      queryOptionalOrgTable<IntegrationConnectionRow>(orgId, () =>
        admin.from('integration_connections').select('id, connector_id, status, org_id, config').eq('org_id', orgId!),
      ),
      queryOptionalOrgTable<IntegrationEmail>(orgId, () =>
        admin
          .from('integration_emails')
          .select('id, account_id, contact_id, org_id, subject, summary, sender, connection_id')
          .eq('org_id', orgId!),
      ),
      queryOptionalOrgTable<RfpRow>(orgId, () =>
        admin
          .from('rfps')
          .select('id, account_id, linked_play_id, org_id')
          .eq('org_id', orgId!),
      ),
      queryOptionalOrgTable<RfpAnalysisRow>(orgId, () =>
        admin
          .from('rfp_ai_analyses')
          .select('id, rfp_id, org_id')
          .eq('org_id', orgId!),
      ),
      queryOptionalOrgTable<SourceRecordRow>(orgId, () =>
        admin
          .from('source_records')
          .select('id, account_id, source_kind, source_table, source_row_id, metadata, occurred_at, org_id')
          .eq('org_id', orgId!),
      ),
      queryOptionalOrgTable<KnowledgeUpdateLogRow>(orgId, () =>
        admin
          .from('knowledge_update_log')
          .select('id, account_id, trigger_source_id, update_type, changed_pages, changed_claims, org_id')
          .eq('org_id', orgId!),
      ),
      queryOptionalOrgTable<AccountOpenQuestionRow>(orgId, () =>
        admin
          .from('account_open_questions')
          .select('id, account_id, question, status, org_id')
          .eq('org_id', orgId!),
      ),
      queryOptionalOrgTable<ContactOpportunityRoleRow>(orgId, () =>
        admin
          .from('contact_opportunity_roles')
          .select('id, contact_id, opportunity_id, role_type, org_id')
          .eq('org_id', orgId!),
      ),
      queryOptionalOrgTable<TimelineEventRow>(orgId, () =>
        admin
          .from('timeline_events')
          .select('id, account_id, opportunity_id, type, title, org_id')
          .eq('org_id', orgId!),
      ),
      queryOptionalOrgTable<LeadRow>(orgId, () =>
        admin
          .from('leads')
          .select('id, company_name, contact_name, status, priority, estimated_value, converted_opportunity_id, org_id')
          .eq('org_id', orgId!),
      ),
    ]);

    // RFP / source_records / knowledge_update_log / open questions are optional
    // in older demo deployments. Treat their errors as non-fatal so the rest of
    // verification can still run.
    const optionalTableErrors = [rfpsError, rfpAnalysesError, sourceRecordsError, knowledgeUpdateLogError, accountOpenQuestionsError, aiForecastsError, contactOpportunityRolesError, timelineEventsError, leadsError].filter(Boolean);

    const queryErrors = [
      accountsError,
      opportunitiesError,
      contactsError,
      playsError,
      insightsError,
      intelError,
      decodesError,
      meetingError,
      activityError,
      tasksError,
      discoveryNotesError,
      aiAdvicesError,
      integrationConnectionError,
      integrationError,
    ].filter(Boolean);

    if (queryErrors.length > 0) {
      const queryErrorDetails = queryErrors.map((error) => error?.message ?? 'unknown error');
      const schemaErrors = queryErrorDetails.filter(isStrategicPlaySchemaError);

      checks.push({
        key: 'demo-verification-query-errors',
        name: 'Demo verification 数据库查询可执行',
        category: 'summary',
        status: 'fail',
        detail: queryErrorDetails.join(' | '),
        meta: {
          errors: queryErrorDetails,
          likelyMissingStrategicPlayEnterpriseSchema: schemaErrors.length > 0,
          migrationFiles: [
            'supabase/migrations/20260506120000_strategic_play_schema_v1.sql',
            'supabase/migrations/20260506120100_strategic_play_evidence_trace.sql',
          ],
        },
      });

      if (schemaErrors.length > 0) {
        checks.push({
          key: 'strategic-play-enterprise-schema',
          name: 'Strategic Play Enterprise schema 已应用',
          category: 'judgment-chain',
          status: 'fail',
          detail: 'strategic_plays 缺少 Enterprise demo 必需列；请应用 idempotent ADD COLUMN migration 后重新 seed/verify',
          meta: {
            requiredColumns: [
              'situation_judgment',
              'strategic_objective',
              'stakeholder_path',
              'evidence_basis',
              'risk_counter_evidence',
              'knowledge_traces',
              'knowledge_gaps',
              'evidence_provenance',
            ],
          },
        });
      }

      return buildEarlyFailureResponse(checks);
    }

    if (optionalTableErrors.length > 0) {
      console.warn('[verify-demo] Optional table query warnings (non-fatal):', optionalTableErrors.map((e) => e?.message));
    }

    const criticalJudgmentMemoryTableErrors = [rfpsError, rfpAnalysesError, sourceRecordsError].filter(Boolean);

    const accountList = accounts ?? [];
    const opportunityList = opportunities ?? [];
    const contactList = contacts ?? [];
    const playList = (strategicPlays ?? []) as StrategicPlayRow[];
    const insightList = (aiInsights ?? []) as AiInsightRow[];
    const intelList = intelItems ?? [];
    const decodeList = emailDecodes ?? [];
    const meetingList = meetingPreps ?? [];
    const activityList = activityLogs ?? [];
    const sourceRecordList = (sourceRecords ?? []) as SourceRecordRow[];
    const knowledgeUpdateLogList = (knowledgeUpdateLog ?? []) as KnowledgeUpdateLogRow[];
    const accountOpenQuestionList = (accountOpenQuestions ?? []) as AccountOpenQuestionRow[];
    const taskList = tasks ?? [];
    const discoveryNoteList = discoveryNotes ?? [];
    const aiAdviceList = (aiAdvices ?? []) as AiAdviceRow[];
    const aiForecastList = (aiForecasts ?? []) as AiForecastRow[];
    const integrationConnectionList = (integrationConnections ?? []) as IntegrationConnectionRow[];
    const integrationEmailList = (integrationEmails ?? []) as IntegrationEmail[];
    const rfpList = (rfps ?? []) as RfpRow[];
    const rfpAnalysisList = (rfpAnalyses ?? []) as RfpAnalysisRow[];
    const contactOpportunityRoleList = (contactOpportunityRoles ?? []) as ContactOpportunityRoleRow[];
    const timelineEventList = (timelineEvents ?? []) as TimelineEventRow[];
    const leadList = (leads ?? []) as LeadRow[];

    const accountById = new Map(accountList.map((account) => [account.id, account]));
    const opportunitiesByAccount = new Map<string, typeof opportunityList>();
    const playsByAccount = new Map<string, typeof playList>();
    const contactsByAccount = new Map<string, typeof contactList>();

    for (const opportunity of opportunityList) {
      const current = opportunitiesByAccount.get(opportunity.account_id) ?? [];
      current.push(opportunity);
      opportunitiesByAccount.set(opportunity.account_id, current);
    }

    for (const play of playList) {
      const current = playsByAccount.get(play.account_id) ?? [];
      current.push(play);
      playsByAccount.set(play.account_id, current);
    }

    for (const contact of contactList) {
      const current = contactsByAccount.get(contact.account_id) ?? [];
      current.push(contact);
      contactsByAccount.set(contact.account_id, current);
    }

    checks.push({
      key: 'org-context',
      name: '组织上下文',
      category: 'summary',
      status: orgId ? 'pass' : 'warn',
      detail: orgId ? `已识别 org_id: ${orgId}` : '未识别 org_id，已按 user_id 继续校验；部分 org 级检查降级',
      meta: { orgId: orgId ?? null },
    });

    checks.push({
      key: 'judgment-memory-verification-tables',
      name: 'Judgment Memory 验收表可查询',
      category: 'memory',
      status: criticalJudgmentMemoryTableErrors.length === 0 ? 'pass' : 'fail',
      detail: criticalJudgmentMemoryTableErrors.length === 0
        ? 'rfps / rfp_ai_analyses / source_records 查询正常'
        : criticalJudgmentMemoryTableErrors.map((error) => error?.message ?? 'unknown error').join(' | '),
      meta: {
        rfps: rfpsError?.message ?? null,
        rfpAnalyses: rfpAnalysesError?.message ?? null,
        sourceRecords: sourceRecordsError?.message ?? null,
      },
    });

    for (const expected of REQUIRED_DEMO_ACCOUNTS) {
      const account = accountById.get(expected.id);
      const accountOpportunities = opportunitiesByAccount.get(expected.id) ?? [];
      const accountPlays = playsByAccount.get(expected.id) ?? [];
      const accountContacts = contactsByAccount.get(expected.id) ?? [];

      const exists = Boolean(account);
      const missingOpportunityIds = expected.requiredOpportunityIds.filter((opportunityId) => !accountOpportunities.some((opportunity) => opportunity.id === opportunityId));
      const danglingOpportunityRefs = (account?.opportunity_ids ?? []).filter(
        (opportunityId: string) => !accountOpportunities.some((opportunity) => opportunity.id === opportunityId),
      );
      const primaryOpportunity = accountOpportunities.find((opportunity) => opportunity.id === expected.primaryOpportunityId);
      const relatedTasks = taskList.filter((task) => task.account_id === expected.id || (task.opportunity_id && expected.requiredOpportunityIds.includes(task.opportunity_id)));
      const relatedDiscoveryNotes = discoveryNoteList.filter((note) => note.opportunity_id && expected.requiredOpportunityIds.includes(note.opportunity_id));
      const relatedForecasts = aiForecastList.filter((forecast) => forecast.opportunity_id && expected.requiredOpportunityIds.includes(forecast.opportunity_id));
      const relatedAdvices = aiAdviceList.filter((advice) => advice.account_id === expected.id || (advice.opportunity_id && expected.requiredOpportunityIds.includes(advice.opportunity_id)));
      const accountPlayLinksBroken = accountPlays.filter(
        (play) => !play.account_id || !play.opportunity_id || !accountOpportunities.some((opportunity) => opportunity.id === play.opportunity_id),
      );
      const targetContactsMissing = accountPlays.filter(
        (play) => play.target_contact_id && !accountContacts.some((contact) => contact.id === play.target_contact_id),
      );
      const primaryMeddiccMissingFields = getMissingMeddiccFields((primaryOpportunity?.meddicc as Record<string, unknown> | undefined) ?? undefined);

      checks.push({
        key: `account-${expected.key}`,
        name: `${expected.name} demo account 存在`,
        category: 'accounts',
        status: exists ? 'pass' : 'fail',
        detail: exists ? `account ${expected.id} 已存在` : `缺少 demo account: ${expected.id}`,
        meta: { accountId: expected.id, expectedName: expected.name },
      });

      checks.push({
        key: `account-fields-${expected.key}`,
        name: `${expected.name} account 核心字段完整`,
        category: 'accounts',
        status:
          account && account.industry && account.deal_stage && account.deal_health && account.notes && account.last_activity
            ? 'pass'
            : exists
              ? 'warn'
              : 'fail',
        detail:
          account
            ? `industry=${Boolean(account.industry)} stage=${Boolean(account.deal_stage)} health=${Boolean(account.deal_health)} notes=${Boolean(account.notes)} last_activity=${Boolean(account.last_activity)}`
            : 'account 不存在，无法校验字段',
      });

      checks.push({
        key: `relations-${expected.key}`,
        name: `${expected.name} account / opportunity / strategic play 关联`,
        category: 'relations',
        status: toStatus(
          exists &&
            missingOpportunityIds.length === 0 &&
            danglingOpportunityRefs.length === 0 &&
            accountPlays.length >= expected.minStrategicPlayCount &&
            accountPlayLinksBroken.length === 0 &&
            targetContactsMissing.length === 0,
        ),
        detail: [
          `opportunities=${accountOpportunities.length}`,
          `plays=${accountPlays.length}`,
          `missingOpportunityIds=${missingOpportunityIds.length ? missingOpportunityIds.join(', ') : 'none'}`,
          `danglingOpportunityRefs=${danglingOpportunityRefs.length ? danglingOpportunityRefs.join(', ') : 'none'}`,
          `brokenPlayLinks=${accountPlayLinksBroken.length}`,
          `missingTargetContacts=${targetContactsMissing.length}`,
        ].join(' | '),
        meta: {
          accountId: expected.id,
          requiredOpportunityIds: expected.requiredOpportunityIds,
          primaryOpportunityId: expected.primaryOpportunityId,
        },
      });

      checks.push({
        key: `meddicc-${expected.key}`,
        name: `${expected.name} 主线商机 MEDDICC 完整`,
        category: 'meddicc',
        status: toStatus(Boolean(primaryOpportunity) && primaryMeddiccMissingFields.length === 0),
        detail: primaryOpportunity
          ? primaryMeddiccMissingFields.length === 0
            ? `${primaryOpportunity.id} MEDDICC 关键字段齐全`
            : `${primaryOpportunity.id} 缺少字段: ${primaryMeddiccMissingFields.join(', ')}`
          : `缺少主线商机 ${expected.primaryOpportunityId}`,
        meta: {
          opportunityId: expected.primaryOpportunityId,
          missingFields: primaryMeddiccMissingFields,
          requiredFields: REQUIRED_MEDDICC_FIELDS,
        },
      });

      checks.push({
        key: `demo-surface-${expected.key}`,
        name: `${expected.name} demo surface 资产可读`,
        category: 'summary',
        status: toStatus(relatedTasks.length > 0 && relatedDiscoveryNotes.length > 0 && relatedAdvices.length > 0, relatedForecasts.length > 0),
        detail: [
          `tasks=${relatedTasks.length}`,
          `discoveryNotes=${relatedDiscoveryNotes.length}`,
          `aiAdvices=${relatedAdvices.length}`,
          `aiForecasts=${relatedForecasts.length}`,
        ].join(' | '),
        meta: {
          accountId: expected.id,
          opportunityIds: expected.requiredOpportunityIds,
        },
      });
    }

    const requiredInsightPairs = [
      { entityId: 'acc_eastchina_platform_001', entityType: 'account', insightType: 'action', label: '华东某头部互联网平台 action insight' },
      { entityId: 'opp_platform_cloud_001', entityType: 'opportunity', insightType: 'health', label: '平台云基础设施运维 health insight' },
      { entityId: 'acc_national_bank_003', entityType: 'account', insightType: 'impact', label: '该银行 impact insight' },
    ];

    const missingInsightPairs = requiredInsightPairs.filter(
      (required) =>
        !insightList.some(
          (insight) =>
            insight.entity_id === required.entityId &&
            insight.entity_type === required.entityType &&
            insight.insight_type === required.insightType,
        ),
    );

    checks.push({
      key: 'ai-demo-insights',
      name: 'Demo AI insights 存在',
      category: 'ai',
      status: toStatus(missingInsightPairs.length === 0, insightList.length > 0),
      detail:
        missingInsightPairs.length === 0
          ? `已找到 ${requiredInsightPairs.length}/${requiredInsightPairs.length} 个关键 insight`
          : `缺少: ${missingInsightPairs.map((item) => item.label).join(', ')}`,
      meta: {
        totalInsights: insightList.length,
        required: requiredInsightPairs,
      },
    });

    const evidenceTables = [
      { key: 'intel_items', rows: intelList, min: 1 },
      { key: 'email_decodes', rows: decodeList, min: 1 },
      { key: 'meeting_preps', rows: meetingList, min: 1 },
      { key: 'activity_logs', rows: activityList, min: 1 },
      { key: 'strategic_plays', rows: playList, min: 1 },
      { key: 'contacts', rows: contactList, min: 1 },
      { key: 'integration_connections', rows: integrationConnectionList, min: 1 },
      { key: 'integration_emails', rows: integrationEmailList, min: 1 },
      { key: 'source_records', rows: sourceRecordList, min: 0 },
      { key: 'knowledge_update_log', rows: knowledgeUpdateLogList, min: 0 },
      { key: 'account_open_questions', rows: accountOpenQuestionList, min: 0 },
    ];

    const missingRequiredEvidenceTables = evidenceTables.filter((table) => table.min > 0 && table.rows.length < table.min);
    const runtimeAccountIds = new Set(['acc_eastchina_platform_001', 'acc_chinamobile_002', 'acc_national_bank_003']);

    // ── Integration email → account inference ──────────────────────────
    const accountHints: AccountHint[] = accountList.map((a) => ({ id: a.id, name: a.name }));
    const connectionHints: ConnectionHint[] = integrationConnectionList.map((c) => ({
      id: c.id,
      config: typeof c.config === 'object' ? (c.config as ConnectionHint['config']) : null,
    }));

    const integrationAttributions = integrationEmailList.map((email) => {
      const attribution = inferEmailAccount(
        email as IntegrationEmail,
        accountHints,
        connectionHints,
      );
      return { email, attribution };
    });

    const huaweiDirectEmails = integrationEmailList.filter((row) => row.account_id === 'acc_eastchina_platform_001').length;
    const huaweiInferredEmails = integrationAttributions.filter(
      (r) => r.attribution.accountId === 'acc_eastchina_platform_001' && r.attribution.matchMethod !== 'direct',
    );
    const huaweiTotalIntegrationEmails = huaweiDirectEmails + huaweiInferredEmails.length;

    const huaweiEvidenceCoverage = {
      intel: intelList.filter((row) => row.account_id === 'acc_eastchina_platform_001').length,
      decodes: decodeList.filter((row) => row.account_id === 'acc_eastchina_platform_001').length,
      meetings: meetingList.filter((row) => row.account_id === 'acc_eastchina_platform_001').length,
      activityLogs: activityList.filter((row) => row.account_id === 'acc_eastchina_platform_001').length,
      plays: playList.filter((row) => row.account_id === 'acc_eastchina_platform_001').length,
      contacts: contactList.filter((row) => row.account_id === 'acc_eastchina_platform_001').length,
      integrationEmails: huaweiTotalIntegrationEmails,
      integrationEmailsDirect: huaweiDirectEmails,
      integrationEmailsInferred: huaweiInferredEmails.length,
      sourceRecords: sourceRecordList.filter((row) => row.account_id === 'acc_eastchina_platform_001').length,
      knowledgeUpdates: knowledgeUpdateLogList.filter((row) => row.account_id === 'acc_eastchina_platform_001').length,
    };

    const huaweiEvidenceSourceKinds = [
      huaweiEvidenceCoverage.intel > 0 ? 'intel' : null,
      huaweiEvidenceCoverage.decodes > 0 ? 'decode' : null,
      huaweiEvidenceCoverage.meetings > 0 ? 'meeting' : null,
      huaweiEvidenceCoverage.activityLogs > 0 ? 'activity' : null,
      huaweiEvidenceCoverage.plays > 0 ? 'play' : null,
      huaweiEvidenceCoverage.integrationEmails > 0 ? 'integration_email' : null,
      huaweiEvidenceCoverage.sourceRecords > 0 ? 'source_record' : null,
      huaweiEvidenceCoverage.knowledgeUpdates > 0 ? 'knowledge_update' : null,
    ].filter(Boolean) as string[];

    const huaweiRfpIds = new Set(rfpList.filter((row) => row.account_id === 'acc_eastchina_platform_001').map((row) => row.id));
    const huaweiRfpAnalysisCount = rfpAnalysisList.filter((row) => row.rfp_id && huaweiRfpIds.has(row.rfp_id)).length;
    const huaweiJudgmentMemorySources = sourceRecordList
      .filter((row) => row.account_id === 'acc_eastchina_platform_001')
      .map((row) => getJudgmentMemorySourceKind(row))
      .filter((sourceKind): sourceKind is string => Boolean(sourceKind));
    const huaweiJudgmentMemoryCounts = {
      decode: huaweiJudgmentMemorySources.filter((sourceKind) => sourceKind === 'decode').length,
      rfp_analysis: huaweiJudgmentMemorySources.filter((sourceKind) => sourceKind === 'rfp_analysis').length,
      strategic_play: huaweiJudgmentMemorySources.filter((sourceKind) => sourceKind === 'strategic_play').length,
    };
    const huaweiExpectedJudgmentMemoryKinds = [
      huaweiEvidenceCoverage.decodes > 0 ? 'decode' : null,
      huaweiRfpAnalysisCount > 0 ? 'rfp_analysis' : null,
      huaweiEvidenceCoverage.plays > 0 ? 'strategic_play' : null,
    ].filter(Boolean) as Array<keyof typeof huaweiJudgmentMemoryCounts>;
    const huaweiMissingJudgmentMemoryKinds = huaweiExpectedJudgmentMemoryKinds.filter((sourceKind) => huaweiJudgmentMemoryCounts[sourceKind] === 0);

    const judgmentProvenance = verifyJudgmentProvenance({
      orgId,
      accounts: REQUIRED_DEMO_ACCOUNTS,
      sourceRecords: sourceRecordList,
      emailDecodes: decodeList,
      strategicPlays: playList,
      rfps: rfpList,
      rfpAnalyses: rfpAnalysisList,
    });
    const huaweiProvenance = judgmentProvenance.accounts.find((account) => account.accountId === 'acc_eastchina_platform_001');

    const scenarioAccountIds = new Set(['acc_eastchina_platform_001', 'acc_chinamobile_002', 'acc_national_bank_003']);
    const nonScenarioAccounts = accountList.filter((account) => !scenarioAccountIds.has(account.id));
    const rfpScenarioRows = rfpList.filter((row) => row.account_id === 'acc_chinamobile_002');
    const rfpScenarioIds = new Set(rfpScenarioRows.map((row) => row.id));
    const rfpScenarioAnalyses = rfpAnalysisList.filter((row) => row.rfp_id && rfpScenarioIds.has(row.rfp_id));
    const rfpLinkedPlayIds = new Set(rfpScenarioRows.map((row) => row.linked_play_id).filter((id): id is string => typeof id === 'string' && id.length > 0));
    const directlyLinkedRfpPlays = playList.filter((play) => rfpLinkedPlayIds.has(play.id));
    const rfpOpportunityPlays = playList.filter((play) => play.opportunity_id === 'opp_cmcc_5g_003');
    const rfpLinkedPlays = [...directlyLinkedRfpPlays, ...rfpOpportunityPlays.filter((play) => !rfpLinkedPlayIds.has(play.id))];
    const primaryRfpLinkedPlay = directlyLinkedRfpPlays.find((play) => hasStrategicPlayEnterpriseShape(play).ready)
      ?? directlyLinkedRfpPlays[0]
      ?? rfpOpportunityPlays.find((play) => hasStrategicPlayEnterpriseShape(play).ready)
      ?? rfpOpportunityPlays[0];
    const rfpJudgmentMemoryRows = sourceRecordList.filter((row) => row.account_id === 'acc_chinamobile_002' && getJudgmentMemorySourceKind(row) === 'rfp_analysis');
    const decodeSavedSourceRows = sourceRecordList.filter((row) => row.account_id === 'acc_national_bank_003' && getJudgmentMemorySourceKind(row) === 'decode');
    const decodeHumanFeedbackRows = sourceRecordList.filter(
      (row) => row.account_id === 'acc_national_bank_003' && row.source_kind === 'human_feedback' && row.source_table === 'judgment_feedback',
    );
    const decodeReviewedPlays = playList.filter((play) => play.account_id === 'acc_national_bank_003' && play.review && typeof play.review === 'object');
    const primaryScenarioPlays = [
      { key: 'renewal', label: '续约扩张 Strategic Play', play: playList.find((play) => play.account_id === 'acc_eastchina_platform_001' && play.opportunity_id === 'opp_platform_cloud_001') },
      { key: 'decodeRisk', label: '关系风险 Strategic Play', play: playList.find((play) => play.account_id === 'acc_national_bank_003' && play.opportunity_id === 'opp_bank_app_005') },
      { key: 'rfp', label: 'RFP linked Strategic Play', play: primaryRfpLinkedPlay },
    ];
    const primaryScenarioPlayShapes = primaryScenarioPlays.map((item) => ({
      key: item.key,
      label: item.label,
      playId: item.play?.id ?? null,
      ...hasStrategicPlayEnterpriseShape(item.play),
    }));
    const missingStrategicPlayShape = primaryScenarioPlayShapes.filter((item) => !item.ready);

    checks.push({
      key: 'demo-three-scenario-focus',
      name: 'Demo seed 聚焦3个重点客户 / 3个scenario',
      category: 'summary',
      status: nonScenarioAccounts.length === 0 ? 'pass' : 'warn',
      detail: `scenarioAccounts=${accountList.length - nonScenarioAccounts.length} | nonScenarioAccounts=${nonScenarioAccounts.length}`,
      meta: { nonScenarioAccountIds: nonScenarioAccounts.map((account) => account.id) },
    });

    checks.push({
      key: 'scenario-rfp-linked-play',
      name: 'Scenario C RFP / 招投标证据链与关联谋局可演示',
      category: 'judgment-chain',
      status: rfpScenarioRows.length > 0 && rfpScenarioAnalyses.length > 0 && rfpLinkedPlays.length > 0 && rfpJudgmentMemoryRows.length > 0 ? 'pass' : 'fail',
      detail: [
        `rfps=${rfpScenarioRows.length}`,
        `analyses=${rfpScenarioAnalyses.length}`,
        `linkedPlays=${rfpLinkedPlays.length}`,
        `rfpJudgmentSources=${rfpJudgmentMemoryRows.length}`,
      ].join(' | '),
      meta: {
        rfpIds: rfpScenarioRows.map((row) => row.id),
        analysisIds: rfpScenarioAnalyses.map((row) => row.id),
        linkedPlayIds: rfpLinkedPlays.map((play) => play.id),
        sourceRecordIds: rfpJudgmentMemoryRows.map((row) => row.id),
      },
    });

    checks.push({
      key: 'scenario-decode-calibration-loop',
      name: 'Scenario B Decode source / 关系风险 / win-loss calibration 可演示',
      category: 'judgment-chain',
      status: decodeSavedSourceRows.length > 0 && decodeHumanFeedbackRows.length > 0 && decodeReviewedPlays.length > 0 ? 'pass' : 'fail',
      detail: [
        `decodeJudgmentSources=${decodeSavedSourceRows.length}`,
        `humanFeedback=${decodeHumanFeedbackRows.length}`,
        `reviewedPlays=${decodeReviewedPlays.length}`,
      ].join(' | '),
      meta: {
        decodeSourceRecordIds: decodeSavedSourceRows.map((row) => row.id),
        feedbackSourceRecordIds: decodeHumanFeedbackRows.map((row) => row.id),
        reviewedPlayIds: decodeReviewedPlays.map((play) => play.id),
      },
    });

    checks.push({
      key: 'strategic-play-enterprise-shape',
      name: 'Strategic Play 包含关系局/需求局/方案局/证据局/校正闭环/P3-P4演示字段',
      category: 'judgment-chain',
      status: missingStrategicPlayShape.length === 0 ? 'pass' : 'fail',
      detail: missingStrategicPlayShape.length === 0
        ? '3条主线 Strategic Play 均包含 stakeholder map、customer pains、solution fit/value hypothesis、Evidence Trace、calibration loop、单局赢单路径与信号待验证问题'
        : `缺少结构化谋局字段: ${missingStrategicPlayShape.map((item) => item.label).join(', ')}`,
      meta: {
        scenarios: primaryScenarioPlayShapes,
      },
    });

    const primaryOpportunityIds = REQUIRED_DEMO_ACCOUNTS.map((account) => account.primaryOpportunityId);
    const primaryRoutePlanPlays = playList.filter((play) =>
      play.opportunity_id && primaryOpportunityIds.includes(play.opportunity_id)
      && Array.isArray(play.situation_layers) && play.situation_layers.length >= 4
      && Array.isArray(play.win_gaps) && play.win_gaps.length > 0
      && typeof play.confidence_profile === 'object' && play.confidence_profile !== null
      && typeof play.next_verification_point === 'string' && play.next_verification_point.length > 0,
    );
    const primaryRoles = contactOpportunityRoleList.filter((role) => primaryOpportunityIds.includes(role.opportunity_id));
    const primaryTimelineEvents = timelineEventList.filter((event) => event.opportunity_id && primaryOpportunityIds.includes(event.opportunity_id));

    checks.push({
      key: 'crm-batch3-demo-seed',
      name: '批次3 Demo Seed 2.0 支撑 Workbench / 谋局2.0 / 角色时间线',
      category: 'judgment-chain',
      status: primaryRoutePlanPlays.length >= 3 && primaryRoles.length >= 6 && primaryTimelineEvents.length >= 3 ? 'pass' : 'warn',
      detail: [
        `routePlanV2=${primaryRoutePlanPlays.length}/3`,
        `opportunityRoles=${primaryRoles.length}`,
        `timelineEvents=${primaryTimelineEvents.length}`,
      ].join(' | '),
      meta: {
        routePlanPlayIds: primaryRoutePlanPlays.map((play) => play.id),
        roleOpportunityIds: [...new Set(primaryRoles.map((role) => role.opportunity_id))],
        timelineOpportunityIds: [...new Set(primaryTimelineEvents.map((event) => event.opportunity_id))],
      },
    });

    const openSeedLeads = leadList.filter((lead) => lead.status !== 'converted' && lead.status !== 'disqualified');
    const qualifiedSeedLeads = leadList.filter((lead) => lead.status === 'qualified');
    const leadPipelineValue = openSeedLeads.reduce((sum, lead) => sum + Number(lead.estimated_value ?? 0), 0);

    checks.push({
      key: 'crm-batch5-demo-lead-intake',
      name: '批次5 Demo 可演示线索池 / Workbench / 转化入口',
      category: 'summary',
      status: leadList.length >= 3 && openSeedLeads.length >= 2 && qualifiedSeedLeads.length >= 1 && leadPipelineValue > 0 ? 'pass' : 'warn',
      detail: [
        `leads=${leadList.length}`,
        `open=${openSeedLeads.length}`,
        `qualified=${qualifiedSeedLeads.length}`,
        `openValue=${leadPipelineValue}`,
      ].join(' | '),
      meta: {
        leadIds: leadList.map((lead) => lead.id),
        qualifiedLeadIds: qualifiedSeedLeads.map((lead) => lead.id),
      },
    });

    const huaweiPrimaryPlay = playList.find((play) => play.opportunity_id === 'opp_platform_cloud_001');
    const huaweiPrimaryPlayTargetExists = Boolean(
      huaweiPrimaryPlay?.target_contact_id && contactList.some((contact) => contact.id === huaweiPrimaryPlay.target_contact_id),
    );
    const huaweiPlayExecutionRecords = sourceRecordList.filter((row) => {
      const event = row.metadata?.playExecutionEvent as Record<string, unknown> | undefined;
      return row.account_id === 'acc_eastchina_platform_001'
        && row.source_kind === 'play_execution_event'
        && row.source_table === 'strategic_plays'
        && typeof event?.playId === 'string'
        && playList.some((play) => play.id === event.playId);
    });
    const huaweiBlockedExecutionRecords = huaweiPlayExecutionRecords.filter((row) => {
      const event = row.metadata?.playExecutionEvent as Record<string, unknown> | undefined;
      return event?.status === 'blocked' || event?.status === 'invalidated';
    });
    const huaweiPrimaryPlayHasExecutableState = Array.isArray(huaweiPrimaryPlay?.steps)
      && huaweiPrimaryPlay.steps.some((step) => ['done', 'completed', 'blocked', 'invalidated'].includes(String(step.status)));
    const huaweiOpenQuestions = accountOpenQuestionList.filter((row) => row.account_id === 'acc_eastchina_platform_001' && row.status !== 'resolved');
    const huaweiPlayExecutionSourceTraces = huaweiPlayExecutionRecords.filter((row) => Boolean(row.source_table && row.source_row_id));

    const huaweiEvidenceReady =
      huaweiEvidenceCoverage.intel > 0 &&
      huaweiEvidenceCoverage.decodes > 0 &&
      huaweiEvidenceCoverage.meetings > 0 &&
      huaweiEvidenceCoverage.activityLogs > 0 &&
      huaweiEvidenceCoverage.plays > 0 &&
      huaweiEvidenceCoverage.contacts > 0;

    checks.push({
      key: 'evidence-runtime-core',
      name: 'Evidence Memory runtime 核心表可用',
      category: 'evidence-runtime',
      status: toStatus(missingRequiredEvidenceTables.length === 0),
      detail:
        missingRequiredEvidenceTables.length === 0
          ? evidenceTables.map((table) => `${table.key}=${table.rows.length}`).join(' | ')
          : `缺少核心表数据: ${missingRequiredEvidenceTables.map((table) => table.key).join(', ')}`,
      meta: {
        runtimeTables: evidenceTables.map((table) => ({ key: table.key, count: table.rows.length, required: table.min > 0 })),
      },
    });

    checks.push({
      key: 'evidence-huawei-path',
      name: '华东某头部互联网平台 Evidence Memory 主演示链路完整',
      category: 'evidence-runtime',
      status: huaweiEvidenceReady ? 'pass' : 'fail',
      detail: Object.entries(huaweiEvidenceCoverage)
        .map(([key, value]) => `${key}=${value}`)
        .join(' | '),
      meta: huaweiEvidenceCoverage,
    });

    checks.push({
      key: 'memory-huawei-runtime-shape',
      name: '华东某头部互联网平台 account memory 运行时素材充足',
      category: 'memory',
      status: toStatus(huaweiEvidenceSourceKinds.length >= 5, huaweiEvidenceSourceKinds.length >= 4),
      detail: `sourceKinds=${huaweiEvidenceSourceKinds.join(', ') || 'none'} | primaryPlay=${huaweiPrimaryPlay?.id ?? 'missing'} | targetLinked=${huaweiPrimaryPlayTargetExists}`,
      meta: {
        sourceKinds: huaweiEvidenceSourceKinds,
        primaryPlayId: huaweiPrimaryPlay?.id ?? null,
        primaryPlayTargetId: huaweiPrimaryPlay?.target_contact_id ?? null,
        primaryPlayTargetExists: huaweiPrimaryPlayTargetExists,
      },
    });

    const huaweiPlayExecutionLoopReady = huaweiPlayExecutionRecords.length >= 2 && huaweiBlockedExecutionRecords.length >= 1 && huaweiPrimaryPlayHasExecutableState;

    checks.push({
      key: 'play-execution-demo-loop',
      name: '华东某头部互联网平台 Play Execution 闭环可演示',
      category: 'memory',
      // Play execution write-back is a v2 enrichment. Do not fail the whole demo
      // readiness gate when older but still coherent demo seeds have the primary
      // play and evidence memory but lack execution-event samples.
      status: huaweiPlayExecutionLoopReady ? 'pass' : huaweiPrimaryPlay ? 'warn' : 'fail',
      detail: [
        `events=${huaweiPlayExecutionRecords.length}`,
        `blockedOrInvalidated=${huaweiBlockedExecutionRecords.length}`,
        `primaryPlayExecutableState=${huaweiPrimaryPlayHasExecutableState}`,
        `primaryPlay=${huaweiPrimaryPlay?.id ?? 'missing'}`,
      ].join(' | '),
      meta: {
        primaryPlayId: huaweiPrimaryPlay?.id ?? null,
        sourceRecordIds: huaweiPlayExecutionRecords.map((row) => row.id),
        blockedSourceRecordIds: huaweiBlockedExecutionRecords.map((row) => row.id),
      },
    });

    checks.push({
      key: 'memory-huawei-persisted-judgment-sources',
      name: '华东某头部互联网平台 persisted Judgment Memory 来源已补种',
      category: 'memory',
      status: huaweiMissingJudgmentMemoryKinds.length === 0 ? 'pass' : 'fail',
      detail: [
        `decode=${huaweiJudgmentMemoryCounts.decode}`,
        `rfp_analysis=${huaweiJudgmentMemoryCounts.rfp_analysis}`,
        `strategic_play=${huaweiJudgmentMemoryCounts.strategic_play}`,
        `expected=${huaweiExpectedJudgmentMemoryKinds.join(', ') || 'none'}`,
        `missing=${huaweiMissingJudgmentMemoryKinds.join(', ') || 'none'}`,
      ].join(' | '),
      meta: {
        counts: huaweiJudgmentMemoryCounts,
        expectedKinds: huaweiExpectedJudgmentMemoryKinds,
        missingKinds: huaweiMissingJudgmentMemoryKinds,
        rfpAnalyses: huaweiRfpAnalysisCount,
      },
    });

    checks.push({
      key: 'judgment-provenance-p0',
      name: 'Judgment OS P0 evidence provenance 安全校验',
      category: 'memory',
      status: judgmentProvenance.status,
      detail: [
        `accounts=${judgmentProvenance.totals.accounts}`,
        `passed=${judgmentProvenance.totals.passed}`,
        `failed=${judgmentProvenance.totals.failed}`,
        `persisted=${judgmentProvenance.totals.persisted}`,
        `derived=${judgmentProvenance.totals.derived}`,
        `missing=${judgmentProvenance.totals.missing}`,
        `invalid=${judgmentProvenance.totals.invalid}`,
      ].join(' | '),
      meta: {
        status: judgmentProvenance.status,
        totals: judgmentProvenance.totals,
        accounts: judgmentProvenance.accounts,
      },
    });

    const huaweiPolanyiCoreReady = Boolean(huaweiProvenance && huaweiProvenance.status === 'pass') && huaweiEvidenceReady;
    const huaweiPolanyiV2LoopReady = huaweiPolanyiCoreReady
      && huaweiPlayExecutionRecords.length >= 2
      && huaweiOpenQuestions.length > 0
      && huaweiEvidenceCoverage.knowledgeUpdates > 0;

    checks.push({
      key: 'polanyi-hero-chain',
      name: 'Polanyi / Judgment Layer 主演示链路闭合',
      category: 'judgment-chain',
      status: huaweiPolanyiV2LoopReady ? 'pass' : huaweiPolanyiCoreReady ? 'warn' : 'fail',
      detail: [
        `decode/knowledge=${huaweiEvidenceReady ? 'ready' : 'missing'}`,
        `judgmentProvenance=${huaweiProvenance?.status ?? 'missing'}`,
        `playExecutionEvents=${huaweiPlayExecutionRecords.length}`,
        `knowledgeGaps=${huaweiOpenQuestions.length}`,
        `knowledgeUpdates=${huaweiEvidenceCoverage.knowledgeUpdates}`,
      ].join(' | '),
      meta: {
        chain: [
          'Decode / 客户知识',
          'traceable judgment',
          'Strategic Play',
          'play step execution',
          'outcome/source_records write-back',
          'timeline / pattern learning / portfolio signal',
          'next judgment improves',
        ],
        huaweiProvenance,
        openQuestions: huaweiOpenQuestions.map((row) => ({ id: row.id, question: row.question ?? null, status: row.status ?? null })),
      },
    });

    const huaweiSourceTraceWritebackReady = huaweiPlayExecutionSourceTraces.length >= 2
      && huaweiBlockedExecutionRecords.length >= 1
      && huaweiEvidenceCoverage.knowledgeUpdates > 0;

    checks.push({
      key: 'hero-source-trace-writeback',
      name: 'Hero source trace / learning loop 样本可追溯',
      category: 'judgment-chain',
      status: huaweiSourceTraceWritebackReady ? 'pass' : huaweiPolanyiCoreReady ? 'warn' : 'fail',
      detail: [
        `sourceTraceEvents=${huaweiPlayExecutionSourceTraces.length}`,
        `blockedOrInvalidated=${huaweiBlockedExecutionRecords.length}`,
        `knowledgeUpdates=${huaweiEvidenceCoverage.knowledgeUpdates}`,
      ].join(' | '),
      meta: {
        playExecutionSourceRows: huaweiPlayExecutionSourceTraces.map((row) => ({
          id: row.id,
          sourceTable: row.source_table ?? null,
          sourceRowId: row.source_row_id ?? null,
          title: row.metadata?.playExecutionEvent && typeof row.metadata.playExecutionEvent === 'object'
            ? (row.metadata.playExecutionEvent as Record<string, unknown>).stepTitle ?? null
            : null,
        })),
        knowledgeUpdateIds: knowledgeUpdateLogList.filter((row) => row.account_id === 'acc_eastchina_platform_001').map((row) => row.id),
      },
    });

    // Integration email attribution detail
    const attributionSummary = integrationAttributions.map((r) => ({
      emailId: r.email.id,
      subject: (r.email as unknown as Record<string, unknown>).subject ?? null,
      sender: (r.email as unknown as Record<string, unknown>).sender ?? null,
      directAccountId: r.email.account_id ?? null,
      inferredAccountId: r.attribution.accountId,
      matchMethod: r.attribution.matchMethod,
      confidence: r.attribution.confidence,
    }));

    const unattributed = integrationAttributions.filter((r) => r.attribution.matchMethod === 'none');

    checks.push({
      key: 'integration-email-attribution',
      name: 'Integration 邮件归属推断',
      category: 'evidence-runtime',
      status: toStatus(unattributed.length === 0, integrationEmailList.length > 0),
      detail: `total=${integrationEmailList.length} | attributed=${integrationEmailList.length - unattributed.length} | unattributed=${unattributed.length} | huaweiTotal=${huaweiTotalIntegrationEmails}(direct=${huaweiDirectEmails}+inferred=${huaweiInferredEmails.length})`,
      meta: {
        attributions: attributionSummary,
        inferredMethods: [...new Set(integrationAttributions.map((r) => r.attribution.matchMethod))],
      },
    });

    const decodeMissingContacts = decodeList.filter(
      (row) => row.matched_contact_id && !contactList.some((contact) => contact.id === row.matched_contact_id),
    );
    const intelMissingContacts = intelList.filter(
      (row) => Array.isArray(row.related_contact_ids) && row.related_contact_ids.some((contactId) => !contactList.some((contact) => contact.id === contactId)),
    );
    const runtimeRowsInsideDemoAccounts = [
      ...intelList.filter((row) => row.account_id && runtimeAccountIds.has(row.account_id)),
      ...decodeList.filter((row) => row.account_id && runtimeAccountIds.has(row.account_id)),
    ];
    const runtimeRowsOutsideDemoAccounts = [
      ...intelList.filter((row) => row.account_id && runtimeAccountIds.has(row.account_id) === false),
      ...decodeList.filter((row) => row.account_id && runtimeAccountIds.has(row.account_id) === false),
    ];

    checks.push({
      key: 'evidence-references',
      name: 'Evidence 引用关系完整',
      category: 'evidence-runtime',
      status: toStatus(decodeMissingContacts.length === 0 && intelMissingContacts.length === 0),
      detail: `decodeMissingContacts=${decodeMissingContacts.length} | intelMissingContacts=${intelMissingContacts.length}`,
      meta: {
        decodeMissingContacts: decodeMissingContacts.map((row) => row.id),
        intelMissingContacts: intelMissingContacts.map((row) => row.id),
      },
    });

    // Enterprise 1.0 seed should keep non-mainline runtime data out of the primary demo path.
    const focusLost = runtimeRowsOutsideDemoAccounts.length > 0;

    checks.push({
      key: 'runtime-demo-focus',
      name: '当前 demo runtime 聚焦3个Enterprise scenario主线',
      category: 'summary',
      status: focusLost ? 'warn' : 'pass',
      detail:
        `主线 ${runtimeRowsInsideDemoAccounts.length} 条 | 非主线 ${runtimeRowsOutsideDemoAccounts.length} 条` +
        (focusLost ? '（非主线数据超过主线，demo 聚焦不足，建议人工复查）' : '（主线占比健康）'),
    });

    const passed = checks.filter((check) => check.status === 'pass').length;
    const warned = checks.filter((check) => check.status === 'warn').length;
    const failed = checks.filter((check) => check.status === 'fail').length;
    const overallStatus: 'pass' | 'partial' | 'fail' = failed > 0 ? (passed > 0 || warned > 0 ? 'partial' : 'fail') : warned > 0 ? 'partial' : 'pass';

    const grouped = groupChecks(checks);

    return Response.json({
      summary: {
        total: checks.length,
        passed,
        warned,
        failed,
        ready: failed === 0,
        overallStatus,
        scope: 'Closr current demo assets verification',
      },
      demoAssets: {
        requiredAccounts: REQUIRED_DEMO_ACCOUNTS,
        demoReadinessChecklist: DEMO_READINESS_CHECKLIST,
        evidenceRuntimeTables: evidenceTables.map((table) => ({ key: table.key, count: table.rows.length, required: table.min > 0 })),
        integration: {
          connections: integrationConnectionList.length,
          emails: integrationEmailList.length,
        },
      },
      checks,
      grouped,
    });
  } catch (err) {
    console.error('[verify-demo] Error:', err);
    return Response.json({ error: 'Verification failed' }, { status: 500 });
  }
}
