import type { Account } from '@/lib/babel-engine/types';

export type ImportObjectType = 'contacts' | 'accounts' | 'leads';
export type ImportRowAction = 'create' | 'update' | 'skip' | 'conflict';
export type ImportFindingSeverity = 'high' | 'medium' | 'low';

export interface ImportSourceRow {
  rowIndex: number;
  values: Record<string, string>;
}

export interface ImportFieldDef {
  key: string;
  label: string;
  required: boolean;
}

export interface DuplicateCandidate {
  id: string;
  rowIndex: number;
  importedName: string;
  existingId: string;
  existingName: string;
  matchType: 'name' | 'email' | 'website';
  confidence: 'high' | 'medium';
  recommendation: 'merge' | 'review';
}

export interface DataQualityFinding {
  id: string;
  rowIndex: number;
  field: string;
  label: string;
  detail: string;
  severity: ImportFindingSeverity;
}

export interface ImportPreviewRow {
  rowIndex: number;
  displayName: string;
  action: ImportRowAction;
  duplicate?: DuplicateCandidate;
  findings: DataQualityFinding[];
}

export interface ImportGovernanceModel {
  previewRows: ImportPreviewRow[];
  duplicates: DuplicateCandidate[];
  findings: DataQualityFinding[];
  counts: Record<ImportRowAction, number>;
}

export interface MergePlanConflict {
  field: string;
  existingValue: string;
  incomingValue: string;
}

export interface MergePlan {
  entityType: ImportObjectType;
  existingId: string;
  updates: Record<string, string>;
  filled: string[];
  conflicts: MergePlanConflict[];
}

const CONTACT_MERGE_FIELDS: Record<string, string> = {
  email: 'email',
  phone: 'phone',
  title: 'title',
  role: 'role',
  department: 'department',
  linkedin: 'linkedin',
  notes: 'personal_notes',
};

const ACCOUNT_MERGE_FIELDS: Record<string, string> = {
  industry: 'industry',
  website: 'website',
  notes: 'notes',
};

function normalize(value?: string): string {
  return (value ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}

function cleanMergeValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function mappedValue(row: ImportSourceRow, mapping: Record<string, string>, field: string): string {
  const source = mapping[field];
  return source ? row.values[source]?.trim() ?? '' : '';
}

function mappedFirstValue(row: ImportSourceRow, mapping: Record<string, string>, fields: string[]): string {
  for (const field of fields) {
    const value = mappedValue(row, mapping, field);
    if (value) return value;
  }
  return '';
}

function contactRows(accounts: Account[]) {
  return accounts.flatMap((account) => (account.contacts ?? []).map((contact) => ({
    accountId: account.id,
    accountName: account.name,
    contactId: contact.id,
    contactName: contact.name,
    email: contact.email,
  })));
}

function requiredFindings(params: {
  row: ImportSourceRow;
  fields: ImportFieldDef[];
  mapping: Record<string, string>;
}): DataQualityFinding[] {
  return params.fields
    .filter((field) => field.required && !mappedValue(params.row, params.mapping, field.key))
    .map((field) => ({
      id: 'missing-' + params.row.rowIndex + '-' + field.key,
      rowIndex: params.row.rowIndex,
      field: field.key,
      label: field.label + ' 缺失',
      detail: '第 ' + (params.row.rowIndex + 1) + ' 行缺少 ' + field.label,
      severity: 'high' as const,
    }));
}

function formatFindings(params: {
  type: ImportObjectType;
  row: ImportSourceRow;
  mapping: Record<string, string>;
}): DataQualityFinding[] {
  const findings: DataQualityFinding[] = [];
  const email = mappedValue(params.row, params.mapping, 'email');
  const website = mappedValue(params.row, params.mapping, 'website');
  const phone = mappedValue(params.row, params.mapping, 'phone');

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    findings.push({
      id: 'email-' + params.row.rowIndex,
      rowIndex: params.row.rowIndex,
      field: 'email',
      label: '邮箱格式异常',
      detail: email + ' 不是有效邮箱',
      severity: 'medium',
    });
  }

  if (params.type === 'accounts' && website && !normalize(website).includes('.')) {
    findings.push({
      id: 'website-' + params.row.rowIndex,
      rowIndex: params.row.rowIndex,
      field: 'website',
      label: '网站格式异常',
      detail: website + ' 看起来不像公司网站',
      severity: 'low',
    });
  }

  if (params.type === 'contacts' && phone && phone.replace(/[^\d]/g, '').length < 7) {
    findings.push({
      id: 'phone-' + params.row.rowIndex,
      rowIndex: params.row.rowIndex,
      field: 'phone',
      label: '电话格式异常',
      detail: phone + ' 位数过短',
      severity: 'low',
    });
  }

  return findings;
}

