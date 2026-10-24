import { NextResponse } from 'next/server';
import { requireAdmin, requireAuth } from '@/lib/api-guard';
import { verifyJudgmentProvenance, type ProvenanceAccountScopedRow, type ProvenanceRfpAnalysisRow, type ProvenanceRfpRow, type ProvenanceSourceRecordRow } from '@/lib/judgment/provenance-verifier';
import { buildProvenanceGapWorkbench } from '@/lib/judgment/provenance-gaps';

export const dynamic = 'force-dynamic';

type AccountRow = {
  id: string;
  name: string | null;
};

type QueryError = { message?: string } | null | undefined;

function isOptionalTableUnavailable(error: QueryError): boolean {
  const message = error?.message ?? '';
  return message.includes('schema cache') || message.includes('does not exist') || message.includes('Could not find');
}

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? data as T[] : [];
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(Number(searchParams.get('limit') ?? 6), 20));

    const [accountsResult, sourceRecordsResult, decodesResult, playsResult, rfpsResult, rfpAnalysesResult] = await Promise.all([
      admin
        .from('accounts')
        .select('id, name')
        .eq('org_id', ctx.orgId)
        .order('name', { ascending: true })
        .limit(300),
      admin
        .from('source_records')
        .select('id, account_id, org_id, source_kind, source_table, source_row_id, metadata')
        .eq('org_id', ctx.orgId)
        .order('occurred_at', { ascending: false })
        .limit(1200),
      admin
        .from('email_decodes')
        .select('id, account_id, org_id')
        .eq('org_id', ctx.orgId)
        .order('date', { ascending: false })
        .limit(500),
      admin
        .from('strategic_plays')
        .select('id, account_id, org_id')
        .eq('org_id', ctx.orgId)
        .order('updated_at', { ascending: false })
        .limit(500),
      admin
        .from('rfps')
        .select('id, account_id, org_id')
        .eq('org_id', ctx.orgId)
        .limit(500),
      admin
        .from('rfp_ai_analyses')
        .select('id, rfp_id, org_id')
        .eq('org_id', ctx.orgId)
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    if (accountsResult.error) throw new Error(accountsResult.error.message ?? 'accounts query failed');
    if (sourceRecordsResult.error && !isOptionalTableUnavailable(sourceRecordsResult.error)) {
      throw new Error(sourceRecordsResult.error.message ?? 'source_records query failed');
    }

    for (const result of [decodesResult, playsResult, rfpsResult, rfpAnalysesResult]) {
      if (result.error && !isOptionalTableUnavailable(result.error)) {
        throw new Error(result.error.message ?? 'provenance source query failed');
      }
    }

    const accounts = asRows<AccountRow>(accountsResult.data).map((account) => ({
      id: account.id,
      key: account.id,
      name: account.name || '未命名账户',
    }));

    const verification = verifyJudgmentProvenance({
      orgId: ctx.orgId,
      accounts,
      sourceRecords: sourceRecordsResult.error ? [] : asRows<ProvenanceSourceRecordRow>(sourceRecordsResult.data),
      emailDecodes: decodesResult.error ? [] : asRows<ProvenanceAccountScopedRow>(decodesResult.data),
      strategicPlays: playsResult.error ? [] : asRows<ProvenanceAccountScopedRow>(playsResult.data),
      rfps: rfpsResult.error ? [] : asRows<ProvenanceRfpRow>(rfpsResult.data),
      rfpAnalyses: rfpAnalysesResult.error ? [] : asRows<ProvenanceRfpAnalysisRow>(rfpAnalysesResult.data),
    });

    const workbench = buildProvenanceGapWorkbench(verification, { topLimit: limit });

    return NextResponse.json({
      ...workbench,
      scope: {
        orgId: ctx.orgId,
        accounts: accounts.length,
      },
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) {
      const apiErr = err as { status: number; message: string };
      return NextResponse.json({ error: apiErr.message }, { status: apiErr.status });
    }
    console.error('[judgment/provenance-gaps] Error:', err);
    return NextResponse.json({ error: '加载 judgment provenance gaps 失败' }, { status: 500 });
  }
}
