import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getOrgIdForUser } from '@/lib/get-org-id';
import {
  buildTaskOutcomeSourceRecord,
  defaultTaskOutcomeJudgmentImpact,
  type TaskOutcome,
} from '@/lib/judgment/task-outcome';
import type { ToolResult } from './types';

export interface RecordTaskOutcomeArgs {
  taskId: string;
  accountId?: string | null;
  opportunityId?: string | null;
  contactId?: string | null;
  outcome: TaskOutcome;
  outcomeNote?: string | null;
  reason?: string | null;
  judgmentImpact?: string | null;
  previousTaskStatus?: string | null;
  newTaskStatus?: string | null;
  source_quote: string;
  conversation_id?: string;
}

type TaskRow = {
  id: string;
  title?: string | null;
  status?: string | null;
  account_id?: string | null;
  opportunity_id?: string | null;
  contact_id?: string | null;
  org_id?: string | null;
};

async function resolveAuthenticatedScope(): Promise<{ userId: string; orgId: string } | { error: ToolResult }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: { success: false, message: '未登录，无法记录任务反馈' } };

  const orgId = await getOrgIdForUser(user.id);
  if (!orgId) return { error: { success: false, message: '无法确定用户所属组织，已拒绝写入' } };
  return { userId: user.id, orgId };
}

function idsMatch(payloadId: string | null | undefined, rowId: string | null | undefined): boolean {
  if (!payloadId) return true;
  return Boolean(rowId && payloadId === rowId);
}

export async function executeRecordTaskOutcome(args: RecordTaskOutcomeArgs): Promise<ToolResult> {
  const scope = await resolveAuthenticatedScope();
  if ('error' in scope) return scope.error;
  const admin = getSupabaseAdmin();
  if (!admin) return { success: false, message: '数据库暂时不可用，无法记录任务反馈' };

  if (!args.taskId || !args.outcome || !(args.outcomeNote || args.reason || args.source_quote)?.trim()) {
    return { success: false, message: '缺少必要参数：任务、结果或原因' };
  }

  const { data: task, error: taskError } = await admin
    .from('tasks')
    .select('id, title, status, org_id, account_id, opportunity_id, contact_id')
    .eq('id', args.taskId)
    .eq('org_id', scope.orgId)
    .maybeSingle();

  if (taskError) return { success: false, message: `读取任务失败：${taskError.message}` };
  const taskRow = task as TaskRow | null;
  if (!taskRow) return { success: false, message: '任务不存在或不属于当前组织，已拒绝写入' };
  if (!taskRow.account_id) return { success: false, message: '任务缺少关联客户，无法沉淀到客户判断时间线' };

  if (!idsMatch(args.accountId, taskRow.account_id)) {
    return { success: false, message: '任务与确认卡客户不一致，已拒绝写入' };
  }
  if (!idsMatch(args.opportunityId, taskRow.opportunity_id)) {
    return { success: false, message: '任务与确认卡商机不一致，已拒绝写入' };
  }
  if (!idsMatch(args.contactId, taskRow.contact_id)) {
    return { success: false, message: '任务与确认卡联系人不一致，已拒绝写入' };
  }

  const now = new Date().toISOString();
  const outcomeNote = (args.outcomeNote || args.reason || args.source_quote).trim();
  const row = buildTaskOutcomeSourceRecord({
    orgId: scope.orgId,
    accountId: taskRow.account_id,
    taskId: taskRow.id,
    opportunityId: taskRow.opportunity_id ?? null,
    contactId: taskRow.contact_id ?? null,
    outcome: args.outcome,
    outcomeNote,
    reason: args.reason || outcomeNote,
    judgmentImpact: args.judgmentImpact || defaultTaskOutcomeJudgmentImpact(args.outcome),
    previousTaskStatus: args.previousTaskStatus || taskRow.status || null,
    newTaskStatus: args.newTaskStatus ?? null,
    sourceQuote: args.source_quote,
    createdBy: scope.userId,
    createdAt: now,
  });

  const { data: inserted, error } = await admin
    .from('source_records')
    .insert(row)
    .select('id')
    .single();

  if (error) return { success: false, message: `记录任务反馈失败：${error.message}` };

  return {
    success: true,
    message: '已记录为当前客户的任务执行反馈；后续判断会参考这条证据，但不会自动覆盖最终判断。',
    data: {
      sourceRecordId: (inserted as { id?: string } | null)?.id,
      taskId: taskRow.id,
      accountId: taskRow.account_id,
      opportunityId: taskRow.opportunity_id ?? null,
      contactId: taskRow.contact_id ?? null,
      outcome: args.outcome,
    },
  };
}
