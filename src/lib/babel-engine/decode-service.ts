import { requireAdmin } from '@/lib/api-guard';
import { decodeMessages, parseEmailToMessages } from '@/lib/babel-engine/decode';
import { triggerProfileUpdate } from '@/lib/babel-engine/profile-updater';
import { fetchDecodeHistory, formatContextMemory } from '@/lib/babel-engine/context-memory';
import { detectCulture } from '@/lib/babel-engine/cultural';
import { buildCulturalContextInjection } from '@/lib/babel-engine/prompts/cultural';
import { emitEvent } from '@/lib/ai-event-hub';
import { logError, safeCatch } from '@/lib/error-monitor';
import { loadCILAccountContextScoped, loadCILAccountContextUnsafeInternal } from '@/lib/compiled-intelligence/context';
import { buildCILForDecode } from '@/lib/compiled-intelligence/prompt-context';
import { injectKnowledgeContextScoped, depositKnowledge } from '@/lib/knowledge-engine';
import { query, queryOne } from '@/lib/postgres';
import { buildJudgmentMemoryFromDecode } from '@/lib/judgment/memory';
import { persistJudgmentMemorySourceRecord } from '@/lib/judgment/persistence';
import {
  attachStabilityLayer,
  buildDecodeContextSnapshot,
  buildInputFingerprint,
  type PreviousDecodeForDiff,
} from '@/lib/judgment/decode-stability';
import type { DecodeMessage, DecodeOutput, SavedDecode } from '@/lib/babel-engine/types';
import type { UserContext } from '@/lib/permissions';

type AdminClient = ReturnType<typeof requireAdmin>;

type NullableString = string | null | undefined;

interface PreviousDecodeRow {
  id: string;
  email_text: string | null;
  decode: DecodeOutput | null;
  date: string | null;
  account_id: string | null;
  account_name: string | null;
  client_name: string | null;
  deal_stage: string | null;
  matched_contact_id: string | null;
  opportunity_id: string | null;
  signal_source: string | null;
  analysis_goal: string | null;
  signal_context: string | null;
}

export interface DecodePipelineInput {
  emailText: string;
  context?: string;
  clientName?: string;
  dealStage?: string;
  signalSource?: SavedDecode['signalSource'];
  analysisGoal?: SavedDecode['analysisGoal'];
  signalContext?: string;
  knowledgeBase?: string;
  matchedContactId?: string;
  matchedContactName?: string;
  matchedAccountId?: string;
  matchedAccountName?: string;
  accountId?: string;
  accountName?: string;
  opportunityId?: string;
  messages?: DecodeMessage[];
  actor?: Pick<UserContext, 'userId' | 'orgId'> | { userId?: NullableString; orgId?: NullableString };
  requestContext?: UserContext;
  route?: string;
  useCase?: string;
  persist?: boolean;
  persistId?: string;
  originalSenderEmail?: string;
  originalSenderName?: string;
  sourceFingerprint?: string;
  sourceMetadata?: Record<string, unknown>;
  direction?: SavedDecode['direction'];
  outputLocale?: 'zh' | 'en';
}

export interface DecodePipelineResult {
  decode?: DecodeOutput;
  savedDecodeId?: string;
  duplicate: boolean;
  sourceRecordStatus?: 'persisted' | 'skipped';
  sourceRecordReason?: string;
}

export interface DecodePipelineDeps {
  decodeMessagesFn?: typeof decodeMessages;
  findExistingDecodeById?: (id: string) => Promise<DecodeOutput | null>;
  persistDecodeRecord?: (record: PersistEmailDecodeRecordInput) => Promise<void>;
}

export interface PersistEmailDecodeRecordInput {
  id: string;
  userId?: NullableString;
  orgId?: NullableString;
  accountId?: NullableString;
  accountName?: NullableString;
  opportunityId?: NullableString;
  emailText: string;
  clientName?: NullableString;
  dealStage?: NullableString;
  signalSource?: NullableString;
  analysisGoal?: NullableString;
  signalContext?: NullableString;
  decode: DecodeOutput | null;
  date: string;
  originalSenderEmail?: NullableString;
  originalSenderName?: NullableString;
  matchedContactId?: NullableString;
  matchedAccountId?: NullableString;
  matchedAccountName?: NullableString;
  direction?: NullableString;
  sourceFingerprint?: NullableString;
  sourceMetadata?: Record<string, unknown>;
}

