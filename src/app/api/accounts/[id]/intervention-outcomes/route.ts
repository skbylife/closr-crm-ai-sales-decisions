import { requireAuth, requireAdmin, requireAccountAccess, guardResponse } from '@/lib/api-guard';
import { validateAccountScopedSourcePointers } from '@/lib/judgment/source-pointer-access';
import { normalizeInterventionSourceRow, type JudgmentInterventionType } from '@/lib/judgment/intervention';
import {
  buildInterventionOutcomeSourceRecord,
  parseInterventionOutcome,
  type InterventionOutcomeSourceRecordRow,
} from '@/lib/judgment/intervention-learning';

export const dynamic = 'force-dynamic';

type AdminClient = ReturnType<typeof requireAdmin>;
type AuthContext = Awaited<ReturnType<typeof requireAuth>>;

type SourceRecordScopeRow = {
  id?: string | null;
  org_id?: string | null;
  account_id?: string | null;
  source_kind?: string | null;
  source_table?: string | null;
  source_row_id?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

function isSourceRecordsUnavailable(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? '';
  return message.includes('source_records') || message.includes('schema cache') || message.includes('does not exist');
}

function isAdminOrOwner(ctx: AuthContext): boolean {
  return ctx.roleLevel === 'admin' || ctx.orgRole === 'owner' || ctx.orgRole === 'admin';
}

function hasOutcomePermission(ctx: AuthContext, type: JudgmentInterventionType): boolean {
  if (isAdminOrOwner(ctx)) return true;
  const jobLevel = Number(ctx.jobLevel ?? 0);
  if (type === 'executive_intervention') return jobLevel >= 2;
  return jobLevel >= 1;
}

async function loadInterventionSourceRecord(admin: AdminClient, params: {
  orgId: string;
  accountId: string;
  sourceRecordId: string;
}): Promise<SourceRecordScopeRow | null> {
  const { data, error } = await admin
    .from('source_records')
    .select('id, org_id, account_id, source_kind, source_table, source_row_id, occurred_at, created_at, metadata')
    .eq('org_id', params.orgId)
    .eq('account_id', params.accountId)
    .eq('id', params.sourceRecordId)
    .maybeSingle();

  if (error) {
    if (isSourceRecordsUnavailable(error)) return null;
    throw new Error(error.message);
  }
  return (data ?? null) as SourceRecordScopeRow | null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await requireAccountAccess(ctx, id);
    const admin = requireAdmin();
    const body = await request.json().catch(() => ({}));
    const now = new Date().toISOString();
    const outcomeId = crypto.randomUUID();

    const parsed = parseInterventionOutcome(body, {
      id: outcomeId,
      accountId: id,
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      createdAt: now,
    });

    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    const originalRow = await loadInterventionSourceRecord(admin, {
      orgId: ctx.orgId,
      accountId: id,
      sourceRecordId: parsed.interventionOutcome.sourceRecordId,
    });
    const originalIntervention = originalRow ? normalizeInterventionSourceRow(originalRow) : null;

    if (!originalRow || !originalIntervention) {
      return Response.json({ error: '原介入 source_record 不存在或不属于当前 account/org' }, { status: 404 });
    }

    if (originalIntervention.id !== parsed.interventionOutcome.interventionId) {
      return Response.json({ error: '原介入 ID 与 source_record 不匹配' }, { status: 400 });
    }

    if (originalIntervention.accountId !== id || originalIntervention.orgId !== ctx.orgId) {
      return Response.json({ error: '原介入不属于当前 account/org，已拒绝写入' }, { status: 400 });
    }

    if (parsed.interventionOutcome.opportunityId && parsed.interventionOutcome.opportunityId !== originalIntervention.opportunityId) {
      return Response.json({ error: '介入结果 opportunity 与原介入不匹配' }, { status: 400 });
    }

    if (!hasOutcomePermission(ctx, originalIntervention.type)) {
      return Response.json({ error: '权限不足，无法记录该级别介入的结果' }, { status: 403 });
    }

    const evidenceRefs = [
      {
        sourceKind: 'source_record' as const,
        sourceId: originalRow.id ?? parsed.interventionOutcome.sourceRecordId,
        sourceTable: 'source_records',
        sourceRowId: originalRow.id ?? parsed.interventionOutcome.sourceRecordId,
        title: '原介入记录',
      },
      ...parsed.interventionOutcome.evidenceRefs,
    ];

    const sourcePointerError = await validateAccountScopedSourcePointers(admin, {
      orgId: ctx.orgId,
      accountId: id,
      refs: evidenceRefs,
    });
    if (sourcePointerError) {
      return Response.json({ error: sourcePointerError }, { status: 400 });
    }

    const interventionOutcome = {
      ...parsed.interventionOutcome,
      opportunityId: parsed.interventionOutcome.opportunityId ?? originalIntervention.opportunityId,
      role: parsed.interventionOutcome.role ?? originalIntervention.role,
      reason: parsed.interventionOutcome.reason ?? originalIntervention.reason,
      evidenceRefs,
    };

    const row: InterventionOutcomeSourceRecordRow = buildInterventionOutcomeSourceRecord({
      orgId: ctx.orgId,
      interventionOutcome,
    });

    const { error } = await admin
      .from('source_records')
      .insert(row);

    if (error) {
      if (isSourceRecordsUnavailable(error)) {
        return Response.json({ error: 'source_records 不可用，无法保存介入结果' }, { status: 503 });
      }
      throw new Error(error.message);
    }

    return Response.json({
      ok: true,
      interventionOutcome,
      message: '介入结果/学习结论已记录到 Judgment Timeline。',
    }, { status: 201 });
  } catch (err) {
    return guardResponse(err);
  }
}
