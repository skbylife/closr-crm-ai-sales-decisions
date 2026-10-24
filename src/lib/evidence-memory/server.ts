import { ApiError, requireAccountAccess, requireAdmin } from '@/lib/api-guard';
import { MemoryCache, withCache } from '@/lib/cache';
import type { ContactRole, StrategicPlay } from '@/lib/babel-engine/types';
import type { UserContext } from '@/lib/permissions';
import type { EvidenceRecord } from './index';
import { buildAdHocRecommendationEvidenceBundle, buildMemorySummary, buildMomentumShift, buildRecommendationEvidenceBundle, detectConflicts, hydrateRecordSignal, toTimelineItems } from './index';
import { inferEmailAccount, type IntegrationEmail, type AccountHint, type ConnectionHint } from './integration-attribution';

// ─── Types (hoisted for cache declarations) ─────────────────────────
type MemorySnapshotPayload = {
  summary: ReturnType<typeof buildMemorySummary>;
  conflicts: ReturnType<typeof detectConflicts>;
  timelineItems: ReturnType<typeof toTimelineItems>;
  previousSummary: ReturnType<typeof buildMemorySummary> | null;
  momentumShift: ReturnType<typeof buildMomentumShift> | null;
  summaryHistory: { id: string; label: string; summary: ReturnType<typeof buildMemorySummary> }[];
};

// ─── Server-side in-memory caches ────────────────────────────────────
/** Per-account evidence records cache (3 min TTL) */
const evidenceCache = new MemoryCache<EvidenceRecord[]>(50);
const EVIDENCE_TTL = 3 * 60 * 1000;

/** Org-wide account hints cache (10 min TTL — changes rarely) */
const accountHintsCache = new MemoryCache<AccountHint[]>(20);
const ACCOUNT_HINTS_TTL = 10 * 60 * 1000;

/** Org-wide connection hints cache (10 min TTL — changes rarely) */
const connectionHintsCache = new MemoryCache<ConnectionHint[]>(20);
const CONNECTION_HINTS_TTL = 10 * 60 * 1000;

/** Unified memory payload cache (3 min TTL — avoids DB snapshot round-trip) */
const memoryPayloadCache = new MemoryCache<MemorySnapshotPayload>(30);
const MEMORY_PAYLOAD_TTL = 3 * 60 * 1000;

/** Map raw DB table names to user-facing Chinese labels */
const SOURCE_TABLE_LABELS: Record<string, string> = {
  intel_items: '情报记录',
  email_decodes: '邮件解读',
  integration_emails: '邮件往来',
  meeting_preps: '会议纪要',
  meeting_recordings: '会议录音/通话记录',
  activity_logs: '活动记录',
  strategic_plays: '谋局建议',
  rfps: 'RFP',
  rfp_ai_analyses: 'RFP判断',
  source_records: '来源记录',
  public_web: '公开网页',
  account_evidence: '账户证据',
  account_claims: '账户判断',
  account_knowledge_pages: '知识页',
};

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  stakeholder_assessment: '干系人评估',
  risk_hypothesis: '风险线索',
  initiative_judgment: '项目线索',
  budget_signal: '预算信号',
  procurement_signal: '采购信号',
  competitive_intel: '竞争情报',
  relationship_signal: '关系信号',
  general: '综合证据',
};

const CLAIM_TYPE_LABELS: Record<string, string> = {
  risk_hypothesis: '风险判断',
  stakeholder_assessment: '干系人判断',
  budget_signal: '预算判断',
  competitive_intel: '竞争判断',
  initiative_judgment: '项目判断',
  relationship_signal: '关系判断',
  procurement_signal: '采购判断',
  general: '综合判断',
};

const KNOWLEDGE_PAGE_LABELS: Record<string, string> = {
  overview: '账户全景',
  stakeholders: '关键干系人',
  timeline: '推进时间线',
  risks: '主要风险',
  competition: '竞争格局',
  strategy: '推进策略',
  notes: '业务笔记',
};

