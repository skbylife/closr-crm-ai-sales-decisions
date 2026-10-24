import { getAuthUser, unauthorizedResponse } from '@/lib/api-auth';
import { requireAdmin, guardResponse } from '@/lib/api-guard';
import { getUserContext } from '@/lib/permissions-server';
import { dbLogActivity } from '@/lib/db-server';
import { recordComplianceAudit } from '@/lib/compliance-audit';
import { safeCatch } from '@/lib/error-monitor';
import { toCsvString } from '@/lib/export-csv';

type ExportType = 'accounts' | 'contacts' | 'opportunities' | 'intel';

const EXPORT_CONFIGS: Record<ExportType, {
  table: string;
  headers: string[];
  columns: string[];
  select: string;
}> = {
  accounts: {
    table: 'accounts',
    headers: ['名称', '行业', '网站', '负责人', '创建时间'],
    columns: ['name', 'industry', 'website', 'owner_id', 'created_at'],
    select: 'id, name, industry, website, owner_id, created_at',
  },
  contacts: {
    table: 'contacts',
    headers: ['姓名', '邮箱', '电话', '职位', '部门', '创建时间'],
    columns: ['name', 'email', 'phone', 'title', 'department', 'created_at'],
    select: 'id, name, email, phone, title, department, account_id, user_id, created_at',
  },
  opportunities: {
    table: 'opportunities',
    headers: ['名称', '阶段', '金额', '概率', '预计关闭日期', '创建时间'],
    columns: ['name', 'stage', 'value', 'probability', 'expected_close_date', 'created_at'],
    select: 'id, name, stage, value, probability, expected_close_date, account_id, user_id, created_at',
  },
  intel: {
    table: 'intel_items',
    headers: ['标题', '类型', '来源', '内容', '创建时间'],
    columns: ['title', 'type', 'source', 'content', 'created_at'],
    select: 'id, title, type, source, content, account_id, user_id, created_at',
  },
};

type ExportRow = Record<string, unknown>;

function getVisibleUserIds(ctx: { userId: string; orgRole: string; jobLevel: number; teamMemberIds: string[] }): string[] | null {
  if (ctx.orgRole === 'owner' || ctx.orgRole === 'admin' || ctx.jobLevel >= 2) return null;
  if (ctx.jobLevel === 1) return ctx.teamMemberIds.length > 0 ? ctx.teamMemberIds : [ctx.userId];
  return [ctx.userId];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyAccountOwnerFilter(query: any, visibleUserIds: string[] | null) {
  if (!visibleUserIds) return query;
  const idList = visibleUserIds.join(',');
  return query.or(`owner_id.in.(${idList}),and(owner_id.is.null,user_id.in.(${idList})),and(owner_id.is.null,user_id.is.null)`);
}

function isRowVisibleByAccount(row: ExportRow, visibleAccountIds: Set<string> | null, visibleUserIds: string[] | null): boolean {
  if (!visibleAccountIds || !visibleUserIds) return true;
  const accountId = typeof row.account_id === 'string' ? row.account_id : null;
  if (accountId) return visibleAccountIds.has(accountId);
  const rowUserId = typeof row.user_id === 'string' ? row.user_id : null;
  return rowUserId ? visibleUserIds.includes(rowUserId) : true;
}

export async function GET(request: Request) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return unauthorizedResponse();

    const ctx = await getUserContext(authUser.id);
    if (!ctx) return Response.json({ error: 'No org context' }, { status: 400 });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as ExportType | null;

    if (!type || !EXPORT_CONFIGS[type]) {
      return Response.json({ error: '无效的导出类型，支持: accounts, contacts, opportunities, intel' }, { status: 400 });
    }

    const config = EXPORT_CONFIGS[type];
    const admin = requireAdmin();

    const visibleUserIds = getVisibleUserIds(ctx);
    let visibleAccountIds: Set<string> | null = null;

    if (visibleUserIds) {
      const { data: accountRows, error: accountScopeError } = await applyAccountOwnerFilter(
        admin.from('accounts').select('id, owner_id, user_id').eq('org_id', ctx.orgId),
        visibleUserIds,
      );
      if (accountScopeError) return Response.json({ error: accountScopeError.message }, { status: 500 });
      visibleAccountIds = new Set(((accountRows ?? []) as { id: string }[]).map(row => row.id));
    }

    let query = admin
      .from(config.table)
      .select(config.select)
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false })
      .limit(10000);

    // 权限过滤：导出必须与 account 可见性对齐，避免通过 contact/opportunity/intel 的 user_id 绕过 account scope。
    if (type === 'accounts') {
      query = applyAccountOwnerFilter(query, visibleUserIds);
    }

    const { data, error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const scopedRows = ((data ?? []) as unknown as ExportRow[]).filter(row =>
      type === 'accounts' || isRowVisibleByAccount(row, visibleAccountIds, visibleUserIds)
    );

    const rows = scopedRows.map((row: Record<string, unknown>) =>
      config.columns.map(col => String(row[col] ?? ''))
    );

    const csv = '\uFEFF' + toCsvString(config.headers, rows);

    // 审计日志
    dbLogActivity({
      userId: authUser.id,
      orgId: ctx.orgId,
      actionType: 'data_exported',
      entityType: type,
      summary: `导出 ${type} 数据，共 ${rows.length} 条`,
      metadata: { exportType: type, rowCount: rows.length },
    }).catch(safeCatch('export', 'audit-log', { exportType: type, rowCount: rows.length }));

    await recordComplianceAudit({
      admin,
      ctx,
      action: 'data_exported',
      objectType: type,
      recordName: `${type}_csv_export`,
      request,
      changes: {
        exportType: type,
        rowCount: rows.length,
        scope: visibleUserIds ? 'scoped' : 'organization',
      },
    });

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${type}-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (err) {
    return guardResponse(err);
  }
}
