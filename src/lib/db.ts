// Supabase Data Access Layer
// All DB operations + snake_case <-> camelCase conversion.
// Multi-tenant: queries use org_id for organization-level isolation.

import { getSupabase, getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import type {
  Account,
  Contact,
  IntelItem,
  SavedDecode,
  KnowledgeItem,
  Opportunity,
  MeetingPrepRecord,
  ComposedEmail,
  DiscoveryNote,
  Organization,
  OrgMember,
  OrgInvitation,
  OrgRole,
  OrgSettings,
  AIAdvice,
  DecodeFeedback,
  Rfp,
  RfpDocument,
  RfpMilestone,
  RfpRow,
  RfpDocumentRow,
  RfpMilestoneRow,
  RfpCompetitorRow,
  RfpAnalysisRow,
} from '@/lib/babel-engine/types';
import { normalizeMeddiccAssessment } from '@/lib/meddicc';

// ─── Auth Helper ──────────────────────────────────────────────────────

// Cached user ID set by auth-context.tsx via setAuthUserId().
// This avoids calling getUser()/getSession() which both acquire a lock and
// cause contention when multiple DB functions run in parallel (e.g. hydrate).
let _cachedUserId: string | null = null;

/** Set the authenticated user ID (called from auth-context before hydration) */
export function setAuthUserId(userId: string | null) {
  if (typeof window === 'undefined') return;
  _cachedUserId = userId;
}

async function getCurrentUserId(): Promise<string | null> {
  // Fast path: use cached user ID set by auth-context
  if (_cachedUserId) return _cachedUserId;
  // Fallback only: read user from Supabase client (should rarely be needed)
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data: { user } } = await sb.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

// ─── Org Helper (cached per session) ──────────────────────────────────

let _cachedOrgId: string | null = null;
let _cachedOrgIdForUser: string | null = null;
let _cachedRole: import('@/lib/babel-engine/types').OrgRole | null = null;
let _cachedTeamId: string | null = null;
let _cachedJobLevel: number = 0;

async function getCurrentOrgId(): Promise<string | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  // 只允许命中当前 user 的缓存，避免账号切换后复用旧 org 上下文
  if (_cachedOrgId && _cachedOrgIdForUser === userId) return _cachedOrgId;
  if (_cachedOrgIdForUser && _cachedOrgIdForUser !== userId) {
    _cachedOrgId = null;
    _cachedRole = null;
    _cachedTeamId = null;
    _cachedVisibleUserIds = undefined;
    _cachedVisibleForUser = null;
  }
  // Fallback: 查 Supabase（可能被 RLS 挡住）
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb
      .from('org_memberships')
      .select('org_id, role, team_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    _cachedOrgId = data?.org_id ?? null;
    _cachedRole = (data?.role as import('@/lib/babel-engine/types').OrgRole) ?? null;
    _cachedTeamId = (data?.team_id as string) ?? null;
    _cachedOrgIdForUser = userId;
  } catch (e) {
    console.warn('[db] getCurrentOrgId fallback failed (RLS?):', e);
  }
  return _cachedOrgId;
}

/** Set org context directly (from auth-context, bypasses RLS) */
export function setOrgContext(orgId: string | null, role: import('@/lib/babel-engine/types').OrgRole | null, teamId?: string | null, jobLevel?: number) {
  // Prevent server-side cache pollution in long-lived PM2 process
  if (typeof window === 'undefined') return;
  _cachedOrgId = orgId;
  _cachedRole = role;
  _cachedTeamId = teamId ?? null;
  _cachedJobLevel = jobLevel ?? 0;
  // role/team 变化后必须清除 visible user cache，防止 refreshOrg 后脏读
  _cachedVisibleUserIds = undefined;
  _cachedVisibleForUser = null;
  // Use cached user ID (set by setAuthUserId before this call)
  _cachedOrgIdForUser = _cachedUserId;
}

/** Clear the org cache (call after creating/joining an org) */
export function clearOrgCache() {
  // Note: _cachedUserId is NOT cleared here — it's managed by setAuthUserId()
  // and must survive org cache resets to avoid auth lock contention during hydrate.
  _cachedOrgId = null;
  _cachedRole = null;
  _cachedTeamId = null;
  _cachedJobLevel = 0;
  _cachedVisibleUserIds = undefined;
  _cachedVisibleForUser = null;
  _cachedOrgIdForUser = null;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

const unavailableTables = new Set<string>();

function isMissingTableError(error: unknown, table: string): boolean {
  const candidate = error as { code?: string; message?: string; hint?: string } | null;
  if (!candidate) return false;
  const text = `${candidate.message ?? ''} ${candidate.hint ?? ''}`;
  return candidate.code === 'PGRST205' || text.includes(`public.${table}`) || text.includes(`table '${table}'`);
}

function markTableUnavailable(table: string) {
  if (unavailableTables.has(table)) return;
  unavailableTables.add(table);
}

function isTableUnavailable(table: string) {
  return unavailableTables.has(table);
}

// Convert object keys from snake_case to camelCase (shallow)
function toCamelKeys<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    result[snakeToCamel(key)] = obj[key];
  }
  return result as T;
}

// Convert object keys from camelCase to snake_case (shallow)
function toSnakeKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    result[camelToSnake(key)] = obj[key];
  }
  return result;
}

// ─── Account Conversion ───────────────────────────────────────────────

interface AccountRow {
  id: string;
  user_id?: string;
  owner_id?: string | null;
  business_team_id?: string | null;
  name: string;
  industry: string | null;
  website: string | null;
  deal_value: number | null;
  deal_stage: string | null;
  deal_health: string | null;
  notes: string | null;
  market_intel: unknown;
  strategy: unknown;
  meddicc: unknown;
  opportunity_ids: string[] | null;
  last_activity: string | null;
  created_at: string | null;
}

function rowToAccount(row: AccountRow, contacts: Contact[], meetingPreps: MeetingPrepRecord[]): Account {
  return {
    id: row.id,
    userId: row.user_id,
    ownerId: row.owner_id ?? undefined,
    businessTeamId: row.business_team_id ?? undefined,
    name: row.name,
    industry: row.industry ?? undefined,
    website: row.website ?? undefined,
    dealValue: row.deal_value ?? undefined,
    dealStage: row.deal_stage ?? undefined,
    dealHealth: (row.deal_health as Account['dealHealth']) ?? undefined,
    notes: row.notes ?? undefined,
    contacts,
    marketIntel: (row.market_intel as Account['marketIntel']) ?? undefined,
    strategy: (row.strategy as Account['strategy']) ?? undefined,
    meddicc: (row.meddicc as Account['meddicc']) ?? undefined,
    opportunityIds: row.opportunity_ids ?? [],
    lastActivity: row.last_activity ?? undefined,
    createdAt: row.created_at ?? undefined,
    meetingPreps: meetingPreps.length > 0 ? meetingPreps : undefined,
  };
}

function accountToRow(account: Partial<Account> & { id?: string }) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { contacts, meetingPreps, opportunityIds, ...rest } = account as Account;
  return {
    ...(rest.id ? { id: rest.id } : {}),
    name: rest.name,
    industry: rest.industry ?? null,
    website: rest.website ?? null,
    deal_value: rest.dealValue ?? null,
    deal_stage: rest.dealStage ?? null,
    deal_health: rest.dealHealth ?? null,
    notes: rest.notes ?? null,
    market_intel: rest.marketIntel ?? null,
    strategy: rest.strategy ?? null,
    meddicc: rest.meddicc ?? null,
    opportunity_ids: opportunityIds ?? [],
    last_activity: rest.lastActivity ?? null,
    created_at: rest.createdAt ?? new Date().toISOString(),
    // 持久化 owner；ownerId 存在时写入，否则不覆盖已有值
    ...(rest.ownerId !== undefined ? { owner_id: rest.ownerId } : {}),
    ...(rest.businessTeamId !== undefined ? { business_team_id: rest.businessTeamId } : {}),
  };
}

// ─── Contact Conversion ──────────────────────────────────────────────

function rowToContact(row: Record<string, unknown>): Contact {
  return {
    id: row.id as string,
    name: row.name as string,
    email: (row.email as string) ?? '',
    phone: (row.phone as string) ?? undefined,
    mobilePhone: (row.mobile_phone as string) ?? undefined,
    title: (row.title as string) ?? undefined,
    role: (row.role as Contact['role']) ?? undefined,
    reportsTo: (row.reports_to as string) ?? undefined,
    department: (row.department as string) ?? undefined,
    linkedin: (row.linkedin as string) ?? undefined,
    wechat: (row.wechat as string) ?? undefined,
    twitter: (row.twitter as string) ?? undefined,
    location: (row.location as string) ?? undefined,
    timezone: (row.timezone as string) ?? undefined,
    preferredChannel: (row.preferred_channel as Contact['preferredChannel']) ?? undefined,
    preferredLanguage: (row.preferred_language as string) ?? undefined,
    personalNotes: (row.personal_notes as string) ?? undefined,
    decisionStyle: (row.decision_style as Contact['decisionStyle']) ?? undefined,
    riskAppetite: (row.risk_appetite as Contact['riskAppetite']) ?? undefined,
    communicationNotes: (row.communication_notes as string) ?? undefined,
    landmines: (row.landmines as string) ?? undefined,
    profile: (row.profile as Contact['profile']) ?? undefined,
    contactProfile: (row.contact_profile as Contact['contactProfile']) ?? undefined,
    createdAt: (row.created_at as string) ?? undefined,
    updatedAt: (row.updated_at as string) ?? undefined,
    relationship_strength: (row.relationship_strength as number) ?? undefined,
    lastContactedAt: (row.last_contacted_at as string) ?? undefined,
    attitudeTrend: (row.attitude_trend as Contact['attitudeTrend']) ?? undefined,
    jobLevel: (row.job_level as number) ?? undefined,
    roleConfidence: (row.role_confidence as number) ?? undefined,
    roleSource: (row.role_source as string) ?? undefined,
    roleUpdatedAt: (row.role_updated_at as string) ?? undefined,
    enrichmentStatus: (row.enrichment_status as string) ?? undefined,
    enrichedAt: (row.enriched_at as string) ?? undefined,
  };
}

// Fields that may not exist in all DB schemas (added later)
const OPTIONAL_CONTACT_COLUMNS = new Set<string>();

