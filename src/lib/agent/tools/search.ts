/**
 * Closr 全局搜索工具（只读）
 * - search_contacts: 按姓名/邮箱/电话搜索联系人
 * - search_accounts: 按公司名搜索客户
 * - search_opportunities: 按名称/客户名搜索商机
 *
 * 使用 getSupabaseAdmin() + UserContext + entity access guard 过滤，确保多租户与角色范围隔离
 */

import { ApiError, requireAccountAccess, requireContactAccess, requireOpportunityAccess } from '@/lib/api-guard';
import { getUserContext } from '@/lib/permissions-server';
import { type UserContext } from '@/lib/permissions';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export interface SearchToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

// ─── Helper: resolve permission context and scoped entity access ─────────────

async function resolveUserContext(userId: string): Promise<UserContext | null> {
  return getUserContext(userId);
}

function isAccessGuardBlock(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 403 || err.status === 404);
}

async function canReadAccount(ctx: UserContext, accountId: string | null | undefined): Promise<boolean> {
  if (!accountId) return true;
  try {
    await requireAccountAccess(ctx, accountId);
    return true;
  } catch (err) {
    if (isAccessGuardBlock(err)) return false;
    throw err;
  }
}

async function canReadContact(ctx: UserContext, contactId: string): Promise<boolean> {
  try {
    await requireContactAccess(ctx, contactId);
    return true;
  } catch (err) {
    if (isAccessGuardBlock(err)) return false;
    throw err;
  }
}

async function canReadOpportunity(ctx: UserContext, opportunityId: string): Promise<boolean> {
  try {
    await requireOpportunityAccess(ctx, opportunityId);
    return true;
  } catch (err) {
    if (isAccessGuardBlock(err)) return false;
    throw err;
  }
}

// ─── search_contacts ─────────────────────────────────────────────────────────

export interface SearchContactsArgs {
  query: string;
  limit?: number;
  userId: string;
}

