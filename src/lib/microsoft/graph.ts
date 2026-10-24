/**
 * Microsoft Graph API — 邮件同步 + 组织用户
 *
 * 使用 Delta Query 增量同步邮件，避免每次全量拉取。
 */

import { Client } from '@microsoft/microsoft-graph-client';

// ─── Types ──────────────────────────────────────────────────────────

export interface GraphEmail {
  id: string;
  internetMessageId: string;
  subject: string;
  bodyPreview: string;
  from: { emailAddress: { name: string; address: string } };
  toRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  ccRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  receivedDateTime: string;
  conversationId: string;
  isRead: boolean;
}

export interface OrgUser {
  id: string;
  displayName: string;
  mail: string;
  jobTitle?: string;
}

interface DeltaResponse {
  emails: GraphEmail[];
  deltaLink: string;
  nextLink?: string;
}

// ─── Client Factory ─────────────────────────────────────────────────

export function createGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}

// ─── Email Delta Query ──────────────────────────────────────────────

const EMAIL_SELECT_FIELDS = [
  'id',
  'internetMessageId',
  'subject',
  'bodyPreview',
  'from',
  'toRecipients',
  'ccRecipients',
  'receivedDateTime',
  'conversationId',
  'isRead',
].join(',');

/**
 * 增量获取邮件（Delta Query）
 *
 * 首次调用不传 deltaLink，返回全量 + deltaLink。
 * 后续调用传入 deltaLink，只返回变更。
 */
export async function getEmailsDelta(
  client: Client,
  userId: string = 'me',
  deltaLink?: string,
  options?: { top?: number; since?: Date },
): Promise<DeltaResponse> {
  const MAX_EMAILS_PER_SYNC = 2000;
  const emails: GraphEmail[] = [];
  let currentNextLink: string | undefined;
  let currentDeltaLink = '';

  // 构建初始 URL
  let url: string;
  if (deltaLink) {
    // 增量：使用上次的 deltaLink
    url = deltaLink;
  } else {
    // 首次：构建 delta 查询
    const basePath = userId === 'me'
      ? '/me/mailFolders/inbox/messages/delta'
      : `/users/${userId}/mailFolders/inbox/messages/delta`;

    const params: string[] = [`$select=${EMAIL_SELECT_FIELDS}`];

    if (options?.top) {
      params.push(`$top=${options.top}`);
    }
    if (options?.since) {
      params.push(`$filter=receivedDateTime ge ${options.since.toISOString()}`);
    }

    url = `${basePath}?${params.join('&')}`;
  }

  // 分页获取所有结果
  let response = await client.api(url).get();

  while (response) {
    // 收集邮件
    const items = response.value as GraphEmail[] | undefined;
    if (items?.length) {
      emails.push(...items);
    }

    // M8: 硬上限检查
    if (emails.length >= MAX_EMAILS_PER_SYNC) break;

    // 检查分页 / delta link
    if (response['@odata.nextLink']) {
      currentNextLink = response['@odata.nextLink'] as string;
      // 继续获取下一页（最多自动分页）
      if (emails.length < (options?.top ?? 500)) {
        response = await client.api(currentNextLink).get();
        continue;
      }
      break;
    }

    if (response['@odata.deltaLink']) {
      currentDeltaLink = response['@odata.deltaLink'] as string;
    }

    break;
  }

  return {
    emails,
    deltaLink: currentDeltaLink,
    nextLink: currentNextLink,
  };
}

// ─── Organization Users ─────────────────────────────────────────────

/**
 * 获取组织用户列表（需要 Admin Consent + User.Read.All 权限）
 */
export async function getOrgUsers(client: Client): Promise<OrgUser[]> {
  const users: OrgUser[] = [];

  let response = await client
    .api('/users')
    .select('id,displayName,mail,jobTitle')
    .top(100)
    .get();

  while (response) {
    const items = response.value as Array<{
      id: string;
      displayName: string;
      mail: string | null;
      jobTitle: string | null;
    }> | undefined;

    if (items?.length) {
      for (const u of items) {
        if (u.mail) {
          users.push({
            id: u.id,
            displayName: u.displayName,
            mail: u.mail,
            jobTitle: u.jobTitle ?? undefined,
          });
        }
      }
    }

    // 分页
    if (response['@odata.nextLink']) {
      response = await client.api(response['@odata.nextLink']).get();
    } else {
      break;
    }
  }

  return users;
}
