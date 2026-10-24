/**
 * 联系人相关工具执行函数
 * - add_contact_note: 添加联系人备注
 * - update_contact_profile: 更新联系人画像（DISC、沟通风格、态度、影响力、参与度）
 * - create_contact: 创建新联系人
 * - update_contact: 更新联系人基础信息
 */

import { createClient } from '@/lib/supabase/server';
import type { ToolResult } from './types';
export type { ToolResult };

// ─── add_contact_note ────────────────────────────────────────────────

export interface AddContactNoteArgs {
  contactId: string;
  note: string;
  noteType: 'meeting' | 'call' | 'email' | 'observation';
  source_quote: string;
  conversation_id?: string;
}

export async function executeAddContactNote(args: AddContactNoteArgs): Promise<ToolResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: '未登录，无法添加备注' };
  }

  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const orgId = membership?.org_id ?? null;

  // 读取联系人当前 personal_notes
  const { data: contact, error: fetchError } = await supabase
    .from('contacts')
    .select('id, name, personal_notes')
    .eq('id', args.contactId)
    .single();

  if (fetchError || !contact) {
    return {
      success: false,
      message: `找不到联系人 ${args.contactId}：${fetchError?.message ?? '数据不存在'}`,
    };
  }

  // 追加备注（以时间戳分隔）
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const noteEntry = `[${timestamp}][${args.noteType}][AI记录] ${args.note}\n来源：${args.source_quote}`;

  const existingNotes = (contact.personal_notes as string) ?? '';
  const updatedNotes = existingNotes
    ? `${existingNotes}\n\n---\n${noteEntry}`
    : noteEntry;

  const updateQuery = supabase
    .from('contacts')
    .update({
      personal_notes: updatedNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.contactId);
  if (orgId) updateQuery.eq('org_id', orgId);
  const { error: updateError } = await updateQuery;

  if (updateError) {
    return {
      success: false,
      message: `添加备注失败：${updateError.message}`,
    };
  }

  return {
    success: true,
    message: `✅ 联系人 ${contact.name} 的${args.noteType}备注已添加`,
    data: {
      contactId: args.contactId,
      contactName: contact.name,
      noteType: args.noteType,
      note: args.note,
    },
  };
}

// ─── update_contact_profile ──────────────────────────────────────────

export interface UpdateContactProfileArgs {
  contactId: string;
  role?: 'decision_maker' | 'influencer' | 'champion' | 'blocker' | 'end_user' | 'coach' | 'economic_buyer' | null;
  discType?: 'D' | 'I' | 'S' | 'C' | null;
  communicationStyle?: string | null;
  attitude?: 'positive' | 'neutral' | 'negative' | 'unknown' | null;
  influenceLevel?: 'high' | 'medium' | 'low' | null;
  engagement?: 'active' | 'passive' | 'inactive' | null;
  notes?: string | null;
  source_quote: string;
  conversation_id?: string;
}

export async function executeUpdateContactProfile(
  args: UpdateContactProfileArgs
): Promise<ToolResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: '未登录，无法更新联系人画像' };
  }

  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const orgId = membership?.org_id ?? null;

  const { data: contact, error: fetchError } = await supabase
    .from('contacts')
    .select('id, name, contact_profile')
    .eq('id', args.contactId)
    .single();

  if (fetchError || !contact) {
    return {
      success: false,
      message: `找不到联系人 ${args.contactId}：${fetchError?.message ?? '数据不存在'}`,
    };
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  // 直接字段更新
  if (args.role !== undefined && args.role !== null) {
    updates.role = args.role;
  }
  if (args.discType !== undefined && args.discType !== null) {
    updates.decision_style = `DISC-${args.discType}`;
  }
  if (args.communicationStyle !== undefined && args.communicationStyle !== null) {
    updates.communication_notes = args.communicationStyle;
  }
  if (args.notes !== undefined && args.notes !== null) {
    const aiMetaNote = `[AI更新 ${new Date().toISOString()}] source: '${args.source_quote}'`;
    updates.personal_notes = `${args.notes}\n${aiMetaNote}`;
  }

  // 画像扩展字段存入 contact_profile jsonb
  const currentProfile = (contact.contact_profile as Record<string, unknown>) ?? {};
  const profileUpdates: Record<string, unknown> = { ...currentProfile };
  let profileChanged = false;

  if (args.attitude !== undefined && args.attitude !== null) {
    profileUpdates.attitude = args.attitude;
    profileChanged = true;
  }
  if (args.influenceLevel !== undefined && args.influenceLevel !== null) {
    profileUpdates.influence_level = args.influenceLevel;
    profileChanged = true;
  }
  if (args.engagement !== undefined && args.engagement !== null) {
    profileUpdates.engagement = args.engagement;
    profileChanged = true;
  }

  if (profileChanged) {
    profileUpdates.ai_updated_at = new Date().toISOString();
    profileUpdates.ai_source_quote = args.source_quote;
    updates.contact_profile = profileUpdates;
  }

  const profileUpdateQuery = supabase
    .from('contacts')
    .update(updates)
    .eq('id', args.contactId);
  if (orgId) profileUpdateQuery.eq('org_id', orgId);
  const { error: updateError } = await profileUpdateQuery;

  if (updateError) {
    return {
      success: false,
      message: `更新联系人画像失败：${updateError.message}`,
    };
  }

  return {
    success: true,
    message: `✅ 联系人 ${contact.name} 的画像已更新`,
    data: {
      contactId: args.contactId,
      contactName: contact.name,
      updatedFields: Object.keys(updates).filter((k) => k !== 'updated_at'),
    },
  };
}

