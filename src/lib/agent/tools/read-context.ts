/**
 * Server-side read tools for Sales Agent.
 *
 * These tools deliberately read from the server with org/account access checks
 * instead of trusting the browser-built chat context snapshot.
 */

import { ApiError, requireAccountAccess } from '@/lib/api-guard';
import { getUserContext } from '@/lib/permissions-server';
import { type UserContext } from '@/lib/permissions';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { SearchToolResult } from './search';

export interface ReadAccountContextArgs {
  accountId: string;
  sections?: string[];
  limit?: number;
  userId: string;
}

type QueryResult<T> = { data: T[] | null; error: { message?: string } | null };

function isOptionalSchemaError(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? '';
  return (
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes('Could not find') ||
    message.includes('column')
  );
}

async function safeSelect<T>(label: string, promise: PromiseLike<QueryResult<T>>): Promise<T[]> {
  const result = await promise;
  if (!result.error) return result.data ?? [];
  if (isOptionalSchemaError(result.error)) return [];
  throw new Error(`${label}: ${result.error.message ?? 'query_failed'}`);
}

async function resolveUserContext(userId: string): Promise<UserContext> {
  const ctx = await getUserContext(userId);
  if (!ctx) throw new ApiError(403, '无法确定用户权限上下文');
  return ctx;
}

function clip(value: unknown, max = 240): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function wants(sections: Set<string>, name: string): boolean {
  return sections.size === 0 || sections.has(name) || sections.has('all');
}

