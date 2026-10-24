/**
 * update_meddicc 工具执行函数
 *
 * 更新 opportunities 表的 meddicc JSON 字段中的指定维度。
 * 写入时附加 AI agent metadata。
 */

import { createClient } from '@/lib/supabase/server';
import type { ToolResult } from './types';
export type { ToolResult };

export interface UpdateMeddiccArgs {
  opportunityId: string;
  field:
    | 'metrics'
    | 'economic_buyer'
    | 'decision_criteria'
    | 'decision_process'
    | 'identify_pain'
    | 'champion'
    | 'competition';
  value: string;
  confidence: 'explicit' | 'implied';
  source_quote: string;
  needs_clarification?: string;
  conversation_id?: string;
}

const FIELD_MAP: Record<string, string> = {
  metrics: 'metrics',
  economic_buyer: 'economicBuyer',
  decision_criteria: 'decisionCriteria',
  decision_process: 'decisionProcess',
  identify_pain: 'identifiedPain',
  champion: 'champion',
  competition: 'competition',
};

export async function executeMeddiccUpdate(args: UpdateMeddiccArgs): Promise<ToolResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: '未登录，无法更新 MEDDICC' };
  }

  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const orgId = membership?.org_id ?? null;

  // 1. 读取当前 meddicc 值（快照备用）
  const { data: opp, error: fetchError } = await supabase
    .from('opportunities')
    .select('id, meddicc, name')
    .eq('id', args.opportunityId)
    .single();

  if (fetchError || !opp) {
    return {
      success: false,
      message: `找不到商机 ${args.opportunityId}：${fetchError?.message ?? '数据不存在'}`,
    };
  }

  // 2. 构建更新后的 meddicc 对象
  const currentMeddicc = (opp.meddicc as Record<string, unknown>) ?? {};
  const camelField = FIELD_MAP[args.field] ?? args.field;

  const updatedMeddicc = {
    ...currentMeddicc,
    [camelField]: {
      value: args.value,
      updatedAt: new Date().toISOString(),
      ai_metadata: {
        source: 'ai_agent',
        source_quote: args.source_quote,
        confidence: args.confidence,
        conversation_id: args.conversation_id ?? null,
        updated_at: new Date().toISOString(),
      },
    },
  };

  // 3. 写入
  const meddiccUpdateQuery = supabase
    .from('opportunities')
    .update({
      meddicc: updatedMeddicc,
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.opportunityId);
  if (orgId) meddiccUpdateQuery.eq('org_id', orgId);
  const { error: updateError } = await meddiccUpdateQuery;

  if (updateError) {
    return {
      success: false,
      message: `更新失败：${updateError.message}`,
    };
  }

  return {
    success: true,
    message: `✅ MEDDICC [${args.field}] 已更新`,
    data: {
      opportunityId: args.opportunityId,
      opportunityName: opp.name,
      field: args.field,
      value: args.value,
      previousValue: (currentMeddicc[camelField] as Record<string, unknown>)?.value ?? null,
    },
  };
}
