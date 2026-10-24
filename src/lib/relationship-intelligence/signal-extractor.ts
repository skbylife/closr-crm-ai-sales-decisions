import type { ActivityLogRow, EmailDecodeRow, IntegrationEmailRow, MeetingPrepRow, RelationshipSignal, SourceRecordRow } from './types';

function toIso(value: string | null | undefined): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function clip(value: string | null | undefined, length: number): string | null {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  return trimmed.length > length ? `${trimmed.slice(0, length - 1)}…` : trimmed;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sourceRecordFor(sourceRecords: SourceRecordRow[], table: string, rowId: string): SourceRecordRow | null {
  return sourceRecords.find((record) => record.source_table === table && record.source_row_id === rowId) ?? null;
}

function hasForwardedEvidence(row: EmailDecodeRow, sourceRecord?: SourceRecordRow | null): boolean {
  const decode = asRecord(row.decode);
  const forwardedEmail = decode.forwardedEmail;
  const sourceMetadata = asRecord(sourceRecord?.metadata);
  const intake = asRecord(sourceMetadata.intake);

  return Boolean(
    row.id.startsWith('fwd_') ||
    row.signal_source === 'forwarded_email' ||
    forwardedEmail ||
    intake?.type === 'forwarded_email' ||
    row.original_sender_email,
  );
}

function valenceFromSentiment(value: string | null | undefined): RelationshipSignal['valence'] {
  const lower = value?.toLowerCase() ?? '';
  if (/positive|support|支持|认可|积极|正面/.test(lower)) return 'positive';
  if (/negative|risk|blocked|反对|负面|风险|质疑/.test(lower)) return 'negative';
  if (/mixed|摇摆|复杂/.test(lower)) return 'mixed';
  return 'neutral';
}

function strengthFromValenceAndKind(params: { valence: RelationshipSignal['valence']; kind: RelationshipSignal['kind']; text?: string | null }): number {
  const text = params.text ?? '';
  let base = params.kind === 'meeting' ? 44 : params.kind === 'manual_note' ? 38 : 34;
  if (params.valence === 'positive') base += 12;
  if (params.valence === 'negative') base -= 6;
  if (/信任|认可|引荐|推荐|支持|长期|高层|技术评审通过|预算已批/.test(text)) base += 14;
  if (/风险|反对|质疑|暂缓|沉默|过期/.test(text)) base -= 8;
  return Math.max(10, Math.min(88, base));
}

export function extractRelationshipSignalsFromForwardedEmailDecode(
  row: EmailDecodeRow,
  sourceRecord?: SourceRecordRow | null,
): RelationshipSignal[] {
  const orgId = row.org_id ?? sourceRecord?.org_id ?? null;
  const accountId = row.account_id ?? row.matched_account_id ?? sourceRecord?.account_id ?? null;
  const contactId = row.matched_contact_id;

  if (!orgId || !accountId || !contactId) return [];
  if (!hasForwardedEvidence(row, sourceRecord)) return [];

  const occurredAt = toIso(row.date ?? row.created_at ?? sourceRecord?.occurred_at ?? sourceRecord?.created_at);
  const senderLabel = row.original_sender_name || row.original_sender_email || '客户联系人';
  const quote = clip(row.email_text, 280);
  const sourceId = sourceRecord?.id ?? row.id;

  return [{
    id: `derived:${row.id}:forwarded:${contactId}:${row.user_id ?? 'unknown'}`,
    orgId,
    accountId,
    opportunityId: row.opportunity_id,
    contactId,
    actorUserId: row.user_id,
    kind: 'forwarded_email_decode',
    valence: 'neutral',
    strength: 35,
    confidence: 0.55,
    summary: `转发邮件解读显示近期与 ${senderLabel} 有互动。`,
    quoteText: quote,
    evidence: {
      sourceId,
      sourceKind: sourceRecord?.source_kind ?? 'email_decode',
      sourceTable: sourceRecord?.source_table ?? 'email_decodes',
      sourceRowId: sourceRecord?.source_row_id ?? row.id,
      title: sourceRecord?.title ?? null,
      summary: sourceRecord?.summary ?? null,
      occurredAt,
    },
    occurredAt,
    metadata: {
      extraction: 'forwarded_email_decode_p0',
      originalSenderEmail: row.original_sender_email,
      originalSenderName: row.original_sender_name,
      direction: row.direction ?? 'inbound',
      sourceRecordId: sourceRecord?.id ?? null,
    },
  }];
}

export function extractRelationshipSignalsFromEmailDecodes(
  rows: EmailDecodeRow[],
  sourceRecords: SourceRecordRow[] = [],
): RelationshipSignal[] {
  const sourceByRowId = new Map(sourceRecords
    .filter((row) => row.source_table === 'email_decodes' && row.source_row_id)
    .map((row) => [row.source_row_id, row]));

  return rows.flatMap((row) => extractRelationshipSignalsFromForwardedEmailDecode(row, sourceByRowId.get(row.id) ?? null));
}

export function extractRelationshipSignalsFromIntegrationEmails(
  rows: IntegrationEmailRow[],
  sourceRecords: SourceRecordRow[] = [],
): RelationshipSignal[] {
  return rows.flatMap((row) => {
    if (!row.org_id || !row.account_id || !row.contact_id) return [];
    const occurredAt = toIso(row.received_at ?? row.created_at);
    const sourceRecord = sourceRecordFor(sourceRecords, 'integration_emails', row.id);
    const summaryText = row.summary || row.subject || '邮件往来';
    const valence = valenceFromSentiment(row.sentiment ?? row.intent);
    const strength = strengthFromValenceAndKind({ valence, kind: 'email_interaction', text: summaryText });
    return [{
      id: `derived:${row.id}:integration-email:${row.contact_id}`,
      orgId: row.org_id,
      accountId: row.account_id,
      opportunityId: row.opportunity_id,
      contactId: row.contact_id,
      actorUserId: row.visible_to?.[0] ?? null,
      kind: 'email_interaction' as const,
      valence,
      strength,
      confidence: sourceRecord ? 0.62 : 0.52,
      summary: `邮件往来显示关系信号：${summaryText}`,
      quoteText: clip(row.summary ?? row.subject, 280),
      evidence: {
        sourceId: sourceRecord?.id ?? row.id,
        sourceKind: sourceRecord?.source_kind ?? 'email',
        sourceTable: sourceRecord?.source_table ?? 'integration_emails',
        sourceRowId: sourceRecord?.source_row_id ?? row.id,
        title: sourceRecord?.title ?? row.subject,
        summary: sourceRecord?.summary ?? row.summary,
        occurredAt,
      },
      occurredAt,
      metadata: {
        extraction: 'integration_email_basic',
        sender: row.sender,
        intent: row.intent,
        sentiment: row.sentiment,
        keyInfo: row.key_info ?? [],
      },
    }];
  });
}

export function extractRelationshipSignalsFromActivityLogs(
  rows: ActivityLogRow[],
  sourceRecords: SourceRecordRow[] = [],
): RelationshipSignal[] {
  return rows.flatMap((row) => {
    if (!row.org_id || !row.account_id || !row.contact_id) return [];
    const occurredAt = toIso(row.created_at);
    const sourceRecord = sourceRecordFor(sourceRecords, 'activity_logs', row.id);
    const metadata = asRecord(row.metadata);
    const actionText = row.summary || row.action_type || '活动记录';
    const kind: RelationshipSignal['kind'] = /meeting|会议|call|通话|拜访|demo|演示/i.test(row.action_type ?? actionText) ? 'meeting' : 'manual_note';
    const valence = valenceFromSentiment(typeof metadata.sentiment === 'string' ? metadata.sentiment : actionText);
    const strength = strengthFromValenceAndKind({ valence, kind, text: actionText });
    return [{
      id: `derived:${row.id}:activity:${row.contact_id}:${row.user_id ?? 'unknown'}`,
      orgId: row.org_id,
      accountId: row.account_id,
      opportunityId: row.opportunity_id,
      contactId: row.contact_id,
      actorUserId: row.user_id,
      kind,
      valence,
      strength,
      confidence: sourceRecord ? 0.68 : 0.58,
      summary: `活动记录显示关系信号：${actionText}`,
      quoteText: clip(row.summary, 280),
      evidence: {
        sourceId: sourceRecord?.id ?? row.id,
        sourceKind: sourceRecord?.source_kind ?? 'activity_log',
        sourceTable: sourceRecord?.source_table ?? 'activity_logs',
        sourceRowId: sourceRecord?.source_row_id ?? row.id,
        title: sourceRecord?.title ?? row.action_type,
        summary: sourceRecord?.summary ?? row.summary,
        occurredAt,
      },
      occurredAt,
      metadata: {
        extraction: 'activity_log_basic',
        contactName: row.contact_name,
        actionType: row.action_type,
      },
    }];
  });
}

function contactIdsFromMeetingPrep(row: MeetingPrepRow): string[] {
  const input = asRecord(row.input);
  const result = asRecord(row.result);
  const candidates = [input.contactId, input.contact_id, result.contactId, result.contact_id, input.contactIds, result.contactIds];
  const ids = candidates.flatMap((value) => Array.isArray(value) ? value : value ? [value] : []);
  return ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

export function extractRelationshipSignalsFromMeetingPreps(
  rows: MeetingPrepRow[],
  sourceRecords: SourceRecordRow[] = [],
): RelationshipSignal[] {
  return rows.flatMap((row) => {
    if (!row.org_id || !row.account_id) return [];
    const contactIds = contactIdsFromMeetingPrep(row);
    if (contactIds.length === 0) return [];
    const occurredAt = toIso(row.created_at);
    const sourceRecord = sourceRecordFor(sourceRecords, 'meeting_preps', row.id);
    const result = asRecord(row.result);
    const summaryText = typeof result.summary === 'string' ? result.summary : typeof result.objective === 'string' ? result.objective : '会议准备包含关系判断线索';
    return contactIds.map((contactId) => ({
      id: `derived:${row.id}:meeting-prep:${contactId}:${row.user_id ?? 'unknown'}`,
      orgId: row.org_id!,
      accountId: row.account_id!,
      opportunityId: null,
      contactId,
      actorUserId: row.user_id,
      kind: 'meeting' as const,
      valence: 'neutral' as const,
      strength: 36,
      confidence: sourceRecord ? 0.56 : 0.46,
      summary: `会议准备显示关系线索：${summaryText}`,
      quoteText: clip(summaryText, 280),
      evidence: {
        sourceId: sourceRecord?.id ?? row.id,
        sourceKind: sourceRecord?.source_kind ?? 'meeting_prep',
        sourceTable: sourceRecord?.source_table ?? 'meeting_preps',
        sourceRowId: sourceRecord?.source_row_id ?? row.id,
        title: sourceRecord?.title ?? '会议准备',
        summary: sourceRecord?.summary ?? summaryText,
        occurredAt,
      },
      occurredAt,
      metadata: { extraction: 'meeting_prep_basic' },
    }));
  });
}