export async function executeSearchContacts(args: SearchContactsArgs): Promise<SearchToolResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { success: false, message: 'Supabase admin 未配置' };
  }

  const ctx = await resolveUserContext(args.userId);
  if (!ctx) {
    return { success: false, message: '无法确定用户权限上下文' };
  }

  const limit = args.limit ?? 5;
  const pattern = `%${args.query}%`;

  const { data, error } = await admin
    .from('contacts')
    .select('id, name, title, role, account_id, email, phone')
    .eq('org_id', ctx.orgId)
    .or(`name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
    .limit(limit);

  if (error) {
    return { success: false, message: `搜索联系人失败：${error.message}` };
  }

  const visibleContacts = [];
  for (const contact of data ?? []) {
    if (await canReadContact(ctx, contact.id)) visibleContacts.push(contact);
  }

  if (visibleContacts.length === 0) {
    return {
      success: true,
      message: `未找到匹配「${args.query}」的联系人`,
      data: [],
    };
  }

  // 查关联客户名称
  const accountIds = [...new Set(visibleContacts.map((c) => c.account_id).filter(Boolean))];
  let accountMap: Record<string, string> = {};
  if (accountIds.length > 0) {
    const { data: accounts } = await admin
      .from('accounts')
      .select('id, name')
      .eq('org_id', ctx.orgId)
      .in('id', accountIds);
    if (accounts) {
      accountMap = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
    }
  }

  const results = visibleContacts.map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    role: c.role,
    accountId: c.account_id,
    accountName: accountMap[c.account_id as string] ?? null,
    email: c.email,
  }));

  return {
    success: true,
    message: `找到 ${results.length} 个匹配的联系人`,
    data: results,
  };
}

// ─── search_accounts ─────────────────────────────────────────────────────────

export interface SearchAccountsArgs {
  query: string;
  limit?: number;
  userId: string;
}

export async function executeSearchAccounts(args: SearchAccountsArgs): Promise<SearchToolResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { success: false, message: 'Supabase admin 未配置' };
  }

  const ctx = await resolveUserContext(args.userId);
  if (!ctx) {
    return { success: false, message: '无法确定用户权限上下文' };
  }

  const limit = args.limit ?? 3;
  const pattern = `%${args.query}%`;

  const { data, error } = await admin
    .from('accounts')
    .select('id, name, industry, deal_stage, deal_value')
    .eq('org_id', ctx.orgId)
    .ilike('name', pattern)
    .limit(limit);

  if (error) {
    return { success: false, message: `搜索客户失败：${error.message}` };
  }

  const visibleAccounts = [];
  for (const account of data ?? []) {
    if (await canReadAccount(ctx, account.id)) visibleAccounts.push(account);
  }

  if (visibleAccounts.length === 0) {
    return {
      success: true,
      message: `未找到匹配「${args.query}」的客户`,
      data: [],
    };
  }

  // 查关联联系人
  const accountIds = visibleAccounts.map((a) => a.id);
  const { data: contacts } = await admin
    .from('contacts')
    .select('id, name, title, role, account_id')
    .eq('org_id', ctx.orgId)
    .in('account_id', accountIds);

  const contactsByAccount: Record<string, { id: string; name: string; title: string | null; role: string | null }[]> = {};
  if (contacts) {
    for (const c of contacts) {
      const aid = c.account_id as string;
      if (!contactsByAccount[aid]) contactsByAccount[aid] = [];
      contactsByAccount[aid].push({ id: c.id, name: c.name, title: c.title, role: c.role });
    }
  }

  const results = visibleAccounts.map((a) => ({
    id: a.id,
    name: a.name,
    industry: a.industry,
    dealStage: a.deal_stage,
    dealValue: a.deal_value,
    contacts: contactsByAccount[a.id] ?? [],
  }));

  return {
    success: true,
    message: `找到 ${results.length} 个匹配的客户`,
    data: results,
  };
}

// ─── search_opportunities ────────────────────────────────────────────────────

export interface SearchOpportunitiesArgs {
  query?: string;
  accountId?: string;
  limit?: number;
  userId: string;
}

export async function executeSearchOpportunities(args: SearchOpportunitiesArgs): Promise<SearchToolResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { success: false, message: 'Supabase admin 未配置' };
  }

  const ctx = await resolveUserContext(args.userId);
  if (!ctx) {
    return { success: false, message: '无法确定用户权限上下文' };
  }

  const limit = args.limit ?? 5;

  if (args.accountId && !(await canReadAccount(ctx, args.accountId))) {
    return {
      success: true,
      message: `未找到匹配的商机（query=${args.query ?? ''}, accountId=${args.accountId ?? ''}）`,
      data: [],
    };
  }

  // 构建查询：支持 accountId 和/或 name 过滤
  let q = admin
    .from('opportunities')
    .select('id, name, account_id, stage, value, user_id, assigned_to')
    .eq('org_id', ctx.orgId);

  if (args.accountId) {
    q = q.eq('account_id', args.accountId);
  }
  if (args.query) {
    const pattern = `%${args.query}%`;
    q = q.ilike('name', pattern);
  }

  const { data, error } = await q.limit(limit);

  if (error) {
    return { success: false, message: `搜索商机失败：${error.message}` };
  }

  const visibleOpportunities = [];
  for (const opportunity of data ?? []) {
    if (await canReadOpportunity(ctx, opportunity.id)) visibleOpportunities.push(opportunity);
  }

  if (visibleOpportunities.length === 0) {
    return {
      success: true,
      message: `未找到匹配的商机（query=${args.query ?? ''}, accountId=${args.accountId ?? ''}）`,
      data: [],
    };
  }

  // 查关联客户名称和联系人，让“这个商机的联系人都有谁”这类问题可一次回答。
  const accountIds = [...new Set(visibleOpportunities.map((o) => o.account_id).filter(Boolean))];
  let accountMap: Record<string, string> = {};
  let contactsByAccount: Record<string, { id: string; name: string; title: string | null; role: string | null }[]> = {};
  if (accountIds.length > 0) {
    const { data: accounts } = await admin
      .from('accounts')
      .select('id, name')
      .eq('org_id', ctx.orgId)
      .in('id', accountIds);
    if (accounts) {
      accountMap = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
    }

    const { data: contacts } = await admin
      .from('contacts')
      .select('id, name, title, role, account_id')
      .eq('org_id', ctx.orgId)
      .in('account_id', accountIds);
    if (contacts) {
      contactsByAccount = contacts.reduce<Record<string, { id: string; name: string; title: string | null; role: string | null }[]>>((acc, contact) => {
        const accountId = contact.account_id as string;
        if (!acc[accountId]) acc[accountId] = [];
        acc[accountId].push({
          id: contact.id,
          name: contact.name,
          title: contact.title,
          role: contact.role,
        });
        return acc;
      }, {});
    }
  }

  const results = visibleOpportunities.map((o) => ({
    id: o.id,
    name: o.name,
    accountId: o.account_id,
    accountName: accountMap[o.account_id as string] ?? null,
    stage: o.stage,
    value: o.value,
    ownerId: o.assigned_to ?? o.user_id,
    contacts: contactsByAccount[o.account_id as string] ?? [],
  }));

  return {
    success: true,
    message: `找到 ${results.length} 个匹配的商机`,
    data: results,
  };
}