const ACTIVITY_ACTION_TYPE_LABELS: Record<string, string> = {
  account_created: '创建客户',
  opportunity_created: '创建商机',
  deal_stage_changed: '商机阶段更新',
  contact_role_changed: '联系人角色更新',
  meeting_held: '召开会议',
  email_received: '收到邮件',
  material_submitted: '提交材料',
  procurement_sync: '采购同步',
  technical_blocker_identified: '识别技术阻塞',
  strategic_play_updated: '谋局更新',
  task_completed: '完成任务',
};

function getActivityActionTypeLabel(actionType: string | undefined): string {
  if (!actionType) return '活动记录';
  return ACTIVITY_ACTION_TYPE_LABELS[actionType] ?? '活动更新';
}

function sanitizeSourceLabel(label: string | undefined, fallbackTitle: string): string {
  if (!label) return fallbackTitle;
  // Avoid exposing raw kind:uuid patterns or bare UUIDs
  if (/^[a-z_]+:[0-9a-f-]{20,}$/i.test(label)) return fallbackTitle;
  if (/^[0-9a-f-]{20,}$/i.test(label)) return fallbackTitle;
  return label;
}

function mapSourceTable(rawTable: string | undefined): string | undefined {
  if (!rawTable) return undefined;
  return SOURCE_TABLE_LABELS[rawTable] ?? rawTable;
}

function isMissingTable(error: unknown, table: string) {
  const message = (
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : error instanceof Error
        ? error.message
        : String(error ?? '')
  );

  return message.includes(`relation "public.${table}" does not exist`)
    || message.includes(`Could not find the table 'public.${table}'`)
    || message.includes('in the schema cache');
}

async function safeSelect<T>(table: string, query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error, table)) return [] as T[];
    throw new Error(error.message);
  }
  return data ?? [];
}

async function assertEvidenceAccountScope(accountId: string, orgId: string, ctx?: UserContext): Promise<void> {
  if (!ctx) return;
  if (ctx.orgId !== orgId) {
    throw new ApiError(403, '组织上下文不匹配，无法加载证据上下文');
  }
  await requireAccountAccess(ctx, accountId);
}