function contactToRow(contact: Contact, accountId: string) {
  const row: Record<string, unknown> = {
    id: contact.id,
    account_id: accountId,
    name: contact.name,
    email: contact.email ?? null,
    phone: contact.phone ?? null,
    mobile_phone: contact.mobilePhone ?? null,
    title: contact.title ?? null,
    role: contact.role ?? null,
    reports_to: contact.reportsTo ?? null,
    department: contact.department ?? null,
    linkedin: contact.linkedin ?? null,
    wechat: contact.wechat ?? null,
    twitter: contact.twitter ?? null,
    location: contact.location ?? null,
    timezone: contact.timezone ?? null,
    preferred_channel: contact.preferredChannel ?? null,
    preferred_language: contact.preferredLanguage ?? null,
    personal_notes: contact.personalNotes ?? null,
    decision_style: contact.decisionStyle ?? null,
    risk_appetite: contact.riskAppetite ?? null,
    communication_notes: contact.communicationNotes ?? null,
    landmines: contact.landmines ?? null,
    profile: contact.profile ?? null,
    contact_profile: contact.contactProfile ?? null,
    created_at: contact.createdAt ?? new Date().toISOString(),
    updated_at: contact.updatedAt ?? null,
    relationship_strength: contact.relationship_strength ?? null,
    last_contacted_at: contact.lastContactedAt ?? null,
    // Note: job_level, role_confidence, role_source, role_updated_at,
    // enrichment_status, enriched_at are server-side only (written by writeback service)
  };
  // attitude_trend: only include if column is known to exist (avoid PGRST204)
  if (!OPTIONAL_CONTACT_COLUMNS.has('attitude_trend')) {
    // Try including it; if it fails once, we'll strip it on retry
  }
  if (contact.attitudeTrend) row.attitude_trend = contact.attitudeTrend;
  return row;
}

// ─── Opportunity Conversion ──────────────────────────────────────────

function rowToOpportunity(row: Record<string, unknown>): Opportunity {
  return {
    id: row.id as string,
    userId: (row.user_id as string) ?? undefined,
    assignedTo: (row.assigned_to as string) ?? undefined,
    accountId: row.account_id as string,
    name: row.name as string,
    value: (row.value as number) ?? 0,
    currency: (row.currency as string) ?? 'USD',
    stage: (row.stage as Opportunity['stage']) ?? 'lead_identified',
    probability: (row.probability as number) ?? 0,
    expectedCloseDate: (row.expected_close_date as string) ?? '',
    owner: (row.owner as string) ?? '',
    source: (row.source as string) ?? '',
    createdAt: (row.created_at as string) ?? '',
    updatedAt: (row.updated_at as string) ?? '',
    lostReason: (row.lost_reason as string) ?? undefined,
    wonDate: (row.won_date as string) ?? undefined,
    meddicc: normalizeMeddiccAssessment(row.meddicc),
    mutualActionPlan: (row.mutual_action_plan as Opportunity['mutualActionPlan']) ?? {
      targetSignDate: '',
      confidence: 0,
      milestones: [],
    },
    competitorIds: (row.competitor_ids as string[]) ?? [],
    notes: (row.notes as string) ?? '',
  };
}

function opportunityToRow(opp: Opportunity) {
  return {
    id: opp.id,
    account_id: opp.accountId,
    name: opp.name,
    value: opp.value,
    currency: opp.currency,
    stage: opp.stage,
    probability: opp.probability,
    expected_close_date: opp.expectedCloseDate,
    assigned_to: opp.assignedTo ?? null,
    owner: opp.owner,
    source: opp.source,
    lost_reason: opp.lostReason ?? null,
    won_date: opp.wonDate ?? null,
    meddicc: opp.meddicc,
    mutual_action_plan: opp.mutualActionPlan,
    competitor_ids: opp.competitorIds,
    notes: opp.notes,
    created_at: opp.createdAt,
    updated_at: opp.updatedAt,
  };
}

// ─── Intel Conversion ────────────────────────────────────────────────

function rowToIntel(row: Record<string, unknown>): IntelItem {
  return {
    id: row.id as string,
    accountId: row.account_id as string,
    accountName: (row.account_name as string) ?? '',
    type: (row.type as IntelItem['type']) ?? 'manual',
    source: (row.source as IntelItem['source']) ?? 'other',
    title: (row.title as string) ?? '',
    content: (row.content as string) ?? '',
    summary: (row.summary as string) ?? '',
    credibility: (row.credibility as IntelItem['credibility']) ?? 'medium',
    urgency: (row.urgency as IntelItem['urgency']) ?? 'medium',
    relevance: (row.relevance as string) ?? '',
    date: (row.date as string) ?? '',
    analysis: (row.analysis as IntelItem['analysis']) ?? undefined,
    relatedContactIds: (row.related_contact_ids as string[]) ?? [],
    opportunityId: (row.opportunity_id as string) ?? undefined,
    spinClassification: Array.isArray(row.spin_classification) ? (row.spin_classification as IntelItem['spinClassification']) : undefined,
  };
}

function intelToRow(intel: IntelItem) {
  return {
    id: intel.id,
    account_id: intel.accountId,
    account_name: intel.accountName,
    type: intel.type,
    source: intel.source,
    title: intel.title,
    content: intel.content,
    summary: intel.summary,
    credibility: intel.credibility,
    urgency: intel.urgency,
    relevance: intel.relevance,
    date: intel.date,
    analysis: intel.analysis ?? null,
    related_contact_ids: intel.relatedContactIds,
    opportunity_id: intel.opportunityId ?? null,
    spin_classification: intel.spinClassification ?? null,
  };
}

// ─── Decode Conversion ───────────────────────────────────────────────

function rowToDecode(row: Record<string, unknown>): SavedDecode {
  return {
    id: row.id as string,
    userId: (row.user_id as string) ?? undefined,
    accountId: (row.account_id as string) ?? undefined,
    accountName: (row.account_name as string) ?? undefined,
    opportunityId: (row.opportunity_id as string) ?? undefined,
    emailText: (row.email_text as string) ?? '',
    clientName: (row.client_name as string) ?? undefined,
    dealStage: (row.deal_stage as string) ?? undefined,
    signalSource: (row.signal_source as SavedDecode['signalSource']) ?? undefined,
    analysisGoal: (row.analysis_goal as SavedDecode['analysisGoal']) ?? undefined,
    signalContext: (row.signal_context as string) ?? undefined,
    signalStatus: (row.signal_status as SavedDecode['signalStatus']) ?? undefined,
    signalTaskId: (row.signal_task_id as string) ?? undefined,
    signalStatusUpdatedAt: (row.signal_status_updated_at as string) ?? undefined,
    decode: (row.decode as SavedDecode['decode']) ?? { messages: [], threadAnalysis: { sentimentTrend: 'stable', riskLevel: 'low', buyerState: 'evaluating', keySignal: '' } },
    strategy: (row.strategy as SavedDecode['strategy']) ?? undefined,
    date: (row.date as string) ?? '',
    originalSenderEmail: (row.original_sender_email as string) ?? undefined,
    originalSenderName: (row.original_sender_name as string) ?? undefined,
    matchedContactId: (row.matched_contact_id as string) ?? undefined,
    matchedAccountId: (row.matched_account_id as string) ?? undefined,
    matchedAccountName: (row.matched_account_name as string) ?? undefined,
    direction: (row.direction as SavedDecode['direction']) ?? undefined,
  };
}

function decodeToRow(decode: SavedDecode) {
  return {
    id: decode.id,
    user_id: decode.userId ?? null,
    account_id: decode.accountId ?? null,
    account_name: decode.accountName ?? null,
    opportunity_id: decode.opportunityId ?? null,
    email_text: decode.emailText,
    client_name: decode.clientName ?? null,
    deal_stage: decode.dealStage ?? null,
    signal_source: decode.signalSource ?? null,
    analysis_goal: decode.analysisGoal ?? null,
    signal_context: decode.signalContext ?? null,
    signal_status: decode.signalStatus ?? 'new',
    signal_task_id: decode.signalTaskId ?? null,
    signal_status_updated_at: decode.signalStatusUpdatedAt ?? null,
    decode: decode.decode,
    strategy: decode.strategy ?? null,
    date: decode.date,
    original_sender_email: decode.originalSenderEmail ?? null,
    original_sender_name: decode.originalSenderName ?? null,
    matched_contact_id: decode.matchedContactId ?? null,
    matched_account_id: decode.matchedAccountId ?? null,
    matched_account_name: decode.matchedAccountName ?? null,
    direction: decode.direction ?? null,
  };
}

function decodeToLegacyRow(decode: SavedDecode) {
  const row = decodeToRow(decode) as Record<string, unknown>;
  delete row.signal_source;
  delete row.analysis_goal;
  delete row.signal_context;
  delete row.signal_status;
  delete row.signal_task_id;
  delete row.signal_status_updated_at;
  return row;
}

// ─── Knowledge Conversion ────────────────────────────────────────────

function rowToKnowledge(row: Record<string, unknown>): KnowledgeItem {
  return {
    id: row.id as string,
    title: (row.title as string) ?? '',
    category: (row.category as KnowledgeItem['category']) ?? 'other',
    content: (row.content as string) ?? '',
    fileSize: (row.file_size as number) ?? undefined,
    createdAt: (row.created_at as string) ?? '',
  };
}

function knowledgeToRow(item: KnowledgeItem) {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    content: item.content,
    file_size: item.fileSize ?? null,
    created_at: item.createdAt,
  };
}

// ─── ComposedEmail Conversion ────────────────────────────────────────

function rowToComposedEmail(row: Record<string, unknown>): ComposedEmail {
  return {
    id: row.id as string,
    accountId: row.account_id as string,
    contactId: (row.contact_id as string) ?? '',
    contactName: (row.contact_name as string) ?? '',
    opportunityId: (row.opportunity_id as string) ?? undefined,
    type: (row.email_type as ComposedEmail['type']) ?? 'custom',
    goal: (row.goal as string) ?? '',
    subject: (row.subject as string) ?? '',
    body: (row.body as string) ?? '',
    sendingAdvice: (row.sending_advice as string) ?? '',
    status: (row.status as ComposedEmail['status']) ?? 'draft',
    finalContent: (row.final_content as string) ?? undefined,
    sentAt: (row.sent_at as string) ?? undefined,
    suggestedCc: (row.suggested_cc as string[]) ?? undefined,
    createdAt: (row.created_at as string) ?? '',
  };
}

function composedEmailToRow(email: ComposedEmail) {
  return {
    id: email.id,
    account_id: email.accountId,
    contact_id: email.contactId,
    contact_name: email.contactName,
    opportunity_id: email.opportunityId ?? null,
    email_type: email.type,
    goal: email.goal,
    subject: email.subject,
    body: email.body,
    sending_advice: email.sendingAdvice,
    status: email.status,
    final_content: email.finalContent ?? null,
    suggested_cc: email.suggestedCc ?? null,
    sent_at: email.sentAt ?? null,
    created_at: email.createdAt,
  };
}

