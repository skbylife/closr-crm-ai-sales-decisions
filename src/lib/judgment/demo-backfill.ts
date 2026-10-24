import type { DecodeOutput, RfpJudgment, SavedDecode, StrategicPlay } from '@/lib/babel-engine/types';
import { invalidateAccountCaches } from '@/lib/evidence-memory/server';
import {
  buildJudgmentMemoryFromDecode,
  buildJudgmentMemoryFromRfpAnalysis,
  buildJudgmentMemoryFromStrategicPlay,
  buildJudgmentMemorySourceRecord,
  type JudgmentMemoryInput,
  type JudgmentMemorySourceKind,
} from '@/lib/judgment/memory';
import { requireAdmin } from '@/lib/api-guard';
import { buildDecodeStabilityMetadata, normalizeDecodeStabilityMetadata, type DecodeStabilityMetadata } from './decode-stability';

type AdminClient = ReturnType<typeof requireAdmin>;

export const DEMO_JUDGMENT_MEMORY_BACKFILL_CONFIRM = 'demo-judgment-memory-backfill';

const MAX_DEMO_ACCOUNTS = 50;
const MAX_SOURCE_ROWS_PER_KIND = 500;

type BackfillSourceKind = JudgmentMemorySourceKind;

type BackfillCounters = Record<BackfillSourceKind, number>;

export interface DecodeStabilityBackfillCandidate {
  sourceRecordId: string;
  decodeId: string;
  accountId: string;
  title: string;
  occurredAt: string;
  inputSummary: string;
  status: string;
  confidence: number | null;
  changedFields: string[];
  hasSnapshot: boolean;
}

export interface DecodeStabilityBackfillResult {
  dryRun: boolean;
  scanned: number;
  eligible: number;
  written: number;
  candidates: DecodeStabilityBackfillCandidate[];
  skipped: Record<string, number>;
  warnings: string[];
}

export interface DemoJudgmentMemoryBackfillResult {
  dryRun: boolean;
  orgId: string;
  accountIds: string[];
  scanned: BackfillCounters;
  eligible: BackfillCounters;
  written: BackfillCounters;
  skipped: Record<string, number>;
  warnings: string[];
  decodeStabilityBackfill: DecodeStabilityBackfillResult;
}

type DemoAccountRow = {
  id?: string | null;
};

type DecodeBackfillRow = {
  id?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  client_name?: string | null;
  date?: string | null;
  decode?: unknown;
  matched_contact_id?: string | null;
  opportunity_id?: string | null;
};

type StrategicPlayBackfillRow = {
  id?: string | null;
  account_id?: string | null;
  opportunity_id?: string | null;
  target_contact_id?: string | null;
  goal_description?: string | null;
  steps?: unknown;
  confidence?: unknown;
  assumptions?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
};

type RfpBackfillRow = {
  id?: string | null;
  org_id?: string | null;
  account_id?: string | null;
  title?: string | null;
  due_date?: string | null;
};

type RfpAnalysisBackfillRow = {
  id?: string | null;
  org_id?: string | null;
  rfp_id?: string | null;
  win_probability?: number | null;
  weaknesses?: unknown;
  recommendations?: unknown;
  created_at?: string | null;
  raw_output?: unknown;
};

type DecodeStabilitySourceRecordRow = {
  id?: string | null;
  account_id?: string | null;
  source_row_id?: string | null;
  title?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

function emptyCounters(): BackfillCounters {
  return { decode: 0, rfp_analysis: 0, strategic_play: 0 };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value) && value.length <= 128;
}

function hasDecodeOutput(value: unknown): value is DecodeOutput {
  return Boolean(
    value
      && typeof value === 'object'
      && Array.isArray((value as DecodeOutput).messages)
      && (value as DecodeOutput).threadAnalysis,
  );
}

function isRfpJudgment(value: unknown): value is RfpJudgment {
  const row = asRecord(value);
  const decision = row?.decision;
  return Boolean(
    row
      && (decision === 'bid' || decision === 'no_bid' || decision === 'cautious_bid' || decision === 'need_more_intel')
      && typeof row.confidence === 'number'
      && typeof row.rationale === 'string'
      && typeof row.uncertainty === 'string'
      && Array.isArray(row.keyRisks)
      && Array.isArray(row.tensions)
      && Array.isArray(row.contradictions)
      && Array.isArray(row.evidenceSignals),
  );
}

