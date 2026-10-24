import type { UnifiedTimelineEvent, TimelineEventType } from './opportunity-workbench';

export const TIMELINE_EVENT_TYPES = [
  'email',
  'meeting',
  'call',
  'chat',
  'intel',
  'task',
  'stage_change',
  'close_date',
  'document',
  'note',
] as const satisfies TimelineEventType[];

export interface TimelineEventRow {
  id: string;
  org_id: string;
  user_id: string | null;
  account_id: string | null;
  opportunity_id: string | null;
  contact_id: string | null;
  type: TimelineEventType;
  occurred_at: string;
  title: string;
  actor: string | null;
  detail: string | null;
  source_table: string | null;
  source_row_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineEventInput {
  accountId?: string | null;
  opportunityId?: string | null;
  contactId?: string | null;
  type: TimelineEventType;
  occurredAt?: string | null;
  title: string;
  actor?: string | null;
  detail?: string | null;
  sourceTable?: string | null;
  sourceRowId?: string | null;
  metadata?: Record<string, unknown>;
}

function includes<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

export function buildTimelineEventInsert(input: TimelineEventInput, context: { orgId: string; userId: string }) {
  if (!includes(TIMELINE_EVENT_TYPES, input.type)) throw new Error('时间线类型无效');
  const title = cleanText(input.title);
  if (!title) throw new Error('缺少时间线标题');
  if (!input.accountId && !input.opportunityId && !input.contactId) throw new Error('至少需要关联一个客户、商机或联系人');

  return {
    org_id: context.orgId,
    user_id: context.userId,
    account_id: input.accountId ?? null,
    opportunity_id: input.opportunityId ?? null,
    contact_id: input.contactId ?? null,
    type: input.type,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    title,
    actor: cleanText(input.actor),
    detail: cleanText(input.detail),
    source_table: cleanText(input.sourceTable),
    source_row_id: cleanText(input.sourceRowId),
    metadata: input.metadata ?? {},
    updated_at: new Date().toISOString(),
  };
}

export function rowToUnifiedTimelineEvent(row: TimelineEventRow): UnifiedTimelineEvent {
  return {
    id: 'timeline-' + row.id,
    type: row.type,
    occurredAt: row.occurred_at,
    title: row.title,
    actor: row.actor ?? undefined,
    detail: row.detail ?? undefined,
    relatedContactIds: row.contact_id ? [row.contact_id] : [],
    relatedOpportunityId: row.opportunity_id ?? undefined,
    relatedAccountId: row.account_id ?? undefined,
    source: 'persisted',
  };
}