export async function executeReadAccountContext(args: ReadAccountContextArgs): Promise<SearchToolResult> {
  const admin = getSupabaseAdmin();
  if (!admin) return { success: false, message: 'Supabase admin 未配置' };
  if (!args.accountId || typeof args.accountId !== 'string') {
    return { success: false, message: '缺少 accountId' };
  }

  let ctx: UserContext;
  try {
    ctx = await resolveUserContext(args.userId);
    await requireAccountAccess(ctx, args.accountId);
  } catch (err) {
    if (err instanceof ApiError) {
      return { success: false, message: err.message };
    }
    throw err;
  }

  const limit = Math.max(1, Math.min(Number(args.limit ?? 12), 30));
  const sectionSet = new Set((args.sections ?? []).map((section) => String(section).trim()).filter(Boolean));

  const { data: account, error: accountError } = await admin
    .from('accounts')
    .select('id, name, industry, deal_stage, deal_value, owner_id, user_id, updated_at')
    .eq('org_id', ctx.orgId)
    .eq('id', args.accountId)
    .maybeSingle();

  if (accountError) return { success: false, message: `读取客户失败：${accountError.message}` };
  if (!account) return { success: false, message: '客户不存在或无权访问' };

  const [
    contacts,
    opportunities,
    tasks,
    intelItems,
    emailDecodes,
    strategicPlays,
    activityLogs,
    sourceRecords,
    claims,
    openQuestions,
  ] = await Promise.all([
    wants(sectionSet, 'contacts')
      ? safeSelect('contacts', admin
          .from('contacts')
          .select('id, name, title, role, email, phone, updated_at')
          .eq('org_id', ctx.orgId)
          .eq('account_id', args.accountId)
          .order('updated_at', { ascending: false })
          .limit(limit))
      : Promise.resolve([]),
    wants(sectionSet, 'opportunities')
      ? safeSelect('opportunities', admin
          .from('opportunities')
          .select('id, name, stage, value, expected_close_date, owner_id, assigned_to, updated_at')
          .eq('org_id', ctx.orgId)
          .eq('account_id', args.accountId)
          .order('updated_at', { ascending: false })
          .limit(limit))
      : Promise.resolve([]),
    wants(sectionSet, 'tasks')
      ? safeSelect('tasks', admin
          .from('tasks')
          .select('id, title, status, priority, due_date, account_id, opportunity_id, contact_id, updated_at')
          .eq('org_id', ctx.orgId)
          .eq('account_id', args.accountId)
          .order('updated_at', { ascending: false })
          .limit(limit))
      : Promise.resolve([]),
    wants(sectionSet, 'intel')
      ? safeSelect('intel_items', admin
          .from('intel_items')
          .select('id, title, summary, content, priority, signal_type, date, updated_at')
          .eq('org_id', ctx.orgId)
          .eq('account_id', args.accountId)
          .order('date', { ascending: false })
          .limit(limit))
      : Promise.resolve([]),
    wants(sectionSet, 'decodes')
      ? safeSelect('email_decodes', admin
          .from('email_decodes')
          .select('id, date, original_sender_name, client_name, email_text, decode, created_at')
          .eq('org_id', ctx.orgId)
          .eq('account_id', args.accountId)
          .order('created_at', { ascending: false })
          .limit(limit))
      : Promise.resolve([]),
    wants(sectionSet, 'strategic_plays')
      ? safeSelect('strategic_plays', admin
          .from('strategic_plays')
          .select('id, goal_description, status, confidence, steps, assumptions, updated_at')
          .eq('org_id', ctx.orgId)
          .eq('account_id', args.accountId)
          .order('updated_at', { ascending: false })
          .limit(limit))
      : Promise.resolve([]),
    wants(sectionSet, 'activities')
      ? safeSelect('activity_logs', admin
          .from('activity_logs')
          .select('id, summary, action_type, contact_name, contact_id, created_at')
          .eq('org_id', ctx.orgId)
          .eq('account_id', args.accountId)
          .order('created_at', { ascending: false })
          .limit(limit))
      : Promise.resolve([]),
    wants(sectionSet, 'source_records')
      ? safeSelect('source_records', admin
          .from('source_records')
          .select('id, source_kind, source_table, title, summary, occurred_at')
          .eq('org_id', ctx.orgId)
          .eq('account_id', args.accountId)
          .order('occurred_at', { ascending: false })
          .limit(limit))
      : Promise.resolve([]),
    wants(sectionSet, 'claims')
      ? safeSelect('account_claims', admin
          .from('account_claims')
          .select('id, claim_type, statement, status, confidence, updated_at')
          .eq('org_id', ctx.orgId)
          .eq('account_id', args.accountId)
          .order('updated_at', { ascending: false })
          .limit(limit))
      : Promise.resolve([]),
    wants(sectionSet, 'open_questions')
      ? safeSelect('account_open_questions', admin
          .from('account_open_questions')
          .select('id, question, priority, status, updated_at')
          .eq('org_id', ctx.orgId)
          .eq('account_id', args.accountId)
          .eq('status', 'open')
          .order('priority', { ascending: true })
          .limit(limit))
      : Promise.resolve([]),
  ]);

  return {
    success: true,
    message: `已读取「${account.name ?? '当前客户'}」的服务端上下文`,
    data: {
      account: {
        id: account.id,
        name: account.name,
        industry: account.industry,
        dealStage: account.deal_stage,
        dealValue: account.deal_value,
        updatedAt: account.updated_at,
      },
      contacts: contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        title: contact.title,
        role: contact.role,
        email: contact.email,
      })),
      opportunities: opportunities.map((opportunity) => ({
        id: opportunity.id,
        name: opportunity.name,
        stage: opportunity.stage,
        value: opportunity.value,
        expectedCloseDate: opportunity.expected_close_date,
      })),
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.due_date,
        opportunityId: task.opportunity_id,
        contactId: task.contact_id,
      })),
      intelItems: intelItems.map((item) => ({
        id: item.id,
        title: item.title,
        summary: clip(item.summary ?? item.content),
        priority: item.priority,
        signalType: item.signal_type,
        date: item.date,
      })),
      emailDecodes: emailDecodes.map((decode) => ({
        id: decode.id,
        date: decode.date,
        sender: decode.original_sender_name ?? decode.client_name,
        summary: clip(
          typeof decode.decode === 'object' && decode.decode !== null && 'summary' in decode.decode
            ? (decode.decode as { summary?: unknown }).summary
            : decode.email_text,
        ),
      })),
      strategicPlays: strategicPlays.map((play) => ({
        id: play.id,
        goalDescription: clip(play.goal_description, 220),
        status: play.status,
        confidence: play.confidence,
        updatedAt: play.updated_at,
        steps: Array.isArray(play.steps)
          ? play.steps.slice(0, 6).map((step: { title?: unknown; description?: unknown; status?: unknown; expectedOutcome?: unknown }) => ({
              title: clip(step.title, 80),
              description: clip(step.description, 160),
              status: step.status,
              expectedOutcome: clip(step.expectedOutcome, 120),
            }))
          : [],
      })),
      activityLogs: activityLogs.map((activity) => ({
        id: activity.id,
        summary: clip(activity.summary),
        actionType: activity.action_type,
        contactName: activity.contact_name,
        createdAt: activity.created_at,
      })),
      sourceRecords: sourceRecords.map((record) => ({
        id: record.id,
        sourceKind: record.source_kind,
        sourceTable: record.source_table,
        title: record.title,
        summary: clip(record.summary),
        occurredAt: record.occurred_at,
      })),
      claims: claims.map((claim) => ({
        id: claim.id,
        claimType: claim.claim_type,
        statement: clip(claim.statement),
        status: claim.status,
        confidence: claim.confidence,
        updatedAt: claim.updated_at,
      })),
      openQuestions: openQuestions.map((question) => ({
        id: question.id,
        question: question.question,
        priority: question.priority,
      })),
      sourceRefs: {
        note: '以上数据均由服务端按 org/account 权限读取；前端传入的 chat context 仅作为当前页面提示。',
      },
    },
  };
}
