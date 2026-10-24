/**
 * 企业微信同步服务
 *
 * 同步流程：
 * 1. 获取 token → 2. 拉取部门+成员 → 3. 获取外部联系人 → 4. 映射到 Contact
 * 5. 获取客户群 → 6. 去重 → 7. 返回统计
 */

import { getWeComToken } from '@/lib/wecom/auth';
import {
  getDepartmentList,
  getDepartmentMembers,
  getExternalContactList,
  getExternalContactDetail,
  getGroupChatList,
  getGroupChatDetail,
  WeComApiError,
  type WeComMember,
  type WeComExternalContact,
  type WeComGroupChatDetail,
} from '@/lib/wecom/api';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/integration/audit-logger';
import { createNotification } from './notification-service';
import { throttledCall, getErrorMessage } from './utils';
import { logWarn } from '@/lib/error-monitor';

// ─── Types ──────────────────────────────────────────────────────────

export interface WeComSyncResult {
  membersCount: number;
  externalContactsCount: number;
  newContactsFound: number;
  groupChatsCount: number;
  accountsMatched: number;
  errors: string[];
}

// ─── Concurrency control ────────────────────────────────────────────

const MAX_CONCURRENT = 5;

async function processInBatches<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number = MAX_CONCURRENT,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ─── Main Sync ──────────────────────────────────────────────────────

