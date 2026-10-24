/**
 * add_discovery_note 工具执行函数
 *
 * 记录发现的客户需求、痛点、预算、时间线等信息，写入 discovery_notes 表。
 */

import { createClient } from '@/lib/supabase/server';
import type { ToolResult } from './types';
export type { ToolResult };

export interface AddDiscoveryNoteArgs {
  opportunityId?: string | null;
  accountId?: string | null;
  content: string;
  noteType: 'pain_point' | 'need' | 'budget' | 'timeline' | 'decision_process' | 'competitor' | 'other';
  priority: 'high' | 'medium' | 'low';
  source_quote: string;
  conversation_id?: string;
}

const NOTE_TYPE_LABEL: Record<string, string> = {
  pain_point: '痛点',
  need: '需求',
  budget: '预算',
  timeline: '时间线',
  decision_process: '决策流程',
  competitor: '竞品',
  other: '其他',
};

export async function executeAddDiscoveryNote(args: AddDiscoveryNoteArgs): Promise<ToolResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: '未登录，无法添加发现笔记' };
  }

  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const orgId = membership?.org_id ?? null;

  const noteId = `disc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const today = new Date().toISOString().split('T')[0];

  // 如果只提供了 accountId 没有 opportunityId，尝试查找该客户的商机
  let opportunityId = args.opportunityId ?? null;
  if (!opportunityId && args.accountId) {
    const { data: opp } = await supabase
      .from('opportunities')
      .select('id')
      .eq('account_id', args.accountId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    if (opp) {
      opportunityId = opp.id;
    }
  }

  // spin_classification jsonb 存储 noteType 和 priority
  const spinClassification = {
    note_type: args.noteType,
    priority: args.priority,
    ai_source: 'ai_agent',
    source_quote: args.source_quote,
    conversation_id: args.conversation_id ?? null,
  };

  const { data, error } = await supabase
    .from('discovery_notes')
    .insert({
      id: noteId,
      user_id: user.id,
      org_id: orgId,
      opportunity_id: opportunityId,
      date: today,
      source: 'ai_agent',
      content: args.content,
      spin_classification: spinClassification,
      created_at: now,
    })
    .select()
    .single();

  if (error) {
    return {
      success: false,
      message: `添加发现笔记失败：${error.message}`,
    };
  }

  const label = NOTE_TYPE_LABEL[args.noteType] ?? args.noteType;

  return {
    success: true,
    message: `✅ ${label}笔记已添加`,
    data: {
      noteId: data.id,
      noteType: args.noteType,
      priority: args.priority,
      opportunityId,
    },
  };
}