function hasDecodeOutput(value: unknown): value is DecodeOutput {
  return Boolean(
    value
      && typeof value === 'object'
      && Array.isArray((value as DecodeOutput).messages)
      && (value as DecodeOutput).threadAnalysis,
  );
}

function buildContext(input: DecodePipelineInput): string | undefined {
  const contextParts: string[] = [];
  if (input.clientName) contextParts.push(`Client: ${input.clientName}`);
  if (input.dealStage) contextParts.push(`Deal stage: ${input.dealStage}`);
  if (input.signalSource) contextParts.push(`Signal source: ${input.signalSource}`);
  if (input.analysisGoal) contextParts.push(`User analysis goal: ${input.analysisGoal}`);
  if (input.signalContext) contextParts.push(`User-provided signal background: ${input.signalContext}`);
  if (input.context) contextParts.push(input.context);
  if (input.knowledgeBase) contextParts.push(`Product/company context: ${input.knowledgeBase}`);
  return contextParts.length > 0 ? contextParts.join('. ') : undefined;
}

async function loadPreviousMatchingDecode(admin: AdminClient, params: {
  orgId: string;
  userId: string;
  inputFingerprint: string;
  accountId?: string;
  contactId?: string;
  opportunityId?: string;
}): Promise<PreviousDecodeForDiff | null> {
  if (!params.accountId && !params.contactId && !params.opportunityId) return null;

  let dbQuery = admin
    .from('email_decodes')
    .select('id, email_text, decode, date, account_id, account_name, client_name, deal_stage, matched_contact_id, opportunity_id, signal_source, analysis_goal, signal_context')
    .eq('org_id', params.orgId)
    .order('date', { ascending: false })
    .limit(20);

  if (params.accountId) dbQuery = dbQuery.eq('account_id', params.accountId);
  else dbQuery = dbQuery.eq('user_id', params.userId);
  if (params.contactId) dbQuery = dbQuery.eq('matched_contact_id', params.contactId);
  if (params.opportunityId) dbQuery = dbQuery.eq('opportunity_id', params.opportunityId);

  const { data, error } = await dbQuery;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as PreviousDecodeRow[];
  const row = rows.find((candidate) =>
    candidate.email_text && buildInputFingerprint(candidate.email_text) === params.inputFingerprint && hasDecodeOutput(candidate.decode),
  );
  if (!row?.decode) return null;

  const contextSnapshot = row.decode.contextSnapshot ?? buildDecodeContextSnapshot({
    emailText: row.email_text ?? '',
    accountId: row.account_id ?? undefined,
    accountName: row.account_name ?? undefined,
    contactId: row.matched_contact_id ?? undefined,
    opportunityId: row.opportunity_id ?? undefined,
    clientName: row.client_name ?? undefined,
    dealStage: row.deal_stage ?? undefined,
    signalSource: row.signal_source ?? undefined,
    analysisGoal: row.analysis_goal ?? undefined,
    signalContext: row.signal_context ?? undefined,
    createdAt: row.date ?? undefined,
  });

  return {
    id: row.id,
    decode: row.decode,
    contextSnapshot,
    stableJudgment: row.decode.stableJudgment,
  };
}

async function defaultFindExistingDecodeById(id: string): Promise<DecodeOutput | null> {
  const row = await queryOne<{ decode: DecodeOutput | null }>(
    'SELECT decode FROM email_decodes WHERE id = $1 LIMIT 1',
    [id],
  );
  return hasDecodeOutput(row?.decode) ? row.decode : null;
}

