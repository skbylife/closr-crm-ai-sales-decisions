/**
 * Microsoft Graph Webhook — 订阅管理
 *
 * 创建、续期、删除 Webhook 订阅，用于实时接收邮件通知。
 * Graph 订阅最大有效期: 4230 分钟（约3天）
 */

import { Client } from '@microsoft/microsoft-graph-client';

// ─── Types ──────────────────────────────────────────────────────────

interface SubscriptionResponse {
  id: string;
  expirationDateTime: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const MAX_EXPIRATION_MINUTES = 4230; // Graph 最大值（约3天）

function getWebhookSecret(): string {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('WEBHOOK_SECRET environment variable must be configured');
  }
  return secret;
}

// ─── Create Subscription ────────────────────────────────────────────

/**
 * 创建邮件变更通知订阅
 */
export async function createSubscription(
  client: Client,
  notificationUrl: string,
  userId: string = 'me',
  expirationMinutes: number = MAX_EXPIRATION_MINUTES,
): Promise<{ subscriptionId: string; expirationDateTime: string }> {
  const resource =
    userId === 'me'
      ? '/me/mailFolders/inbox/messages'
      : `/users/${userId}/mailFolders/inbox/messages`;

  const expiration = new Date(
    Date.now() + Math.min(expirationMinutes, MAX_EXPIRATION_MINUTES) * 60 * 1000,
  );

  const subscription = (await client.api('/subscriptions').post({
    changeType: 'created',
    notificationUrl,
    resource,
    expirationDateTime: expiration.toISOString(),
    clientState: getWebhookSecret(),
  })) as SubscriptionResponse;

  return {
    subscriptionId: subscription.id,
    expirationDateTime: subscription.expirationDateTime,
  };
}

// ─── Renew Subscription ─────────────────────────────────────────────

/**
 * 续期订阅（延长过期时间）
 */
export async function renewSubscription(
  client: Client,
  subscriptionId: string,
  expirationMinutes: number = MAX_EXPIRATION_MINUTES,
): Promise<{ expirationDateTime: string }> {
  const expiration = new Date(
    Date.now() + Math.min(expirationMinutes, MAX_EXPIRATION_MINUTES) * 60 * 1000,
  );

  const result = (await client
    .api(`/subscriptions/${subscriptionId}`)
    .patch({
      expirationDateTime: expiration.toISOString(),
    })) as SubscriptionResponse;

  return { expirationDateTime: result.expirationDateTime };
}

// ─── Delete Subscription ────────────────────────────────────────────

/**
 * 删除订阅
 */
export async function deleteSubscription(
  client: Client,
  subscriptionId: string,
): Promise<void> {
  await client.api(`/subscriptions/${subscriptionId}`).delete();
}
