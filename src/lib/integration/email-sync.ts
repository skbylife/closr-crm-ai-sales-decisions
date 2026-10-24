/**
 * Email Sync Service — 邮件同步主流程
 *
 * 1. 获取 token → 2. 拉取邮件 → 3. 域名匹配 → 4. 去重 → 5. Contact 匹配 → 6. AI 分析 → 7. 更新 cursor
 */

import { createGraphClient, getEmailsDelta, type GraphEmail } from '@/lib/microsoft/graph';
import { getToken } from './token-vault';
import { getAccountDomains, matchEmailToAccount } from './domain-matcher';
import { analyzeEmail, type EmailAnalysis } from './email-analyzer';
import { generateSignal } from './signal-generator';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { logAudit } from './audit-logger';
import { createNotification } from './notification-service';
import { logError, logWarn } from '@/lib/error-monitor';

// ─── Types ──────────────────────────────────────────────────────────

export interface SyncResult {
  scannedCount: number;
  matchedCount: number;
  newContactsFound: number;
  signalsGenerated: number;
  errors: string[];
}

export interface SyncedEmail {
  id: string;
  orgId: string;
  connectionId: string;
  messageId: string;
  sender: string;
  senderName: string;
  toRecipients: string[];
  ccRecipients: string[];
  subject: string;
  bodyPreview: string;
  receivedAt: string;
  accountId: string | null;
  contactId: string | null;
  summary: string | null;
  sentiment: string | null;
  intent: string | null;
  keyInfo: string[];
}

// ─── Main Sync ──────────────────────────────────────────────────────