// ─── DiscoveryNote Conversion ────────────────────────────────────────

function rowToDiscoveryNote(row: Record<string, unknown>): DiscoveryNote {
  return {
    id: row.id as string,
    opportunityId: (row.opportunity_id as string) ?? '',
    date: (row.date as string) ?? '',
    source: (row.source as DiscoveryNote['source']) ?? 'other',
    content: (row.content as string) ?? '',
    spinClassification: Array.isArray(row.spin_classification) ? (row.spin_classification as DiscoveryNote['spinClassification']) : undefined,
    createdAt: (row.created_at as string) ?? '',
  };
}

function discoveryNoteToRow(note: DiscoveryNote) {
  return {
    id: note.id,
    opportunity_id: note.opportunityId,
    date: note.date,
    source: note.source,
    content: note.content,
    spin_classification: note.spinClassification ?? null,
    created_at: note.createdAt,
  };
}

// ─── MeetingPrep Conversion ──────────────────────────────────────────

function rowToMeetingPrep(row: Record<string, unknown>): MeetingPrepRecord {
  return {
    id: row.id as string,
    accountId: row.account_id as string,
    input: row.input as MeetingPrepRecord['input'],
    result: row.result as MeetingPrepRecord['result'],
    createdAt: (row.created_at as string) ?? '',
  };
}

function meetingPrepToRow(prep: MeetingPrepRecord) {
  return {
    id: prep.id,
    account_id: prep.accountId,
    input: prep.input,
    result: prep.result,
    created_at: prep.createdAt,
  };
}

// ─── Tenant context helper ──────────────────────────────────────────

interface TenantContext {
  userId: string;
  orgId: string | null;
  role: import('@/lib/babel-engine/types').OrgRole | null;
  teamId: string | null;
  jobLevel: number;
}

/** Get userId, orgId, role, teamId, jobLevel for queries & writes */
async function getTenantContext(): Promise<TenantContext | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const orgId = await getCurrentOrgId(); // 同时缓存 role 和 teamId
  return { userId, orgId, role: _cachedRole, teamId: _cachedTeamId, jobLevel: _cachedJobLevel };
}

/**
 * 根据 jobLevel 返回可见的 user_id 列表。
 * - Executive (2): null（不过滤，看所有数据）
 * - Director (1): 自己 + 同 team 成员
 * - AE (0): 仅自己
 */
async function getVisibleUserIds(ctx: TenantContext): Promise<string[] | null> {
  if (!ctx.orgId) return null; // 无组织，不做角色过滤
  // Executive 或平台 admin → 看全部
  if (ctx.jobLevel >= 2 || ctx.role === 'owner' || ctx.role === 'admin') return null;
  // Director → 团队
  if (ctx.jobLevel >= 1 && ctx.teamId) {
    const sb = getSupabase();
    if (!sb) return [ctx.userId];
    const { data } = await sb
      .from('org_memberships')
      .select('user_id')
      .eq('org_id', ctx.orgId)
      .eq('team_id', ctx.teamId);
    if (data && data.length > 0) {
      const ids = data.map((r: Record<string, unknown>) => r.user_id as string);
      if (!ids.includes(ctx.userId)) ids.push(ctx.userId);
      return ids;
    }
  }
  return [ctx.userId]; // AE 或 Director 无 team 时只看自己的
}

/** 缓存 visibleUserIds，同一 session 内避免重复查询 */
let _cachedVisibleUserIds: string[] | null | undefined = undefined;
let _cachedVisibleForUser: string | null = null;

async function getCachedVisibleUserIds(ctx: TenantContext): Promise<string[] | null> {
  if (_cachedVisibleUserIds !== undefined && _cachedVisibleForUser === ctx.userId) {
    return _cachedVisibleUserIds;
  }
  const ids = await getVisibleUserIds(ctx);
  _cachedVisibleUserIds = ids;
  _cachedVisibleForUser = ctx.userId;
  return ids;
}

// ─── Column Lists (hydration-optimized — omit heavy JSON blobs) ─────

const ACCOUNTS_HYDRATION_COLS = 'id, user_id, owner_id, business_team_id, name, industry, website, deal_value, deal_stage, deal_health, notes, opportunity_ids, last_activity, created_at, strategy, market_intel';
const CONTACTS_HYDRATION_COLS = 'id, account_id, name, email, phone, mobile_phone, title, role, reports_to, department, linkedin, wechat, twitter, location, timezone, decision_style, risk_appetite, preferred_channel, preferred_language, communication_notes, landmines, personal_notes, contact_profile, enrichment_status, enriched_at, role_updated_at, role_source, created_at, updated_at, relationship_strength, last_contacted_at, attitude_trend, job_level, role_confidence';
const OPPORTUNITIES_HYDRATION_COLS = 'id, user_id, assigned_to, account_id, name, value, currency, stage, probability, expected_close_date, owner, source, created_at, updated_at, lost_reason, won_date, competitor_ids, notes, meddicc, mutual_action_plan';
const INTEL_HYDRATION_COLS = 'id, account_id, account_name, type, source, title, content, summary, credibility, urgency, relevance, date, related_contact_ids, opportunity_id, created_at, analysis, spin_classification';
const DECODES_HYDRATION_COLS = 'id, user_id, account_id, account_name, opportunity_id, client_name, deal_stage, signal_source, analysis_goal, signal_context, signal_status, signal_task_id, signal_status_updated_at, date, original_sender_email, original_sender_name, matched_contact_id, matched_account_id, matched_account_name, direction, created_at, decode, email_text, strategy';
const DECODES_LEGACY_HYDRATION_COLS = 'id, user_id, account_id, account_name, opportunity_id, client_name, deal_stage, date, original_sender_email, original_sender_name, matched_contact_id, matched_account_id, matched_account_name, direction, created_at, decode, email_text, strategy';
const KNOWLEDGE_HYDRATION_COLS = 'id, title, content, category, file_size, created_at';
const COMPOSED_EMAILS_HYDRATION_COLS = 'id, account_id, contact_id, contact_name, opportunity_id, email_type, goal, subject, status, sent_at, created_at';
const DISCOVERY_NOTES_HYDRATION_COLS = 'id, opportunity_id, date, source, content, spin_classification, created_at';
const AI_ADVICES_HYDRATION_COLS = 'id, text, source, status, account_id, opportunity_id, task_id, created_at, updated_at';

// ─── DB Operations ───────────────────────────────────────────────────

// Accounts (with nested contacts — meeting preps loaded on demand)
export async function dbGetAccounts(): Promise<Account[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const ctx = await getTenantContext();
  if (!ctx) return [];
  try {
    const fk = ctx.orgId ? 'org_id' : 'user_id';
    const fv = ctx.orgId ?? ctx.userId;
    const visibleIds = await getCachedVisibleUserIds(ctx);

    // 角色过滤：owner/admin 看全部，manager 看团队，member 看自己
    let accountsQ = sb.from('accounts').select(ACCOUNTS_HYDRATION_COLS).eq(fk, fv);
    let contactsQ = sb.from('contacts').select(CONTACTS_HYDRATION_COLS).eq(fk, fv);
    if (visibleIds) {
      // 账户可见性：owner_id 优先（交接后），owner_id 为空时回退到 user_id（未交接）
      const idList = visibleIds.join(',');
      // 公海账户（owner_id 与 user_id 均为空）对所有 org 成员可见/可领取
      accountsQ = accountsQ.or(`owner_id.in.(${idList}),and(owner_id.is.null,user_id.in.(${idList})),and(owner_id.is.null,user_id.is.null)`);
      // 公海账户的关联数据 user_id 为 null，也需可见
      const cIdList = visibleIds.join(',');
      contactsQ = contactsQ.or(`user_id.in.(${cIdList}),user_id.is.null`);
    }

    const [accountsRes, contactsRes] = await Promise.all([
      accountsQ.order('created_at', { ascending: false }).limit(200),
      contactsQ.limit(500),
    ]);
    if (accountsRes.error) throw accountsRes.error;
    const contactsByAccount = new Map<string, Contact[]>();
    for (const row of contactsRes.data ?? []) {
      const accountId = row.account_id as string;
      if (!contactsByAccount.has(accountId)) contactsByAccount.set(accountId, []);
      contactsByAccount.get(accountId)!.push(rowToContact(row));
    }
    return (accountsRes.data as AccountRow[]).map((row) =>
      rowToAccount(row, contactsByAccount.get(row.id) ?? [], [])
    );
  } catch (e) {
    console.error('[db] getAccounts failed:', e);
    return [];
  }
}

/** Load meeting preps for a single account (on-demand, not during hydration) */
export async function dbGetMeetingPreps(accountId: string): Promise<MeetingPrepRecord[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const ctx = await getTenantContext();
  if (!ctx) return [];
  try {
    const fk = ctx.orgId ? 'org_id' : 'user_id';
    const fv = ctx.orgId ?? ctx.userId;
    let q = sb.from('meeting_preps').select('*').eq(fk, fv).eq('account_id', accountId);
    const visibleIds = await getCachedVisibleUserIds(ctx);
    if (visibleIds) {
      const idList = visibleIds.join(',');
      q = q.or(`user_id.in.(${idList}),user_id.is.null`);
    }
    const { data, error } = await q.order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    return (data ?? []).map(rowToMeetingPrep);
  } catch (e) {
    console.error('[db] getMeetingPreps failed:', e);
    return [];
  }
}