export async function loadEvidenceRecordsUnsafeInternal(accountId: string, orgId: string): Promise<EvidenceRecord[]> {
  const admin = requireAdmin();

  // Org-wide hints are cached separately (10 min TTL) — needed by inferEmailAccount()
  const accountHintsPromise = withCache(accountHintsCache, `hints:accounts:${orgId}`, ACCOUNT_HINTS_TTL, async () => {
    const rows = await safeSelect('accounts', admin.from('accounts').select('id, name, website').eq('org_id', orgId).limit(50));
    return (rows as { id: string; name?: string | null; website?: string | null }[]).map((a) => ({ id: a.id, name: a.name ?? '', website: a.website ?? null }));
  });
  const connectionHintsPromise = withCache(connectionHintsCache, `hints:connections:${orgId}`, CONNECTION_HINTS_TTL, async () => {
    const rows = await safeSelect('integration_connections', admin.from('integration_connections').select('id, connector_id, config, status').eq('org_id', orgId).limit(20));
    return (rows as { id: string; config?: Record<string, unknown> | null }[]).map((c) => ({ id: c.id, config: c.config ?? null }));
  });

  const [intelItems, emailDecodes, directEmails, unattributedEmails, meetingPreps, activityLogs, plays, contacts, accountHints, connectionHints, sourceRecords, compiledClaims, compiledEvidence, knowledgePages] = await Promise.all([
    safeSelect('intel_items', admin.from('intel_items').select('id, title, summary, content, date, related_contact_ids').eq('org_id', orgId).eq('account_id', accountId).order('date', { ascending: false }).limit(20)),
    safeSelect('email_decodes', admin.from('email_decodes').select('id, date, email_text, original_sender_name, matched_contact_id').eq('org_id', orgId).eq('account_id', accountId).order('created_at', { ascending: false }).limit(20)),
    // P2: Split integration_emails into two scoped queries instead of one org-wide query
    // 1) Emails directly attributed to this account
    safeSelect('integration_emails', admin.from('integration_emails').select('id, account_id, contact_id, connection_id, subject, summary, sender, received_at').eq('org_id', orgId).eq('account_id', accountId).order('received_at', { ascending: false }).limit(30)),
    // 2) Unattributed emails — need inferEmailAccount() to determine account ownership
    safeSelect('integration_emails', admin.from('integration_emails').select('id, account_id, contact_id, connection_id, subject, summary, sender, received_at').eq('org_id', orgId).is('account_id', null).order('received_at', { ascending: false }).limit(30)),
    safeSelect('meeting_preps', admin.from('meeting_preps').select('id, input, result, created_at').eq('org_id', orgId).eq('account_id', accountId).order('created_at', { ascending: false }).limit(12)),
    safeSelect('activity_logs', admin.from('activity_logs').select('id, summary, action_type, contact_id, contact_name, created_at').eq('org_id', orgId).eq('account_id', accountId).order('created_at', { ascending: false }).limit(20)),
    safeSelect('strategic_plays', admin.from('strategic_plays').select('id, goal_description, confidence, updated_at').eq('org_id', orgId).eq('account_id', accountId).order('updated_at', { ascending: false }).limit(12)),
    // P2: Scope contacts to account_id — eliminates org-wide fetch + client-side filter
    safeSelect('contacts', admin.from('contacts').select('id, account_id, name, email, title, role').eq('org_id', orgId).eq('account_id', accountId).limit(40)),
    accountHintsPromise,
    connectionHintsPromise,
    safeSelect('source_records', admin.from('source_records').select('id, source_kind, source_table, source_row_id, title, summary, occurred_at, metadata').eq('org_id', orgId).eq('account_id', accountId).order('occurred_at', { ascending: false }).limit(120)),
    safeSelect('account_claims', admin.from('account_claims').select('id, claim_type, statement, status, confidence, affected_object_ids, updated_at, supporting_evidence_ids, counter_evidence_ids').eq('org_id', orgId).eq('account_id', accountId).order('updated_at', { ascending: false }).limit(60)),
    safeSelect('account_evidence', admin.from('account_evidence').select('id, source_id, source_type, evidence_type, quote_text, summary, speaker, occurred_at, relevance_score, linked_claim_ids, linked_page_types, created_at').eq('org_id', orgId).eq('account_id', accountId).order('occurred_at', { ascending: false }).order('created_at', { ascending: false }).limit(120)),
    safeSelect('account_knowledge_pages', admin.from('account_knowledge_pages').select('id, page_type, title, content_json, updated_at').eq('org_id', orgId).eq('account_id', accountId).order('updated_at', { ascending: false }).limit(24)),
  ]);

  // Merge the two integration_emails result sets
  const integrationEmails = [...directEmails, ...unattributedEmails];

  // P2: contacts query is already scoped to account_id — no client-side filter needed
  const scopedContacts = contacts as { id: string; account_id: string; name: string; email?: string; title?: string; role?: ContactRole }[];
  const contactMap = new Map(scopedContacts.map((contact) => [contact.id, contact]));
  const contactByName = new Map(scopedContacts.map((contact) => [contact.name.trim().toLowerCase(), contact]));
  const sourceRecordMap = new Map(
    (sourceRecords as {
      id: string;
      source_kind?: string | null;
      source_table?: string | null;
      source_row_id: string;
      title?: string | null;
      summary?: string | null;
      occurred_at?: string | null;
      metadata?: Record<string, unknown> | null;
    }[]).map((record) => [`${record.source_kind ?? 'source_record'}:${record.source_row_id}`, record])
  );
  const records: EvidenceRecord[] = [];

  function withTraceability(input: EvidenceRecord): EvidenceRecord {
    const sourceRecord = sourceRecordMap.get(`${input.sourceKind}:${input.sourceId}`);
    const rawTable = sourceRecord?.source_table ?? input.sourceTable;
    return {
      ...input,
      sourceLabel: sanitizeSourceLabel(sourceRecord?.title ?? input.sourceLabel, input.title),
      sourceTable: mapSourceTable(rawTable),
      sourceRowId: sourceRecord?.source_row_id ?? input.sourceRowId ?? input.sourceId,
      occurredAt: sourceRecord?.occurred_at ?? input.occurredAt,
      summary: sourceRecord?.summary ?? input.summary,
      title: sourceRecord?.title ?? input.title,
    };
  }

  for (const item of intelItems as { id: string; title?: string; summary?: string; content?: string; date?: string; related_contact_ids?: string[] }[]) {
    const contact = item.related_contact_ids?.[0] ? contactMap.get(item.related_contact_ids[0]) : undefined;
    records.push(withTraceability({
      sourceId: item.id,
      sourceKind: 'intel_item',
      occurredAt: item.date ?? new Date().toISOString(),
      title: item.title ?? '情报信号',
      summary: item.summary ?? item.content ?? '无摘要',
      signal: hydrateRecordSignal({ title: item.title ?? '', summary: item.summary ?? item.content ?? '' }),
      weight: 0.9,
      sourceTable: SOURCE_TABLE_LABELS['intel_items'],
      sourceRowId: item.id,
      contactId: contact?.id,
      contactName: contact?.name,
      contactTitle: contact?.title,
      contactRole: contact?.role,
    }));
  }

  for (const item of emailDecodes as { id: string; date?: string; email_text?: string; original_sender_name?: string; matched_contact_id?: string }[]) {
    const contact = item.matched_contact_id ? contactMap.get(item.matched_contact_id) : undefined;
    const summary = (item.email_text ?? '').slice(0, 180) || '邮件解读记录';
    records.push(withTraceability({
      sourceId: item.id,
      sourceKind: 'email_decode',
      occurredAt: item.date ?? new Date().toISOString(),
      title: item.original_sender_name ? `邮件解读 · ${item.original_sender_name}` : '邮件解读',
      summary,
      signal: hydrateRecordSignal({ title: '邮件解读', summary }),
      weight: 0.85,
      sourceTable: SOURCE_TABLE_LABELS['email_decodes'],
      sourceRowId: item.id,
      contactId: contact?.id,
      contactName: contact?.name,
      contactTitle: contact?.title,
      contactRole: contact?.role,
    }));
  }

  // accountHints and connectionHints are already resolved from the cached promises above
  const matchedIntegrationEmails = (integrationEmails as IntegrationEmail[])
    .map((email) => ({ email, attribution: inferEmailAccount(email, accountHints, connectionHints) }))
    .filter(({ email, attribution }) => email.account_id === accountId || attribution.accountId === accountId);

  for (const { email: item } of matchedIntegrationEmails) {
    const contact = item.contact_id ? contactMap.get(item.contact_id) : undefined;
    const title = item.subject || `互动邮件 · ${item.sender || '未知发送者'}`;
    const summary = item.summary || item.sender || '邮件互动';
    records.push(withTraceability({
      sourceId: item.id,
      sourceKind: 'integration_email',
      occurredAt: item.received_at ?? new Date().toISOString(),
      title,
      summary,
      signal: hydrateRecordSignal({ title, summary }),
      weight: item.account_id ? 0.8 : 0.68,
      sourceTable: SOURCE_TABLE_LABELS['integration_emails'],
      sourceRowId: item.id,
      contactId: contact?.id,
      contactName: contact?.name,
      contactTitle: contact?.title,
      contactRole: contact?.role,
    }));
  }

  for (const item of meetingPreps as { id: string; input?: { meetingTitle?: string }; result?: { meetingSummary?: { title?: string }; recentDynamics?: string }; created_at?: string }[]) {
    const title = item.result?.meetingSummary?.title || item.input?.meetingTitle || '会议记录';
    const summary = item.result?.recentDynamics || '已生成会议准备/纪要，可作为当前 account 关系变化的依据。';
    records.push(withTraceability({
      sourceId: item.id,
      sourceKind: 'meeting_prep',
      occurredAt: item.created_at ?? new Date().toISOString(),
      title,
      summary,
      signal: hydrateRecordSignal({ title, summary }),
      weight: 0.75,
      sourceTable: SOURCE_TABLE_LABELS['meeting_preps'],
      sourceRowId: item.id,
    }));
  }

  for (const item of activityLogs as { id: string; summary?: string; action_type?: string; contact_id?: string; contact_name?: string; created_at?: string }[]) {
    const contact = item.contact_id ? contactMap.get(item.contact_id) : undefined;
    const title = `活动记录 · ${getActivityActionTypeLabel(item.action_type)}`;
    const summary = item.summary || '手动活动记录';
    records.push(withTraceability({
      sourceId: item.id,
      sourceKind: 'activity_log',
      occurredAt: item.created_at ?? new Date().toISOString(),
      title,
      summary,
      signal: hydrateRecordSignal({ title, summary }),
      weight: 0.65,
      sourceTable: SOURCE_TABLE_LABELS['activity_logs'],
      sourceRowId: item.id,
      contactId: contact?.id,
      contactName: contact?.name ?? item.contact_name,
      contactTitle: contact?.title,
      contactRole: contact?.role,
    }));
  }

  for (const item of plays as { id: string; goal_description?: string; confidence?: number; updated_at?: string }[]) {
    const title = '谋局建议';
    const summary = `${item.goal_description ?? '已有战略动作'}（置信度 ${Number(item.confidence ?? 0)}）`;
    records.push(withTraceability({
      sourceId: item.id,
      sourceKind: 'strategic_play',
      occurredAt: item.updated_at ?? new Date().toISOString(),
      title,
      summary,
      signal: hydrateRecordSignal({ title, summary }),
      weight: 0.55,
      sourceTable: SOURCE_TABLE_LABELS['strategic_plays'],
      sourceRowId: item.id,
    }));
  }

  for (const item of sourceRecords as {
    id: string;
    source_kind?: string | null;
    source_table?: string | null;
    source_row_id: string;
    title?: string | null;
    summary?: string | null;
    occurred_at?: string | null;
    metadata?: Record<string, unknown> | null;
  }[]) {
    const key = `${item.source_kind ?? 'source_record'}:${item.source_row_id}`;
    if (records.some((record) => `${record.sourceKind}:${record.sourceRowId ?? record.sourceId}` === key)) continue;
    const title = item.title ?? '来源记录';
    const summary = item.summary ?? '原始来源记录';
    const metadataContactName = typeof item.metadata?.contact === 'string' ? item.metadata.contact.trim() : '';
    const contact = metadataContactName ? contactByName.get(metadataContactName.toLowerCase()) : undefined;
    records.push({
      sourceId: item.id,
      sourceKind: 'source_record',
      sourceLabel: title,
      sourceTable: mapSourceTable(item.source_table ?? undefined) ?? SOURCE_TABLE_LABELS['source_records'],
      sourceRowId: item.source_row_id,
      occurredAt: item.occurred_at ?? new Date().toISOString(),
      title,
      summary,
      signal: hydrateRecordSignal({ title, summary }),
      weight: 0.6,
      contactId: contact?.id,
      contactName: contact?.name ?? (metadataContactName || undefined),
      contactTitle: contact?.title,
      contactRole: contact?.role,
    });
  }

  for (const item of compiledEvidence as {
    id: string;
    source_id?: string | null;
    evidence_type?: string | null;
    quote_text?: string | null;
    summary?: string | null;
    speaker?: string | null;
    occurred_at?: string | null;
    relevance_score?: number | null;
    created_at?: string | null;
  }[]) {
    const speakerName = item.speaker?.trim();
    const contact = speakerName ? contactByName.get(speakerName.toLowerCase()) : undefined;
    const title = item.evidence_type ? `证据 · ${EVIDENCE_TYPE_LABELS[item.evidence_type] ?? '综合证据'}` : '账户证据';
    const summary = item.summary ?? item.quote_text ?? '编译证据';
    records.push(withTraceability({
      sourceId: item.id,
      sourceKind: 'source_record',
      occurredAt: item.occurred_at ?? item.created_at ?? new Date().toISOString(),
      title,
      summary,
      signal: hydrateRecordSignal({ title: `${title} ${speakerName ?? ''}`, summary }),
      weight: 0.82 + Math.min(Number(item.relevance_score ?? 0) * 0.1, 0.12),
      sourceLabel: title,
      sourceTable: SOURCE_TABLE_LABELS['account_evidence'],
      sourceRowId: item.id,
      contactId: contact?.id,
      contactName: contact?.name,
      contactTitle: contact?.title,
      contactRole: contact?.role,
    }));
  }

  for (const item of compiledClaims as {
    id: string;
    claim_type?: string | null;
    statement: string;
    status?: string | null;
    confidence?: number | null;
    updated_at?: string | null;
  }[]) {
    const title = item.claim_type ? `判断 · ${CLAIM_TYPE_LABELS[item.claim_type] ?? '综合判断'}` : '账户判断';
    const summary = item.statement;
    records.push(withTraceability({
      sourceId: item.id,
      sourceKind: 'source_record',
      occurredAt: item.updated_at ?? new Date().toISOString(),
      title,
      summary,
      signal: item.status === 'stale' || item.status === 'invalidated' ? 'risk' : hydrateRecordSignal({ title, summary }),
      weight: 0.72 + Math.min(Number(item.confidence ?? 0) * 0.12, 0.12),
      sourceLabel: title,
      sourceTable: SOURCE_TABLE_LABELS['account_claims'],
      sourceRowId: item.id,
    }));
  }

  for (const item of knowledgePages as {
    id: string;
    page_type?: string | null;
    title?: string | null;
    content_json?: Record<string, unknown> | null;
    updated_at?: string | null;
  }[]) {
    const content = item.content_json && typeof item.content_json === 'object' ? item.content_json : {};
    const summary = [content.summary, content.narrative, Array.isArray(content.milestones) ? (content.milestones as string[]).join('；') : undefined]
      .find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined;
    const pageType = item.page_type ?? 'overview';
    const pageLabel = KNOWLEDGE_PAGE_LABELS[pageType] ?? '业务知识页';
    const title = item.title || `知识页 · ${pageLabel}`;
    records.push(withTraceability({
      sourceId: item.id,
      sourceKind: 'source_record',
      occurredAt: item.updated_at ?? new Date().toISOString(),
      title,
      summary: summary ?? `${pageLabel}已更新`,
      signal: hydrateRecordSignal({ title: item.title || pageLabel, summary: summary ?? '' }),
      weight: 0.66,
      sourceLabel: title,
      sourceTable: SOURCE_TABLE_LABELS['account_knowledge_pages'],
      sourceRowId: item.id,
    }));
  }

  return records.sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt));
}

