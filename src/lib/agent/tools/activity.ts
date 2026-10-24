/**
 * log_activity 工具执行函数
 *
 * 记录销售活动（通话、会议、邮件、拜访、演示），写入 activity_logs 表。
 */

import { createClient } from '@/lib/supabase/server';
import type { ToolResult } from './types';
export type { ToolResult };

export interface LogActivityArgs {
  accountId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  activityType: 'call' | 'meeting' | 'email' | 'visit' | 'demo';
  summary: string;
  nextSteps?: string | null;
  date?: string | null;
  source_quote: string;
  conversation_id?: string;
}

const ACTIVITY_LABEL: Record<string, string> = {
  call: '通话',
  meeting: '会议',
  email: '邮件',
  visit: '拜访',
  demo: '演示',
};

export async function executeLogActivity(args: LogActivityArgs): Promise<ToolResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: '未登录，无法记录活动' };
  }

  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const orgId = membership?.org_id ?? null;

  // 查询关联实体名称
  let accountName: string | null = null;
  let contactName: string | null = null;

  if (args.accountId) {
    const { data: acc } = await supabase
      .from('accounts')
      .select('name')
      .eq('id', args.accountId)
      .single();
    accountName = acc?.name ?? null;
  }

  if (args.contactId) {
    const { data: con } = await supabase
      .from('contacts')
      .select('name')
      .eq('id', args.contactId)
      .single();
    contactName = con?.name ?? null;
  }

  const now = new Date().toISOString();
  const label = ACTIVITY_LABEL[args.activityType] ?? args.activityType;

  const metadata: Record<string, unknown> = {
    ai_source: 'ai_agent',
    source_quote: args.source_quote,
    conversation_id: args.conversation_id ?? null,
    activity_date: args.date ?? now,
  };
  if (args.nextSteps) {
    metadata.next_steps = args.nextSteps;
  }

  const { data, error } = await supabase
    .from('activity_logs')
    .insert({
      user_id: user.id,
      org_id: orgId,
      action_type: args.activityType,
      entity_type: 'activity',
      entity_name: `${label}记录`,
      account_id: args.accountId ?? null,
      account_name: accountName,
      contact_id: args.contactId ?? null,
      contact_name: contactName,
      opportunity_id: args.opportunityId ?? null,
      summary: args.summary,
      metadata,
      created_at: args.date ?? now,
    })
    .select()
    .single();

  if (error) {
    return {
      success: false,
      message: `记录活动失败：${error.message}`,
    };
  }

  const contextParts: string[] = [];
  if (accountName) contextParts.push(accountName);
  if (contactName) contextParts.push(contactName);
  const contextStr = contextParts.length > 0 ? `（${contextParts.join(' / ')}）` : '';

  return {
    success: true,
    message: `✅ ${label}活动已记录${contextStr}`,
    data: {
      activityId: data.id,
      activityType: args.activityType,
      accountId: args.accountId,
      contactId: args.contactId,
    },
  };
}