export async function dbSaveAccount(account: Account, options?: { preserveOwnership?: boolean }): Promise<void> {
  const sb = getSupabase();
  if (!sb) return; // Supabase 未配置，跳过
  const ctx = await getTenantContext();
  if (!ctx) throw new Error('[db] 租户上下文不可用，无法保存 account');
  const row = accountToRow(account) as Record<string, unknown>;

  if (options?.preserveOwnership) {
    // 普通编辑路径：剥离服务端专用字段，避免覆盖 transfer/claim/team APIs 的确认结果。
    delete row.owner_id;
    delete row.business_team_id;
    // RLS INSERT policy requires user_id = auth.uid(); preserve existing user_id for updates
    const { data: existing } = await sb.from('accounts').select('id, user_id').eq('id', account.id).maybeSingle();
    const uid = existing ? existing.user_id : ctx.userId;
    const { error } = await sb.from('accounts').upsert({ ...row, user_id: uid, org_id: ctx.orgId }, { onConflict: 'id' });
    if (error) throw error;
  } else {
    // 新建路径：写入完整 ownership
    const userId = account.userId !== undefined ? account.userId
      : account.ownerId !== undefined ? account.ownerId
      : ctx.userId;
    const { error } = await sb.from('accounts').upsert({ ...row, user_id: userId ?? null, org_id: ctx.orgId }, { onConflict: 'id' });
    if (error) throw error;
  }
  // 同步保存联系人
  if (account.contacts.length > 0) {
    const contactIds = account.contacts.map((c) => c.id);
    // 查询哪些联系人已存在（已有记录保持 user_id 不变，包括公海 NULL）
    const { data: existingContacts } = await sb.from('contacts').select('id, user_id').in('id', contactIds);
    const existingMap = new Map((existingContacts ?? []).map((c: { id: string; user_id: string | null }) => [c.id, c.user_id]));
    // RLS INSERT policy requires user_id = auth.uid(); include user_id in each row
    const contactRows = account.contacts.map((c) => ({
      ...contactToRow(c, account.id),
      org_id: ctx.orgId,
      user_id: existingMap.has(c.id) ? existingMap.get(c.id) : ctx.userId,
    }));
    const { error: cErr } = await sb.from('contacts').upsert(contactRows, { onConflict: 'id' });
    if (cErr) throw cErr;
  }
}

export async function dbDeleteAccount(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ctx = await getTenantContext();
  const q = sb.from('accounts').delete().eq('id', id);
  if (ctx?.orgId) q.eq('org_id', ctx.orgId);
  const { error } = await q;
  if (error) throw error;
}

// Contacts
export async function dbSaveContact(contact: Contact, accountId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) { console.warn('[db] dbSaveContact: no supabase client'); return; }
  const ctx = await getTenantContext();
  if (!ctx) { console.error('[db] dbSaveContact: 租户上下文不可用, userId missing'); throw new Error('[db] 租户上下文不可用，无法保存 contact'); }
  if (!ctx.orgId) { console.warn('[db] dbSaveContact: orgId is null, contact may not be accessible to team'); }
  // RLS INSERT policy requires user_id = auth.uid(); preserve existing user_id for updates
  const { data: existingContact } = await sb.from('contacts').select('id, user_id').eq('id', contact.id).maybeSingle();
  const userId = existingContact ? existingContact.user_id : ctx.userId;
  const row = { ...contactToRow(contact, accountId), org_id: ctx.orgId, user_id: userId } as Record<string, unknown>;
  const { error } = await sb.from('contacts').upsert(row, { onConflict: 'id' });
  if (error) {
    // If a column doesn't exist (PGRST204), retry without optional columns
    if (error.code === 'PGRST204') {
      const colMatch = error.message.match(/the '(\w+)' column/);
      if (colMatch) {
        const badCol = colMatch[1];
        console.warn(`[db] dbSaveContact: column '${badCol}' missing, retrying without it`);
        OPTIONAL_CONTACT_COLUMNS.add(badCol);
        const safeRow = { ...row } as Record<string, unknown>;
        delete safeRow[badCol];
        const { error: retryError } = await sb.from('contacts').upsert(safeRow, { onConflict: 'id' });
        if (retryError) { console.error('[db] dbSaveContact retry failed:', retryError); throw retryError; }
        return;
      }
    }
    console.error('[db] dbSaveContact failed:', error);
    throw error;
  }
}

export async function dbDeleteContact(contactId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ctx = await getTenantContext();
  const q = sb.from('contacts').delete().eq('id', contactId);
  if (ctx?.orgId) q.eq('org_id', ctx.orgId);
  const { error } = await q;
  if (error) throw error;
}

// Intel Items
export async function dbGetIntelItems(): Promise<IntelItem[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const ctx = await getTenantContext();
  if (!ctx) return [];
  try {
    let q = sb.from('intel_items').select(INTEL_HYDRATION_COLS);
    q = ctx.orgId ? q.eq('org_id', ctx.orgId) : q.eq('user_id', ctx.userId);
    const visibleIds = await getCachedVisibleUserIds(ctx);
    if (visibleIds) {
      const idList = visibleIds.join(',');
      q = q.or(`user_id.in.(${idList}),user_id.is.null`);
    }
    const { data, error } = await q.order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return (data ?? []).map(rowToIntel);
  } catch (e) {
    console.error('[db] getIntelItems failed:', e);
    return [];
  }
}

export async function dbSaveIntel(intel: IntelItem): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ctx = await getTenantContext();
  if (!ctx) throw new Error('[db] 租户上下文不可用，无法保存 intel');
  // RLS INSERT policy requires user_id = auth.uid(), so always include user_id
  const { data: existingIntel } = await sb.from('intel_items').select('id, user_id').eq('id', intel.id).maybeSingle();
  // For existing records, preserve the original user_id (e.g. pool records with NULL user_id);
  // for new records, set user_id to current user so RLS INSERT policy passes.
  const userId = existingIntel ? existingIntel.user_id : ctx.userId;
  const { error } = await sb.from('intel_items').upsert(
    { ...intelToRow(intel), org_id: ctx.orgId, user_id: userId },
    { onConflict: 'id' },
  );
  if (error) throw error;
}

export async function dbDeleteIntel(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ctx = await getTenantContext();
  const q = sb.from('intel_items').delete().eq('id', id);
  if (ctx?.orgId) q.eq('org_id', ctx.orgId);
  const { error } = await q;
  if (error) throw error;
}

// Email Decodes
export async function dbGetDecodes(): Promise<SavedDecode[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const ctx = await getTenantContext();
  if (!ctx) return [];
  try {
    let q = sb.from('email_decodes').select(DECODES_HYDRATION_COLS);
    q = ctx.orgId ? q.eq('org_id', ctx.orgId) : q.eq('user_id', ctx.userId);
    const visibleIds = await getCachedVisibleUserIds(ctx);
    if (visibleIds) {
      const idList = visibleIds.join(',');
      q = q.or(`user_id.in.(${idList}),user_id.is.null`);
    }
    const { data, error } = await q.order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return (data ?? []).map(rowToDecode);
  } catch (e) {
    const message = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    if (
      message.includes('signal_source') ||
      message.includes('analysis_goal') ||
      message.includes('signal_context') ||
      message.includes('signal_status') ||
      message.includes('signal_task_id') ||
      message.includes('signal_status_updated_at')
    ) {
      try {
        let q = sb.from('email_decodes').select(DECODES_LEGACY_HYDRATION_COLS);
        q = ctx.orgId ? q.eq('org_id', ctx.orgId) : q.eq('user_id', ctx.userId);
        const visibleIds = await getCachedVisibleUserIds(ctx);
        if (visibleIds) {
          const idList = visibleIds.join(',');
          q = q.or(`user_id.in.(${idList}),user_id.is.null`);
        }
        const { data, error } = await q.order('created_at', { ascending: false }).limit(50);
        if (error) throw error;
        console.warn('[db] email_decodes signal columns missing; using legacy decode hydration. Run migration 023_signal_input_context.sql.');
        return (data ?? []).map(rowToDecode);
      } catch (legacyErr) {
        console.error('[db] legacy getDecodes failed:', legacyErr);
        return [];
      }
    }
    console.error('[db] getDecodes failed:', e);
    return [];
  }
}

export async function dbSaveDecode(decode: SavedDecode): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ctx = await getTenantContext();
  if (!ctx) throw new Error('[db] 租户上下文不可用，无法保存 decode');
  // RLS INSERT policy requires user_id = auth.uid(), so always include user_id
  const { data: existingDecode } = await sb.from('email_decodes').select('id, user_id').eq('id', decode.id).maybeSingle();
  const userId = existingDecode ? existingDecode.user_id : ctx.userId;
  const { error } = await sb.from('email_decodes').upsert(
    { ...decodeToRow(decode), org_id: ctx.orgId, user_id: userId },
    { onConflict: 'id' },
  );
  if (error && (
    error.message?.includes('signal_source') ||
    error.message?.includes('analysis_goal') ||
    error.message?.includes('signal_context') ||
    error.message?.includes('signal_status') ||
    error.message?.includes('signal_task_id') ||
    error.message?.includes('signal_status_updated_at')
  )) {
    console.warn('[db] email_decodes signal columns missing; saving decode without signal metadata. Run latest signal migrations.');
    const retry = await sb.from('email_decodes').upsert(
      { ...decodeToLegacyRow(decode), org_id: ctx.orgId, user_id: userId },
      { onConflict: 'id' },
    );
    if (retry.error) throw retry.error;
    return;
  }
  if (error) throw error;
}

export async function dbDeleteDecode(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ctx = await getTenantContext();
  const q = sb.from('email_decodes').delete().eq('id', id);
  if (ctx?.orgId) q.eq('org_id', ctx.orgId);
  const { error } = await q;
  if (error) throw error;
}

// Knowledge Items
export async function dbGetKnowledge(): Promise<KnowledgeItem[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const ctx = await getTenantContext();
  if (!ctx) return [];
  try {
    let q = sb.from('knowledge_items').select(KNOWLEDGE_HYDRATION_COLS);
    q = ctx.orgId ? q.eq('org_id', ctx.orgId) : q.eq('user_id', ctx.userId);
    const visibleIds = await getCachedVisibleUserIds(ctx);
    if (visibleIds) q = q.in('user_id', visibleIds);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return (data ?? []).map(rowToKnowledge);
  } catch (e) {
    console.error('[db] getKnowledge failed:', e);
    return [];
  }
}

export async function dbSaveKnowledge(item: KnowledgeItem): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ctx = await getTenantContext();
  if (!ctx) throw new Error('[db] 租户上下文不可用，无法保存 knowledge');
  // RLS INSERT policy requires user_id = auth.uid(); preserve existing user_id for updates
  const { data: existingKnowledge } = await sb.from('knowledge_items').select('id, user_id').eq('id', item.id).maybeSingle();
  const userId = existingKnowledge ? existingKnowledge.user_id : ctx.userId;
  const knowledgeRow = { ...knowledgeToRow(item), org_id: ctx.orgId, user_id: userId };
  const { error } = await sb.from('knowledge_items').upsert(knowledgeRow, { onConflict: 'id' });
  if (error) throw error;
}

export async function dbDeleteKnowledge(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ctx = await getTenantContext();
  const q = sb.from('knowledge_items').delete().eq('id', id);
  if (ctx?.orgId) q.eq('org_id', ctx.orgId);
  const { error } = await q;
  if (error) throw error;
}