function isJudgmentMemoryInput(value: unknown): value is JudgmentMemoryInput {
  const memory = asRecord(value);
  const sourceKind = memory?.sourceKind;
  return Boolean(
    memory
      && (sourceKind === 'decode' || sourceKind === 'rfp_analysis' || sourceKind === 'strategic_play')
      && typeof memory.sourceId === 'string'
      && typeof memory.accountId === 'string'
      && typeof memory.currentJudgment === 'string'
      && typeof memory.risk === 'string'
      && typeof memory.nextAction === 'string'
      && Array.isArray(memory.evidenceRefs),
  );
}

function normalizeStrategicPlayForJudgment(row: StrategicPlayBackfillRow): Pick<StrategicPlay, 'id' | 'accountId' | 'goalDescription' | 'steps' | 'confidence' | 'assumptions' | 'updatedAt' | 'createdAt'> | null {
  const id = typeof row.id === 'string' ? row.id : '';
  const accountId = typeof row.account_id === 'string' ? row.account_id : '';
  const goalDescription = typeof row.goal_description === 'string' ? row.goal_description.trim() : '';
  if (!id || !accountId || !goalDescription) return null;

  const now = new Date().toISOString();
  return {
    id,
    accountId,
    goalDescription,
    steps: Array.isArray(row.steps) ? row.steps as StrategicPlay['steps'] : [],
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : 0.5,
    assumptions: Array.isArray(row.assumptions) ? row.assumptions as StrategicPlay['assumptions'] : [],
    createdAt: row.created_at ?? row.updated_at ?? now,
    updatedAt: row.updated_at ?? row.created_at ?? now,
  };
}

function incrementSkipped(result: DemoJudgmentMemoryBackfillResult, reason: string) {
  result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
}

