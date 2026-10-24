import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { runDecodePipeline } from '@/lib/babel-engine/decode-service';
import {
  matchForwardedEmailContact,
  parseForwardedEmail,
  resolveRecipientOwnerHint,
  type RawInboundEmail,
} from '@/lib/forwarded-email-intake';

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function maskEmail(email: string): string {
  return email.replace(/^(.{1,3}).*@/, '$1***@');
}

// AgentMail webhook endpoint for message.received events
interface WebhookPayload {
  type: string;
  event_type: string;
  event_id: string;
  message?: {
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
  };
  thread?: {
    thread_id: string;
    message_count: number;
  };
}

async function parseWebhookRequest(request: Request): Promise<RawInboundEmail | { ignored: string }> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
    // SendGrid Inbound Parse format
    const formData = await request.formData();
    const from = (formData.get('from') as string) ?? '';
    const to = ((formData.get('to') as string) ?? '')
      .split(',')
      .map((address) => address.trim())
      .filter(Boolean);

    return {
      messageId: (formData.get('Message-ID') as string) || (formData.get('message-id') as string) || undefined,
      from,
      to,
      subject: (formData.get('subject') as string) ?? '',
      text: (formData.get('text') as string) ?? '',
      html: (formData.get('html') as string) ?? '',
    };
  }

  // AgentMail JSON format
  const payload: WebhookPayload = await request.json();
  if (payload.event_type !== 'message.received') {
    return { ignored: 'not message.received' };
  }
  const msg = payload.message;
  if (!msg) {
    return { ignored: 'no message data' };
  }

  return {
    messageId: msg.message_id,
    threadId: msg.thread_id,
    from: msg.from,
    to: msg.to ?? [],
    cc: msg.cc,
    subject: msg.subject ?? '',
    text: msg.extracted_text ?? msg.text ?? '',
    html: msg.extracted_html ?? msg.html ?? '',
    timestamp: msg.timestamp,
    labels: msg.labels,
  };
}

export async function POST(request: Request) {
  try {
    const headerSecret = request.headers.get('x-webhook-secret');
    const bearerToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const providedSecret = headerSecret ?? bearerToken;
    const expectedSecret = process.env.WEBHOOK_SECRET;
    if (!expectedSecret || !providedSecret || !safeEqual(providedSecret, expectedSecret)) {
      return NextResponse.json({ status: 'unauthorized' }, { status: 401 });
    }

    const raw = await parseWebhookRequest(request);
    if ('ignored' in raw) {
      return NextResponse.json({ status: 'ignored', reason: raw.ignored });
    }

    const parsed = parseForwardedEmail(raw);
    if (!parsed.emailText.trim()) {
      return NextResponse.json({ status: 'ignored', reason: 'empty message body' });
    }

    const contactMatch = await matchForwardedEmailContact({
      senderEmail: parsed.senderEmail,
      recipientDomain: parsed.recipientDomain,
      recipientUserShortId: parsed.recipientUserShortId,
    });
    const ownerHint = contactMatch
      ? null
      : await resolveRecipientOwnerHint(parsed.recipientUserShortId).catch(() => null);

    const actor = {
      userId: contactMatch?.userId ?? ownerHint?.userId ?? null,
      orgId: contactMatch?.orgId ?? ownerHint?.orgId ?? null,
    };

    const contextParts = [
      contactMatch?.contactName ? `Client: ${contactMatch.contactName}` : undefined,
      `Forwarded email from ${parsed.senderName} <${parsed.senderEmail}>`,
      `Forwarded by ${parsed.forwarderName || parsed.forwarderEmail} <${parsed.forwarderEmail}>`,
      `Subject: ${parsed.originalSubject || parsed.subject}`,
    ].filter(Boolean);

    const result = await runDecodePipeline({
      emailText: parsed.emailText,
      messages: parsed.messages,
      context: contextParts.join('. '),
      clientName: contactMatch?.contactName ?? parsed.senderName ?? parsed.senderEmail,
      signalSource: 'email',
      analysisGoal: 'auto',
      signalContext: 'Forwarded email intake via webhook',
      matchedContactId: contactMatch?.contactId,
      matchedContactName: contactMatch?.contactName,
      matchedAccountId: contactMatch?.accountId,
      matchedAccountName: contactMatch?.accountName,
      accountId: contactMatch?.accountId,
      accountName: contactMatch?.accountName,
      actor,
      route: '/api/email-webhook',
      useCase: 'decode.forwarded_email',
      persist: true,
      persistId: parsed.decodeId,
      originalSenderEmail: parsed.originalSenderEmail ?? parsed.senderEmail,
      originalSenderName: parsed.originalSenderName ?? parsed.senderName,
      sourceFingerprint: parsed.fingerprint,
      direction: 'inbound',
      sourceMetadata: {
        messageId: parsed.messageId ?? null,
        threadId: parsed.threadId ?? null,
        subject: parsed.subject,
        originalSubject: parsed.originalSubject,
        forwarderEmail: parsed.forwarderEmail,
        recipientDomain: parsed.recipientDomain ?? null,
        matched: Boolean(contactMatch),
        cleanedMessageCount: parsed.cleanedMessages.length,
      },
    });

    console.log('[email-webhook] Processed:', {
      from: maskEmail(parsed.senderEmail),
      forwarder: maskEmail(parsed.forwarderEmail),
      subjectLen: parsed.subject.length,
      matched: contactMatch ? 'yes' : 'no',
      duplicate: result.duplicate,
      decoded: Boolean(result.decode),
      sourceRecord: result.sourceRecordStatus ?? 'n/a',
    });

    return NextResponse.json({
      status: result.duplicate ? 'duplicate' : 'processed',
      id: result.savedDecodeId,
      fingerprint: parsed.fingerprint,
      from: maskEmail(parsed.senderEmail),
      forwarder: maskEmail(parsed.forwarderEmail),
      subject: parsed.originalSubject || parsed.subject,
      matched: contactMatch ? {
        contactName: contactMatch.contactName,
        accountName: contactMatch.accountName,
      } : null,
      decoded: Boolean(result.decode),
      sourceRecord: result.sourceRecordStatus ?? null,
    });
  } catch (err) {
    console.error('[email-webhook] Error:', err instanceof Error ? err.message : err);
    // Return 200 to prevent webhook retries, but do not leak internal error messages.
    return NextResponse.json(
      { status: 'error' },
      { status: 200 },
    );
  }
}
