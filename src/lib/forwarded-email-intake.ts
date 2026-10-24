import { createHash } from 'crypto';
import { parseEmailToMessages } from '@/lib/babel-engine/decode';
import type { DecodeMessage } from '@/lib/babel-engine/types';
import { extractOriginalSender, parseForwardAddress } from '@/lib/forward-address';
import { query, queryOne } from '@/lib/postgres';

export interface RawInboundEmail {
  messageId?: string | null;
  threadId?: string | null;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text?: string | null;
  html?: string | null;
  timestamp?: string | null;
  labels?: string[];
}

export interface ParsedForwardedEmail {
  messageId?: string;
  threadId?: string;
  forwarderEmail: string;
  forwarderName: string;
  to: string[];
  subject: string;
  originalSubject: string;
  emailText: string;
  senderEmail: string;
  senderName: string;
  originalSenderEmail?: string;
  originalSenderName?: string;
  messages: DecodeMessage[];
  cleanedMessages: Array<{ speaker: 'them' | 'me'; text: string }>;
  quotedChain: Array<{ index: number; textPreview: string }>;
  fingerprint: string;
  decodeId: string;
  recipientDomain?: string;
  recipientUserShortId?: string;
  timestamp?: string;
}

export interface ForwardedContactMatch {
  contactId: string;
  contactName: string;
  accountId: string;
  accountName: string;
  userId: string | null;
  orgId: string | null;
  ambiguous?: false;
}

export interface RecipientOwnerHint {
  userId: string;
  orgId: string | null;
}

interface ContactCandidate {
  contact_id: string;
  contact_name: string;
  account_id: string;
  account_name: string | null;
  user_id: string | null;
  org_id: string | null;
  owner_email: string | null;
  updated_at: string | null;
}

export function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim().replace(/^mailto:/i, '');
}