// ─── create_contact ──────────────────────────────────────────────────

export interface CreateContactArgs {
  name: string;
  title?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  accountId?: string | null;
  conversation_id?: string;
}

export async function executeCreateContact(args: CreateContactArgs): Promise<ToolResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: '未登录，无法创建联系人' };
  }

  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const orgId = membership?.org_id ?? null;

  const contactId = `contact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      id: contactId,
      name: args.name,
      title: args.title ?? null,
      email: args.email ?? null,
      phone: args.phone ?? null,
      account_id: args.accountId ?? null,
      user_id: user.id,
      org_id: orgId,
      personal_notes: `[AI创建 ${now}] source: 'ai_agent', conversation: '${args.conversation_id ?? ''}'`,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) {
    return {
      success: false,
      message: `创建联系人失败：${error.message}`,
    };
  }

  return {
    success: true,
    message: `✅ 联系人 ${args.name} 已创建`,
    data: {
      contactId: data.id,
      name: args.name,
      title: args.title,
      company: args.company,
    },
  };
}

// ─── update_contact ──────────────────────────────────────────────────

export interface UpdateContactArgs {
  contactId: string;
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  wechat?: string | null;
  linkedin?: string | null;
  department?: string | null;
  seniority?: 'c_level' | 'vp' | 'director' | 'manager' | 'senior' | 'mid' | 'junior' | null;
  source_quote: string;
  conversation_id?: string;
}

export async function executeUpdateContact(args: UpdateContactArgs): Promise<ToolResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: '未登录，无法更新联系人' };
  }

  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const orgId = membership?.org_id ?? null;

  const { data: contact, error: fetchError } = await supabase
    .from('contacts')
    .select('id, name, contact_profile')
    .eq('id', args.contactId)
    .single();

  if (fetchError || !contact) {
    return {
      success: false,
      message: `找不到联系人 ${args.contactId}：${fetchError?.message ?? '数据不存在'}`,
    };
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (args.name !== undefined && args.name !== null) updates.name = args.name;
  if (args.title !== undefined && args.title !== null) updates.title = args.title;
  if (args.email !== undefined && args.email !== null) updates.email = args.email;
  if (args.phone !== undefined && args.phone !== null) updates.phone = args.phone;
  if (args.wechat !== undefined && args.wechat !== null) updates.wechat = args.wechat;
  if (args.linkedin !== undefined && args.linkedin !== null) updates.linkedin = args.linkedin;
  if (args.department !== undefined && args.department !== null) updates.department = args.department;

  // seniority 存入 contact_profile jsonb
  if (args.seniority !== undefined && args.seniority !== null) {
    const currentProfile = (contact.contact_profile as Record<string, unknown>) ?? {};
    updates.contact_profile = {
      ...currentProfile,
      seniority: args.seniority,
      ai_updated_at: new Date().toISOString(),
    };
  }

  const updatedFields = Object.keys(updates).filter((k) => k !== 'updated_at');

  if (updatedFields.length === 0) {
    return {
      success: false,
      message: '没有需要更新的字段',
    };
  }

  const contactUpdateQuery = supabase
    .from('contacts')
    .update(updates)
    .eq('id', args.contactId);
  if (orgId) contactUpdateQuery.eq('org_id', orgId);
  const { error: updateError } = await contactUpdateQuery;

  if (updateError) {
    return {
      success: false,
      message: `更新联系人失败：${updateError.message}`,
    };
  }

  return {
    success: true,
    message: `✅ 联系人 ${contact.name} 的基础信息已更新`,
    data: {
      contactId: args.contactId,
      contactName: contact.name,
      updatedFields,
    },
  };
}
