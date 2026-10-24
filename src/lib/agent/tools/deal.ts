/**
 * update_deal_stage 工具执行函数
 *
 * 推进商机阶段，附带快照备份和 AI agent metadata。
 * 这是不可逆操作，写入前需用户确认。
 */

import { createClient } from '@/lib/supabase/server';
import type { ToolResult } from './types';
export type { ToolResult };

export interface UpdateDealStageArgs {
  opportunityId: string;
  newStage: string;
  reason: string;
  source_quote: string;
  conversation_id?: string;
}

export async function executeUpdateDealStage(args: UpdateDealStageArgs): Promise<ToolResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: '未登录，无法更新商机阶段' };
  }

  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const orgId = membership?.org_id ?? null;

  // 1. 读取当前状态（快照）
  const { data: opp, error: fetchError } = await supabase
    .from('opportunities')
    .select('id, name, stage, status, notes')
    .eq('id', args.opportunityId)
    .single();

  if (fetchError || !opp) {
    return {
      success: false,
      message: `找不到商机 ${args.opportunityId}：${fetchError?.message ?? '数据不存在'}`,
    };
  }

  const previousStage = opp.stage as string;
  const now = new Date().toISOString();

  // 2. 构建更新的 notes（追加快照信息）
  const existingNotes = (opp.notes as string) ?? '';
  const stageChangeLog = `[${now}][AI阶段变更] ${previousStage} → ${args.newStage}\n原因：${args.reason}\n来源：${args.source_quote}`;
  const updatedNotes = existingNotes
    ? `${existingNotes}\n\n---\n${stageChangeLog}`
    : stageChangeLog;

  // 3. 执行更新
  const dealUpdateQuery = supabase
    .from('opportunities')
    .update({
      stage: args.newStage,
      notes: updatedNotes,
      updated_at: now,
    })
    .eq('id', args.opportunityId);
  if (orgId) dealUpdateQuery.eq('org_id', orgId);
  const { error: updateError } = await dealUpdateQuery;

  if (updateError) {
    return {
      success: false,
      message: `更新商机阶段失败：${updateError.message}`,
    };
  }

  return {
    success: true,
    message: `✅ 商机「${opp.name}」已从 ${previousStage} 推进到 ${args.newStage}`,
    data: {
      opportunityId: args.opportunityId,
      opportunityName: opp.name,
      previousStage,
      newStage: args.newStage,
      reason: args.reason,
      snapshot: {
        stage: previousStage,
        status: opp.status,
        capturedAt: now,
      },
    },
  };
}
