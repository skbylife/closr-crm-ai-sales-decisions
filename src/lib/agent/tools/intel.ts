/**
 * add_intel 工具执行函数
 *
 * 向 intel_items 表添加新情报，附带 AI agent metadata。
 */

import { createClient } from '@/lib/supabase/server';
import type { ToolResult } from './types';
export type { ToolResult };

export interface AddIntelArgs {
  accountId: string;
  content: string;
  intelType: 'budget' | 'competitor' | 'timeline' | 'stakeholder' | 'risk' | 'opportunity';
  priority: 'high' | 'medium' | 'low';
  source_quote: string;
  conversation_id?: string;
}

// intel_type → Intel 表的 source 字段映射
const INTEL_TYPE_LABEL: Record<string, string> = {
  budget: '预算情报',
  competitor: '竞品情报',
  timeline: '时间线情报',
  stakeholder: '决策人情报',
  risk: '风险信号',
  opportunity: '商机信号',
};

export async function executeAddIntel(args: AddIntelArgs): Promise<ToolResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: '未登录，无法添加情报' };
  }

  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const orgId = membership?.org_id ?? null;

  const intelId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('intel_items')
    .insert({
      id: intelId,
      account_id: args.accountId,
      content: args.content,
      source: 'ai_agent',
      credibility: args.priority === 'high' ? 'high' : args.priority === 'medium' ? 'medium' : 'low',
      urgency: args.priority,
      user_id: user.id,
      org_id: orgId,
      // 以 metadata JSON 存储 AI agent 来源信息
      // intel_items 表若有 metadata 字段则写入，否则追加到 content
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) {
    // 如果 metadata 字段不存在，重试不带该字段
    if (error.code === 'PGRST204' || error.message?.includes('column')) {
      const { data: retryData, error: retryError } = await supabase
        .from('intel_items')
        .insert({
          id: intelId,
          account_id: args.accountId,
          content: `${args.content}\n\n[AI记录 ${now}] 来源：${args.source_quote}`,
          source: 'ai_agent',
          credibility: args.priority === 'high' ? 'high' : 'medium',
          urgency: args.priority,
          user_id: user.id,
          org_id: orgId,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (retryError) {
        return { success: false, message: `添加情报失败：${retryError.message}` };
      }

      return {
        success: true,
        message: `✅ ${INTEL_TYPE_LABEL[args.intelType] ?? '情报'}已添加`,
        data: { intelId: retryData?.id, accountId: args.accountId, intelType: args.intelType },
      };
    }

    return { success: false, message: `添加情报失败：${error.message}` };
  }

  return {
    success: true,
    message: `✅ ${INTEL_TYPE_LABEL[args.intelType] ?? '情报'}已添加到情报库`,
    data: {
      intelId: data?.id ?? intelId,
      accountId: args.accountId,
      intelType: args.intelType,
      priority: args.priority,
    },
  };
}