// Opportunities
export async function dbGetOpportunities(): Promise<Opportunity[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const ctx = await getTenantContext();
  if (!ctx) return [];
  try {
    let q = sb.from('opportunities').select(OPPORTUNITIES_HYDRATION_COLS);
    q = ctx.orgId ? q.eq('org_id', ctx.orgId) : q.eq('user_id', ctx.userId);
    // 角色过滤统一基于负责人语义字段 assigned_to；
    // 仅当 assigned_to 为空（历史数据）时才 fallback 到 user_id
    const visibleIds = await getCachedVisibleUserIds(ctx);
    if (visibleIds) {
      const idList = visibleIds.join(',');
      q = q.or(`assigned_to.in.(${idList}),and(assigned_to.is.null,user_id.in.(${idList})),and(assigned_to.is.null,user_id.is.null)`);
    }
    const { data, error } = await q.order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    return (data ?? []).map(rowToOpportunity);
  } catch (e) {
    console.error('[db] getOpportunities failed:', e);
    return [];
  }
}

const OPTIONAL_OPPORTUNITY_COLUMNS = new Set<string>();

async function writeOpportunityFactChanges(params: {
  sb: NonNullable<ReturnType<typeof getSupabase>>;
  orgId: string;
  userId: string;
  before: Pick<Opportunity, 'id' | 'accountId' | 'stage' | 'expectedCloseDate'> | null;
  after: Opportunity;
}) {
  if (!params.before) return;
  const now = new Date().toISOString();
  try {
    if (params.before.stage !== params.after.stage) {
      await params.sb.from('opportunity_stage_history').insert({
        org_id: params.orgId,
        opportunity_id: params.after.id,
        old_stage: params.before.stage,
        new_stage: params.after.stage,
        changed_by: params.userId,
        changed_at: now,
        metadata: { source: 'dbSaveOpportunity' },
      });
      await params.sb.from('timeline_events').insert({
        org_id: params.orgId,
        user_id: params.userId,
        account_id: params.after.accountId,
        opportunity_id: params.after.id,
        type: 'stage_change',
        occurred_at: now,
        title: '商机阶段变更：' + params.before.stage + ' → ' + params.after.stage,
        detail: params.after.notes || null,
        source_table: 'opportunities',
        source_row_id: params.after.id,
        metadata: { oldStage: params.before.stage, newStage: params.after.stage },
      });
    }

    if (params.before.expectedCloseDate !== params.after.expectedCloseDate && params.after.expectedCloseDate) {
      await params.sb.from('opportunity_close_date_history').insert({
        org_id: params.orgId,
        opportunity_id: params.after.id,
        old_close_date: params.before.expectedCloseDate || null,
        new_close_date: params.after.expectedCloseDate,
        changed_by: params.userId,
        changed_at: now,
        metadata: { source: 'dbSaveOpportunity' },
      });
      await params.sb.from('timeline_events').insert({
        org_id: params.orgId,
        user_id: params.userId,
        account_id: params.after.accountId,
        opportunity_id: params.after.id,
        type: 'close_date',
        occurred_at: now,
        title: '预计关单日变更：' + (params.before.expectedCloseDate || '未设置') + ' → ' + params.after.expectedCloseDate,
        source_table: 'opportunities',
        source_row_id: params.after.id,
        metadata: { oldCloseDate: params.before.expectedCloseDate || null, newCloseDate: params.after.expectedCloseDate },
      });
    }
  } catch (err) {
    console.warn('[db] opportunity fact history skipped:', err instanceof Error ? err.message : err);
  }
}

export async function dbSaveOpportunity(opp: Opportunity, options?: { preserveOwnership?: boolean }): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ctx = await getTenantContext();
  if (!ctx) throw new Error('[db] 租户上下文不可用，无法保存 opportunity');
  if (!ctx.orgId) throw new Error('[db] 组织上下文不可用，无法保存 opportunity');
  const row = {
    ...opportunityToRow(opp),
    ...(options?.preserveOwnership ? {} : { user_id: opp.userId ?? ctx.userId }),
    org_id: ctx.orgId,
  } as Record<string, unknown>;

  const { data: beforeRow } = await sb
    .from('opportunities')
    .select('id, account_id, stage, expected_close_date')
    .eq('id', opp.id)
    .eq('org_id', ctx.orgId)
    .maybeSingle();
  const before = beforeRow ? rowToOpportunity(beforeRow as Record<string, unknown>) : null;

  if (options?.preserveOwnership) {
    // 普通编辑路径：剥离 ownership 字段，避免覆盖服务端 transfer/claim 结果
    delete row.assigned_to;
    // RLS INSERT policy requires user_id = auth.uid(); preserve existing user_id
    const { data: existing } = await sb.from('opportunities').select('id, user_id').eq('id', opp.id).maybeSingle();
    if (!row.user_id) row.user_id = existing ? existing.user_id : ctx.userId;
  }

  for (const col of OPTIONAL_OPPORTUNITY_COLUMNS) {
    delete row[col];
  }

  const { error } = await sb.from('opportunities').upsert(row, { onConflict: 'id' });
  if (error) {
    if (error.code === 'PGRST204') {
      const colMatch = error.message.match(/the '(\w+)' column/);
      if (colMatch) {
        const badCol = colMatch[1];
        console.warn(`[db] dbSaveOpportunity: column '${badCol}' missing, retrying without it`);
        OPTIONAL_OPPORTUNITY_COLUMNS.add(badCol);
        const safeRow = { ...row };
        delete safeRow[badCol];
        const { error: retryError } = await sb.from('opportunities').upsert(safeRow, { onConflict: 'id' });
        if (retryError) throw retryError;
        return;
      }
    }
    throw error;
  }
  await writeOpportunityFactChanges({ sb, orgId: ctx.orgId, userId: ctx.userId, before, after: opp });
}

export async function dbDeleteOpportunity(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ctx = await getTenantContext();
  const q = sb.from('opportunities').delete().eq('id', id);
  if (ctx?.orgId) q.eq('org_id', ctx.orgId);
  const { error } = await q;
  if (error) throw error;
}

// Meeting Preps
export async function dbSaveMeetingPrep(prep: MeetingPrepRecord): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ctx = await getTenantContext();
  if (!ctx) throw new Error('[db] 租户上下文不可用，无法保存 meetingPrep');
  // RLS INSERT policy requires user_id = auth.uid(); preserve existing user_id for updates
  const { data: existingPrep } = await sb.from('meeting_preps').select('id, user_id').eq('id', prep.id).maybeSingle();
  const userId = existingPrep ? existingPrep.user_id : ctx.userId;
  const { error } = await sb.from('meeting_preps').upsert({ ...meetingPrepToRow(prep), org_id: ctx.orgId, user_id: userId }, { onConflict: 'id' });
  if (error) throw error;
}

export async function dbDeleteMeetingPrep(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ctx = await getTenantContext();
  const q = sb.from('meeting_preps').delete().eq('id', id);
  if (ctx?.orgId) q.eq('org_id', ctx.orgId);
  const { error } = await q;
  if (error) throw error;
}

// Composed Emails
export async function dbGetComposedEmails(): Promise<ComposedEmail[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const ctx = await getTenantContext();
  if (!ctx) return [];
  try {
    let q = sb.from('composed_emails').select(COMPOSED_EMAILS_HYDRATION_COLS);
    q = ctx.orgId ? q.eq('org_id', ctx.orgId) : q.eq('user_id', ctx.userId);
    const visibleIds = await getCachedVisibleUserIds(ctx);
    if (visibleIds) q = q.in('user_id', visibleIds);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return (data ?? []).map(rowToComposedEmail);
  } catch (e) {
    console.error('[db] getComposedEmails failed:', e);
    return [];
  }
}

export async function dbSaveComposedEmail(email: ComposedEmail): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ctx = await getTenantContext();
  if (!ctx) throw new Error('[db] 租户上下文不可用，无法保存 composedEmail');
  // RLS INSERT policy requires user_id = auth.uid(); preserve existing user_id for updates
  const { data: existingEmail } = await sb.from('composed_emails').select('id, user_id').eq('id', email.id).maybeSingle();
  const userId = existingEmail ? existingEmail.user_id : ctx.userId;
  const emailRow = { ...composedEmailToRow(email), org_id: ctx.orgId, user_id: userId };
  const { error } = await sb.from('composed_emails').upsert(emailRow, { onConflict: 'id' });
  if (error) throw error;
}

// Discovery Notes
export async function dbGetDiscoveryNotes(): Promise<DiscoveryNote[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const ctx = await getTenantContext();
  if (!ctx) return [];
  try {
    let q = sb.from('discovery_notes').select(DISCOVERY_NOTES_HYDRATION_COLS);
    q = ctx.orgId ? q.eq('org_id', ctx.orgId) : q.eq('user_id', ctx.userId);
    const visibleIds = await getCachedVisibleUserIds(ctx);
    if (visibleIds) q = q.in('user_id', visibleIds);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return (data ?? []).map(rowToDiscoveryNote);
  } catch (e) {
    console.error('[db] getDiscoveryNotes failed:', e);
    return [];
  }
}

export async function dbSaveDiscoveryNote(note: DiscoveryNote): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ctx = await getTenantContext();
  if (!ctx) throw new Error('[db] 租户上下文不可用，无法保存 discoveryNote');
  // RLS INSERT policy requires user_id = auth.uid(); preserve existing user_id for updates
  const { data: existingNote } = await sb.from('discovery_notes').select('id, user_id').eq('id', note.id).maybeSingle();
  const userId = existingNote ? existingNote.user_id : ctx.userId;
  const noteRow = { ...discoveryNoteToRow(note), org_id: ctx.orgId, user_id: userId };
  const { error } = await sb.from('discovery_notes').upsert(noteRow, { onConflict: 'id' });
  if (error) throw error;
}

export async function dbDeleteDiscoveryNote(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ctx = await getTenantContext();
  const q = sb.from('discovery_notes').delete().eq('id', id);
  if (ctx?.orgId) q.eq('org_id', ctx.orgId);
  const { error } = await q;
  if (error) throw error;
}

// ─── AI Advice CRUD ─────────────────────────────────────────────────