export async function syncEmails(
  connectionId: string,
  orgId: string,
  options?: { since?: Date; userId?: string },
): Promise<SyncResult> {
  const result: SyncResult = {
    scannedCount: 0,
    matchedCount: 0,
    newContactsFound: 0,
    signalsGenerated: 0,
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

  async function persistFinalSyncState(cursor?: Record<string, string>) {
    const timestamp = finishedAt();
    const status = result.errors.length > 0 ? 'partial' : 'completed';

    await admin
      .from('integration_sync_state')
      .upsert(
        {
          connection_id: connectionId,
          object_type: 'email',
          last_sync_at: timestamp,
          ...(cursor ? { cursor } : {}),
          record_count: result.matchedCount,
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
    connectorId: 'outlook',
    action: 'sync_start',
    objectType: 'email',
    status: 'success',
  });

  // 1. 获取 token（自动刷新）
  let token: Awaited<ReturnType<typeof getToken>>;
  try {
    token = await getToken(connectionId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Token refresh failed: ${msg}`);
    // Mark connection as needing reauth so panel/agent surface the issue
    await admin
      .from('integration_connections')
      .update({ sync_status: 'error', updated_at: new Date().toISOString() })
      .eq('id', connectionId);
    await persistFinalSyncState();
    return result;
  }
  if (!token) {
    result.errors.push('Token not found or expired — 需要重新授权');
    // Mark connection so UI surfaces the reauth prompt
    await admin
      .from('integration_connections')
      .update({ sync_status: 'error', updated_at: new Date().toISOString() })
      .eq('id', connectionId);
    await persistFinalSyncState();
    return result;
  }

  // 2. 获取 account 域名映射
  const domainMap = await getAccountDomains(orgId);

  // 3. 获取 sync cursor
  const { data: syncState } = await supabase
    .from('integration_sync_state')
    .select('cursor')
    .eq('connection_id', connectionId)
    .eq('object_type', 'email')
    .single();

  const deltaLink = (syncState?.cursor as Record<string, string> | null)?.deltaLink;

  // 4. 拉取邮件
  const client = createGraphClient(token.accessToken);
  const userId = options?.userId ?? 'me';
  let deltaResponse: Awaited<ReturnType<typeof getEmailsDelta>>;
  try {
    deltaResponse = await getEmailsDelta(client, userId, deltaLink, {
      top: 200,
      since: options?.since,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Graph API fetch failed: ${msg}`);
    // Persist error state so the sync doesn't stay stuck as "syncing"
    await persistFinalSyncState();
    return result;
  }

  result.scannedCount = deltaResponse.emails.length;

  // 5. 处理每封邮件：匹配 + 去重 + Contact 匹配
  interface MatchedEmail {
    email: GraphEmail;
    accountId: string;
    contactId: string | null;
    isNew: boolean;
  }
  const matchedEmails: MatchedEmail[] = [];

  for (const email of deltaResponse.emails) {
    try {
      // 域名匹配：检查 from 和 to 中是否有已知 account 的域名
      const accountId = findAccountMatch(email, domainMap);
      if (!accountId) continue; // 跳过与已知客户无关的邮件

      result.matchedCount++;

      // Contact 匹配
      const senderAddress = email.from.emailAddress.address;
      const senderName = email.from.emailAddress.name;
      const { contactId, isNew } = await matchContact(
        supabase,
        orgId,
        senderAddress,
        senderName,
        accountId,
      );

      if (isNew) result.newContactsFound++;
      matchedEmails.push({ email, accountId, contactId, isNew });
    } catch (err) {
      result.errors.push(`Error processing ${email.internetMessageId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 6. AI 分析 — 分批并行处理（每批 5 封）
  const AI_BATCH_SIZE = 5;

  async function analyzeAndStore(matched: MatchedEmail) {
    if (!supabase) return;
    const { email, accountId, contactId } = matched;
    const senderAddress = email.from.emailAddress.address;
    const senderName = email.from.emailAddress.name;

    let analysis: EmailAnalysis | null = null;
    try {
      const { data: accountRow } = await supabase
        .from('accounts')
        .select('name')
        .eq('id', accountId)
        .single();

      analysis = await analyzeEmail(
        email.subject,
        email.bodyPreview,
        `${senderName} <${senderAddress}>`,
        {
          accountName: (accountRow?.name as string) ?? undefined,
          contactName: senderName || undefined,
        },
      );
    } catch (err) {
      result.errors.push(`AI analysis failed for ${email.internetMessageId}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 原子 upsert：INSERT ... ON CONFLICT 避免 select-then-insert 竞态
    const visibleTo = options?.userId ? [options.userId] : [];
    const { data: upserted, error: upsertErr } = await supabase
      .from('integration_emails')
      .upsert(
        {
          org_id: orgId,
          connection_id: connectionId,
          message_id: email.internetMessageId,
          sender: senderAddress,
          to_recipients: email.toRecipients.map((r) => r.emailAddress.address),
          cc_recipients: email.ccRecipients.map((r) => r.emailAddress.address),
          subject: email.subject,
          received_at: email.receivedDateTime,
          synced_from: userId,
          visible_to: visibleTo,
          summary: analysis?.summary ?? null,
          sentiment: analysis?.sentiment ?? null,
          intent: analysis?.intent ?? null,
          key_info: analysis?.keyInfo ?? [],
          account_id: accountId,
          contact_id: contactId,
        },
        { onConflict: 'org_id,message_id', ignoreDuplicates: false },
      )
      .select('id, visible_to')
      .single();

    if (upsertErr) {
      result.errors.push(`Upsert failed for ${email.internetMessageId}: ${upsertErr.message}`);
      return;
    }

    // 合并 visible_to（upsert 覆盖后需要合并已有的可见用户）
    if (upserted && visibleTo.length > 0) {
      const currentVisible = (upserted.visible_to as string[]) ?? [];
      const merged = [...new Set([...currentVisible, ...visibleTo])];
      if (merged.length > currentVisible.length) {
        await supabase
          .from('integration_emails')
          .update({ visible_to: merged })
          .eq('id', upserted.id);
      }
    }

    // Signal 生成
    if (analysis) {
      try {
        await generateSignal(orgId, {
          id: email.id,
          orgId,
          connectionId,
          messageId: email.internetMessageId,
          sender: senderAddress,
          senderName,
          toRecipients: email.toRecipients.map((r) => r.emailAddress.address),
          ccRecipients: email.ccRecipients.map((r) => r.emailAddress.address),
          subject: email.subject,
          bodyPreview: email.bodyPreview,
          receivedAt: email.receivedDateTime,
          accountId,
          contactId,
          summary: analysis.summary,
          sentiment: analysis.sentiment,
          intent: analysis.intent,
          keyInfo: analysis.keyInfo,
        }, analysis);
        result.signalsGenerated++;
      } catch (err) {
        logWarn('email-sync', 'Signal 生成失败', { action: 'generate-signal', messageId: email.internetMessageId, accountId, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  for (let i = 0; i < matchedEmails.length; i += AI_BATCH_SIZE) {
    const batch = matchedEmails.slice(i, i + AI_BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map(analyzeAndStore));
    for (const r of settled) {
      if (r.status === 'rejected') {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        result.errors.push(`AI batch processing failed: ${msg}`);
        logError('email-sync', r.reason, { action: 'analyze-and-store-batch', connectionId, orgId });
      }
    }
  }

  // 7. 更新 sync cursor + connection 真实状态
  await persistFinalSyncState(
    deltaResponse.deltaLink ? { deltaLink: deltaResponse.deltaLink } : undefined,
  );

  // 9. 审计日志
  await logAudit({
    orgId,
    connectionId,
    connectorId: 'outlook',
    action: result.errors.length > 0 ? 'sync_error' : 'sync_complete',
    objectType: 'email',
    recordCount: result.matchedCount,
    details: {
      scanned: result.scannedCount,
      matched: result.matchedCount,
      newContacts: result.newContactsFound,
      signals: result.signalsGenerated,
    },
    status: result.errors.length > 0 ? 'failure' : 'success',
    errorMessage: result.errors[0],
    durationMs: Date.now() - startTime,
  });

  // 10. 新联系人发现通知
  if (result.newContactsFound > 0) {
    try {
      await createNotification({
        orgId,
        userId: options?.userId,
        type: 'discovery',
        priority: 'medium',
        title: `邮件同步发现 ${result.newContactsFound} 个新联系人`,
        body: `本次同步扫描 ${result.scannedCount} 封邮件，匹配 ${result.matchedCount} 封，生成 ${result.signalsGenerated} 条信号`,
        actions: [
          {
            id: 'view-contacts',
            label: '查看联系人',
            style: 'primary',
            action: { type: 'reply', text: '显示最近发现的新联系人' },
          },
        ],
      });
    } catch (err) {
      logWarn('email-sync', '新联系人通知创建失败', { action: 'create-notification', orgId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * 在邮件的 from/to/cc 中查找已知 account 的域名匹配
 */
function findAccountMatch(
  email: GraphEmail,
  domainMap: Map<string, string>,
): string | null {
  // 先检查发件人
  const fromMatch = matchEmailToAccount(email.from.emailAddress.address, domainMap);
  if (fromMatch) return fromMatch;

  // 再检查收件人
  for (const r of email.toRecipients) {
    const match = matchEmailToAccount(r.emailAddress.address, domainMap);
    if (match) return match;
  }

  // 最后检查抄送
  for (const r of email.ccRecipients) {
    const match = matchEmailToAccount(r.emailAddress.address, domainMap);
    if (match) return match;
  }

  return null;
}

/**
 * Contact 匹配：通过 email 查找 contact
 * 精确匹配 → 返回 contactId
 * 无匹配 → 返回 null + isNew = true（标记为新联系人候选）
 */
async function matchContact(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  orgId: string,
  emailAddress: string,
  name: string,
  accountId: string,
): Promise<{ contactId: string | null; isNew: boolean }> {
  if (!supabase) return { contactId: null, isNew: false };

  // 查 contacts 表（contacts 通过 account_id 关联，这里用 supabase 直接查 email）
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, email')
    .eq('org_id', orgId)
    .eq('account_id', accountId)
    .ilike('email', emailAddress);

  if (contacts && contacts.length > 0) {
    return { contactId: contacts[0].id as string, isNew: false };
  }

  // 尝试跨 account 匹配
  const { data: globalContacts } = await supabase
    .from('contacts')
    .select('id, email')
    .eq('org_id', orgId)
    .ilike('email', emailAddress);

  if (globalContacts && globalContacts.length > 0) {
    return { contactId: globalContacts[0].id as string, isNew: false };
  }

  // 无匹配 — 新联系人候选（不自动创建，只标记）
  return { contactId: null, isNew: true };
}