export async function persistEmailDecodeRecord(record: PersistEmailDecodeRecordInput): Promise<void> {
  const decodeWithForwardMetadata = record.decode
    ? {
        ...record.decode,
        forwardedEmail: record.sourceFingerprint || record.sourceMetadata
          ? {
              fingerprint: record.sourceFingerprint ?? null,
              metadata: record.sourceMetadata ?? {},
            }
          : undefined,
      }
    : null;

  await query(
    `INSERT INTO email_decodes (
       id, account_id, account_name, opportunity_id, email_text, client_name,
       deal_stage, signal_source, analysis_goal, signal_context, decode, date,
       user_id, org_id, original_sender_email, original_sender_name,
       matched_contact_id, matched_account_id, matched_account_name, direction
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $12,
       $13, $14, $15, $16,
       $17, $18, $19, $20
     )
     ON CONFLICT (id) DO UPDATE SET
       account_id = EXCLUDED.account_id,
       account_name = EXCLUDED.account_name,
       opportunity_id = EXCLUDED.opportunity_id,
       email_text = EXCLUDED.email_text,
       client_name = EXCLUDED.client_name,
       deal_stage = EXCLUDED.deal_stage,
       signal_source = EXCLUDED.signal_source,
       analysis_goal = EXCLUDED.analysis_goal,
       signal_context = EXCLUDED.signal_context,
       decode = EXCLUDED.decode,
       date = EXCLUDED.date,
       user_id = EXCLUDED.user_id,
       org_id = EXCLUDED.org_id,
       original_sender_email = EXCLUDED.original_sender_email,
       original_sender_name = EXCLUDED.original_sender_name,
       matched_contact_id = EXCLUDED.matched_contact_id,
       matched_account_id = EXCLUDED.matched_account_id,
       matched_account_name = EXCLUDED.matched_account_name,
       direction = EXCLUDED.direction`,
    [
      record.id,
      record.accountId ?? null,
      record.accountName ?? null,
      record.opportunityId ?? null,
      record.emailText,
      record.clientName ?? null,
      record.dealStage ?? null,
      record.signalSource ?? null,
      record.analysisGoal ?? null,
      record.signalContext ?? null,
      decodeWithForwardMetadata ? JSON.stringify(decodeWithForwardMetadata) : null,
      record.date,
      record.userId ?? null,
      record.orgId ?? null,
      record.originalSenderEmail ?? null,
      record.originalSenderName ?? null,
      record.matchedContactId ?? null,
      record.matchedAccountId ?? record.accountId ?? null,
      record.matchedAccountName ?? record.accountName ?? null,
      record.direction ?? 'inbound',
    ],
  );
}

async function persistDecodeSourceRecord(params: {
  decodeId: string;
  output: DecodeOutput;
  input: DecodePipelineInput;
  date: string;
  accountId: string;
  accountName?: string;
  userId?: string | null;
  orgId: string;
}): Promise<{ status: 'persisted' | 'skipped'; reason?: string }> {
  const admin = requireAdmin();
  const judgmentMemory = buildJudgmentMemoryFromDecode({
    savedDecode: {
      id: params.decodeId,
      accountId: params.accountId,
      accountName: params.accountName,
      clientName: params.input.clientName,
      decode: params.output,
      date: params.date,
    },
    createdAt: params.date,
  });

  if (!judgmentMemory) return { status: 'skipped', reason: 'no_judgment_memory' };

  const result = await persistJudgmentMemorySourceRecord({
    admin,
    orgId: params.orgId,
    judgmentMemory,
    sourceTable: 'email_decodes',
    expectedAccountId: params.accountId,
    extraMetadata: {
      intake: params.input.sourceFingerprint
        ? { type: 'forwarded_email', fingerprint: params.input.sourceFingerprint }
        : { type: params.input.route ?? 'decode' },
      originalSenderEmail: params.input.originalSenderEmail ?? null,
      matchedContactId: params.input.matchedContactId ?? null,
    },
  });

  return { status: result.status, reason: result.reason };
}

