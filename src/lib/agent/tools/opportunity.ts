/**
 * 商机相关工具执行函数
 * - update_opportunity: 更新商机字段
 * - create_opportunity: 创建新商机
 */

import { createClient } from '@/lib/supabase/server';
import type { ToolResult } from './types';
export type { ToolResult };

// ─── update_opportunity ──────────────────────────────────────────────

export interface UpdateOpportunityArgs {
  opportunityId: string;
  name?: string | null;
  value?: number | null;
  currency?: string | null;
  stage?: string | null;
  closeDate?: string | null;
  winProbability?: number | null;
  health?: 'healthy' | 'at_risk' | 'critical' | null;
  notes?: string | null;
  source_quote: string;
  conversation_id?: string;
}

export async function executeUpdateOpportunity(args: UpdateOpportunityArgs): Promise<ToolResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: '未登录，无法更新商机' };
  }

  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const orgId = membership?.org_id ?? null;

  const { data: opp, error: fetchError } = await supabase
    .from('opportunities')
    .select('id, name, notes')
    .eq('id', args.opportunityId)
    .single();

  if (fetchError || !opp) {
    return {
      success: false,
      message: `找不到商机 ${args.opportunityId}：${fetchError?.message ?? '数据不存在'}`,
    };
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (args.name !== undefined && args.name !== null) updates.name = args.name;
  if (args.value !== undefined && args.value !== null) updates.value = args.value;
  if (args.currency !== undefined && args.currency !== null) updates.currency = args.currency;
  if (args.stage !== undefined && args.stage !== null) updates.stage = args.stage;
  if (args.closeDate !== undefined && args.closeDate !== null) updates.expected_close_date = args.closeDate;
  if (args.winProbability !== undefined && args.winProbability !== null) updates.probability = args.winProbability;

  // health 没有直接列，追加到 notes
  if (args.health !== undefined && args.health !== null) {
    const healthLabel = { healthy: '健康', at_risk: '有风险', critical: '危急' }[args.health];
    const now = new Date().toISOString();
    const existingNotes = (opp.notes as string) ?? '';
    const healthNote = `[${now}][AI更新][健康度] ${healthLabel} (${args.health})\n来源：${args.source_quote}`;
    updates.notes = existingNotes ? `${existingNotes}\n\n---\n${healthNote}` : healthNote;
  }

  // 追加备注
  if (args.notes !== undefined && args.notes !== null && !updates.notes) {
    const existingNotes = (opp.notes as string) ?? '';
    const now = new Date().toISOString();
    const noteEntry = `[${now}][AI备注] ${args.notes}\n来源：${args.source_quote}`;
    updates.notes = existingNotes ? `${existingNotes}\n\n---\n${noteEntry}` : noteEntry;
  }

  const updatedFields = Object.keys(updates).filter((k) => k !== 'updated_at');

  if (updatedFields.length === 0) {
    return { success: false, message: '没有需要更新的字段' };
  }

  const oppUpdateQuery = supabase
    .from('opportunities')
    .update(updates)
    .eq('id', args.opportunityId);
  if (orgId) oppUpdateQuery.eq('org_id', orgId);
  const { error: updateError } = await oppUpdateQuery;

  if (updateError) {
    return {
      success: false,
      message: `更新商机失败：${updateError.message}`,
    };
  }

  return {
    success: true,
    message: `✅ 商机「${opp.name}」已更新`,
    data: {
      opportunityId: args.opportunityId,
      opportunityName: opp.name,
      updatedFields,
    },
  };
}

// ─── create_opportunity ──────────────────────────────────────────────

export interface CreateOpportunityArgs {
  name: string;
  accountId?: string | null;
  value?: number | null;
  currency?: string | null;
  stage?: string | null;
  closeDate?: string | null;
  description?: string | null;
  source_quote: string;
  conversation_id?: string;
}

export async function executeCreateOpportunity(args: CreateOpportunityArgs): Promise<ToolResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: '未登录，无法创建商机' };
  }

  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const orgId = membership?.org_id ?? null;

  const oppId = `opp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('opportunities')
    .insert({
      id: oppId,
      name: args.name,
      account_id: args.accountId ?? null,
      value: args.value ?? null,
      currency: args.currency ?? 'USD',
      stage: args.stage ?? 'prospecting',
      expected_close_date: args.closeDate ?? null,
      notes: args.description
        ? `${args.description}\n\n[AI创建 ${now}] 来源：${args.source_quote}`
        : `[AI创建 ${now}] 来源：${args.source_quote}`,
      user_id: user.id,
      org_id: orgId,
      source: 'ai_agent',
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) {
    return {
      success: false,
      message: `创建商机失败：${error.message}`,
    };
  }

  return {
    success: true,
    message: `✅ 商机「${args.name}」已创建`,
    data: {
      opportunityId: data.id,
      name: args.name,
      value: args.value,
      stage: args.stage ?? 'prospecting',
    },
  };
}
