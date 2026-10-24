import { buildMergePlan, type ImportObjectType } from '@/lib/crm-foundation/import-governance';
import { requireAdmin, requireAuth, requireRole, guardResponse } from '@/lib/api-guard';
import { dbLogActivity } from '@/lib/db-server';
import { safeCatch } from '@/lib/error-monitor';

interface MergeRequest {
  objectType: ImportObjectType;
  importJobId?: string | null;
  rowIndex: number;
  existingId: string;
  incoming: Record<string, string>;
  importedName?: string;
  rationale?: string;
}

function isMissingTableError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; hint?: string } | null;
  const text = (candidate?.message ?? '') + ' ' + (candidate?.hint ?? '');
  return candidate?.code === 'PGRST205' || /import_rows|merge_decisions/i.test(text);
}

function entityLabel(type: ImportObjectType): 'account' | 'contact' {
  return type === 'accounts' ? 'account' : 'contact';
}

function selectColumns(type: ImportObjectType): string {
  if (type === 'accounts') return 'id, name, industry, website, notes';
  return 'id, name, email, phone, title, role, department, linkedin, personal_notes';
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, 'admin');
    const admin = requireAdmin();
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '20') || 20, 1), 100);

    const { data, error } = await admin
      .from('merge_decisions')
      .select('id, import_job_id, import_row_index, decision, decided_by, decided_at, rationale, metadata')
      .eq('org_id', ctx.orgId)
      .order('decided_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingTableError(error)) {
        return Response.json({ decisions: [], skipped: true, reason: 'import_governance_tables_missing' }, { status: 202 });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ decisions: data ?? [] });
  } catch (err) {
    return guardResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, 'admin');
    const admin = requireAdmin();
    const body = await request.json() as MergeRequest;

    if (body.objectType !== 'accounts' && body.objectType !== 'contacts') {
      return Response.json({ error: '不支持的合并对象' }, { status: 400 });
    }
    if (!body.existingId?.trim()) {
      return Response.json({ error: '缺少现有记录 ID' }, { status: 400 });
    }
    if (!Number.isInteger(body.rowIndex) || body.rowIndex < 0) {
      return Response.json({ error: '导入行号无效' }, { status: 400 });
    }

    const table = body.objectType;
    const { data: existing, error: existingError } = await admin
      .from(table)
      .select(selectColumns(body.objectType))
      .eq('org_id', ctx.orgId)
      .eq('id', body.existingId)
      .single();

    if (existingError || !existing) {
      return Response.json({ error: existingError?.message ?? '现有记录不存在' }, { status: 404 });
    }

    const plan = buildMergePlan({
      type: body.objectType,
      existingId: body.existingId,
      incoming: body.incoming ?? {},
      existing: existing as unknown as Record<string, string | null | undefined>,
    });

    if (Object.keys(plan.updates).length > 0) {
      const { error: updateError } = await admin
        .from(table)
        .update(plan.updates)
        .eq('org_id', ctx.orgId)
        .eq('id', body.existingId);

      if (updateError) {
        return Response.json({ error: updateError.message }, { status: 500 });
      }
    }

    let governanceSkipped = false;
    if (body.importJobId) {
      const decisionWrite = await admin.from('merge_decisions').insert({
        org_id: ctx.orgId,
        import_job_id: body.importJobId,
        import_row_index: body.rowIndex,
        decision: 'merge',
        decided_by: ctx.userId,
        rationale: body.rationale ?? null,
        metadata: {
          objectType: body.objectType,
          entityType: entityLabel(body.objectType),
          existingId: body.existingId,
          importedName: body.importedName ?? null,
          updates: plan.updates,
          filled: plan.filled,
          conflicts: plan.conflicts,
        },
      });

      if (decisionWrite.error) {
        if (isMissingTableError(decisionWrite.error)) {
          governanceSkipped = true;
        } else {
          return Response.json({ error: decisionWrite.error.message }, { status: 500 });
        }
      }

      if (!governanceSkipped) {
        const rowWrite = await admin
          .from('import_rows')
          .update({
            result_status: Object.keys(plan.updates).length > 0 ? 'updated' : 'skipped',
            result_entity_type: entityLabel(body.objectType),
            result_entity_id: body.existingId,
            error_message: plan.conflicts.length > 0 ? 'conflicts_preserved' : null,
          })
          .eq('org_id', ctx.orgId)
          .eq('import_job_id', body.importJobId)
          .eq('row_index', body.rowIndex);

        if (rowWrite.error) {
          if (isMissingTableError(rowWrite.error)) {
            governanceSkipped = true;
          } else {
            return Response.json({ error: rowWrite.error.message }, { status: 500 });
          }
        }
      }
    }

    dbLogActivity({
      userId: ctx.userId,
      orgId: ctx.orgId,
      actionType: 'data_merged',
      entityType: entityLabel(body.objectType),
      entityId: body.existingId,
      entityName: (existing as { name?: string }).name ?? body.importedName ?? body.existingId,
      summary: '导入行合并到现有' + (body.objectType === 'accounts' ? '客户' : '联系人') + ': ' + ((existing as { name?: string }).name ?? body.importedName ?? body.existingId),
      metadata: {
        importJobId: body.importJobId ?? null,
        rowIndex: body.rowIndex,
        updates: plan.updates,
        filled: plan.filled,
        conflicts: plan.conflicts,
        governanceSkipped,
      },
    }).catch(safeCatch('import-governance-merge', 'audit-log', { existingId: body.existingId }));

    return Response.json({
      success: true,
      plan,
      skipped: governanceSkipped,
      reason: governanceSkipped ? 'import_governance_tables_missing' : undefined,
    });
  } catch (err) {
    return guardResponse(err);
  }
}
