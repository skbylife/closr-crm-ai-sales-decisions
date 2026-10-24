/**
 * Signal Generator — 根据邮件分析结果生成 Signal
 *
 * 将分析结果写入 ai_events 表（项目已有的事件管道），
 * 同时缓存到 ai_insights 用于快速读取。
 */

import { emitEvent, upsertInsight } from '@/lib/ai-event-hub';
import type { SyncedEmail } from './email-sync';
import type { EmailAnalysis } from './email-analyzer';

// ─── Signal Generation ──────────────────────────────────────────────

export async function generateSignal(
  orgId: string,
  email: SyncedEmail,
  analysis: EmailAnalysis,
): Promise<void> {
  // 1. 发射事件到 ai_events 管道
  await emitEvent({
    orgId,
    eventType: 'email.synced',
    entityType: 'integration_email',
    entityId: email.messageId,
    payload: {
      accountId: email.accountId,
      contactId: email.contactId,
      sender: email.sender,
      subject: email.subject,
      receivedAt: email.receivedAt,
      sentiment: analysis.sentiment,
      intent: analysis.intent,
      summary: analysis.summary,
    },
  });

  // 2. 缓存到 ai_insights（按 account 维度聚合最新邮件信号）
  if (email.accountId) {
    await upsertInsight(
      orgId,
      'account',
      email.accountId,
      'latest_email_signal',
      {
        sender: email.sender,
        subject: email.subject,
        summary: analysis.summary,
        sentiment: analysis.sentiment,
        intent: analysis.intent,
        keyInfo: analysis.keyInfo,
        receivedAt: email.receivedAt,
        contactId: email.contactId,
      },
      'email.synced',
    );
  }

  // 3. 按 contact 维度也缓存
  if (email.contactId) {
    await upsertInsight(
      orgId,
      'contact',
      email.contactId,
      'latest_email_signal',
      {
        sender: email.sender,
        subject: email.subject,
        summary: analysis.summary,
        sentiment: analysis.sentiment,
        intent: analysis.intent,
        keyInfo: analysis.keyInfo,
        receivedAt: email.receivedAt,
        accountId: email.accountId,
      },
      'email.synced',
    );
  }
}
