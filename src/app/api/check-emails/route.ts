import { requireAuth, guardResponse } from '@/lib/api-guard';
import { NextResponse } from 'next/server';
import {
  extractDisplayName,
  extractEmailAddress,
  matchForwardedEmailContact,
  parseForwardedEmail,
} from '@/lib/forwarded-email-intake';

const AGENTMAIL_API_KEY = process.env.AGENTMAIL_API_KEY;
const INBOX_ADDRESS = process.env.AGENTMAIL_INBOX ?? 'example-164c28f39e@example.invalid';

interface AgentMailMessage {
  message_id: string;
  inbox_id: string;
  thread_id: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text?: string;
  html?: string;
  extracted_text?: string;
  extracted_html?: string;
  timestamp: string;
  labels: string[];
  size: number;
}

interface ListMessagesResponse {
  count: number;
  limit: number;
  messages: AgentMailMessage[];
  page_token?: string;
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(request.url);
    const after = searchParams.get('after');
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);

    const params = new URLSearchParams();
    params.set('limit', String(Math.min(limit, 50)));
    if (after) params.set('after', after);

    const listRes = await fetch(
      `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(INBOX_ADDRESS)}/messages?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${AGENTMAIL_API_KEY}`,
        },
      }
    );

    if (!listRes.ok) {
      const errText = await listRes.text();
      console.error('[check-emails] AgentMail list error:', listRes.status, errText);
      return NextResponse.json(
        { error: `AgentMail API 错误: ${listRes.status}` },
        { status: 502 }
      );
    }

    const listData: ListMessagesResponse = await listRes.json();

    // Filter out sent messages
    const inboundMessages = listData.messages.filter(
      (msg) => !msg.labels.includes('sent')
    );

    // Enrich messages with full content if missing
    const enrichedMessages = await Promise.all(
      inboundMessages.map(async (msg) => {
        let text = msg.extracted_text ?? msg.text ?? '';
        let html = msg.extracted_html ?? msg.html ?? '';

        // 列表 API 不返回内容，每封邮件都需要获取详情
        try {
          const detailRes = await fetch(
            `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(INBOX_ADDRESS)}/messages/${encodeURIComponent(msg.message_id)}`,
            {
              headers: { 'Authorization': `Bearer ${AGENTMAIL_API_KEY}` },
            }
          );
          if (detailRes.ok) {
            const detail: AgentMailMessage = await detailRes.json();
            text = detail.extracted_text ?? detail.text ?? '';
            html = detail.extracted_html ?? detail.html ?? '';
          }
        } catch (e) {
          console.error('[check-emails] fetch detail failed:', msg.message_id, e instanceof Error ? e.message : e);
        }

        const parsed = parseForwardedEmail({
          messageId: msg.message_id,
          threadId: msg.thread_id,
          from: msg.from,
          to: msg.to ?? [],
          cc: msg.cc,
          subject: msg.subject ?? '(无主题)',
          text,
          html,
          timestamp: msg.timestamp,
          labels: msg.labels,
        });

        // /api/check-emails is an authenticated preview path. It does not run AI decode;
        // it reuses the same forwarded parsing/fingerprint/matching helpers as the webhook
        // so the user preview and webhook intake agree before a future explicit ingest action.
        const contactMatch = await matchForwardedEmailContact({
          senderEmail: parsed.senderEmail,
          orgId: ctx.orgId,
          recipientDomain: parsed.recipientDomain,
          recipientUserShortId: parsed.recipientUserShortId,
        });

        return {
          messageId: msg.message_id,
          threadId: msg.thread_id,
          fingerprint: parsed.fingerprint,
          decodeId: parsed.decodeId,
          from: msg.from,
          fromEmail: extractEmailAddress(msg.from),
          fromName: extractDisplayName(msg.from),
          to: msg.to,
          subject: msg.subject ?? '(无主题)',
          originalSubject: parsed.originalSubject,
          text,
          html,
          timestamp: msg.timestamp,
          labels: msg.labels,
          // Original sender info (from forwarded content)
          originalSenderEmail: parsed.originalSenderEmail ?? null,
          originalSenderName: parsed.originalSenderName ?? null,
          senderEmail: parsed.senderEmail,
          senderName: parsed.senderName,
          cleanedMessageCount: parsed.cleanedMessages.length,
          quotedChain: parsed.quotedChain,
          // Contact match info
          matchedContactId: contactMatch?.contactId ?? null,
          matchedContactName: contactMatch?.contactName ?? null,
          matchedAccountId: contactMatch?.accountId ?? null,
          matchedAccountName: contactMatch?.accountName ?? null,
        };
      })
    );

    return NextResponse.json({
      messages: enrichedMessages,
      count: enrichedMessages.length,
      totalInbox: listData.count,
    });
  } catch (err) {
    return guardResponse(err);
  }
}
