import { requireAuth, requireRole, requireAdmin, guardResponse } from '@/lib/api-guard';

interface AuditLogItem {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  objectType: string | null;
  recordId: string | null;
  recordName: string | null;
  accountName: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  source: 'activity_logs' | 'audit_log';
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, 'admin');
    const admin = requireAdmin();

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const objectType = searchParams.get('objectType');
    const userId = searchParams.get('userId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const search = searchParams.get('search');
    const limit = Math.min(Number(searchParams.get('limit') || 200), 1000);
    const offset = Number(searchParams.get('offset') || 0);

    // Query activity_logs (user activity trail) for org.
    let activityQuery = admin
      .from('activity_logs')
      .select('*')
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false });

    if (action) activityQuery = activityQuery.eq('action_type', action);
    if (objectType) activityQuery = activityQuery.eq('entity_type', objectType);
    if (userId) activityQuery = activityQuery.eq('user_id', userId);
    if (from) activityQuery = activityQuery.gte('created_at', from);
    if (to) activityQuery = activityQuery.lte('created_at', to);
    if (search) {
      // Strip PostgREST operator chars to prevent filter injection
      const safeSearch = search.replace(/[,.()*%\\]/g, '').slice(0, 100);
      if (safeSearch) {
        activityQuery = activityQuery.or(`entity_name.ilike.%${safeSearch}%,summary.ilike.%${safeSearch}%,user_display_name.ilike.%${safeSearch}%`);
      }
    }

    activityQuery = activityQuery.range(0, offset + limit - 1);

    // Query audit_log (security/ownership/admin trail) and merge locally so
    // enterprise audit sees transfer/reclaim events alongside user activity.
    let securityQuery = admin
      .from('audit_log')
      .select('*')
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false });

    if (action) securityQuery = securityQuery.eq('action', action);
    if (objectType) securityQuery = securityQuery.eq('object_type', objectType);
    if (userId) securityQuery = securityQuery.eq('user_id', userId);
    if (from) securityQuery = securityQuery.gte('created_at', from);
    if (to) securityQuery = securityQuery.lte('created_at', to);
    if (search) {
      const safeSearch = search.replace(/[,.()*%\\]/g, '').slice(0, 100);
      if (safeSearch) {
        securityQuery = securityQuery.or(`record_name.ilike.%${safeSearch}%`);
      }
    }
    securityQuery = securityQuery.range(0, offset + limit - 1);

    const [activityRes, securityRes] = await Promise.all([activityQuery, securityQuery]);
    if (activityRes.error) return Response.json({ logs: [], error: activityRes.error.message }, { status: 500 });
    if (securityRes.error) return Response.json({ logs: [], error: securityRes.error.message }, { status: 500 });

    const activityLogs: AuditLogItem[] = (activityRes.data ?? []).map((l: Record<string, unknown>) => ({
      id: l.id as string,
      userId: l.user_id as string | null,
      userName: l.user_display_name as string | null,
      action: l.action_type as string,
      objectType: l.entity_type as string | null,
      recordId: l.entity_id as string | null,
      recordName: l.entity_name as string | null,
      accountName: l.account_name as string | null,
      summary: l.summary as string | null,
      metadata: l.metadata as Record<string, unknown> | null,
      createdAt: l.created_at as string,
      source: 'activity_logs',
    }));
    const securityLogs: AuditLogItem[] = (securityRes.data ?? []).map((l: Record<string, unknown>) => ({
      id: l.id as string,
      userId: l.user_id as string | null,
      userName: null,
      action: l.action as string,
      objectType: l.object_type as string | null,
      recordId: l.record_id as string | null,
      recordName: l.record_name as string | null,
      accountName: null,
      summary: `${l.action as string}: ${(l.record_name as string | null) ?? (l.record_id as string | null) ?? ''}`.trim(),
      metadata: (l.changes as Record<string, unknown> | null) ?? null,
      createdAt: l.created_at as string,
      source: 'audit_log',
    }));

    const logs = [...activityLogs, ...securityLogs]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(offset, offset + limit);

    return Response.json({ logs });
  } catch (err) {
    return guardResponse(err);
  }
}
