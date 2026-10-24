import type { JudgmentEvidenceRef } from '@/lib/babel-engine/types';
import type { requireAdmin } from '@/lib/api-guard';

type AdminClient = ReturnType<typeof requireAdmin>;

type AccountScopedSourceTable = 'source_records' | 'email_decodes' | 'strategic_plays' | 'rfps' | 'rfp_ai_analyses' | 'opportunities';

const ACCOUNT_SCOPED_SOURCE_TABLES = new Set<AccountScopedSourceTable>([
  'source_records',
  'email_decodes',
  'strategic_plays',
  'rfps',
  'rfp_ai_analyses',
  'opportunities',
]);

const SOURCE_KIND_FALLBACK_TABLES: Partial<Record<JudgmentEvidenceRef['sourceKind'], AccountScopedSourceTable>> = {
  source_record: 'source_records',
  email_decode: 'email_decodes',
  strategic_play: 'strategic_plays',
};

type SourcePointerResolution =
  | { ok: true; table: AccountScopedSourceTable | null }
  | { ok: false; error: string };

export function accountScopedSourceTable(ref: JudgmentEvidenceRef): SourcePointerResolution {
  const table = ref.sourceTable;
  if (table && ACCOUNT_SCOPED_SOURCE_TABLES.has(table as AccountScopedSourceTable)) {
    return { ok: true, table: table as AccountScopedSourceTable };
  }
  if (table) {
    return { ok: false, error: `unsupported sourceTable: ${table}` };
  }

  return { ok: true, table: SOURCE_KIND_FALLBACK_TABLES[ref.sourceKind] ?? null };
}

async function accountScopedRowExists(admin: AdminClient, params: {
  orgId: string;
  accountId: string;
  table: Exclude<AccountScopedSourceTable, 'rfp_ai_analyses'>;
  rowId: string;
}): Promise<boolean> {
  const { data, error } = await admin
    .from(params.table)
    .select('id')
    .eq('org_id', params.orgId)
    .eq('account_id', params.accountId)
    .eq('id', params.rowId)
    .maybeSingle();

  if (error) {
    const message = error.message ?? '';
    if (message.includes('schema cache') || message.includes('does not exist') || message.includes(params.table)) return false;
    throw new Error(message);
  }
  return Boolean(data);
}

async function rfpAnalysisPointerBelongsToAccount(admin: AdminClient, params: {
  orgId: string;
  accountId: string;
  rowId: string;
}): Promise<boolean> {
  const { data, error } = await admin
    .from('rfp_ai_analyses')
    .select('id, rfp_id')
    .eq('org_id', params.orgId)
    .eq('id', params.rowId)
    .maybeSingle();

  if (error) {
    const message = error.message ?? '';
    if (message.includes('schema cache') || message.includes('does not exist') || message.includes('rfp_ai_analyses')) return false;
    throw new Error(message);
  }

  const rfpId = typeof data?.rfp_id === 'string' ? data.rfp_id : '';
  if (!rfpId) return false;

  return accountScopedRowExists(admin, {
    orgId: params.orgId,
    accountId: params.accountId,
    table: 'rfps',
    rowId: rfpId,
  });
}

async function sourcePointerBelongsToAccount(admin: AdminClient, params: {
  orgId: string;
  accountId: string;
  table: AccountScopedSourceTable;
  rowId: string;
}): Promise<boolean> {
  if (params.table === 'rfp_ai_analyses') {
    return rfpAnalysisPointerBelongsToAccount(admin, params);
  }
  return accountScopedRowExists(admin, { ...params, table: params.table });
}

export async function validateAccountScopedSourcePointers(admin: AdminClient, params: {
  orgId: string;
  accountId: string;
  refs: JudgmentEvidenceRef[];
}): Promise<string | null> {
  for (const ref of params.refs) {
    const resolution = accountScopedSourceTable(ref);
    if (!resolution.ok) return resolution.error;
    const table = resolution.table;
    const rowId = ref.sourceRowId || ref.sourceId;
    if (!table || !rowId) continue;
    const ok = await sourcePointerBelongsToAccount(admin, { ...params, table, rowId });
    if (!ok) {
      return 'source pointer 不属于当前 account/org，已拒绝写入';
    }
  }
  return null;
}
