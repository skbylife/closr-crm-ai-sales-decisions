import { requireAdmin, requireAuth, guardResponse } from '@/lib/api-guard';
import { dbLogActivity } from '@/lib/db-server';
import { safeCatch } from '@/lib/error-monitor';

type ImportAction = 'create' | 'update' | 'skip' | 'conflict';
type ImportJobStatus = 'previewed' | 'published' | 'failed';

interface ImportGovernanceRequest {
  objectType: 'accounts' | 'contacts' | 'leads';
  sourceFilename?: string;
  status?: ImportJobStatus;
  rowCount: number;
  counts: Record<ImportAction, number>;
  mapping: Record<string, string>;
  rows: Array<{
    rowIndex: number;
    sourceValues: Record<string, string>;
    mappedValues: Record<string, string>;
    plannedAction: ImportAction;
  }>;
  duplicates?: Array<{
    rowIndex: number;
    importedName: string;
    existingId?: string;
    existingName: string;
    matchType: 'name' | 'email' | 'website';
    confidence: 'high' | 'medium';
    recommendation: 'merge' | 'review';
  }>;
  decisions?: Record<number, ImportAction>;
  findings?: Array<{
    rowIndex: number;
    field: string;
    label: string;
    detail: string;
    severity: 'high' | 'medium' | 'low';
  }>;
}

function isMissingTableError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; hint?: string } | null;
  const text = (candidate?.message ?? '') + ' ' + (candidate?.hint ?? '');
  return candidate?.code === 'PGRST205' || /import_jobs|import_rows|field_mappings|duplicate_candidates|merge_decisions|data_quality_findings/i.test(text);
}

function mapDecision(action: ImportAction): 'merge' | 'keep_both' | 'skip' | 'defer' {
  if (action === 'update') return 'merge';
  if (action === 'create') return 'keep_both';
  if (action === 'skip') return 'skip';
  return 'defer';
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '5') || 5, 1), 20);

    const { data, error } = await admin
      .from('import_jobs')
      .select('id, object_type, source_filename, status, row_count, create_count, update_count, conflict_count, skip_count, finding_count, created_at, published_at')
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingTableError(error)) {
        return Response.json({ jobs: [], skipped: true, reason: 'import_governance_tables_missing' }, { status: 202 });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    const jobs = (data ?? []).map((row) => ({
      id: row.id,
      objectType: row.object_type,
      sourceFilename: row.source_filename,
      status: row.status,
      rowCount: row.row_count,
      createCount: row.create_count,
      updateCount: row.update_count,
      conflictCount: row.conflict_count,
      skipCount: row.skip_count,
      findingCount: row.finding_count,
      createdAt: row.created_at,
      publishedAt: row.published_at,
    }));

    return Response.json({ jobs });
  } catch (err) {
    return guardResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const body = await request.json() as ImportGovernanceRequest;

    if (body.objectType !== 'accounts' && body.objectType !== 'contacts' && body.objectType !== 'leads') {
      return Response.json({ error: '不支持的导入对象' }, { status: 400 });
    }

    const { data: job, error: jobError } = await admin
      .from('import_jobs')
      .insert({
        org_id: ctx.orgId,
        user_id: ctx.userId,
        object_type: body.objectType,
        source_filename: body.sourceFilename ?? null,
        status: body.status ?? 'previewed',
        row_count: body.rowCount,
        create_count: body.counts.create ?? 0,
        update_count: body.counts.update ?? 0,
        conflict_count: body.counts.conflict ?? 0,
        skip_count: body.counts.skip ?? 0,
        finding_count: body.findings?.length ?? 0,
        metadata: { source: 'csv_import_governance' },
        published_at: body.status === 'published' ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    if (jobError || !job?.id) {
      if (isMissingTableError(jobError)) {
        return Response.json({ skipped: true, reason: 'import_governance_tables_missing' }, { status: 202 });
      }
      return Response.json({ error: jobError?.message ?? '导入批次保存失败' }, { status: 500 });
    }

    const jobId = job.id as string;

    const mappingRows = Object.entries(body.mapping)
      .filter(([, sourceField]) => Boolean(sourceField))
      .map(([closrField, sourceField]) => ({
        org_id: ctx.orgId,
        import_job_id: jobId,
        object_type: body.objectType,
        closr_field: closrField,
        source_field: sourceField,
        required: closrField === 'name' || closrField === 'company',
      }));

    const importRows = body.rows.map((row) => ({
      org_id: ctx.orgId,
      import_job_id: jobId,
      row_index: row.rowIndex,
      source_values: row.sourceValues,
      mapped_values: row.mappedValues,
      planned_action: row.plannedAction,
      result_status: row.plannedAction === 'create' && body.status === 'published' ? 'created' : row.plannedAction === 'skip' ? 'skipped' : 'pending',
      result_entity_type: null,
      result_entity_id: null,
    }));

    const duplicateRows = (body.duplicates ?? []).map((candidate) => ({
      org_id: ctx.orgId,
      import_job_id: jobId,
      import_row_index: candidate.rowIndex,
      imported_name: candidate.importedName,
      existing_entity_type: body.objectType === 'accounts' ? 'account' : body.objectType === 'contacts' ? 'contact' : 'lead',
      existing_entity_id: candidate.existingId || null,
      existing_name: candidate.existingName,
      match_type: candidate.matchType,
      confidence: candidate.confidence,
      recommendation: candidate.recommendation,
    }));

    const decisionRows = Object.entries(body.decisions ?? {}).map(([rowIndex, action]) => ({
      org_id: ctx.orgId,
      import_job_id: jobId,
      import_row_index: Number(rowIndex),
      decision: mapDecision(action),
      decided_by: ctx.userId,
      rationale: null,
      metadata: { importAction: action },
    }));

    const findingRows = (body.findings ?? []).map((finding) => ({
      org_id: ctx.orgId,
      import_job_id: jobId,
      import_row_index: finding.rowIndex,
      field: finding.field,
      severity: finding.severity,
      label: finding.label,
      detail: finding.detail,
      created_by: ctx.userId,
    }));

    const writes = [
      mappingRows.length ? admin.from('field_mappings').insert(mappingRows) : null,
      importRows.length ? admin.from('import_rows').insert(importRows) : null,
      duplicateRows.length ? admin.from('duplicate_candidates').insert(duplicateRows) : null,
      decisionRows.length ? admin.from('merge_decisions').insert(decisionRows) : null,
      findingRows.length ? admin.from('data_quality_findings').insert(findingRows) : null,
    ].filter(Boolean);

    for (const write of writes) {
      const { error } = await write!;
      if (error) {
        if (isMissingTableError(error)) {
          return Response.json({ skipped: true, reason: 'import_governance_tables_missing', jobId }, { status: 202 });
        }
        return Response.json({ error: error.message, jobId }, { status: 500 });
      }
    }

    dbLogActivity({
      userId: ctx.userId,
      orgId: ctx.orgId,
      actionType: body.status === 'published' ? 'import_published' : 'import_previewed',
      entityType: 'import_job',
      entityId: jobId,
      entityName: body.sourceFilename ?? body.objectType,
      summary: '导入治理批次: ' + body.objectType + ' ' + body.rowCount + ' 行',
      metadata: {
        counts: body.counts,
        duplicateCount: body.duplicates?.length ?? 0,
        findingCount: body.findings?.length ?? 0,
      },
    }).catch(safeCatch('import-governance', 'audit-log', { jobId }));

    return Response.json({ success: true, jobId });
  } catch (err) {
    return guardResponse(err);
  }
}
