/**
 * POST /api/agent/execute-tools
 *
 * 接收用户确认的 pending actions，执行对应工具函数并写入数据库。
 * 每个 action 包含字段列表，映射到对应的工具函数。
 *
 * dispatch 逻辑抽取到 ./dispatch.ts，本文件只负责 HTTP 层。
 */

import {
  ApiError,
  requireAuth,
  requireAccountAccess,
  requireContactAccess,
  requireOpportunityAccess,
  requireAdmin,
  guardResponse,
} from '@/lib/api-guard';
import type { ToolResult } from '@/lib/agent/tools/types';
import {
  dispatchTool,
  type ExecuteToolsRequest,
  type ExecuteToolsResultItem,
} from './dispatch';


type TaskGuardRow = {
  id: string;
  title?: string | null;
  status?: string | null;
  org_id?: string | null;
  account_id?: string | null;
  opportunity_id?: string | null;
  contact_id?: string | null;
};

function nullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function guardAndEnrichRecordTaskOutcome(
  ctx: Awaited<ReturnType<typeof requireAuth>>,
  action: ExecuteToolsRequest['actions'][number],
): Promise<ExecuteToolsRequest['actions'][number]> {
  if (action.toolName !== 'record_task_outcome') return action;

  const taskId = actionValue(action, 'taskId');
  if (!taskId) throw new ApiError(400, '缺少任务 ID，已拒绝写入');

  const admin = requireAdmin();
  const { data: task, error } = await admin
    .from('tasks')
    .select('id, title, status, org_id, account_id, opportunity_id, contact_id')
    .eq('id', taskId)
    .eq('org_id', ctx.orgId)
    .maybeSingle();

  if (error) throw new ApiError(500, `读取任务失败：${error.message}`);
  const taskRow = task as TaskGuardRow | null;
  if (!taskRow) throw new ApiError(404, '任务不存在或不属于当前组织，已拒绝写入');

  const payloadAccountId = nullableString(actionValue(action, 'accountId'));
  const payloadOpportunityId = nullableString(actionValue(action, 'opportunityId'));
  const payloadContactId = nullableString(actionValue(action, 'contactId'));

  if (taskRow.account_id) await requireAccountAccess(ctx, taskRow.account_id);

  let opportunityAccountId: string | null = null;
  if (taskRow.opportunity_id || payloadOpportunityId) {
    const opportunity = await requireOpportunityAccess(ctx, payloadOpportunityId ?? taskRow.opportunity_id!);
    opportunityAccountId = opportunity.account_id;
    if (payloadOpportunityId && payloadOpportunityId !== taskRow.opportunity_id) {
      throw new ApiError(400, '任务与确认卡商机不一致，已拒绝写入');
    }
  }

  let contactAccountId: string | null = null;
  if (taskRow.contact_id || payloadContactId) {
    const contact = await requireContactAccess(ctx, payloadContactId ?? taskRow.contact_id!);
    contactAccountId = contact.account_id;
    if (payloadContactId && payloadContactId !== taskRow.contact_id) {
      throw new ApiError(400, '任务与确认卡联系人不一致，已拒绝写入');
    }
  }

  const effectiveAccountId = taskRow.account_id ?? opportunityAccountId ?? contactAccountId;
  if (!effectiveAccountId) throw new ApiError(400, '任务缺少关联客户，无法沉淀到客户判断时间线');
  if (payloadAccountId && payloadAccountId !== effectiveAccountId) {
    throw new ApiError(400, '任务与确认卡客户不一致，已拒绝写入');
  }

  return {
    ...action,
    args: {
      ...(action.args ?? {}),
      taskId: taskRow.id,
      accountId: effectiveAccountId,
      opportunityId: taskRow.opportunity_id ?? null,
      contactId: taskRow.contact_id ?? null,
      previousTaskStatus: taskRow.status ?? null,
    },
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

function actionValue(action: Partial<ExecuteToolsRequest['actions'][number]>, key: string): string | null {
  const fromField = action.fields?.find(
    (field) => field.field === key || field.field.toLowerCase() === key.toLowerCase(),
  )?.value;
  if (fromField != null) return String(fromField);
  const raw = action.args?.[key];
  return raw != null ? String(raw) : null;
}

function forceCurrentUserTaskAssignee(
  action: ExecuteToolsRequest['actions'][number],
  userId: string,
): ExecuteToolsRequest['actions'][number] {
  if (action.toolName !== 'create_task') return action;

  return {
    ...action,
    args: {
      ...(action.args ?? {}),
      assignedTo: userId,
    },
    fields: (action.fields ?? []).filter((field) => !['assignedTo', '负责人'].includes(field.field)),
  };
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    const body = (await request.json()) as Partial<ExecuteToolsRequest>;

    const { actions, conversationId } = body;

    if (!Array.isArray(actions) || actions.length === 0) {
      return Response.json({ error: '缺少 actions 列表' }, { status: 400 });
    }

    if (!conversationId || typeof conversationId !== 'string') {
      return Response.json({ error: '缺少 conversationId' }, { status: 400 });
    }

    // Execute all confirmed actions (sequentially to avoid race conditions)
    const results: ExecuteToolsResultItem[] = [];
    const undoExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // +5min

    for (const action of actions) {
      if (!action.toolName) {
        results.push({
          toolName: 'unknown',
          displayName: action.displayName ?? '未知操作',
          success: false,
          message: '缺少 toolName',
          canUndo: false,
          undoExpiresAt,
        });
        continue;
      }

      let result: ToolResult;
      try {
        const guardedAction = await guardAndEnrichRecordTaskOutcome(ctx, action);
        const accountId = actionValue(guardedAction, 'accountId');
        const contactId = actionValue(guardedAction, 'contactId');
        const opportunityId = actionValue(guardedAction, 'opportunityId');

        // Server-side resource guards before executing AI-confirmed writes.
        // The tool layer also uses RLS/session org filters, but this prevents
        // IDOR attempts from ever reaching write helpers.
        if (accountId) await requireAccountAccess(ctx, accountId);
        const contact = contactId ? await requireContactAccess(ctx, contactId) : null;
        const opportunity = opportunityId ? await requireOpportunityAccess(ctx, opportunityId) : null;

        if (accountId && contact && contact.account_id !== accountId) {
          throw new ApiError(400, '联系人不属于当前客户，已拒绝写入');
        }
        if (accountId && opportunity && opportunity.account_id && opportunity.account_id !== accountId) {
          throw new ApiError(400, '商机不属于当前客户，已拒绝写入');
        }
        if (contact && opportunity && opportunity.account_id !== contact.account_id) {
          throw new ApiError(400, '商机与联系人不属于同一客户，已拒绝写入');
        }

        const safeAction = forceCurrentUserTaskAssignee(guardedAction, ctx.userId);
        result = await dispatchTool(safeAction, conversationId);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (!(err instanceof ApiError) || err.status >= 500) {
          console.error(
            `[execute-tools] dispatchTool 失败: tool=${action.toolName}`,
            err instanceof Error ? err.stack : err,
          );
        }
        result = {
          success: false,
          message: `执行出错：${errMsg}`,
        };
      }

      results.push({
        toolName: action.toolName,
        displayName: action.displayName,
        success: result.success,
        message: result.message,
        canUndo: result.success, // Only successful writes can be undone
        undoExpiresAt,
      });
    }

    return Response.json({ results });
  } catch (err) {
    if (!(err instanceof ApiError)) {
      console.error('[execute-tools] 顶层错误:', err instanceof Error ? err.stack : err);
    }
    return guardResponse(err);
  }
}