/**
 * Request-scoped evidence loader. API/request paths must pass ctx explicitly.
 */
export async function loadEvidenceRecordsScoped(ctx: UserContext, accountId: string, orgId = ctx.orgId): Promise<EvidenceRecord[]> {
  await assertEvidenceAccountScope(accountId, orgId, ctx);
  return loadEvidenceRecordsUnsafeInternal(accountId, orgId);
}

/** Cached wrapper — avoids re-running 13+ queries within the TTL window */
async function loadEvidenceRecordsCached(accountId: string, orgId: string, ctx?: UserContext): Promise<EvidenceRecord[]> {
  await assertEvidenceAccountScope(accountId, orgId, ctx);
  return withCache(evidenceCache, `evidence:${orgId}:${accountId}`, EVIDENCE_TTL, () =>
    loadEvidenceRecordsUnsafeInternal(accountId, orgId)
  );
}

export async function getAccountMemoryPayload(accountId: string, accountName: string, orgId: string, ctx?: UserContext) {
  const records = await loadEvidenceRecordsCached(accountId, orgId, ctx);
  const summary = buildMemorySummary(accountId, accountName, records);
  const conflicts = detectConflicts(accountId, records);
  return { summary, conflicts, records };
}

/** Cache TTL: 5 minutes — after this the cached snapshot is considered stale */
const MEMORY_SNAPSHOT_TTL_MS = 5 * 60 * 1000;

