import type { Opportunity, SalesLead, SalesLeadPriority, SalesLeadStatus } from '@/lib/babel-engine/types';
import { normalizeCurrencyCode, type CurrencyCode } from '@/lib/format-currency';

export interface LeadRow {
  id: string;
  org_id: string;
  user_id: string | null;
  owner_id: string | null;
  company_name: string;
  contact_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  source: string;
  need: string;
  estimated_value: number | string | null;
  currency: string;
  priority: SalesLeadPriority;
  status: SalesLeadStatus;
  next_step: string | null;
  notes: string | null;
  converted_at: string | null;
  converted_account_id: string | null;
  converted_contact_id: string | null;
  converted_opportunity_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadInput {
  companyName?: unknown;
  contactName?: unknown;
  email?: unknown;
  phone?: unknown;
  title?: unknown;
  source?: unknown;
  need?: unknown;
  estimatedValue?: unknown;
  currency?: unknown;
  priority?: unknown;
  status?: unknown;
  ownerId?: unknown;
  nextStep?: unknown;
  notes?: unknown;
}

const VALID_STATUSES: SalesLeadStatus[] = ['new', 'qualified', 'nurture', 'disqualified', 'converted'];
const VALID_PRIORITIES: SalesLeadPriority[] = ['high', 'medium', 'low'];
function clean(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function optionalClean(value: unknown, max = 500): string | null {
  const text = clean(value, max);
  return text || null;
}

export function rowToLead(row: LeadRow): SalesLead {
  return {
    id: row.id,
    companyName: row.company_name,
    contactName: row.contact_name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    title: row.title ?? undefined,
    source: row.source,
    need: row.need,
    estimatedValue: Number(row.estimated_value ?? 0),
    currency: row.currency,
    priority: row.priority,
    status: row.status,
    ownerId: row.owner_id ?? undefined,
    nextStep: row.next_step ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    convertedAt: row.converted_at ?? undefined,
    convertedAccountId: row.converted_account_id ?? undefined,
    convertedContactId: row.converted_contact_id ?? undefined,
    convertedOpportunityId: row.converted_opportunity_id ?? undefined,
  };
}

export function buildLeadInsert(input: LeadInput, params: { orgId: string; userId: string }) {
  const companyName = clean(input.companyName, 200);
  const contactName = clean(input.contactName, 200);
  const need = clean(input.need, 300);
  if (!companyName) return { error: '公司必填' };
  if (!contactName) return { error: '联系人必填' };
  if (!need) return { error: '需求必填' };

  const priority = VALID_PRIORITIES.includes(input.priority as SalesLeadPriority) ? input.priority as SalesLeadPriority : 'medium';
  const status = VALID_STATUSES.includes(input.status as SalesLeadStatus) ? input.status as SalesLeadStatus : 'new';
  const currency: CurrencyCode = normalizeCurrencyCode(input.currency) ?? 'CNY';
  const ownerId = clean(input.ownerId, 80) || params.userId;
  const value = Number(input.estimatedValue);

  return {
    row: {
      org_id: params.orgId,
      user_id: params.userId,
      owner_id: ownerId,
      company_name: companyName,
      contact_name: contactName,
      email: optionalClean(input.email, 254),
      phone: optionalClean(input.phone, 80),
      title: optionalClean(input.title, 160),
      source: clean(input.source, 120) || 'manual',
      need,
      estimated_value: Number.isFinite(value) ? Math.max(0, value) : 0,
      currency,
      priority,
      status,
      next_step: optionalClean(input.nextStep, 500),
      notes: optionalClean(input.notes, 1000),
    },
  };
}

export function buildLeadPatch(input: LeadInput) {
  const row: Record<string, unknown> = {};
  if ('companyName' in input) row.company_name = clean(input.companyName, 200);
  if ('contactName' in input) row.contact_name = clean(input.contactName, 200);
  if ('email' in input) row.email = optionalClean(input.email, 254);
  if ('phone' in input) row.phone = optionalClean(input.phone, 80);
  if ('title' in input) row.title = optionalClean(input.title, 160);
  if ('source' in input) row.source = clean(input.source, 120) || 'manual';
  if ('need' in input) row.need = clean(input.need, 300);
  if ('estimatedValue' in input) {
    const value = Number(input.estimatedValue);
    row.estimated_value = Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  if ('currency' in input) {
    const currency = normalizeCurrencyCode(input.currency);
    if (currency) row.currency = currency;
  }
  if ('priority' in input && VALID_PRIORITIES.includes(input.priority as SalesLeadPriority)) row.priority = input.priority;
  if ('status' in input && VALID_STATUSES.includes(input.status as SalesLeadStatus)) row.status = input.status;
  if ('ownerId' in input) row.owner_id = optionalClean(input.ownerId, 80);
  if ('nextStep' in input) row.next_step = optionalClean(input.nextStep, 500);
  if ('notes' in input) row.notes = optionalClean(input.notes, 1000);

  if (row.company_name === '') return { error: '公司必填' };
  if (row.contact_name === '') return { error: '联系人必填' };
  if (row.need === '') return { error: '需求必填' };
  row.updated_at = new Date().toISOString();
  return { row };
}

export function emptyMeddiccAssessment(): Opportunity['meddicc'] {
  return {
    metrics: { notes: '', status: 'unconfirmed', evidence: '' },
    economicBuyer: { status: 'unknown', accessLevel: '' },
    decisionCriteria: [],
    decisionProcess: [],
    identifiedPain: [],
    champion: { strength: 0, lastEngagement: '', notes: '' },
    competition: [],
    overallScore: 0,
  };
}

export function emptyMutualActionPlan(): Opportunity['mutualActionPlan'] {
  return { targetSignDate: '', confidence: 50, milestones: [] };
}