export async function dbSaveAIAdvice(advice: AIAdvice): Promise<void> {
  const sb = getSupabase();
  if (!sb || isTableUnavailable('ai_advices')) return;
  const ctx = await getTenantContext();
  if (!ctx) return;
  const { error } = await sb.from('ai_advices').upsert({
    id: advice.id,
    user_id: ctx.userId,
    org_id: ctx.orgId,
    text: advice.text,
    source: advice.source,
    status: advice.status,
    account_id: advice.accountId ?? null,
    opportunity_id: advice.opportunityId ?? null,
    task_id: advice.taskId ?? null,
    created_at: advice.createdAt,
    updated_at: advice.updatedAt,
  }, { onConflict: 'id' });
  if (error) {
    if (isMissingTableError(error, 'ai_advices')) {
      markTableUnavailable('ai_advices');
      return;
    }
    console.warn('[db] saveAIAdvice error:', error.message);
  }
}

export async function dbLoadAIAdvices(): Promise<AIAdvice[]> {
  const sb = getSupabase();
  if (!sb || isTableUnavailable('ai_advices')) return [];
  const ctx = await getTenantContext();
  if (!ctx) return [];
  try {
    let q = sb.from('ai_advices').select(AI_ADVICES_HYDRATION_COLS);
    q = ctx.orgId ? q.eq('org_id', ctx.orgId) : q.eq('user_id', ctx.userId);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      text: row.text as string,
      source: row.source as AIAdvice['source'],
      status: row.status as AIAdvice['status'],
      accountId: (row.account_id as string) ?? undefined,
      opportunityId: (row.opportunity_id as string) ?? undefined,
      taskId: (row.task_id as string) ?? undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }));
  } catch (e) {
    if (isMissingTableError(e, 'ai_advices')) {
      markTableUnavailable('ai_advices');
      return [];
    }
    console.error('[db] loadAIAdvices failed:', e);
    return [];
  }
}

export async function dbDeleteAIAdvice(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb || isTableUnavailable('ai_advices')) return;
  const ctx = await getTenantContext();
  const q = sb.from('ai_advices').delete().eq('id', id);
  if (ctx?.orgId) q.eq('org_id', ctx.orgId);
  const { error } = await q;
  if (error) {
    if (isMissingTableError(error, 'ai_advices')) {
      markTableUnavailable('ai_advices');
      return;
    }
    console.warn('[db] deleteAIAdvice error:', error.message);
  }
}

// ─── Decode Feedback CRUD ───────────────────────────────────────────

export async function dbSaveDecodeFeedback(feedback: DecodeFeedback): Promise<void> {
  const sb = getSupabase();
  if (!sb || isTableUnavailable('decode_feedbacks')) return;
  const ctx = await getTenantContext();
  if (!ctx) return;
  const { error } = await sb.from('decode_feedbacks').upsert({
    id: `${feedback.decodeId}_feedback`,
    user_id: ctx.userId,
    org_id: ctx.orgId,
    decode_id: feedback.decodeId,
    accurate: feedback.accurate,
    comment: feedback.comment ?? null,
    created_at: feedback.createdAt,
  }, { onConflict: 'id' });
  if (error) {
    if (isMissingTableError(error, 'decode_feedbacks')) {
      markTableUnavailable('decode_feedbacks');
      return;
    }
    console.warn('[db] saveDecodeFeedback error:', error.message);
  }
}

export async function dbLoadDecodeFeedbacks(): Promise<DecodeFeedback[]> {
  const sb = getSupabase();
  if (!sb || isTableUnavailable('decode_feedbacks')) return [];
  const ctx = await getTenantContext();
  if (!ctx) return [];
  try {
    let q = sb.from('decode_feedbacks').select('*');
    q = ctx.orgId ? q.eq('org_id', ctx.orgId) : q.eq('user_id', ctx.userId);
    const { data, error } = await q.limit(200);
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      decodeId: row.decode_id as string,
      accurate: row.accurate as boolean,
      comment: (row.comment as string) ?? undefined,
      createdAt: row.created_at as string,
    }));
  } catch (e) {
    if (isMissingTableError(e, 'decode_feedbacks')) {
      markTableUnavailable('decode_feedbacks');
      return [];
    }
    console.error('[db] loadDecodeFeedbacks failed:', e);
    return [];
  }
}

// ─── Bulk Hydrate ────────────────────────────────────────────────────

export interface HydratedData {
  accounts: Account[];
  intelItems: IntelItem[];
  emailDecodes: SavedDecode[];
  knowledgeItems: KnowledgeItem[];
  opportunities: Opportunity[];
  composedEmails: ComposedEmail[];
  tasks: import('@/lib/babel-engine/types').Task[];
  aiAdvices: AIAdvice[];
  decodeFeedbacks: DecodeFeedback[];
}

/** Critical data needed for navigation, sidebar, and dashboard */
export interface CriticalData {
  accounts: Account[];
  opportunities: Opportunity[];
  tasks: import('@/lib/babel-engine/types').Task[];
}

/** Deferred data loaded after UI unblocks */
export interface DeferredData {
  intelItems: IntelItem[];
  emailDecodes: SavedDecode[];
  knowledgeItems: KnowledgeItem[];
  composedEmails: ComposedEmail[];
  aiAdvices: AIAdvice[];
  decodeFeedbacks: DecodeFeedback[];
}

/** Phase 1: Critical entities — blocks UI until complete */
export async function dbHydrateCritical(): Promise<CriticalData | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const [accounts, opportunities, tasks] = await Promise.all([
      dbGetAccounts(),
      dbGetOpportunities(),
      dbLoadTasks(),
    ]);
    return { accounts, opportunities, tasks };
  } catch (e) {
    console.error('[db] hydrateCritical failed:', e);
    return null;
  }
}

/** Phase 2: Deferred entities — loaded in background after UI renders */
export async function dbHydrateDeferred(): Promise<DeferredData | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const [intelItems, emailDecodes, knowledgeItems, composedEmails, aiAdvices, decodeFeedbacks] =
      await Promise.all([
        dbGetIntelItems(),
        dbGetDecodes(),
        dbGetKnowledge(),
        dbGetComposedEmails(),
        dbLoadAIAdvices(),
        dbLoadDecodeFeedbacks(),
      ]);
    return { intelItems, emailDecodes, knowledgeItems, composedEmails, aiAdvices, decodeFeedbacks };
  } catch (e) {
    console.error('[db] hydrateDeferred failed:', e);
    return null;
  }
}

/** Legacy: loads all data in one shot (kept for backward compatibility) */
export async function dbHydrateAll(): Promise<HydratedData | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const [critical, deferred] = await Promise.all([
      dbHydrateCritical(),
      dbHydrateDeferred(),
    ]);
    if (!critical) return null;
    return {
      ...critical,
      intelItems: deferred?.intelItems ?? [],
      emailDecodes: deferred?.emailDecodes ?? [],
      knowledgeItems: deferred?.knowledgeItems ?? [],
      composedEmails: deferred?.composedEmails ?? [],
      aiAdvices: deferred?.aiAdvices ?? [],
      decodeFeedbacks: deferred?.decodeFeedbacks ?? [],
    };
  } catch (e) {
    console.error('[db] hydrateAll failed:', e);
    return null;
  }
}

// Re-export for convenience
export { isSupabaseConfigured };

// Suppress unused warnings — these helpers are used internally
void toCamelKeys;
void toSnakeKeys;

// ─── Clear All Data ───────────────────────────────────────────────────

export async function dbClearAll(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ctx = await getTenantContext();
  if (!ctx) return;
  try {
    const filterKey = ctx.orgId ? 'org_id' : 'user_id';
    const filterVal = ctx.orgId ?? ctx.userId;
    // Order matters: delete children first due to foreign keys
    if (!isTableUnavailable('ai_advices')) {
      const { error } = await sb.from('ai_advices').delete().eq(filterKey, filterVal);
      if (error && isMissingTableError(error, 'ai_advices')) markTableUnavailable('ai_advices');
    }
    if (!isTableUnavailable('decode_feedbacks')) {
      const { error } = await sb.from('decode_feedbacks').delete().eq(filterKey, filterVal);
      if (error && isMissingTableError(error, 'decode_feedbacks')) markTableUnavailable('decode_feedbacks');
    }
    await sb.from('tasks').delete().eq(filterKey, filterVal);
    await sb.from('discovery_notes').delete().eq(filterKey, filterVal);
    await sb.from('meeting_preps').delete().eq(filterKey, filterVal);
    await sb.from('composed_emails').delete().eq(filterKey, filterVal);
    await sb.from('email_decodes').delete().eq(filterKey, filterVal);
    await sb.from('intel_items').delete().eq(filterKey, filterVal);
    await sb.from('knowledge_items').delete().eq(filterKey, filterVal);
    await sb.from('opportunities').delete().eq(filterKey, filterVal);
    await sb.from('contacts').delete().eq(filterKey, filterVal);
    await sb.from('accounts').delete().eq(filterKey, filterVal);
    await sb.from('user_settings').delete().eq('user_id', ctx.userId);
    console.log('[db] All data cleared from Supabase');
  } catch (e) {
    console.error('[db] clearAll failed:', e);
  }
}

// ─── Task CRUD ──────────────────────────────────────────────────────

const OPTIONAL_TASK_COLUMNS = new Set<string>();

export async function dbSaveTask(task: import('@/lib/babel-engine/types').Task, options?: { preserveOwnership?: boolean; updateAssignee?: boolean }): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ctx = await getTenantContext();
  if (!ctx) throw new Error('[db] 租户上下文不可用，无法保存 task');
  // user_id（创建者）始终保护，不随编辑者变更
  // assigned_to 默认也保护，仅在 updateAssignee=true 时写入
  // RLS INSERT policy requires user_id = auth.uid(); preserve existing user_id for updates
  let taskUserId: string | null = ctx.userId;
  if (options?.preserveOwnership) {
    const { data: existing } = await sb.from('tasks').select('id, user_id').eq('id', task.id).maybeSingle();
    taskUserId = existing ? existing.user_id : ctx.userId;
  }
  const row = {
    id: task.id,
    user_id: taskUserId,
    org_id: ctx.orgId,
    account_id: task.accountId ?? null,
    opportunity_id: task.opportunityId ?? null,
    contact_id: task.contactId ?? null,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    due_date: task.dueDate ?? null,
    ...(options?.updateAssignee ? { assigned_to: task.assignedTo ?? null } : {}),
    source: task.source,
    source_id: task.sourceId ?? null,
    ai_generated: task.aiGenerated,
    labels: task.labels ? JSON.stringify(task.labels) : null,
    attachments: task.attachments ? JSON.stringify(task.attachments) : null,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  } as Record<string, unknown>;

  for (const col of OPTIONAL_TASK_COLUMNS) {
    delete row[col];
  }

  const { error } = await sb.from('tasks').upsert(row, { onConflict: 'id' });
  if (error) {
    if (error.code === 'PGRST204') {
      const colMatch = error.message.match(/the '(\w+)' column/);
      if (colMatch) {
        const badCol = colMatch[1];
        console.warn(`[db] dbSaveTask: column '${badCol}' missing, retrying without it`);
        OPTIONAL_TASK_COLUMNS.add(badCol);
        const safeRow = { ...row };
        delete safeRow[badCol];
        const { error: retryError } = await sb.from('tasks').upsert(safeRow, { onConflict: 'id' });
        if (retryError) throw retryError;
        return;
      }
    }
    // Foreign key violation (e.g. opportunity_id references a deleted/missing opportunity)
    // → retry without the dangling FK column
    if (error.code === '23503') {
      const fkMatch = error.message.match(/constraint "tasks_(\w+)_fkey"/);
      if (fkMatch) {
        const fkCol = fkMatch[1]; // e.g. "opportunity_id"
        console.warn(`[db] dbSaveTask: FK violation on '${fkCol}', retrying with null`);
        const safeRow = { ...row, [fkCol]: null };
        const { error: retryError } = await sb.from('tasks').upsert(safeRow, { onConflict: 'id' });
        if (retryError) throw retryError;
        return;
      }
    }
    throw error;
  }
}

