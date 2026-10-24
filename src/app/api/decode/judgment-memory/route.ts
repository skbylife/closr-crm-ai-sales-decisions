import { requireAuth, requireAccountAccess, requireAdmin, guardResponse } from '@/lib/api-guard';
import type { DecodeOutput, SavedDecode } from '@/lib/babel-engine/types';
import { invalidateAccountCaches } from '@/lib/evidence-memory/server';
import { buildJudgmentMemoryFromDecode, type JudgmentMemorySourceRecordRow } from '@/lib/judgment/memory';
import { persistJudgmentMemorySourceRecord } from '@/lib/judgment/persistence';
import { buildDecodeStabilityMetadata } from '@/lib/judgment/decode-stability';

export const dynamic = 'force-dynamic';

interface PersistDecodeJudgmentMemoryBody {
  decodeId?: string;
  accountId?: string;
}

interface DecodeRow {
  id: string;
  account_id: string | null;
  account_name: string | null;
  client_name: string | null;
  date: string | null;
  decode: DecodeOutput | null;
  matched_contact_id?: string | null;
  opportunity_id?: string | null;
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

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = await request.json().catch(() => ({})) as PersistDecodeJudgmentMemoryBody;

    if (!isValidId(body.decodeId)) {
      return Response.json({ error: 'decodeId is required' }, { status: 400 });
    }

    if (body.accountId) {
      if (!isValidId(body.accountId)) {
        return Response.json({ error: 'Invalid accountId' }, { status: 400 });
      }
      await requireAccountAccess(ctx, body.accountId);
    }

    const admin = requireAdmin();
    let query = admin
      .from('email_decodes')
      .select('id, account_id, account_name, client_name, date, decode, matched_contact_id, opportunity_id')
      .eq('org_id', ctx.orgId)
      .eq('id', body.decodeId);

    if (body.accountId) query = query.eq('account_id', body.accountId);

    const { data, error } = await query.maybeSingle();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const row = data as DecodeRow | null;
    if (!row?.account_id) {
      return Response.json({ skipped: true, reason: 'decode_has_no_account', judgmentMemory: null });
    }

    await requireAccountAccess(ctx, row.account_id);

    if (!hasDecodeOutput(row.decode)) {
      return Response.json({ skipped: true, reason: 'decode_output_missing', judgmentMemory: null });
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
      return Response.json({ skipped: true, reason: 'judgment_memory_empty', judgmentMemory: null });
    }

    let sourceRecord: JudgmentMemorySourceRecordRow | undefined;
    try {
      const decodeStability = buildDecodeStabilityMetadata(row.decode);
      const persistResult = await persistJudgmentMemorySourceRecord({
        admin,
        orgId: ctx.orgId,
        judgmentMemory,
        sourceTable: 'email_decodes',
        expectedAccountId: row.account_id,
        extraMetadata: {
          matchedContactId: row.matched_contact_id ?? null,
          opportunityId: row.opportunity_id ?? null,
          ...(decodeStability ? { decodeStability } : {}),
        },
      });

      if (persistResult.status === 'skipped') {
        return Response.json({ skipped: true, reason: persistResult.reason, judgmentMemory });
      }
      sourceRecord = persistResult.sourceRecord;
    } catch (err) {
      console.warn('[decode/judgment-memory] source record persistence skipped:', err);
      return Response.json({ skipped: true, reason: 'source_records_error', judgmentMemory });
    }

    invalidateAccountCaches(row.account_id, ctx.orgId);

    return Response.json({ judgmentMemory, sourceRecord });
  } catch (err) {
    return guardResponse(err);
  }
}
