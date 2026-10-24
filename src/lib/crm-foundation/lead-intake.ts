import type { Account, IntelItem, Opportunity, SavedDecode } from '@/lib/babel-engine/types';

export type LeadIntakeSource = 'decode' | 'intel';
export type LeadIntakeStatus = 'ready_to_convert' | 'matched_account' | 'matched_opportunity';

export interface LeadIntakeItem {
  id: string;
  source: LeadIntakeSource;
  sourceId: string;
  title: string;
  companyName: string;
  contactName?: string;
  contactEmail?: string;
  occurredAt: string;
  signal: string;
  urgency: 'high' | 'medium' | 'low';
  status: LeadIntakeStatus;
  matchedAccountId?: string;
  matchedAccountName?: string;
  matchedContactId?: string;
  matchedOpportunityId?: string;
  nextAction: string;
}

function clean(value?: string | null): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function firstText(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return '';
}

function validDate(value?: string | null): string {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : new Date(0).toISOString();
}

function matchAccount(params: {
  accountId?: string;
  accountName?: string;
  companyName?: string;
  accounts: Account[];
}): Account | undefined {
  if (params.accountId) {
    const byId = params.accounts.find((account) => account.id === params.accountId);
    if (byId) return byId;
  }
  const target = normalizeName(firstText(params.accountName, params.companyName));
  if (!target) return undefined;
  return params.accounts.find((account) => normalizeName(account.name) === target);
}

function matchContact(params: {
  contactId?: string;
  email?: string;
  name?: string;
  account?: Account;
}): string | undefined {
  const contacts = params.account?.contacts ?? [];
  if (params.contactId && contacts.some((contact) => contact.id === params.contactId)) return params.contactId;
  const email = clean(params.email).toLowerCase();
  if (email) {
    const byEmail = contacts.find((contact) => contact.email?.toLowerCase() === email);
    if (byEmail) return byEmail.id;
  }
  const name = normalizeName(clean(params.name));
  if (!name) return undefined;
  return contacts.find((contact) => normalizeName(contact.name) === name)?.id;
}

function openOpportunity(accountId: string | undefined, opportunities: Opportunity[]): Opportunity | undefined {
  if (!accountId) return undefined;
  return opportunities.find((opportunity) =>
    opportunity.accountId === accountId
    && opportunity.stage !== 'closed_won'
    && opportunity.stage !== 'closed_lost'
  );
}

function leadUrgency(item: SavedDecode | IntelItem): 'high' | 'medium' | 'low' {
  if ('decode' in item) {
    const risk = item.decode.threadAnalysis?.riskLevel;
    if (risk === 'critical' || risk === 'high') return 'high';
    if (risk === 'medium') return 'medium';
    return 'low';
  }
  if (item.urgency === 'high') return 'high';
  if (item.urgency === 'medium') return 'medium';
  return 'low';
}

function statusFor(match: { account?: Account; opportunity?: Opportunity }): LeadIntakeStatus {
  if (match.opportunity) return 'matched_opportunity';
  if (match.account) return 'matched_account';
  return 'ready_to_convert';
}

function nextActionFor(status: LeadIntakeStatus, hasContact: boolean): string {
  if (status === 'matched_opportunity') return hasContact ? '挂入现有商机' : '补联系人后挂入商机';
  if (status === 'matched_account') return hasContact ? '创建商机' : '补联系人并创建商机';
  return '创建客户、联系人和商机';
}

export function buildLeadIntakeQueue(params: {
  accounts: Account[];
  opportunities: Opportunity[];
  decodes?: SavedDecode[];
  intelItems?: IntelItem[];
  limit?: number;
}): LeadIntakeItem[] {
  const leads: LeadIntakeItem[] = [];

  for (const decode of params.decodes ?? []) {
    if (decode.opportunityId) continue;
    const account = matchAccount({
      accountId: decode.accountId ?? decode.matchedAccountId,
      accountName: decode.accountName ?? decode.matchedAccountName,
      companyName: decode.clientName,
      accounts: params.accounts,
    });
    const opportunity = openOpportunity(account?.id, params.opportunities);
    const contactId = matchContact({
      contactId: decode.matchedContactId,
      email: decode.originalSenderEmail,
      name: firstText(decode.originalSenderName, decode.clientName),
      account,
    });
    const status = statusFor({ account, opportunity });
    const companyName = firstText(account?.name, decode.accountName, decode.matchedAccountName, decode.clientName, '未知客户');
    const signal = firstText(decode.decode.threadAnalysis?.keySignal, decode.decode.stableJudgment?.recommended_next_action, decode.emailText);

    leads.push({
      id: 'decode:' + decode.id,
      source: 'decode',
      sourceId: decode.id,
      title: firstText(decode.clientName, decode.originalSenderName, companyName),
      companyName,
      contactName: firstText(decode.originalSenderName, decode.clientName) || undefined,
      contactEmail: clean(decode.originalSenderEmail) || undefined,
      occurredAt: validDate(decode.date),
      signal,
      urgency: leadUrgency(decode),
      status,
      matchedAccountId: account?.id,
      matchedAccountName: account?.name,
      matchedContactId: contactId,
      matchedOpportunityId: opportunity?.id,
      nextAction: nextActionFor(status, Boolean(contactId)),
    });
  }

  for (const item of params.intelItems ?? []) {
    if (item.opportunityId) continue;
    const account = matchAccount({
      accountId: item.accountId,
      accountName: item.accountName,
      companyName: item.accountName,
      accounts: params.accounts,
    });
    const opportunity = openOpportunity(account?.id, params.opportunities);
    const status = statusFor({ account, opportunity });

    leads.push({
      id: 'intel:' + item.id,
      source: 'intel',
      sourceId: item.id,
      title: item.title,
      companyName: firstText(account?.name, item.accountName, '未知客户'),
      occurredAt: validDate(item.date),
      signal: firstText(item.summary, item.content, item.title),
      urgency: leadUrgency(item),
      status,
      matchedAccountId: account?.id,
      matchedAccountName: account?.name,
      matchedOpportunityId: opportunity?.id,
      nextAction: nextActionFor(status, false),
    });
  }

  return leads
    .sort((a, b) => {
      const urgencyRank = { high: 0, medium: 1, low: 2 } as const;
      return urgencyRank[a.urgency] - urgencyRank[b.urgency]
        || new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
    })
    .slice(0, params.limit ?? 50);
}