export async function syncWeComData(
  connectionId: string,
  orgId: string,
): Promise<WeComSyncResult> {
  const result: WeComSyncResult = {
    membersCount: 0,
    externalContactsCount: 0,
    newContactsFound: 0,
    groupChatsCount: 0,
    accountsMatched: 0,
    errors: [],
  };

  const startTime = Date.now();
  const finishedAt = () => new Date().toISOString();

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    result.errors.push('Supabase admin client not configured');
    return result;
  }
  const admin = supabase;

  async function persistFinalSyncState() {
    const timestamp = finishedAt();
    const status = result.errors.length > 0 ? 'partial' : 'completed';

    await admin
      .from('integration_sync_state')
      .upsert(
        {
          connection_id: connectionId,
          object_type: 'wecom_contact',
          last_sync_at: timestamp,
          record_count: result.externalContactsCount,
          status,
          error_message: result.errors.length > 0 ? result.errors[0] : null,
        },
        { onConflict: 'connection_id,object_type' },
      );

    await admin
      .from('integration_connections')
      .update({
        last_sync_at: timestamp,
        sync_status: status,
      })
      .eq('id', connectionId);
  }

  await logAudit({
    orgId,
    connectionId,
    connectorId: 'wecom',
    action: 'sync_start',
    objectType: 'wecom_contact',
    status: 'success',
  });

  // 1. 获取 token（自动刷新）
  let token: string;
  try {
    token = await getWeComToken(connectionId);
  } catch (err) {
    result.errors.push(`Token error: ${getErrorMessage(err)}`);
    // Mark connection as needing reauth so panel/agent surface the issue
    await admin
      .from('integration_connections')
      .update({ sync_status: 'error', updated_at: new Date().toISOString() })
      .eq('id', connectionId);
    await persistFinalSyncState();
    return result;
  }

  // 2. 获取所有部门 + 成员（带节流）
  const allMembers: WeComMember[] = [];
  try {
    const departments = await getDepartmentList(token);
    for (const dept of departments) {
      try {
        const members = await throttledCall(() => getDepartmentMembers(token, dept.id));
        for (const m of members) {
          // 按 userid 去重
          if (!allMembers.some((existing) => existing.userid === m.userid)) {
            allMembers.push(m);
          }
        }
      } catch (err) {
        // 某个部门获取失败不阻塞整体
        if (err instanceof WeComApiError && err.errcode === 60011) {
          // 60011 = 无权限访问该部门，跳过
          continue;
        }
        result.errors.push(`部门 ${dept.name} 成员获取失败: ${getErrorMessage(err)}`);
      }
    }
    result.membersCount = allMembers.length;
  } catch (err) {
    result.errors.push(`部门列表获取失败: ${getErrorMessage(err)}`);
    await persistFinalSyncState();
    return result;
  }

  // 3. 遍历成员，获取每个人的外部联系人（带并发限制）
  const externalContactIds = new Set<string>();
  try {
    const memberResults = await processInBatches(allMembers, async (member) => {
      const extIds = await throttledCall(() => getExternalContactList(token, member.userid));
      return { member, extIds };
    });
    for (const r of memberResults) {
      if (r.status === 'fulfilled') {
        for (const id of r.value.extIds) {
          externalContactIds.add(id);
        }
      } else {
        const err = r.reason;
        // 84061 = 该成员未开通客户联系功能，跳过
        if (err instanceof WeComApiError && err.errcode === 84061) continue;
        result.errors.push(`外部联系人获取失败: ${getErrorMessage(err)}`);
      }
    }
  } catch (err) {
    result.errors.push(`外部联系人批量获取失败: ${getErrorMessage(err)}`);
    await persistFinalSyncState();
    return result;
  }

  // 4. 获取外部联系人详情 → 映射到 Contact → 写入 integration_wecom_contacts（带并发限制）
  const matchedAccountIds = new Set<string>();
  const extIds = Array.from(externalContactIds);
  const contactResults = await processInBatches(extIds, async (extId) => {
    const contact = await throttledCall(() => getExternalContactDetail(token, extId));
    return { extId, contact };
  });

  for (const r of contactResults) {
    if (r.status === 'rejected') {
      result.errors.push(`外部联系人详情获取失败: ${getErrorMessage(r.reason)}`);
      continue;
    }
    const { extId, contact } = r.value;
    try {
      result.externalContactsCount++;

      // 映射到 Closr Contact
      const mapped = await mapExternalContactToClosr(supabase, orgId, contact);
      if (mapped.isNew) result.newContactsFound++;
      if (mapped.accountId) matchedAccountIds.add(mapped.accountId);

      // 持久化到 integration_wecom_contacts
      const followUser = contact.followUsers[0];
      await supabase
        .from('integration_wecom_contacts')
        .upsert(
          {
            org_id: orgId,
            connection_id: connectionId,
            external_userid: contact.externalUserId,
            name: contact.name,
            corp_name: contact.corpName || null,
            corp_full_name: contact.corpFullName || null,
            position: contact.position || null,
            avatar: contact.avatar || null,
            follow_userid: followUser?.userid || null,
            follow_remark: followUser?.remark || null,
            follow_description: followUser?.description || null,
            add_time: followUser
              ? new Date(followUser.addTime * 1000).toISOString()
              : null,
            tags: followUser?.tags?.map((t) => t.tagName) ?? [],
            account_id: mapped.accountId,
            contact_id: mapped.contactId,
            raw_data: contact,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'org_id,external_userid' },
        );
    } catch (err) {
      result.errors.push(`外部联系人 ${extId} 处理失败: ${getErrorMessage(err)}`);
    }
  }
  result.accountsMatched = matchedAccountIds.size;

  // 5. 获取客户群列表 + 详情 → 写入 integration_wecom_groups（带节流+并发限制）
  try {
    let cursor: string | undefined;
    const allGroupChats: WeComGroupChatDetail[] = [];

    do {
      const chatListResult = await throttledCall(() => getGroupChatList(token, { cursor, limit: 100 }));
      const chatIds = chatListResult.chatList.map((c) => c.chatId);
      const detailResults = await processInBatches(chatIds, async (chatId) => {
        return throttledCall(() => getGroupChatDetail(token, chatId));
      });
      for (const r of detailResults) {
        if (r.status === 'fulfilled') {
          allGroupChats.push(r.value);
        } else {
          result.errors.push(`客户群详情获取失败: ${getErrorMessage(r.reason)}`);
        }
      }
      cursor = chatListResult.nextCursor;
    } while (cursor);

    result.groupChatsCount = allGroupChats.length;

    // 持久化到 integration_wecom_groups
    for (const group of allGroupChats) {
      const externalCount = (group.memberList ?? []).filter(
        (m) => m.type === 2,
      ).length;

      await supabase
        .from('integration_wecom_groups')
        .upsert(
          {
            org_id: orgId,
            connection_id: connectionId,
            chat_id: group.chatId,
            name: group.name || null,
            owner_userid: group.owner,
            create_time: new Date(group.createTime * 1000).toISOString(),
            member_count: (group.memberList ?? []).length,
            external_member_count: externalCount,
            member_list: group.memberList ?? [],
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'org_id,chat_id' },
        );
    }
  } catch (err) {
    result.errors.push(`客户群列表获取失败: ${getErrorMessage(err)}`);
  }

  // 6. 更新 sync state + connection 真实状态
  await persistFinalSyncState();

  // 8. 审计日志
  await logAudit({
    orgId,
    connectionId,
    connectorId: 'wecom',
    action: result.errors.length > 0 ? 'sync_error' : 'sync_complete',
    objectType: 'wecom_contact',
    recordCount: result.externalContactsCount,
    details: {
      members: result.membersCount,
      externalContacts: result.externalContactsCount,
      newContacts: result.newContactsFound,
      groups: result.groupChatsCount,
      accountsMatched: result.accountsMatched,
    },
    status: result.errors.length > 0 ? 'failure' : 'success',
    errorMessage: result.errors[0],
    durationMs: Date.now() - startTime,
  });

  // 9. 新联系人发现通知
  if (result.newContactsFound > 0) {
    try {
      await createNotification({
        orgId,
        type: 'discovery',
        priority: 'medium',
        title: `企业微信同步发现 ${result.newContactsFound} 个新联系人`,
        body: `本次同步：${result.membersCount} 个成员、${result.externalContactsCount} 个外部联系人、${result.groupChatsCount} 个客户群`,
        actions: [
          {
            id: 'view-wecom-contacts',
            label: '查看联系人',
            style: 'primary',
            action: { type: 'reply', text: '显示最近发现的企业微信新联系人' },
          },
        ],
      });
    } catch (err) {
      logWarn('wecom-sync', '新联系人通知创建失败', { action: 'create-notification', orgId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * 外部联系人 → Closr Contact 映射
 * M5 改进：优先用 external_userid 去重，再用 email，最后用 name+company
 */
async function mapExternalContactToClosr(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  orgId: string,
  contact: WeComExternalContact,
): Promise<{ contactId: string | null; accountId: string | null; isNew: boolean }> {
  // 先通过企业名称匹配 Account
  const accountId = await matchCorpToAccount(
    supabase,
    orgId,
    contact.corpName,
    contact.corpFullName,
  );

  // 1. 先查 external_userid 是否已同步过 → 直接找关联的 contact
  const { data: existingWecom } = await supabase
    .from('integration_wecom_contacts')
    .select('contact_id')
    .eq('org_id', orgId)
    .eq('external_userid', contact.externalUserId)
    .limit(1);

  if (existingWecom && existingWecom.length > 0 && existingWecom[0].contact_id) {
    const contactId = existingWecom[0].contact_id as string;
    await supabase
      .from('contacts')
      .update({ wechat: contact.externalUserId, updated_at: new Date().toISOString() })
      .eq('id', contactId);
    return { contactId, accountId, isNew: false };
  }

  // 2. 按名字 + 企业名称查找已有 Contact（要求两者都匹配）
  if (accountId) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('org_id', orgId)
      .ilike('name', contact.name)
      .eq('account_id', accountId)
      .limit(1);

    if (existing && existing.length > 0) {
      const contactId = existing[0].id as string;
      await supabase
        .from('contacts')
        .update({ wechat: contact.externalUserId, updated_at: new Date().toISOString() })
        .eq('id', contactId);
      return { contactId, accountId, isNew: false };
    }
  }

  // 新联系人 → 创建 Contact
  const { data: newContact, error } = await supabase
    .from('contacts')
    .insert({
      org_id: orgId,
      name: contact.name,
      title: contact.position ?? null,
      account_id: accountId,
      wechat: contact.externalUserId,
      source: 'wecom',
      created_at: contact.followUsers[0]
        ? new Date(contact.followUsers[0].addTime * 1000).toISOString()
        : new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !newContact) {
    return { contactId: null, accountId, isNew: false };
  }

  return { contactId: newContact.id as string, accountId, isNew: true };
}

/**
 * 企业名称模糊匹配 Account
 * M6 改进：短名精确匹配，多匹配取最具体，匹配数>3 放弃
 */
async function matchCorpToAccount(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  orgId: string,
  corpName: string,
  corpFullName?: string,
): Promise<string | null> {
  if (!corpName && !corpFullName) return null;

  // 先试全称精确匹配
  if (corpFullName) {
    const { data } = await supabase
      .from('accounts')
      .select('id')
      .eq('org_id', orgId)
      .ilike('name', corpFullName)
      .limit(1);

    if (data && data.length > 0) return data[0].id as string;
  }

  // 再试简称匹配
  if (corpName) {
    // M6: 短名（<3字符）改用精确匹配
    if (corpName.length < 3) {
      const { data } = await supabase
        .from('accounts')
        .select('id')
        .eq('org_id', orgId)
        .ilike('name', corpName)
        .limit(1);

      if (data && data.length > 0) return data[0].id as string;
    } else {
      const { data } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('org_id', orgId)
        .ilike('name', `%${corpName}%`);

      if (data && data.length > 0) {
        // M6: 匹配数 > 3，太模糊，放弃
        if (data.length > 3) return null;
        // M6: 多个匹配时取最短名称（最具体）
        const sorted = data.sort((a, b) => (a.name as string).length - (b.name as string).length);
        return sorted[0].id as string;
      }
    }
  }

  // 反向：account name 包含在 corpFullName 里
  if (corpFullName) {
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, name')
      .eq('org_id', orgId);

    if (accounts) {
      const fullNameLower = corpFullName.toLowerCase();
      const matches = accounts.filter((acc) => {
        const accName = (acc.name as string).toLowerCase();
        return accName.length >= 2 && fullNameLower.includes(accName);
      });

      // M6: 匹配数 > 3，放弃
      if (matches.length > 3) return null;
      if (matches.length > 0) {
        // 取最短名称（最具体）
        const sorted = matches.sort((a, b) => (a.name as string).length - (b.name as string).length);
        return sorted[0].id as string;
      }
    }
  }

  return null;
}