function findDuplicate(params: {
  type: ImportObjectType;
  row: ImportSourceRow;
  mapping: Record<string, string>;
  accounts: Account[];
}): DuplicateCandidate | undefined {
  const name = mappedFirstValue(params.row, params.mapping, ['name', 'contactName']);
  const email = mappedValue(params.row, params.mapping, 'email');
  const website = mappedValue(params.row, params.mapping, 'website');
  const company = mappedFirstValue(params.row, params.mapping, ['company', 'companyName']);

  if (params.type === 'leads') {
    const contacts = contactRows(params.accounts);
    const byEmail = email ? contacts.find((contact) => normalize(contact.email) === normalize(email)) : undefined;
    const byCompany = params.accounts.find((account) => normalize(account.name) === normalize(company || name));
    const match = byEmail ?? byCompany;
    if (!match) return undefined;
    const isContact = 'contactId' in match;
    return {
      id: 'dup-' + params.row.rowIndex + '-' + (isContact ? match.contactId : match.id),
      rowIndex: params.row.rowIndex,
      importedName: company || name || email,
      existingId: isContact ? match.contactId : match.id,
      existingName: isContact ? match.contactName + ' · ' + match.accountName : match.name,
      matchType: byEmail ? 'email' : 'name',
      confidence: byEmail ? 'high' : 'medium',
      recommendation: 'review',
    };
  }

  if (params.type === 'accounts') {
    const byWebsite = website
      ? params.accounts.find((account) => normalize(account.website) && normalize(account.website) === normalize(website))
      : undefined;
    const byName = params.accounts.find((account) => normalize(account.name) === normalize(name));
    const match = byWebsite ?? byName;
    if (!match) return undefined;
    const matchType = byWebsite ? 'website' : 'name';
    return {
      id: 'dup-' + params.row.rowIndex + '-' + match.id,
      rowIndex: params.row.rowIndex,
      importedName: name || website,
      existingId: match.id,
      existingName: match.name,
      matchType,
      confidence: matchType === 'website' ? 'high' : 'medium',
      recommendation: matchType === 'website' ? 'merge' : 'review',
    };
  }

  const contacts = contactRows(params.accounts);
  const byEmail = email ? contacts.find((contact) => normalize(contact.email) === normalize(email)) : undefined;
  const byNameAndCompany = contacts.find((contact) => normalize(contact.contactName) === normalize(name) && normalize(contact.accountName) === normalize(company));
  const match = byEmail ?? byNameAndCompany;
  if (!match) return undefined;
  const matchType = byEmail ? 'email' : 'name';
  return {
    id: 'dup-' + params.row.rowIndex + '-' + match.contactId,
    rowIndex: params.row.rowIndex,
    importedName: name || email,
    existingId: match.contactId,
    existingName: match.contactName + ' · ' + match.accountName,
    matchType,
    confidence: matchType === 'email' ? 'high' : 'medium',
    recommendation: matchType === 'email' ? 'merge' : 'review',
  };
}

export function buildImportGovernanceModel(params: {
  type: ImportObjectType;
  rows: ImportSourceRow[];
  fields: ImportFieldDef[];
  mapping: Record<string, string>;
  accounts: Account[];
  decisions?: Record<number, ImportRowAction>;
}): ImportGovernanceModel {
  const previewRows = params.rows.map((row) => {
    const findings = [
      ...requiredFindings({ row, fields: params.fields, mapping: params.mapping }),
      ...formatFindings({ type: params.type, row, mapping: params.mapping }),
    ];
    const duplicate = findDuplicate({ type: params.type, row, mapping: params.mapping, accounts: params.accounts });
    const displayName = mappedFirstValue(row, params.mapping, ['name', 'company', 'companyName', 'contactName']) || 'Row ' + (row.rowIndex + 1);
    const defaultAction: ImportRowAction = findings.some((finding) => finding.severity === 'high')
      ? 'skip'
      : duplicate
        ? 'conflict'
        : 'create';

    return {
      rowIndex: row.rowIndex,
      displayName,
      action: params.decisions?.[row.rowIndex] ?? defaultAction,
      duplicate,
      findings,
    };
  });

  const counts: Record<ImportRowAction, number> = { create: 0, update: 0, skip: 0, conflict: 0 };
  for (const row of previewRows) counts[row.action] += 1;

  return {
    previewRows,
    duplicates: previewRows.flatMap((row) => row.duplicate ? [row.duplicate] : []),
    findings: previewRows.flatMap((row) => row.findings),
    counts,
  };
}

export function buildMergePlan(params: {
  type: Exclude<ImportObjectType, 'leads'>;
  incoming: Record<string, string>;
  existing: Record<string, string | null | undefined>;
  existingId: string;
}): MergePlan {
  if (!params.existingId.trim()) {
    throw new Error('existingId is required');
  }

  const fields = params.type === 'contacts' ? CONTACT_MERGE_FIELDS : ACCOUNT_MERGE_FIELDS;
  const updates: Record<string, string> = {};
  const filled: string[] = [];
  const conflicts: MergePlanConflict[] = [];

  for (const [incomingField, dbField] of Object.entries(fields)) {
    const incomingValue = cleanMergeValue(params.incoming[incomingField]);
    if (!incomingValue) continue;

    const existingValue = cleanMergeValue(params.existing[dbField]);
    if (!existingValue) {
      updates[dbField] = incomingValue;
      filled.push(dbField);
      continue;
    }

    if (existingValue !== incomingValue) {
      conflicts.push({
        field: dbField,
        existingValue,
        incomingValue,
      });
    }
  }

  return {
    entityType: params.type,
    existingId: params.existingId,
    updates,
    filled,
    conflicts,
  };
}