export function extractDisplayName(from: string): string {
  const match = from.match(/^([^<]+)</);
  return (match ? match[1] : from).trim().replace(/^['"]|['"]$/g, '');
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function normalizeSubject(subject: string): string {
  return subject.replace(/^\s*(?:fwd?|转发|fw)\s*[:：]\s*/i, '').trim() || subject.trim();
}

function extractOriginalSubject(text: string, fallback: string): string {
  const patterns = [
    /(?:^|\n)(?:Subject|主题|Betreff|Objet)[:：]\s*(.+)/i,
    /---------- Forwarded message ----------[\s\S]*?Subject:\s*(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.split('\n')[0]?.trim();
    if (value) return normalizeSubject(value);
  }

  return normalizeSubject(fallback);
}

function getRecipientDomain(to: string[]): string | undefined {
  for (const address of to) {
    const email = extractEmailAddress(address).toLowerCase();
    const domain = email.split('@')[1]?.replace(/[>\s]/g, '');
    if (domain) return domain;
  }
  return undefined;
}

function getRecipientUserShortId(to: string[]): string | undefined {
  for (const address of to) {
    const shortId = parseForwardAddress(extractEmailAddress(address));
    if (shortId) return shortId.toLowerCase();
  }
  return undefined;
}

export function buildForwardedEmailFingerprint(input: {
  messageId?: string | null;
  threadId?: string | null;
  fromEmail: string;
  senderEmail: string;
  subject: string;
  body: string;
}): string {
  const stableBody = input.body.replace(/\s+/g, ' ').trim().slice(0, 20_000);
  const basis = input.messageId
    ? `message:${input.messageId}`
    : JSON.stringify({
        threadId: input.threadId ?? null,
        fromEmail: input.fromEmail.toLowerCase(),
        senderEmail: input.senderEmail.toLowerCase(),
        subject: normalizeSubject(input.subject).toLowerCase(),
        body: stableBody,
      });

  return createHash('sha256').update(basis).digest('hex').slice(0, 32);
}

export function parseForwardedEmail(raw: RawInboundEmail): ParsedForwardedEmail {
  const emailText = firstNonEmpty(raw.text, raw.html ? stripHtml(raw.html) : '') || '';
  const forwarderEmail = extractEmailAddress(raw.from);
  const forwarderName = extractDisplayName(raw.from);
  const originalSender = extractOriginalSender(emailText, forwarderEmail);
  const senderEmail = originalSender?.email ?? forwarderEmail;
  const senderName = originalSender?.name || forwarderName || senderEmail;
  const originalSubject = extractOriginalSubject(emailText, raw.subject ?? '');
  const messages = parseEmailToMessages(emailText);
  const fingerprint = buildForwardedEmailFingerprint({
    messageId: raw.messageId,
    threadId: raw.threadId,
    fromEmail: forwarderEmail,
    senderEmail,
    subject: originalSubject || raw.subject,
    body: emailText,
  });

  return {
    messageId: raw.messageId ?? undefined,
    threadId: raw.threadId ?? undefined,
    forwarderEmail,
    forwarderName,
    to: raw.to,
    subject: raw.subject ?? '',
    originalSubject,
    emailText,
    senderEmail,
    senderName,
    originalSenderEmail: originalSender?.email,
    originalSenderName: originalSender?.name || undefined,
    messages,
    cleanedMessages: messages.map((message) => ({ speaker: message.speaker, text: message.text })),
    quotedChain: messages.map((message, index) => ({ index, textPreview: message.text.slice(0, 160) })),
    fingerprint,
    decodeId: `fwd_${fingerprint}`,
    recipientDomain: getRecipientDomain(raw.to),
    recipientUserShortId: getRecipientUserShortId(raw.to),
    timestamp: raw.timestamp ?? undefined,
  };
}

function uniqueValues<T>(values: T[]): T[] {
  return [...new Set(values.filter((value): value is NonNullable<T> => value != null) as NonNullable<T>[])];
}

function ownerMatchesShortId(userId: string | null, shortId?: string): boolean {
  if (!userId || !shortId) return false;
  return userId.replace(/-/g, '').toLowerCase().startsWith(shortId.toLowerCase());
}

function chooseConservativeContactMatch(
  candidates: ContactCandidate[],
  params: { orgId?: string; recipientDomain?: string; recipientUserShortId?: string },
): ForwardedContactMatch | null {
  if (candidates.length === 0) return null;

  let scoped = candidates;
  if (params.orgId) {
    scoped = scoped.filter((candidate) => candidate.org_id === params.orgId);
    if (scoped.length === 0) return null;
  }

  if (params.recipientUserShortId) {
    const ownerScoped = scoped.filter((candidate) => ownerMatchesShortId(candidate.user_id, params.recipientUserShortId));
    if (ownerScoped.length > 0) scoped = ownerScoped;
  }

  if (params.recipientDomain) {
    const domainScoped = scoped.filter((candidate) => {
      const ownerDomain = candidate.owner_email?.split('@')[1]?.toLowerCase();
      return ownerDomain === params.recipientDomain?.toLowerCase();
    });
    if (domainScoped.length > 0) scoped = domainScoped;
  }

  const orgIds = uniqueValues(scoped.map((candidate) => candidate.org_id));
  if (!params.orgId && orgIds.length > 1) {
    return null;
  }

  const selected = scoped[0];
  return {
    contactId: selected.contact_id,
    contactName: selected.contact_name,
    accountId: selected.account_id,
    accountName: selected.account_name ?? '未知客户',
    userId: selected.user_id,
    orgId: selected.org_id,
  };
}

export async function matchForwardedEmailContact(params: {
  senderEmail: string;
  orgId?: string;
  recipientDomain?: string;
  recipientUserShortId?: string;
}): Promise<ForwardedContactMatch | null> {
  try {
    const candidates = await query<ContactCandidate>(
      `SELECT
         c.id AS contact_id,
         c.name AS contact_name,
         c.account_id,
         a.name AS account_name,
         a.user_id,
         COALESCE(c.org_id, a.org_id) AS org_id,
         u.email AS owner_email,
         c.updated_at
       FROM contacts c
       LEFT JOIN accounts a ON a.id = c.account_id
       LEFT JOIN auth.users u ON u.id = a.user_id
       WHERE lower(c.email) = lower($1)
       ORDER BY c.updated_at DESC NULLS LAST
       LIMIT 25`,
      [params.senderEmail],
    );

    return chooseConservativeContactMatch(candidates, params);
  } catch (err) {
    console.error('[forwarded-email-intake] contact match failed:', err);
    return null;
  }
}

export async function resolveRecipientOwnerHint(recipientUserShortId?: string): Promise<RecipientOwnerHint | null> {
  if (!recipientUserShortId) return null;

  const rows = await query<RecipientOwnerHint>(
    `SELECT u.id AS "userId", om.org_id AS "orgId"
       FROM auth.users u
       LEFT JOIN org_memberships om ON om.user_id = u.id
      WHERE replace(u.id::text, '-', '') ILIKE $1
      LIMIT 2`,
    [`${recipientUserShortId}%`],
  );

  return rows.length === 1 ? rows[0] : null;
}

export async function findExistingForwardedDecode(decodeId: string): Promise<{ id: string } | null> {
  return queryOne<{ id: string }>('SELECT id FROM email_decodes WHERE id = $1 LIMIT 1', [decodeId]);
}