export async function dbDeleteTask(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ctx = await getTenantContext();
  const q = sb.from('tasks').delete().eq('id', id);
  if (ctx?.orgId) q.eq('org_id', ctx.orgId);
  const { error } = await q;
  if (error) throw error;
}

export async function dbLoadTasks(): Promise<import('@/lib/babel-engine/types').Task[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const ctx = await getTenantContext();
  if (!ctx) return [];
  let q = sb.from('tasks').select('*');
  q = ctx.orgId ? q.eq('org_id', ctx.orgId) : q.eq('user_id', ctx.userId);
  // 角色过滤：
  // - 有 account_id 的任务跟随 account 可见性（account owner_id/user_id 在可见范围内）
  // - 无 account_id 的任务按 user_id 或 assigned_to 过滤
  const visibleIds = await getCachedVisibleUserIds(ctx);
  if (visibleIds) {
    const idList = visibleIds.join(',');
    // 先拿可见 account IDs（复用 accounts 表的 owner_id 逻辑）
    const fk = ctx.orgId ? 'org_id' : 'user_id';
    const fv = ctx.orgId ?? ctx.userId;
    const { data: visibleAccts } = await sb.from('accounts').select('id').eq(fk, fv)
      .or(`owner_id.in.(${idList}),and(owner_id.is.null,user_id.in.(${idList})),and(owner_id.is.null,user_id.is.null)`);
    const visibleAccountIds = visibleAccts?.map((a: { id: string }) => a.id) ?? [];

    if (visibleAccountIds.length > 0) {
      const acctIdList = visibleAccountIds.join(',');
      // 有 account_id 的任务只按账户可见性放行；无 account_id 的独立任务按 user/assignee 放行
      q = q.or(`and(account_id.not.is.null,account_id.in.(${acctIdList})),and(account_id.is.null,user_id.in.(${idList})),and(account_id.is.null,assigned_to.in.(${idList}))`);
    } else {
      // 无可见账户时，只返回独立任务
      q = q.or(`and(account_id.is.null,user_id.in.(${idList})),and(account_id.is.null,assigned_to.in.(${idList}))`);
    }
  }
  const { data } = await q.order('created_at', { ascending: false }).limit(500);
  if (!data) return [];
  return data.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    userId: r.user_id as string | undefined,
    accountId: r.account_id as string | undefined,
    opportunityId: r.opportunity_id as string | undefined,
    contactId: r.contact_id as string | undefined,
    title: r.title as string,
    description: r.description as string | undefined,
    status: (r.status as string) || 'todo',
    priority: (r.priority as string) || 'medium',
    dueDate: r.due_date as string | undefined,
    assignedTo: r.assigned_to as string | undefined,
    source: (r.source as string) || 'manual',
    sourceId: r.source_id as string | undefined,
    aiGenerated: r.ai_generated as boolean || false,
    labels: r.labels ? (typeof r.labels === 'string' ? JSON.parse(r.labels as string) : r.labels) as string[] : undefined,
    attachments: r.attachments ? (typeof r.attachments === 'string' ? JSON.parse(r.attachments as string) : r.attachments) as import('@/lib/babel-engine/types').TaskAttachment[] : undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  })) as import('@/lib/babel-engine/types').Task[];
}

// ─── Organization CRUD ──────────────────────────────────────────────

export async function dbCreateOrganization(name: string, userId: string): Promise<Organization | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    // Create org
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { data: org, error } = await admin
      .from('organizations')
      .insert({ name, slug })
      .select()
      .single();
    if (error) throw error;
    // Create owner membership
    const { error: memErr } = await admin
      .from('org_memberships')
      .insert({ user_id: userId, org_id: org.id, role: 'owner' });
    if (memErr) throw memErr;
    clearOrgCache();
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logoUrl: org.logo_url ?? undefined,
      settings: (org.settings as OrgSettings) ?? {},
      createdAt: org.created_at,
      updatedAt: org.updated_at,
    };
  } catch (e) {
    console.error('[db] createOrganization failed:', e);
    return null;
  }
}

export async function dbGetOrganization(orgId: string): Promise<Organization | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();
    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      slug: data.slug ?? undefined,
      logoUrl: data.logo_url ?? undefined,
      settings: (data.settings as OrgSettings) ?? {},
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (e) {
    console.error('[db] getOrganization failed:', e);
    return null;
  }
}

export async function dbUpdateOrganization(orgId: string, updates: Partial<Pick<Organization, 'name' | 'settings'>>): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) row.name = updates.name;
    if (updates.settings !== undefined) row.settings = updates.settings;
    await sb.from('organizations').update(row).eq('id', orgId);
  } catch (e) {
    console.error('[db] updateOrganization failed:', e);
  }
}

export async function dbGetOrgMembers(orgId: string): Promise<OrgMember[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from('org_memberships')
      .select('*')
      .eq('org_id', orgId)
      .order('joined_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      userId: r.user_id as string,
      orgId: r.org_id as string,
      teamId: (r.team_id as string) ?? undefined,
      role: r.role as OrgRole,
      displayName: (r.display_name as string) ?? undefined,
      invitedBy: (r.invited_by as string) ?? undefined,
      joinedAt: r.joined_at as string,
    }));
  } catch (e) {
    console.error('[db] getOrgMembers failed:', e);
    return [];
  }
}

export async function dbGetCurrentMembership(userId: string, orgId: string): Promise<OrgMember | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('org_memberships')
      .select('*')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .single();
    if (error) throw error;
    return {
      id: data.id,
      userId: data.user_id,
      orgId: data.org_id,
      teamId: data.team_id ?? undefined,
      role: data.role as OrgRole,
      displayName: data.display_name ?? undefined,
      invitedBy: data.invited_by ?? undefined,
      joinedAt: data.joined_at,
    };
  } catch (e) {
    console.error('[db] getCurrentMembership failed:', e);
    return null;
  }
}

export async function dbGetUserOrgs(userId: string): Promise<{ orgId: string; orgName: string; role: OrgRole }[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from('org_memberships')
      .select('org_id, role, organizations(name)')
      .eq('user_id', userId);
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      orgId: r.org_id as string,
      orgName: ((r.organizations as Record<string, unknown>)?.name as string) ?? '',
      role: r.role as OrgRole,
    }));
  } catch (e) {
    console.error('[db] getUserOrgs failed:', e);
    return [];
  }
}

export async function dbInviteMember(orgId: string, email: string, role: Exclude<OrgRole, 'owner'>, invitedBy: string): Promise<OrgInvitation | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
    const { data, error } = await admin
      .from('org_invitations')
      .insert({ org_id: orgId, email, role, token, invited_by: invitedBy, expires_at: expiresAt })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      orgId: data.org_id,
      email: data.email,
      role: data.role as Exclude<OrgRole, 'owner'>,
      token: data.token,
      invitedBy: data.invited_by ?? undefined,
      expiresAt: data.expires_at,
      acceptedAt: data.accepted_at ?? undefined,
      createdAt: data.created_at,
    };
  } catch (e) {
    console.error('[db] inviteMember failed:', e);
    return null;
  }
}

export async function dbAcceptInvitation(token: string, userId: string): Promise<{ orgId: string; role: OrgRole } | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    // Find invitation
    const { data: inv, error: findErr } = await admin
      .from('org_invitations')
      .select('*')
      .eq('token', token)
      .is('accepted_at', null)
      .single();
    if (findErr || !inv) return null;
    // Check expiry
    if (new Date(inv.expires_at) < new Date()) return null;
    // Create membership
    const { error: memErr } = await admin
      .from('org_memberships')
      .insert({ user_id: userId, org_id: inv.org_id, role: inv.role, invited_by: inv.invited_by });
    if (memErr) throw memErr;
    // Mark accepted
    await admin
      .from('org_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', inv.id);
    clearOrgCache();
    return { orgId: inv.org_id, role: inv.role as OrgRole };
  } catch (e) {
    console.error('[db] acceptInvitation failed:', e);
    return null;
  }
}

export async function dbUpdateMemberRole(orgId: string, userId: string, newRole: OrgRole): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb
      .from('org_memberships')
      .update({ role: newRole })
      .eq('org_id', orgId)
      .eq('user_id', userId);
  } catch (e) {
    console.error('[db] updateMemberRole failed:', e);
  }
}

export async function dbRemoveMember(orgId: string, userId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb
      .from('org_memberships')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', userId);
  } catch (e) {
    console.error('[db] removeMember failed:', e);
  }
}

export async function dbGetOrgInvitations(orgId: string): Promise<OrgInvitation[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from('org_invitations')
      .select('*')
      .eq('org_id', orgId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      orgId: r.org_id as string,
      email: r.email as string,
      role: r.role as Exclude<OrgRole, 'owner'>,
      token: r.token as string,
      invitedBy: (r.invited_by as string) ?? undefined,
      expiresAt: r.expires_at as string,
      acceptedAt: (r.accepted_at as string) ?? undefined,
      createdAt: r.created_at as string,
    }));
  } catch (e) {
    console.error('[db] getOrgInvitations failed:', e);
    return [];
  }
}

// ─── Activity Logs ──────────────────────────────────────────────────

