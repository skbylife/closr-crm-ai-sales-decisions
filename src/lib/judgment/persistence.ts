import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildJudgmentMemorySourceRecord,
  type JudgmentMemoryInput,
  type JudgmentMemorySourceKind,
  type JudgmentMemorySourceRecordRow,
} from './memory';

type JudgmentMemoryAdminClient = SupabaseClient;

type PersistStatus = 'persisted' | 'skipped';

type PersistSkippedReason =
  | 'invalid_org_id'
  | 'account_mismatch'
  | 'source_table_mismatch'
  | 'source_id_mismatch'
  | 'source_records_unavailable'
  | 'source_account_mismatch'
  | 'source_table_duplicate_mismatch'
  | 'source_metadata_mismatch';

interface SourceRecordExistingRow {
  id?: string | null;
  account_id?: string | null;
  source_table?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface PersistJudgmentMemorySourceRecordResult {
  status: PersistStatus;
  reason?: PersistSkippedReason;
  judgmentMemory: JudgmentMemoryInput;
  sourceRecord?: JudgmentMemorySourceRecordRow;
}

const EXPECTED_SOURCE_TABLE_BY_KIND: Record<JudgmentMemorySourceKind, string> = {
  decode: 'email_decodes',
  rfp_analysis: 'rfp_ai_analyses',
  strategic_play: 'strategic_plays',
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isSourceRecordsUnavailable(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? '';
  return message.includes('source_records') || message.includes('schema cache') || message.includes('does not exist');
}

function mergeSourceRecordMetadata(
  existingMetadata: Record<string, unknown> | null | undefined,
  nextMetadata: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...asRecord(existingMetadata),
    ...nextMetadata,
    judgmentMemory: nextMetadata.judgmentMemory,
    evidenceRefs: nextMetadata.evidenceRefs,
  };
}

function isSameJudgmentMemorySource(
  existingMetadata: Record<string, unknown> | null | undefined,
  judgmentMemory: JudgmentMemoryInput,
): boolean {
  const metadata = asRecord(existingMetadata);
  const existingMemory = asRecord(metadata.judgmentMemory);
  return (
    existingMemory.accountId === judgmentMemory.accountId
    && existingMemory.sourceKind === judgmentMemory.sourceKind
    && existingMemory.sourceId === judgmentMemory.sourceId
  );
}

export async function persistJudgmentMemorySourceRecord(params: {
  admin: JudgmentMemoryAdminClient;
  orgId: string;
  judgmentMemory: JudgmentMemoryInput;
  sourceTable: string;
  expectedAccountId?: string;
  extraMetadata?: Record<string, unknown>;
}): Promise<PersistJudgmentMemorySourceRecordResult> {
  const { admin, orgId, judgmentMemory, sourceTable, expectedAccountId, extraMetadata } = params;

  if (!orgId || typeof orgId !== 'string') {
    return { status: 'skipped', reason: 'invalid_org_id', judgmentMemory };
  }

  if (expectedAccountId && judgmentMemory.accountId !== expectedAccountId) {
    return { status: 'skipped', reason: 'account_mismatch', judgmentMemory };
  }

  const expectedSourceTable = EXPECTED_SOURCE_TABLE_BY_KIND[judgmentMemory.sourceKind];
  if (sourceTable !== expectedSourceTable) {
    return { status: 'skipped', reason: 'source_table_mismatch', judgmentMemory };
  }

  const sourceRecord = buildJudgmentMemorySourceRecord({
    orgId,
    judgmentMemory,
    sourceTable,
    extraMetadata,
  });

  if (sourceRecord.account_id !== judgmentMemory.accountId || sourceRecord.source_row_id !== judgmentMemory.sourceId) {
    return { status: 'skipped', reason: 'source_id_mismatch', judgmentMemory };
  }

  const existingResult = await admin
    .from('source_records')
    .select('id, account_id, source_table, metadata')
    .eq('org_id', orgId)
    .eq('source_kind', sourceRecord.source_kind)
    .eq('source_row_id', sourceRecord.source_row_id)
    .maybeSingle();

  if (existingResult.error) {
    if (isSourceRecordsUnavailable(existingResult.error)) {
      return { status: 'skipped', reason: 'source_records_unavailable', judgmentMemory };
    }
    throw new Error(existingResult.error.message);
  }

  const existing = existingResult.data as SourceRecordExistingRow | null;
  if (existing) {
    const sameJudgmentMemorySource = isSameJudgmentMemorySource(existing.metadata, judgmentMemory);
    const hasTrustedColumns = existing.account_id === judgmentMemory.accountId && existing.source_table === sourceTable;
    if (existing.account_id !== judgmentMemory.accountId && !sameJudgmentMemorySource) {
      return { status: 'skipped', reason: 'source_account_mismatch', judgmentMemory };
    }

    if (existing.source_table !== sourceTable && !sameJudgmentMemorySource) {
      return { status: 'skipped', reason: 'source_table_duplicate_mismatch', judgmentMemory };
    }

    const existingSourceKind = asRecord(existing.metadata).sourceKind;
    if (existingSourceKind && existingSourceKind !== judgmentMemory.sourceKind && !sameJudgmentMemorySource) {
      return { status: 'skipped', reason: 'source_metadata_mismatch', judgmentMemory };
    }

    if (!hasTrustedColumns && !sameJudgmentMemorySource) {
      return { status: 'skipped', reason: 'source_metadata_mismatch', judgmentMemory };
    }
  }

  const mergedSourceRecord = {
    ...sourceRecord,
    metadata: mergeSourceRecordMetadata(existing?.metadata, sourceRecord.metadata),
  };

  const upsertResult = await admin
    .from('source_records')
    .upsert(mergedSourceRecord, { onConflict: 'org_id,source_kind,source_row_id' });

  if (upsertResult.error) {
    if (isSourceRecordsUnavailable(upsertResult.error)) {
      return { status: 'skipped', reason: 'source_records_unavailable', judgmentMemory };
    }
    throw new Error(upsertResult.error.message);
  }

  return { status: 'persisted', judgmentMemory, sourceRecord: mergedSourceRecord };
}