/**
 * Try loading a cached memory snapshot from account_knowledge_pages.
 * Returns null if missing, stale, or window mismatch.
 */
async function loadCachedSnapshot(accountId: string, orgId: string, windowDays: number): Promise<MemorySnapshotPayload | null> {
  try {
    const admin = requireAdmin();
    const { data } = await admin
      .from('account_knowledge_pages')
      .select('content_json, updated_at')
      .eq('org_id', orgId)
      .eq('account_id', accountId)
      .eq('page_type', 'memory_snapshot')
      .single();
    if (!data?.content_json || !data.updated_at) return null;
    const age = Date.now() - new Date(data.updated_at).getTime();
    if (age > MEMORY_SNAPSHOT_TTL_MS) return null;
    const cached = data.content_json as Record<string, unknown>;
    if ((cached._windowDays as number) !== windowDays) return null;
    return cached as unknown as MemorySnapshotPayload;
  } catch {
    return null;
  }
}

/** Save the computed memory snapshot to DB for fast subsequent loads */
async function saveCachedSnapshot(accountId: string, orgId: string, windowDays: number, payload: MemorySnapshotPayload): Promise<void> {
  try {
    const admin = requireAdmin();
    const cachePayload = { ...payload, _windowDays: windowDays };
    await admin
      .from('account_knowledge_pages')
      .upsert({
        org_id: orgId,
        account_id: accountId,
        page_type: 'memory_snapshot',
        title: '账户分析快照',
        content_json: cachePayload,
        version: 1,
        updated_by: 'system',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id,account_id,page_type' });
  } catch (err) {
    console.warn('[memory-snapshot] cache write failed:', err);
  }
}

/**
 * Unified payload: summary + conflicts + timeline in ONE loadEvidenceRecords() call.
 * Results are cached in account_knowledge_pages (page_type='memory_snapshot')
 * for 5 minutes to avoid 13-query reload on every page visit.
 */
function isSparseMemoryPayload(payload: MemorySnapshotPayload | null | undefined) {
  if (!payload?.summary) return true;
  const summary = payload.summary;
  return (
    (summary.sourceCoverage?.totalRecords ?? 0) === 0 ||
    (((summary.people?.length ?? 0) === 0) && ((summary.tensions?.length ?? 0) === 0) && ((summary.timelineHighlights?.length ?? 0) === 0))
  );
}

export async function getUnifiedMemoryPayload(accountId: string, accountName: string, orgId: string, windowDays = 30, ctx?: UserContext) {
  await assertEvidenceAccountScope(accountId, orgId, ctx);
  // 0. Fast path: in-memory cache (avoids DB round-trip for snapshot check)
  const memCacheKey = `memory:${orgId}:${accountId}:${windowDays}`;
  const memCached = memoryPayloadCache.get(memCacheKey);
  if (memCached && !isSparseMemoryPayload(memCached)) return memCached;

  // 1. Try returning DB-cached snapshot
  const cached = await loadCachedSnapshot(accountId, orgId, windowDays);
  if (cached && !isSparseMemoryPayload(cached)) {
    // Populate in-memory cache so subsequent hits skip the DB round-trip
    memoryPayloadCache.set(memCacheKey, cached, MEMORY_PAYLOAD_TTL);
    return cached;
  }

  // 2. Cache miss or stale — compute fresh
  const records = await loadEvidenceRecordsCached(accountId, orgId, ctx);
  const summary = buildMemorySummary(accountId, accountName, records);
  const conflicts = detectConflicts(accountId, records);
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const timelineItems = toTimelineItems(accountId, records.filter((record) => +new Date(record.occurredAt) >= cutoff), 50);

  const newestOccurredAt = records[0]?.occurredAt ? +new Date(records[0].occurredAt) : Date.now();
  const baselineCutoff = newestOccurredAt - 7 * 24 * 60 * 60 * 1000;
  let previousRecords = records.filter((record) => +new Date(record.occurredAt) < baselineCutoff);
  if (previousRecords.length < 4) {
    previousRecords = records.slice(Math.max(3, Math.floor(records.length / 2)));
  }
  const previousSummary = previousRecords.length >= 3
    ? buildMemorySummary(accountId, accountName, previousRecords)
    : null;
  const changeRecords = records.filter((record) => +new Date(record.occurredAt) >= baselineCutoff).slice(0, 6);
  const momentumShift = previousSummary
    ? buildMomentumShift({
        accountId,
        currentSummary: summary,
        previousSummary,
        changeRecords,
      })
    : null;

  // records is sorted newest-first; slicing from the 70% mark yields the oldest entries
  const olderSliceStart = Math.max(5, Math.floor(records.length * 0.7));
  const historyCandidates = [
    { id: 'current', label: '当前版本', records },
    { id: 'previous', label: '上一版', records: previousRecords },
    { id: 'older', label: '更早版本', records: records.slice(olderSliceStart) },
  ].filter((entry, index, arr) => entry.records.length >= 3 && arr.findIndex((other) => other.id === entry.id) === index);

  const summaryHistory = historyCandidates.map((entry) => ({
    id: entry.id,
    label: entry.label,
    summary: buildMemorySummary(accountId, accountName, entry.records),
  }));

  const payload = { summary, conflicts, timelineItems, previousSummary, momentumShift, summaryHistory };

  // 3. Save to in-memory cache + DB cache (fire-and-forget)
  memoryPayloadCache.set(memCacheKey, payload, MEMORY_PAYLOAD_TTL);
  void saveCachedSnapshot(accountId, orgId, windowDays, payload);

  return payload;
}

export async function getEvidenceBundlePayload(accountId: string, play: StrategicPlay, orgId: string, ctx?: UserContext) {
  const records = await loadEvidenceRecordsCached(accountId, orgId, ctx);
  const conflicts = detectConflicts(accountId, records);
  return buildRecommendationEvidenceBundle({ accountId, play, records, conflicts });
}

export async function getAdHocEvidenceBundlePayload(params: {
  accountId: string;
  orgId: string;
  recommendationId: string;
  recommendationTitle: string;
  recommendationSummary: string;
  confidence: number;
  ctx?: UserContext;
}) {
  const { accountId, orgId, recommendationId, recommendationTitle, recommendationSummary, confidence, ctx } = params;
  const records = await loadEvidenceRecordsCached(accountId, orgId, ctx);
  const conflicts = detectConflicts(accountId, records);
  return buildAdHocRecommendationEvidenceBundle({
    accountId,
    recommendationId,
    recommendationTitle,
    recommendationSummary,
    confidence,
    records,
    conflicts,
  });
}

/**
 * Invalidate server-side caches for a specific account.
 * Call after mutations that affect evidence (new decode, intel, meeting prep, etc.).
 */
export function invalidateAccountCaches(accountId: string, orgId: string): void {
  evidenceCache.delete(`evidence:${orgId}:${accountId}`);
  memoryPayloadCache.invalidatePrefix(`memory:${orgId}:${accountId}:`);
}