function incrementDecodeStabilitySkipped(result: DecodeStabilityBackfillResult, reason: string) {
  result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

async function backfillDecodeStabilityMetadata(params: {
  admin: AdminClient;
  orgId: string;
  accountIds: string[];
  decodes: DecodeBackfillRow[];
  dryRun: boolean;
}): Promise<DecodeStabilityBackfillResult> {
  const { admin, orgId, accountIds, decodes, dryRun } = params;
  const result = emptyDecodeStabilityBackfillResult(dryRun);
  if (accountIds.length === 0) return result;

  const { data, error } = await admin
    .from('source_records')
    .select('id, account_id, source_row_id, title, occurred_at, created_at, metadata')
    .eq('org_id', orgId)
    .eq('source_table', 'email_decodes')
    .in('account_id', accountIds)
    .limit(MAX_SOURCE_ROWS_PER_KIND);

  if (error) {
    const message = error.message ?? '';
    if (message.includes('source_records') || message.includes('schema cache') || message.includes('does not exist')) {
      result.warnings.push(`判断复盘补齐不可用：${message}`);
      return result;
    }
    throw new Error(message);
  }

  const decodeById = new Map(decodes.filter((row): row is DecodeBackfillRow & { id: string } => Boolean(row.id)).map((row) => [row.id, row]));
  for (const sourceRecord of (data ?? []) as DecodeStabilitySourceRecordRow[]) {
    result.scanned += 1;
    const existing = normalizeDecodeStabilityMetadata(sourceRecord.metadata?.decodeStability);
    if (existing) {
      incrementDecodeStabilitySkipped(result, 'already_has_decode_stability');
      continue;
    }
    const decodeId = typeof sourceRecord.source_row_id === 'string' ? sourceRecord.source_row_id : '';
    const decode = decodeById.get(decodeId);
    if (!decode || !hasDecodeOutput(decode.decode)) {
      incrementDecodeStabilitySkipped(result, 'decode_output_missing');
      continue;
    }
    const metadata = buildDecodeStabilityMetadata(decode.decode);
    if (!metadata) {
      incrementDecodeStabilitySkipped(result, 'decode_stability_unavailable');
      continue;
    }
    const candidate = buildDecodeStabilityBackfillCandidate({ sourceRecord, decode, metadata });
    if (!candidate) {
      incrementDecodeStabilitySkipped(result, 'source_record_mismatch');
      continue;
    }

    result.eligible += 1;
    result.candidates.push(candidate);

    if (dryRun) {
      result.written += 1;
      continue;
    }

    const nextMetadata = {
      ...(sourceRecord.metadata ?? {}),
      decodeStability: metadata,
      decodeStabilityBackfill: {
        name: 'demo-decode-stability-metadata',
        version: 1,
        backfilledAt: new Date().toISOString(),
      },
    };
    const { error: updateError } = await admin
      .from('source_records')
      .update({ metadata: nextMetadata })
      .eq('id', sourceRecord.id)
      .eq('org_id', orgId)
      .eq('account_id', candidate.accountId);

    if (updateError) throw new Error(updateError.message);
    result.written += 1;
  }

  return result;
}

async function loadDemoAccountIds(admin: AdminClient, params: { orgId: string; userId: string; requestedAccountIds?: string[] }) {
  let query = admin
    .from('accounts')
    .select('id')
    .eq('org_id', params.orgId)
    .eq('user_id', params.userId)
    .limit(MAX_DEMO_ACCOUNTS);

  if (params.requestedAccountIds?.length) {
    query = query.in('id', params.requestedAccountIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as DemoAccountRow[])
    .map((row) => row.id)
    .filter((id): id is string => typeof id === 'string');
}

function emptyDecodeStabilityBackfillResult(dryRun: boolean): DecodeStabilityBackfillResult {
  return {
    dryRun,
    scanned: 0,
    eligible: 0,
    written: 0,
    candidates: [],
    skipped: {},
    warnings: [],
  };
}

export function buildDecodeStabilityBackfillCandidate(params: {
  sourceRecord: DecodeStabilitySourceRecordRow;
  decode: DecodeBackfillRow;
  metadata: DecodeStabilityMetadata;
}): DecodeStabilityBackfillCandidate | null {
  const { sourceRecord, decode, metadata } = params;
  if (!sourceRecord.id || !sourceRecord.account_id || !decode.id || sourceRecord.source_row_id !== decode.id) return null;

  return {
    sourceRecordId: sourceRecord.id,
    decodeId: decode.id,
    accountId: sourceRecord.account_id,
    title: sourceRecord.title ?? 'Decode 判断',
    occurredAt: sourceRecord.occurred_at ?? sourceRecord.created_at ?? decode.date ?? new Date(0).toISOString(),
    inputSummary: metadata.contextSnapshot?.input_summary ?? '历史 Decode 已具备判断依据，可补入复盘记录。',
    status: metadata.judgmentDiff?.status ?? metadata.summary.status ?? 'unknown',
    confidence: typeof metadata.stableJudgment?.confidence === 'number' ? metadata.stableJudgment.confidence : null,
    changedFields: metadata.summary.changedFields,
    hasSnapshot: metadata.summary.snapshotAvailable,
  };
}

async function upsertSourceRecords(admin: AdminClient, result: DemoJudgmentMemoryBackfillResult, sourceKind: BackfillSourceKind, records: ReturnType<typeof buildJudgmentMemorySourceRecord>[]) {
  if (records.length === 0) return;

  result.eligible[sourceKind] += records.length;
  if (result.dryRun) {
    result.written[sourceKind] += records.length;
    return;
  }

  const { error } = await admin
    .from('source_records')
    .upsert(records, { onConflict: 'org_id,source_kind,source_row_id' });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('source_records') || message.includes('schema cache') || message.includes('does not exist')) {
      result.warnings.push(`source_records unavailable; skipped ${sourceKind} backfill: ${message}`);
      return;
    }
    throw new Error(message);
  }

  result.written[sourceKind] += records.length;
}