async function loadContactIntel(params: {
  matchedContactId?: string;
  orgId?: string | null;
  fallbackName?: string;
  fallbackAccountId?: string;
}): Promise<{ contactDiscType?: string; contactForIntel: { id: string; name: string; account_id: string | null } | null }> {
  if (!params.matchedContactId) {
    return { contactForIntel: null };
  }

  let contactForIntel: { id: string; name: string; account_id: string | null } | null = params.fallbackName
    ? { id: params.matchedContactId, name: params.fallbackName, account_id: params.fallbackAccountId ?? null }
    : null;

  if (!params.orgId) {
    return { contactForIntel };
  }

  const admin = requireAdmin();
  const { data: contactRow } = await admin
    .from('contacts')
    .select('id, name, account_id, contact_profile')
    .eq('id', params.matchedContactId)
    .eq('org_id', params.orgId)
    .single();

  if (contactRow) {
    contactForIntel = { id: contactRow.id, name: contactRow.name, account_id: contactRow.account_id };
  }

  const cp = contactRow?.contact_profile as { decisionStyle?: { type?: string } } | null;
  const ds = cp?.decisionStyle?.type;
  if (!ds) return { contactForIntel };

  const styleToDisc: Record<string, string> = { driver: 'D', expressive: 'I', amiable: 'S', analytical: 'C' };
  return { contactForIntel, contactDiscType: styleToDisc[ds] };
}

