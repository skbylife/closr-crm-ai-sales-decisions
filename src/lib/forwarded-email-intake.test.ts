import { describe, expect, it } from 'vitest';
import {
  buildForwardedEmailFingerprint,
  parseForwardedEmail,
} from './forwarded-email-intake';

describe('forwarded-email-intake', () => {
  it('parses forwarded sender, original subject, cleaned messages, and fingerprint', () => {
    const parsed = parseForwardedEmail({
      messageId: 'msg-123',
      threadId: 'thread-1',
      from: 'Zeno <zeno@example.com>',
      to: ['user-a1b2c3d4@forward.example.invalid'],
      subject: 'Fwd: Pricing follow-up',
      text: `FYI\n\n---------- Forwarded message ----------\nFrom: Alice Buyer <example-7af77ce83e@example.invalid>\nSubject: Pricing follow-up\n\nCan you send the revised quote by Friday?\n\nOn Tue, Zeno wrote:\n> Sure`,
    });

    expect(parsed.forwarderEmail).toBe('zeno@example.com');
    expect(parsed.senderEmail).toBe('example-7af77ce83e@example.invalid');
    expect(parsed.originalSenderName).toBe('Alice Buyer');
    expect(parsed.originalSubject).toBe('Pricing follow-up');
    expect(parsed.decodeId).toBe(`fwd_${parsed.fingerprint}`);
    expect(parsed.recipientUserShortId).toBe('a1b2c3d4');
    expect(parsed.cleanedMessages.length).toBeGreaterThanOrEqual(1);
    expect(parsed.quotedChain[0]?.textPreview).toBeTruthy();
  });

  it('uses message id for stable duplicate fingerprints', () => {
    const first = buildForwardedEmailFingerprint({
      messageId: 'same-message-id',
      threadId: 't1',
      fromEmail: 'forwarder@example.com',
      senderEmail: 'example-7af77ce83e@example.invalid',
      subject: 'One subject',
      body: 'body one',
    });
    const second = buildForwardedEmailFingerprint({
      messageId: 'same-message-id',
      threadId: 't2',
      fromEmail: 'other@example.com',
      senderEmail: 'example-449ae1c139@example.invalid',
      subject: 'Different subject',
      body: 'body two',
    });

    expect(second).toBe(first);
  });
});
