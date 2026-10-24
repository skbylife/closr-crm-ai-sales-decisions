import { requireAuth, requireAccountAccess, requireAdmin, guardResponse } from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';

export const dynamic = 'force-dynamic';

// GET — 列出 RFP 的文档
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(request.url);
    const rfpId = searchParams.get('rfpId');

    if (!rfpId) return Response.json({ error: '缺少 rfpId' }, { status: 400 });

    const admin = requireAdmin();

    // 校验 RFP 存在 + 权限
    const { data: rfp } = await admin
      .from('rfps')
      .select('account_id')
      .eq('id', rfpId)
      .eq('org_id', ctx.orgId)
      .single();

    if (!rfp) return Response.json({ error: 'RFP 不存在' }, { status: 404 });
    await requireAccountAccess(ctx, rfp.account_id);

    const { data, error } = await admin
      .from('rfp_documents')
      .select('*')
      .eq('rfp_id', rfpId)
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[rfps/documents] Query failed:', error);
      return Response.json({ documents: [] });
    }

    const documents = (data ?? []).map(mapDocRow);
    return Response.json({ documents });
  } catch (err) {
    console.error('[rfps/documents] GET error:', err);
    return guardResponse(err);
  }
}

// POST — 添加文档元数据
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    const body = await request.json() as {
      rfpId: string;
      name: string;
      docType?: 'rfp' | 'response' | 'clarification' | 'amendment' | 'other';
      url?: string;
      fileSize?: number;
    };

    if (!body.rfpId || !body.name) {
      return Response.json({ error: '缺少必填字段（rfpId, name）' }, { status: 400 });
    }

    const admin = requireAdmin();

    const { data: rfp } = await admin
      .from('rfps')
      .select('account_id')
      .eq('id', body.rfpId)
      .eq('org_id', ctx.orgId)
      .single();

    if (!rfp) return Response.json({ error: 'RFP 不存在' }, { status: 404 });
    await requireAccountAccess(ctx, rfp.account_id);

    // URL scheme validation
    if (body.url) {
      try {
        const parsed = new URL(body.url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return Response.json({ error: 'URL 协议不合法（仅支持 http/https）' }, { status: 400 });
        }
      } catch {
        return Response.json({ error: 'URL 格式不正确' }, { status: 400 });
      }
    }

    const { data, error } = await admin
      .from('rfp_documents')
      .insert({
        org_id: ctx.orgId,
        rfp_id: body.rfpId,
        name: body.name,
        doc_type: body.docType ?? 'other',
        url: body.url ?? null,
        file_size: body.fileSize ?? null,
        uploaded_by: ctx.userId,
      })
      .select()
      .single();

    if (error) {
      console.error('[rfps/documents] Insert failed:', error);
      return Response.json({ error: '添加文档失败' }, { status: 500 });
    }

    return Response.json({ document: mapDocRow(data) });
  } catch (err) {
    console.error('[rfps/documents] POST error:', err);
    return guardResponse(err);
  }
}

// DELETE — 删除文档
export async function DELETE(request: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) return Response.json({ error: '缺少 documentId' }, { status: 400 });

    const admin = requireAdmin();

    // 校验文档存在 + 权限
    const { data: doc } = await admin
      .from('rfp_documents')
      .select('rfp_id, name')
      .eq('id', documentId)
      .eq('org_id', ctx.orgId)
      .single();

    if (!doc) return Response.json({ error: '文档不存在' }, { status: 404 });

    const { data: rfp } = await admin
      .from('rfps')
      .select('account_id')
      .eq('id', doc.rfp_id)
      .eq('org_id', ctx.orgId)
      .single();

    if (!rfp) return Response.json({ error: 'RFP 不存在' }, { status: 404 });
    await requireAccountAccess(ctx, rfp.account_id);

    const { error } = await admin
      .from('rfp_documents')
      .delete()
      .eq('id', documentId)
      .eq('org_id', ctx.orgId);

    if (error) return Response.json({ error: '删除失败' }, { status: 500 });
    await recordComplianceAudit({
      admin,
      ctx,
      action: 'rfp_document_deleted',
      objectType: 'rfp_document',
      recordId: documentId,
      recordName: (doc.name as string | null) ?? documentId,
      request,
      changes: { rfpId: doc.rfp_id, accountId: rfp.account_id },
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[rfps/documents] DELETE error:', err);
    return guardResponse(err);
  }
}

// ─── Helper ──────────────────────────────────────────────────────────

function mapDocRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    rfpId: row.rfp_id,
    name: row.name,
    docType: row.doc_type,
    url: row.url ?? null,
    fileSize: row.file_size ?? null,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}