export async function backfillDemoJudgmentMemorySources(params: {
  admin: AdminClient;
  orgId: string;
  userId: string;
  requestedAccountIds?: string[];
  dryRun?: boolean;
}): Promise<DemoJudgmentMemoryBackfillResult> {
  const { admin, orgId, userId } = params;
  const requestedAccountIds = (params.requestedAccountIds ?? []).filter(isValidId);
  const accountIds = await loadDemoAccountIds(admin, { orgId, userId, requestedAccountIds });

  const result: DemoJudgmentMemoryBackfillResult = {
    dryRun: Boolean(params.dryRun),
    orgId,
    accountIds,
    scanned: emptyCounters(),
    eligible: emptyCounters(),
    written: emptyCounters(),
    skipped: {},
    warnings: requestedAccountIds.length > accountIds.length
      ? [`${requestedAccountIds.length - accountIds.length} requested account(s) were outside the authenticated demo user/org scope and were ignored.`]
      : [],
    decodeStabilityBackfill: emptyDecodeStabilityBackfillResult(Boolean(params.dryRun)),
  };

  if (accountIds.length === 0) {
    result.warnings.push('No demo accounts found for the authenticated demo user/org.');
    return result;
  }

  const accountIdSet = new Set(accountIds);
  const backfilledAt = new Date().toISOString();
  const backfillMetadata = { backfill: { name: 'demo-judgment-memory-source-records', version: 1, backfilledAt } };

  const [decodesResult, playsResult, rfpsResult] = await Promise.all([
    admin
      .from('email_decodes')
      .select('id, account_id, account_name, client_name, date, decode, matched_contact_id, opportunity_id')
      .eq('org_id', orgId)
      .in('account_id', accountIds)
      .order('date', { ascending: false })
      .limit(MAX_SOURCE_ROWS_PER_KIND),
    admin
      .from('strategic_plays')
      .select('id, account_id, opportunity_id, target_contact_id, goal_description, steps, confidence, assumptions, created_at, updated_at')
      .eq('org_id', orgId)
      .in('account_id', accountIds)
      .order('updated_at', { ascending: false })
      .limit(MAX_SOURCE_ROWS_PER_KIND),
    admin
      .from('rfps')
      .select('id, org_id, account_id, title, due_date')
      .eq('org_id', orgId)
      .in('account_id', accountIds)
      .limit(MAX_SOURCE_ROWS_PER_KIND),
  ]);

  for (const queryResult of [decodesResult, playsResult, rfpsResult]) {
    if (queryResult.error) throw new Error(queryResult.error.message);
  }

  const decodeRecords: ReturnType<typeof buildJudgmentMemorySourceRecord>[] = [];
  for (const row of (decodesResult.data ?? []) as DecodeBackfillRow[]) {
    result.scanned.decode += 1;
    if (!row.id || !row.account_id || !accountIdSet.has(row.account_id)) {
      incrementSkipped(result, 'decode_scope_mismatch');
      continue;
    }
    if (!hasDecodeOutput(row.decode)) {
      incrementSkipped(result, 'decode_output_missing');
      continue;
    }

    const savedDecode: Pick<SavedDecode, 'id' | 'accountId' | 'decode' | 'date' | 'clientName' | 'accountName'> = {
      id: row.id,
      accountId: row.account_id,
      accountName: row.account_name ?? undefined,
      clientName: row.client_name ?? undefined,
      date: row.date ?? new Date().toISOString(),
      decode: row.decode,
    };
    const judgmentMemory = buildJudgmentMemoryFromDecode({ savedDecode });
    if (!judgmentMemory) {
      incrementSkipped(result, 'decode_judgment_memory_empty');
      continue;
    }

    const decodeStability = buildDecodeStabilityMetadata(row.decode);
    decodeRecords.push(buildJudgmentMemorySourceRecord({
      orgId,
      judgmentMemory,
      sourceTable: 'email_decodes',
      extraMetadata: {
        ...backfillMetadata,
        matchedContactId: row.matched_contact_id ?? null,
        opportunityId: row.opportunity_id ?? null,
        ...(decodeStability ? { decodeStability } : {}),
      },
    }));
  }

  await upsertSourceRecords(admin, result, 'decode', decodeRecords);

  result.decodeStabilityBackfill = await backfillDecodeStabilityMetadata({
    admin,
    orgId,
    accountIds,
    decodes: (decodesResult.data ?? []) as DecodeBackfillRow[],
    dryRun: result.dryRun,
  });

  const playRecords: ReturnType<typeof buildJudgmentMemorySourceRecord>[] = [];
  for (const row of (playsResult.data ?? []) as StrategicPlayBackfillRow[]) {
    result.scanned.strategic_play += 1;
    if (!row.account_id || !accountIdSet.has(row.account_id)) {
      incrementSkipped(result, 'strategic_play_scope_mismatch');
      continue;
    }
    const play = normalizeStrategicPlayForJudgment(row);
    if (!play) {
      incrementSkipped(result, 'strategic_play_judgment_memory_empty');
      continue;
    }

    playRecords.push(buildJudgmentMemorySourceRecord({
      orgId,
      judgmentMemory: buildJudgmentMemoryFromStrategicPlay(play),
      sourceTable: 'strategic_plays',
      extraMetadata: {
        ...backfillMetadata,
        opportunityId: row.opportunity_id ?? null,
        targetContactId: row.target_contact_id ?? null,
      },
    }));
  }

  await upsertSourceRecords(admin, result, 'strategic_play', playRecords);

  const rfps = ((rfpsResult.data ?? []) as RfpBackfillRow[])
    .filter((rfp): rfp is Required<Pick<RfpBackfillRow, 'id' | 'account_id' | 'title'>> & RfpBackfillRow => Boolean(rfp.id && rfp.account_id && rfp.title && accountIdSet.has(rfp.account_id)));
  const rfpById = new Map(rfps.map((rfp) => [rfp.id, rfp]));

  if (rfps.length > 0) {
    const { data: analyses, error } = await admin
      .from('rfp_ai_analyses')
      .select('id, org_id, rfp_id, win_probability, weaknesses, recommendations, created_at, raw_output')
      .eq('org_id', orgId)
      .in('rfp_id', rfps.map((rfp) => rfp.id))
      .order('created_at', { ascending: false })
      .limit(MAX_SOURCE_ROWS_PER_KIND);

    if (error) throw new Error(error.message);

    const rfpRecords: ReturnType<typeof buildJudgmentMemorySourceRecord>[] = [];
    for (const analysis of (analyses ?? []) as RfpAnalysisBackfillRow[]) {
      result.scanned.rfp_analysis += 1;
      if (!analysis.id || !analysis.rfp_id) {
        incrementSkipped(result, 'rfp_analysis_missing_id');
        continue;
      }
      const rfp = rfpById.get(analysis.rfp_id);
      const rfpId = rfp?.id;
      const rfpAccountId = rfp?.account_id;
      const rfpTitle = rfp?.title;
      if (!rfpId || !rfpAccountId || !rfpTitle || !accountIdSet.has(rfpAccountId)) {
        incrementSkipped(result, 'rfp_analysis_scope_mismatch');
        continue;
      }

      const rawOutput = asRecord(analysis.raw_output);
      let judgmentMemory: JudgmentMemoryInput | null = null;
      const rawJudgment = rawOutput?.judgment;
      if (isRfpJudgment(rawJudgment)) {
        judgmentMemory = buildJudgmentMemoryFromRfpAnalysis({
          rfp: {
            id: rfpId,
            account_id: rfpAccountId,
            title: rfpTitle,
            due_date: rfp.due_date ?? null,
          },
          analysis: {
            id: analysis.id,
            created_at: analysis.created_at ?? new Date().toISOString(),
          },
          judgment: rawJudgment,
          recommendations: arrayOfStrings(analysis.recommendations),
          weaknesses: arrayOfStrings(analysis.weaknesses),
          winProbability: analysis.win_probability ?? null,
        });
      } else if (isJudgmentMemoryInput(rawOutput?.judgmentMemory)) {
        judgmentMemory = rawOutput.judgmentMemory;
      }

      if (!judgmentMemory || judgmentMemory.sourceKind !== 'rfp_analysis' || judgmentMemory.sourceId !== analysis.id || judgmentMemory.accountId !== rfpAccountId) {
        incrementSkipped(result, 'rfp_analysis_judgment_memory_empty');
        continue;
      }

      rfpRecords.push(buildJudgmentMemorySourceRecord({
        orgId,
        judgmentMemory,
        sourceTable: 'rfp_ai_analyses',
        extraMetadata: {
          ...backfillMetadata,
          rfpId,
        },
      }));
    }

    await upsertSourceRecords(admin, result, 'rfp_analysis', rfpRecords);
  }

  if (!result.dryRun) {
    for (const accountId of accountIds) invalidateAccountCaches(accountId, orgId);
  }

  return result;
}
