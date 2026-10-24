import { requireAuth, requireAdmin, requireAccountAccess, guardResponse } from '@/lib/api-guard';
import type { JudgmentEvidenceRef } from '@/lib/babel-engine/types';
import {
  buildJudgmentFeedbackSourceRecord,
  buildRevisedJudgmentPreview,
  normalizeJudgmentFeedbackSourceRow,
  parseJudgmentFeedbackOnly,
} from '@/lib/judgment/feedback';

export const dynamic = 'force-dynamic';

type AdminClient = ReturnType<typeof requireAdmin>;

type AccountScopedSourceTable = 'source_records' | 'email_decodes' | 'strategic_plays' | 'rfps' | 'rfp_ai_analyses';

const ACCOUNT_SCOPED_SOURCE_TABLES = new Set<AccountScopedSourceTable>([
  'source_records',
  'email_decodes',
  'strategic_plays',
  'rfps',
  'rfp_ai_analyses',
]);

const SOURCE_KIND_FALLBACK_TABLES: Partial<Record<JudgmentEvidenceRef['sourceKind'], AccountScopedSourceTable>> = {
  source_record: 'source_records',
  email_decode: 'email_decodes',
  strategic_play: 'strategic_plays',
};

type SourcePointerResolution =
  | { ok: true; table: AccountScopedSourceTable | null }
  | { ok: false; error: string };

function accountScopedSourceTable(ref: JudgmentEvidenceRef): SourcePointerResolution {
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

async function validateFeedbackSourcePointers(admin: AdminClient, params: {
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


type FeedbackSourceRecordRow = {
  id?: string | null;
  org_id?: string | null;
  account_id?: string | null;
  source_row_id?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

function isSourceRecordsUnavailable(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? '';
  return message.includes('source_records') || message.includes('schema cache') || message.includes('does not exist');
}

async function loadJudgmentFeedbacks(admin: AdminClient, params: { accountId: string; orgId: string; limit?: number }) {
  const limit = Math.max(1, Math.min(params.limit ?? 20, 50));
  const { data, error } = await admin
    .from('source_records')
    .select('id, org_id, account_id, source_row_id, occurred_at, created_at, metadata')
    .eq('org_id', params.orgId)
    .eq('account_id', params.accountId)
    .eq('source_kind', 'human_feedback')
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (isSourceRecordsUnavailable(error)) return [];
    throw new Error(error.message);
  }

  return ((data ?? []) as FeedbackSourceRecordRow[])
    .map((row) => normalizeJudgmentFeedbackSourceRow(row))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await requireAccountAccess(ctx, id);
    const admin = requireAdmin();
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get('limit') ?? 20);

    const records = await loadJudgmentFeedbacks(admin, { accountId: id, orgId: ctx.orgId, limit });
    return Response.json({
      judgmentFeedbacks: records.map((record) => record.feedback),
      revisedJudgmentPreviews: records.map((record) => record.revisedPreview).filter(Boolean),
      feedbackRevisionRecords: records,
    });
  } catch (err) {
    return guardResponse(err);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await requireAccountAccess(ctx, id);
    const admin = requireAdmin();
    const body = await request.json().catch(() => ({}));
    const now = new Date().toISOString();
    const feedbackId = crypto.randomUUID();

    const parsed = parseJudgmentFeedbackOnly(body, {
      id: feedbackId,
      accountId: id,
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      createdAt: now,
    });

    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    const sourcePointerError = await validateFeedbackSourcePointers(admin, {
      orgId: ctx.orgId,
      accountId: id,
      refs: parsed.feedback.evidenceRefs,
    });
    if (sourcePointerError) {
      return Response.json({ error: sourcePointerError }, { status: 400 });
    }

    let revisedPreview;
    let revisionStatus: 'ready' | 'failed' = 'ready';
    let revisionError: string | undefined;
    try {
      revisedPreview = buildRevisedJudgmentPreview({
        kind: parsed.feedback.kind,
        targetType: parsed.feedback.targetType,
        previousSummary: body?.previousSummary,
        content: parsed.feedback.content,
        scope: parsed.feedback.scope,
      });
    } catch (err) {
      revisionStatus = 'failed';
      revisionError = err instanceof Error ? err.message : 'revised preview generation failed';
    }

    const row = buildJudgmentFeedbackSourceRecord({
      orgId: ctx.orgId,
      feedback: parsed.feedback,
      revisedPreview,
      revisionStatus,
      revisionError,
      previousSummary: body?.previousSummary,
    });

    const { error } = await admin
      .from('source_records')
      .insert(row);

    if (error) {
      if (isSourceRecordsUnavailable(error)) {
        return Response.json({ error: 'source_records 不可用，无法保存判断反馈' }, { status: 503 });
      }
      throw new Error(error.message);
    }

    return Response.json({
      ok: true,
      feedback: parsed.feedback,
      revisedPreview,
      revisionStatus,
      revisionError,
      message: revisionStatus === 'ready'
        ? '已记录为账户修正；将影响当前客户判断，不会影响其他客户或团队规则。'
        : '用户反馈已持久化；修订预览生成失败，后续可重新生成。',
    }, { status: 201 });
  } catch (err) {
    return guardResponse(err);
  }
}
