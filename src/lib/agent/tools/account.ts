/**
 * 客户公司相关工具执行函数
 * - update_account_info: 更新单字段（行业、规模等）
 * - update_account: 批量更新多字段（备注、交易阶段、健康度、金额、策略）
 */

import { createClient } from '@/lib/supabase/server';
import type { ToolResult } from './types';
export type { ToolResult };

// ─── update_account_info ─────────────────────────────────────────────

export interface UpdateAccountInfoArgs {
  accountId: string;
  field: 'industry' | 'size' | 'annual_revenue' | 'key_initiatives' | 'budget_cycle';
  value: string;
  source_quote: string;
  conversation_id?: string;
}

// field → 数据库列名映射
const FIELD_COLUMN_MAP: Record<string, string> = {
  industry: 'industry',
  size: 'notes',                 // accounts 表无 employee_count，追加到 notes
  annual_revenue: 'notes',       // accounts 表无 annual_revenue，追加到 notes
  key_initiatives: 'notes',      // key_initiatives 存入 notes 字段
  budget_cycle: 'notes',         // budget_cycle 同样存入 notes 字段追加
};

const FIELD_LABEL: Record<string, string> = {
  industry: '行业',
  size: '公司规模',
  annual_revenue: '年收入',
  key_initiatives: '关键项目',
  budget_cycle: '预算周期',
};

export async function executeUpdateAccountInfo(args: UpdateAccountInfoArgs): Promise<ToolResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: '未登录，无法更新客户信息' };
  }

  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const orgId = membership?.org_id ?? null;

  // 读取当前账户信息
  const { data: account, error: fetchError } = await supabase
    .from('accounts')
    .select('id, name, industry, notes')
    .eq('id', args.accountId)
    .single();

  if (fetchError || !account) {
    return {
      success: false,
      message: `找不到客户 ${args.accountId}：${fetchError?.message ?? '数据不存在'}`,
    };
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };

  // 对于所有映射到 notes 的字段，追加写入而非覆盖
  if (FIELD_COLUMN_MAP[args.field] === 'notes') {
    const existingNotes = (account.notes as string) ?? '';
    const label = FIELD_LABEL[args.field];
    const noteEntry = `[${now}][AI更新][${label}] ${args.value}\n来源：${args.source_quote}`;
    updates.notes = existingNotes ? `${existingNotes}\n\n---\n${noteEntry}` : noteEntry;
  } else {
    const col = FIELD_COLUMN_MAP[args.field];
    if (col) {
      updates[col] = args.value;
    }
  }

  const infoUpdateQuery = supabase
    .from('accounts')
    .update(updates)
    .eq('id', args.accountId);
  if (orgId) infoUpdateQuery.eq('org_id', orgId);
  const { error: updateError } = await infoUpdateQuery;

  if (updateError) {
    return {
      success: false,
      message: `更新客户信息失败：${updateError.message}`,
    };
  }

  return {
    success: true,
    message: `✅ 客户「${account.name}」的${FIELD_LABEL[args.field] ?? args.field}已更新`,
    data: {
      accountId: args.accountId,
      accountName: account.name,
      field: args.field,
      value: args.value,
    },
  };
}

// ─── update_account ──────────────────────────────────────────────────

export interface UpdateAccountArgs {
  accountId: string;
  notes?: string | null;
  dealStage?: string | null;
  dealHealth?: 'healthy' | 'at_risk' | 'critical' | null;
  dealValue?: number | null;
  strategy?: Record<string, unknown> | null;
  source_quote: string;
  conversation_id?: string;
}

export async function executeUpdateAccount(args: UpdateAccountArgs): Promise<ToolResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: '未登录，无法更新客户' };
  }

  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const orgId = membership?.org_id ?? null;

  const { data: account, error: fetchError } = await supabase
    .from('accounts')
    .select('id, name, notes, strategy')
    .eq('id', args.accountId)
    .single();

  if (fetchError || !account) {
    return {
      success: false,
      message: `找不到客户 ${args.accountId}：${fetchError?.message ?? '数据不存在'}`,
    };
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {};

  if (args.dealStage !== undefined && args.dealStage !== null) updates.deal_stage = args.dealStage;
  if (args.dealHealth !== undefined && args.dealHealth !== null) updates.deal_health = args.dealHealth;
  if (args.dealValue !== undefined && args.dealValue !== null) updates.deal_value = args.dealValue;

  // notes 追加而非覆盖
  if (args.notes !== undefined && args.notes !== null) {
    const existingNotes = (account.notes as string) ?? '';
    const noteEntry = `[${now}][AI更新] ${args.notes}\n来源：${args.source_quote}`;
    updates.notes = existingNotes ? `${existingNotes}\n\n---\n${noteEntry}` : noteEntry;
  }

  // strategy 合并
  if (args.strategy !== undefined && args.strategy !== null) {
    const currentStrategy = (account.strategy as Record<string, unknown>) ?? {};
    updates.strategy = {
      ...currentStrategy,
      ...args.strategy,
      ai_updated_at: now,
      ai_source_quote: args.source_quote,
    };
  }

  const updatedFields = Object.keys(updates);

  if (updatedFields.length === 0) {
    return { success: false, message: '没有需要更新的字段' };
  }

  const accountUpdateQuery = supabase
    .from('accounts')
    .update(updates)
    .eq('id', args.accountId);
  if (orgId) accountUpdateQuery.eq('org_id', orgId);
  const { error: updateError } = await accountUpdateQuery;

  if (updateError) {
    return {
      success: false,
      message: `更新客户失败：${updateError.message}`,
    };
  }

  return {
    success: true,
    message: `✅ 客户「${account.name}」已更新`,
    data: {
      accountId: args.accountId,
      accountName: account.name,
      updatedFields,
    },
  };
}
