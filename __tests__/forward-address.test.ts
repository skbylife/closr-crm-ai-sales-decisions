import { describe, it, expect } from 'vitest';
import {
  generateForwardAddress,
  parseForwardAddress,
  extractOriginalSender,
  getActualInboxAddress,
} from '@/lib/forward-address';

// ---------------------------------------------------------------------------
// generateForwardAddress
// ---------------------------------------------------------------------------

describe('generateForwardAddress', () => {
  it('strips hyphens and takes first 8 chars of UUID', () => {
    const userId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(generateForwardAddress(userId)).toBe(
      'user-a1b2c3d4@forward.example.invalid',
    );
  });

  it('handles UUID without hyphens', () => {
    const userId = 'abcdef1234567890abcdef1234567890';
    expect(generateForwardAddress(userId)).toBe(
      'user-abcdef12@forward.example.invalid',
    );
  });

  it('handles short input gracefully', () => {
    const userId = 'abc';
    expect(generateForwardAddress(userId)).toBe(
      'user-abc@forward.example.invalid',
    );
  });

  it('produces different addresses for different UUIDs', () => {
    const a = generateForwardAddress('11111111-1111-1111-1111-111111111111');
    const b = generateForwardAddress('22222222-2222-2222-2222-222222222222');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// parseForwardAddress
// ---------------------------------------------------------------------------

describe('parseForwardAddress', () => {
  it('extracts the short ID from a valid forward address', () => {
    expect(parseForwardAddress('user-a1b2c3d4@forward.example.invalid')).toBe(
      'a1b2c3d4',
    );
  });

  it('is case-insensitive on the prefix', () => {
    expect(parseForwardAddress('USER-A1B2C3D4@forward.example.invalid')).toBe(
      'A1B2C3D4',
    );
  });

  it('returns null for a non-forward address', () => {
    expect(parseForwardAddress('hello@example.com')).toBeNull();
  });

  it('returns null for address with wrong prefix', () => {
    expect(parseForwardAddress('person-a1b2c3d4@forward.example.invalid')).toBeNull();
  });

  it('returns null if short ID is too short', () => {
    expect(parseForwardAddress('user-abc@forward.example.invalid')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseForwardAddress('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getActualInboxAddress
// ---------------------------------------------------------------------------

describe('getActualInboxAddress', () => {
  it('returns the AgentMail inbox', () => {
    expect(getActualInboxAddress()).toBe(
      'example-164c28f39e@example.invalid',
    );
  });
});

// ---------------------------------------------------------------------------
// extractOriginalSender
// ---------------------------------------------------------------------------

describe('extractOriginalSender', () => {
  it('extracts sender from Gmail forwarded message format', () => {
    const text = `---------- Forwarded message ----------
From: John Doe <john@example.com>
Date: Mon, 1 Jan 2025
Subject: Test

Hello world`;
    const result = extractOriginalSender(text, 'example-a35ec6cdd6@example.invalid');
    expect(result).toEqual({ email: 'john@example.com', name: 'John Doe' });
  });

  it('extracts sender from Gmail format without display name', () => {
    const text = `---------- Forwarded message ----------
From: john@example.com
Date: Mon, 1 Jan 2025

Body text`;
    const result = extractOriginalSender(text, 'example-81d1a7135b@example.invalid');
    expect(result).toEqual({ email: 'john@example.com', name: '' });
  });

  it('extracts sender from Outlook "From:" header format', () => {
    const text = `
From: Jane Smith <example-a232757322@example.invalid>
Sent: Tuesday, January 2, 2025
To: someone@example.com
Subject: Re: Deal

Content here`;
    const result = extractOriginalSender(text, 'outlook-user@example.com');
    expect(result).toEqual({ email: 'example-a232757322@example.invalid', name: 'Jane Smith' });
  });

  it('extracts sender from Chinese forwarded format (发件人)', () => {
    const text = `发件人: 张三 <example-27f19f3b7c@example.invalid>
日期: 2025年1月1日

你好`;
    const result = extractOriginalSender(text, 'example-f0c661c00f@example.invalid');
    expect(result).toEqual({
      email: 'example-27f19f3b7c@example.invalid',
      name: '张三',
    });
  });

  it('extracts sender using 发件人 with Chinese colon', () => {
    const text = `发件人：李四 <example-1d1623201c@example.invalid>
日期：2025年2月3日`;
    const result = extractOriginalSender(text, 'example-3a3f6cb8c9@example.invalid');
    expect(result).toEqual({
      email: 'example-1d1623201c@example.invalid',
      name: '李四',
    });
  });

  it('extracts sender from "Original Message" pattern', () => {
    const text = `-----Original Message-----
From: Bob Lee <example-cf5116001b@example.invalid>
Sent: Wednesday, March 5, 2025

Some content`;
    const result = extractOriginalSender(text, 'user@example.com');
    expect(result).toEqual({ email: 'example-cf5116001b@example.invalid', name: 'Bob Lee' });
  });

  it('returns null for plain text without forwarding markers', () => {
    const text = 'Hey, just checking in on the proposal. Let me know.';
    expect(
      extractOriginalSender(text, 'sender@example.com'),
    ).toBeNull();
  });

  it('returns null for empty text', () => {
    expect(extractOriginalSender('', 'sender@example.com')).toBeNull();
  });
});