export async function runDecodePipeline(
  input: DecodePipelineInput,
  deps: DecodePipelineDeps = {},
): Promise<DecodePipelineResult> {
  const userId = input.requestContext?.userId ?? input.actor?.userId ?? null;
  const orgId = input.requestContext?.orgId ?? input.actor?.orgId ?? null;
  const route = input.route ?? '/api/decode';
  const useCase = input.useCase ?? 'decode.messages';
  const resolvedAccountId = input.accountId ?? input.matchedAccountId;
  const resolvedAccountName = input.accountName ?? input.matchedAccountName ?? input.clientName;
  const persistId = input.persistId;
  const date = new Date().toISOString();

  if (input.persist && persistId) {
    const existingDecode = await (deps.findExistingDecodeById ?? defaultFindExistingDecodeById)(persistId);
    if (existingDecode) {
      return { decode: existingDecode, savedDecodeId: persistId, duplicate: true };
    }
  }

  const messages = input.messages ?? parseEmailToMessages(input.emailText);
  const context = buildContext(input);

  let contextMemory: string | undefined;
  if (input.matchedContactId && userId) {
    const history = await fetchDecodeHistory(input.matchedContactId, userId, 5, orgId ?? undefined);
    contextMemory = formatContextMemory(history) || undefined;
  }

  let culturalContext: string | undefined;
  const senderEmail = input.originalSenderEmail ?? input.emailText.match(/From:\s*<?([^\s<>]+@[^\s<>]+)>?/i)?.[1] ?? '';
  const detectedCulture = detectCulture(senderEmail, input.emailText);
  if (detectedCulture !== 'american_business') {
    culturalContext = buildCulturalContextInjection(detectedCulture);
    console.log(`[decode-service] 检测到文化背景: ${detectedCulture}`);
  }

  const { contactDiscType, contactForIntel } = await loadContactIntel({
    matchedContactId: input.matchedContactId,
    orgId,
    fallbackName: input.matchedContactName,
    fallbackAccountId: resolvedAccountId,
  });

  let cilContext: string | undefined;
  let knowledgeContext: string | undefined;
  if (resolvedAccountId && orgId) {
    const queryHint = `${input.clientName || ''} ${input.dealStage || ''} 邮件沟通分析`.trim();
    const cilPromise = input.requestContext
      ? loadCILAccountContextScoped({ orgId, accountId: resolvedAccountId, limitEvidence: 8, limitClaims: 10, ctx: input.requestContext })
      : loadCILAccountContextUnsafeInternal({ orgId, accountId: resolvedAccountId, limitEvidence: 8, limitClaims: 10 });
    const kbPromise = input.requestContext
      ? injectKnowledgeContextScoped(input.requestContext, resolvedAccountId, queryHint, 5)
      : Promise.resolve(undefined);

    const [cilResult, kbResult] = await Promise.allSettled([
      cilPromise.then((cilData) => buildCILForDecode(cilData) || undefined),
      kbPromise,
    ]);
    cilContext = cilResult.status === 'fulfilled' ? cilResult.value : undefined;
    knowledgeContext = kbResult.status === 'fulfilled' && kbResult.value ? kbResult.value : undefined;
    if (cilContext) console.log(`[decode-service] CIL 上下文已注入，account=${resolvedAccountId}`);
    if (knowledgeContext) console.log(`[decode-service] 知识库上下文已注入，account=${resolvedAccountId}`);
  }

  const combinedCilContext = [cilContext, knowledgeContext].filter(Boolean).join('\n') || undefined;

  let output = await (deps.decodeMessagesFn ?? decodeMessages)({
    messages,
    mode: 'strategic',
    domain: 'b2b_sales',
    context,
    contactDiscType,
    outputLocale: input.outputLocale,
  }, contextMemory, culturalContext, {
    cilContext: combinedCilContext,
    invocation: {
      orgId,
      userId,
      accountId: resolvedAccountId ?? null,
      opportunityId: input.opportunityId ?? null,
      route,
      useCase,
      metadata: {
        hasContact: Boolean(input.matchedContactId),
        hasAccount: Boolean(resolvedAccountId),
        hasOpportunity: Boolean(input.opportunityId),
        hasCilContext: Boolean(combinedCilContext),
        messageCount: messages.length,
        persisted: Boolean(input.persist),
        source: input.sourceFingerprint ? 'forwarded_email' : 'manual',
      },
    },
  });

  const contextSnapshot = buildDecodeContextSnapshot({
    emailText: input.emailText,
    clientName: input.clientName,
    dealStage: input.dealStage,
    signalSource: input.signalSource,
    analysisGoal: input.analysisGoal,
    signalContext: input.signalContext,
    userContext: input.context,
    knowledgeBase: input.knowledgeBase,
    accountId: resolvedAccountId,
    accountName: resolvedAccountName,
    contactId: input.matchedContactId,
    contactName: contactForIntel?.name ?? input.matchedContactName,
    opportunityId: input.opportunityId,
    contextMemory,
    cilContext,
    knowledgeContext,
    culturalContext,
    detectedCulture,
    modelTier: 'flash',
    createdAt: date,
  });

  let previousDecode: PreviousDecodeForDiff | null = null;
  if (orgId && userId) {
    previousDecode = await loadPreviousMatchingDecode(requireAdmin(), {
      orgId,
      userId,
      inputFingerprint: contextSnapshot.input_fingerprint,
      accountId: resolvedAccountId,
      contactId: input.matchedContactId,
      opportunityId: input.opportunityId,
    }).catch((err) => {
      logError('decode-service', err, { action: 'load-previous-decode', accountId: resolvedAccountId, contactId: input.matchedContactId });
      return null;
    });
  }

  output = attachStabilityLayer({
    output,
    contextSnapshot,
    previous: previousDecode,
  });

  if (input.matchedContactId && userId && orgId) {
    void triggerProfileUpdate(input.matchedContactId, output, userId, orgId).catch(
      safeCatch('decode-service', 'profile-update', { contactId: input.matchedContactId }),
    );
  }

  if (orgId) {
    void emitEvent({
      orgId,
      userId: userId ?? undefined,
      eventType: 'decode.completed',
      entityType: 'email_decode',
      entityId: persistId ?? input.matchedContactId ?? 'unknown',
      payload: {
        accountName: resolvedAccountName,
        dealStage: input.dealStage,
        sentimentTrend: output.threadAnalysis?.sentimentTrend,
        riskLevel: output.threadAnalysis?.riskLevel,
        buyerState: output.threadAnalysis?.buyerState,
        matchedContactId: input.matchedContactId,
      },
    }).catch(safeCatch('decode-service', 'event-emit', { contactId: input.matchedContactId }));
  }

  if (orgId && contactForIntel?.account_id && userId) {
    const admin = requireAdmin();
    const emailSubject = input.emailText.match(/(?:Subject|主题)[:：]\s*(.+)/i)?.[1]?.trim();
    const intelTitle = emailSubject
      ? `邮件解读：${emailSubject.slice(0, 60)}`
      : `邮件解读：与${contactForIntel.name}的邮件`;
    const intelContent = (output.threadAnalysis?.keySignal ?? '').slice(0, 200);
    const signalStrength = output.threadAnalysis?.riskLevel === 'high' ? 'high' : 'medium';

    void admin
      .from('intel_items')
      .insert({
        account_id: contactForIntel.account_id,
        type: 'email_decode',
        title: intelTitle,
        content: intelContent,
        summary: intelContent.slice(0, 80),
        signal_strength: signalStrength,
        source: 'ai_decode',
        user_id: userId,
        org_id: orgId,
        date,
        related_contact_ids: [contactForIntel.id],
        opportunity_id: input.opportunityId ?? null,
      })
      .then(({ error: intelErr }) => {
        if (intelErr) logError('decode-service', intelErr, { action: 'intel-insert', contactId: contactForIntel?.id, accountId: contactForIntel?.account_id });
      });
  }

  if (orgId && resolvedAccountId) {
    const decodeTitle = contactForIntel?.name
      ? `邮件解读洞察：与${contactForIntel.name}的沟通`
      : `邮件解读洞察：${input.clientName || '客户邮件'}`;
    const decodeContent = [
      `情感趋势: ${output.threadAnalysis?.sentimentTrend ?? '未知'}`,
      `风险等级: ${output.threadAnalysis?.riskLevel ?? '未知'}`,
      `买家状态: ${output.threadAnalysis?.buyerState ?? '未知'}`,
      `关键信号: ${output.threadAnalysis?.keySignal ?? ''}`,
      `核心意图: ${output.messages.map((m) => m.decode?.meaning).filter(Boolean).join('；')}`,
    ].join('\n');

    depositKnowledge({
      orgId,
      accountId: resolvedAccountId,
      title: decodeTitle,
      content: decodeContent,
      category: 'ai_insight',
      source: 'ai_decode',
      sourceType: 'email_decodes',
      sourceId: `${resolvedAccountId}_decode_${input.matchedContactId || 'anon'}_${date.split('T')[0]}`,
      applicableScenarios: ['邮件沟通分析', '客户情绪判断', '风险评估'],
    });
  }

  if (orgId && input.matchedContactId) {
    const decodeText = [
      output.threadAnalysis?.keySignal,
      output.threadAnalysis?.sentimentTrend,
      output.threadAnalysis?.riskLevel,
      output.threadAnalysis?.buyerState,
      ...output.messages.map((m) => m.decode.meaning),
    ]
      .filter(Boolean)
      .join(' ');

    void import('@/lib/play-impact-detector')
      .then(({ detectPlayImpact }) =>
        detectPlayImpact({
          orgId,
          contactId: input.matchedContactId!,
          decodeText,
        })
      )
      .catch(safeCatch('decode-service', 'play-impact-detection', { contactId: input.matchedContactId, orgId }));
  }

  let sourceRecordResult: { status: 'persisted' | 'skipped'; reason?: string } | undefined;
  if (input.persist && persistId) {
    const persistRecord: PersistEmailDecodeRecordInput = {
      id: persistId,
      userId,
      orgId,
      accountId: resolvedAccountId,
      accountName: resolvedAccountName,
      opportunityId: input.opportunityId,
      emailText: input.emailText,
      clientName: input.clientName ?? input.matchedContactName ?? input.originalSenderName,
      dealStage: input.dealStage,
      signalSource: input.signalSource,
      analysisGoal: input.analysisGoal,
      signalContext: input.signalContext,
      decode: output,
      date,
      originalSenderEmail: input.originalSenderEmail,
      originalSenderName: input.originalSenderName,
      matchedContactId: input.matchedContactId,
      matchedAccountId: input.matchedAccountId ?? resolvedAccountId,
      matchedAccountName: input.matchedAccountName ?? resolvedAccountName,
      direction: input.direction ?? 'inbound',
      sourceFingerprint: input.sourceFingerprint,
      sourceMetadata: input.sourceMetadata,
    };
    await (deps.persistDecodeRecord ?? persistEmailDecodeRecord)(persistRecord);

    if (orgId && resolvedAccountId) {
      sourceRecordResult = await persistDecodeSourceRecord({
        decodeId: persistId,
        output,
        input,
        date,
        accountId: resolvedAccountId,
        accountName: resolvedAccountName,
        userId,
        orgId,
      }).catch((err) => {
        logError('decode-service', err, { action: 'source-record-insert', decodeId: persistId, accountId: resolvedAccountId });
        return { status: 'skipped' as const, reason: 'source_record_write_failed' };
      });
    }
  }

  return {
    decode: output,
    savedDecodeId: persistId,
    duplicate: false,
    sourceRecordStatus: sourceRecordResult?.status,
    sourceRecordReason: sourceRecordResult?.reason,
  };
}
