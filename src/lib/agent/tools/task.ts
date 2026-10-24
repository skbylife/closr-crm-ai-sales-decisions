/**
 * 任务相关工具执行函数
 * - create_task: 创建跟进任务
 * - update_task: 更新任务状态/截止日期/备注
 */

import { createClient } from '@/lib/supabase/server';
import type { ToolResult } from './types';
export type { ToolResult };

// ─── create_task ─────────────────────────────────────────────────────

export interface CreateTaskArgs {
  title: string;
  dueDate?: string | null;
  accountId?: string | null;
  opportunityId?: string | null;
  contactId?: string | null;
  priority: 'high' | 'medium' | 'low';
  description?: string;
  assignedTo?: string | null;
  conversation_id?: string;
}

export async function executeCreateTask(args: CreateTaskArgs): Promise<ToolResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: '未登录，无法创建任务' };
  }

  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const orgId = membership?.org_id ?? null;

  const taskId = `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      id: taskId,
      title: args.title,
      description: args.description ?? null,
      status: 'todo',
      priority: args.priority,
      due_date: args.dueDate ?? null,
      account_id: args.accountId ?? null,
      opportunity_id: args.opportunityId ?? null,
      contact_id: args.contactId ?? null,
      user_id: user.id,
      assigned_to: user.id,
      org_id: orgId,
      source: 'system', // TaskSource
      ai_generated: true,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) {
    return {
      success: false,
      message: `创建任务失败：${error.message}`,
    };
  }

  return {
    success: true,
    message: `✅ 任务「${args.title}」已创建${args.dueDate ? `，截止 ${args.dueDate}` : ''}`,
    data: {
      taskId: data.id,
      title: args.title,
      priority: args.priority,
      dueDate: args.dueDate,
      accountId: args.accountId,
      opportunityId: args.opportunityId,
      contactId: args.contactId,
      assignedTo: user.id,
    },
  };
}

// ─── update_task ─────────────────────────────────────────────────────

export interface UpdateTaskArgs {
  taskId: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled' | null;
  dueDate?: string | null;
  notes?: string | null;
  source_quote: string;
  conversation_id?: string;
}

// tasks 表 status 列用的是 'todo' 而非 'pending'
const STATUS_MAP: Record<string, string> = {
  pending: 'todo',
  in_progress: 'in_progress',
  completed: 'done',
  cancelled: 'cancelled',
};

export async function executeUpdateTask(args: UpdateTaskArgs): Promise<ToolResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: '未登录，无法更新任务' };
  }

  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const orgId = membership?.org_id ?? null;

  const { data: task, error: fetchError } = await supabase
    .from('tasks')
    .select('id, title, status, description')
    .eq('id', args.taskId)
    .single();

  if (fetchError || !task) {
    return {
      success: false,
      message: `找不到任务 ${args.taskId}：${fetchError?.message ?? '数据不存在'}`,
    };
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (args.status !== undefined && args.status !== null) {
    updates.status = STATUS_MAP[args.status] ?? args.status;
  }
  if (args.dueDate !== undefined && args.dueDate !== null) {
    updates.due_date = args.dueDate;
  }

  // 追加备注到 description
  if (args.notes !== undefined && args.notes !== null) {
    const existing = (task.description as string) ?? '';
    const now = new Date().toISOString();
    const noteEntry = `[${now}][AI更新] ${args.notes}\n来源：${args.source_quote}`;
    updates.description = existing ? `${existing}\n\n---\n${noteEntry}` : noteEntry;
  }

  const updatedFields = Object.keys(updates).filter((k) => k !== 'updated_at');

  if (updatedFields.length === 0) {
    return { success: false, message: '没有需要更新的字段' };
  }

  const updateQuery = supabase
    .from('tasks')
    .update(updates)
    .eq('id', args.taskId);
  if (orgId) updateQuery.eq('org_id', orgId);
  const { error: updateError } = await updateQuery;

  if (updateError) {
    return {
      success: false,
      message: `更新任务失败：${updateError.message}`,
    };
  }

  const statusLabel: Record<string, string> = {
    pending: '待处理',
    in_progress: '进行中',
    completed: '已完成',
    cancelled: '已取消',
  };

  return {
    success: true,
    message: `✅ 任务「${task.title}」已更新${args.status ? `（${statusLabel[args.status] ?? args.status}）` : ''}`,
    data: {
      taskId: args.taskId,
      taskTitle: task.title,
      updatedFields,
    },
  };
}