export interface ActivityLog {
  id: string;
  userId: string | null;
  orgId: string | null;
  userDisplayName: string | null;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  accountId: string | null;
  accountName: string | null;
  contactId: string | null;
  contactName: string | null;
  opportunityId: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Log an activity (uses admin client to bypass RLS) */
export async function dbLogActivity(params: {
  userId: string;
  orgId: string | null;
  userDisplayName?: string;
  actionType: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  accountId?: string;
  accountName?: string;
  contactId?: string;
  contactName?: string;
  opportunityId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    // 客户端没有 admin client，改用 API 写入
    try {
      await fetch("/api/log-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
    } catch {}
    return;
  }
  try {
    await admin.from('activity_logs').insert({
      user_id: params.userId,
      org_id: params.orgId,
      user_display_name: params.userDisplayName ?? null,
      action_type: params.actionType,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      entity_name: params.entityName ?? null,
      account_id: params.accountId ?? null,
      account_name: params.accountName ?? null,
      contact_id: params.contactId ?? null,
      contact_name: params.contactName ?? null,
      opportunity_id: params.opportunityId ?? null,
      summary: params.summary,
      metadata: params.metadata ?? {},
    });
  } catch (e) {
    console.error('[db] logActivity failed:', e);
  }
}

/** Get activity logs (admin only — RLS enforces owner/admin restriction) */
export async function dbGetActivityLogs(filters?: {
  orgId?: string;
  userId?: string;
  accountId?: string;
  actionType?: string;
  limit?: number;
  offset?: number;
}): Promise<ActivityLog[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    let q = sb.from('activity_logs').select('*');
    if (filters?.orgId) q = q.eq('org_id', filters.orgId);
    if (filters?.userId) q = q.eq('user_id', filters.userId);
    if (filters?.accountId) q = q.eq('account_id', filters.accountId);
    if (filters?.actionType) q = q.eq('action_type', filters.actionType);
    q = q.order('created_at', { ascending: false });
    if (filters?.limit) q = q.limit(filters.limit);
    if (filters?.offset) q = q.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      userId: r.user_id as string | null,
      orgId: r.org_id as string | null,
      userDisplayName: r.user_display_name as string | null,
      actionType: r.action_type as string,
      entityType: r.entity_type as string | null,
      entityId: r.entity_id as string | null,
      entityName: r.entity_name as string | null,
      accountId: r.account_id as string | null,
      accountName: r.account_name as string | null,
      contactId: r.contact_id as string | null,
      contactName: r.contact_name as string | null,
      opportunityId: r.opportunity_id as string | null,
      summary: r.summary as string | null,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      createdAt: r.created_at as string,
    }));
  } catch (e) {
    console.error('[db] getActivityLogs failed:', e);
    return [];
  }
}

/** Convenience wrapper: resolves userId/orgId automatically, then logs */
export async function logActivity(
  actionType: string,
  summary: string,
  extra?: Partial<Omit<Parameters<typeof dbLogActivity>[0], 'userId' | 'orgId' | 'actionType' | 'summary'>>,
): Promise<void> {
  const userId = await getCurrentUserId();
  const orgId = await getCurrentOrgId();
  if (!userId) return;
  await dbLogActivity({ userId, orgId, actionType, summary, ...extra });
}

// ─── RFP Conversion ─────────────────────────────────────────────────

function rowToRfp(row: RfpRow, documents: RfpDocument[], milestones: RfpMilestone[]): Rfp {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    accountId: row.account_id,
    title: row.title,
    issuer: row.issuer,
    issuedDate: row.issued_date ?? '',
    dueDate: row.due_date ?? '',
    status: row.status,
    budget: row.budget ?? undefined,
    currency: row.currency,
    requirements: row.requirements ?? [],
    documents,
    milestones,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToRfpDocument(row: RfpDocumentRow): RfpDocument {
  return {
    name: row.name,
    type: row.doc_type,
    url: row.url ?? undefined,
    uploadedAt: row.created_at,
  };
}

function rowToRfpMilestone(row: RfpMilestoneRow): RfpMilestone {
  return {
    id: row.id,
    title: row.title,
    dueDate: row.due_date ?? '',
    status: row.status,
    assignedTo: row.assigned_to ?? undefined,
  };
}

// ─── RFP CRUD ───────────────────────────────────────────────────────

export async function dbGetRfps(): Promise<Rfp[]> {
  const sb = getSupabase();
  const orgId = await getCurrentOrgId();
  if (!sb || !orgId) return [];

  const { data: rows, error } = await sb
    .from('rfps')
    .select('*')
    .eq('org_id', orgId)
    .order('due_date', { ascending: true, nullsFirst: false });

  if (error || !rows) return [];

  const rfpIds = rows.map((r: RfpRow) => r.id);
  if (rfpIds.length === 0) return rows.map((r: RfpRow) => rowToRfp(r, [], []));

  const [{ data: docs }, { data: mils }] = await Promise.all([
    sb.from('rfp_documents').select('*').eq('org_id', orgId).in('rfp_id', rfpIds),
    sb.from('rfp_milestones').select('*').eq('org_id', orgId).in('rfp_id', rfpIds),
  ]);

  const docsByRfp = new Map<string, RfpDocument[]>();
  for (const d of (docs ?? []) as RfpDocumentRow[]) {
    const arr = docsByRfp.get(d.rfp_id) ?? [];
    arr.push(rowToRfpDocument(d));
    docsByRfp.set(d.rfp_id, arr);
  }

  const milsByRfp = new Map<string, RfpMilestone[]>();
  for (const m of (mils ?? []) as RfpMilestoneRow[]) {
    const arr = milsByRfp.get(m.rfp_id) ?? [];
    arr.push(rowToRfpMilestone(m));
    milsByRfp.set(m.rfp_id, arr);
  }

  return rows.map((r: RfpRow) =>
    rowToRfp(r, docsByRfp.get(r.id) ?? [], milsByRfp.get(r.id) ?? []),
  );
}

export async function dbGetRfpById(rfpId: string): Promise<Rfp | null> {
  const sb = getSupabase();
  const orgId = await getCurrentOrgId();
  if (!sb || !orgId) return null;

  const { data: row, error } = await sb
    .from('rfps')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', rfpId)
    .single();

  if (error || !row) return null;

  const [{ data: docs }, { data: mils }] = await Promise.all([
    sb.from('rfp_documents').select('*').eq('org_id', orgId).eq('rfp_id', rfpId),
    sb.from('rfp_milestones').select('*').eq('org_id', orgId).eq('rfp_id', rfpId).order('due_date', { ascending: true }),
  ]);

  return rowToRfp(
    row as RfpRow,
    ((docs ?? []) as RfpDocumentRow[]).map(rowToRfpDocument),
    ((mils ?? []) as RfpMilestoneRow[]).map(rowToRfpMilestone),
  );
}

export async function dbUpsertRfp(rfp: Partial<Rfp> & { title: string; opportunityId: string; accountId: string }): Promise<Rfp | null> {
  const sb = getSupabase();
  const orgId = await getCurrentOrgId();
  const userId = await getCurrentUserId();
  if (!sb || !orgId) return null;

  const row: Record<string, unknown> = {
    org_id: orgId,
    opportunity_id: rfp.opportunityId,
    account_id: rfp.accountId,
    title: rfp.title,
    issuer: rfp.issuer ?? '',
    issued_date: rfp.issuedDate || null,
    due_date: rfp.dueDate || null,
    status: rfp.status ?? 'identified',
    budget: rfp.budget ?? null,
    currency: rfp.currency ?? 'CNY',
    requirements: rfp.requirements ?? [],
    notes: rfp.notes ?? '',
    created_by: userId,
  };

  if (rfp.id) {
    row.id = rfp.id;
  }

  const { data, error } = await sb
    .from('rfps')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();

  if (error || !data) return null;
  return rowToRfp(data as RfpRow, [], []);
}

export async function dbDeleteRfp(rfpId: string): Promise<boolean> {
  const sb = getSupabase();
  const orgId = await getCurrentOrgId();
  if (!sb || !orgId) return false;

  const { error } = await sb
    .from('rfps')
    .delete()
    .eq('org_id', orgId)
    .eq('id', rfpId);

  return !error;
}

export async function dbGetRfpCompetitors(rfpId: string): Promise<RfpCompetitorRow[]> {
  const sb = getSupabase();
  const orgId = await getCurrentOrgId();
  if (!sb || !orgId) return [];

  const { data, error } = await sb
    .from('rfp_competitors')
    .select('*')
    .eq('org_id', orgId)
    .eq('rfp_id', rfpId);

  if (error || !data) return [];
  return data as RfpCompetitorRow[];
}

export async function dbUpsertRfpCompetitor(competitor: Partial<RfpCompetitorRow> & { rfp_id: string; name: string }): Promise<RfpCompetitorRow | null> {
  const sb = getSupabase();
  const orgId = await getCurrentOrgId();
  if (!sb || !orgId) return null;

  const row = { ...competitor, org_id: orgId };

  const { data, error } = await sb
    .from('rfp_competitors')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();

  if (error || !data) return null;
  return data as RfpCompetitorRow;
}

export async function dbGetRfpAnalyses(rfpId: string): Promise<RfpAnalysisRow[]> {
  const sb = getSupabase();
  const orgId = await getCurrentOrgId();
  if (!sb || !orgId) return [];

  const { data, error } = await sb
    .from('rfp_ai_analyses')
    .select('*')
    .eq('org_id', orgId)
    .eq('rfp_id', rfpId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as RfpAnalysisRow[];
}

export async function dbInsertRfpAnalysis(analysis: Omit<RfpAnalysisRow, 'id' | 'org_id' | 'created_at'>): Promise<RfpAnalysisRow | null> {
  const sb = getSupabase();
  const orgId = await getCurrentOrgId();
  if (!sb || !orgId) return null;

  const { data, error } = await sb
    .from('rfp_ai_analyses')
    .insert({ ...analysis, org_id: orgId })
    .select()
    .single();

  if (error || !data) return null;
  return data as RfpAnalysisRow;
}

// ─── Migrate user data to org ───────────────────────────────────────

/** Migrate all existing user_id-only data to an org (run once after org creation) */
export async function dbMigrateUserDataToOrg(userId: string, orgId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const tables = ['accounts', 'contacts', 'opportunities', 'intel_items', 'email_decodes', 'composed_emails', 'meeting_preps', 'discovery_notes', 'knowledge_items', 'user_settings', 'tasks'];
  try {
    for (const table of tables) {
      await admin
        .from(table)
        .update({ org_id: orgId })
        .eq('user_id', userId)
        .is('org_id', null);
    }
    console.log('[db] Migrated user data to org:', orgId);
  } catch (e) {
    console.error('[db] migrateUserDataToOrg failed:', e);
  }
}
