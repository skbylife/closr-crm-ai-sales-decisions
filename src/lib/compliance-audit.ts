import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserContext } from '@/lib/permissions';

type AuditClient = SupabaseClient<any, 'public', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function recordComplianceAudit(params: {
  admin: AuditClient;
  ctx: Pick<UserContext, 'orgId' | 'userId'>;
  action: string;
  objectType: string;
  recordId?: string | null;
  recordName?: string | null;
  changes?: Record<string, unknown> | null;
  request?: Request;
}): Promise<void> {
  try {
    await params.admin.from('audit_log').insert({
      org_id: params.ctx.orgId,
      user_id: params.ctx.userId,
      action: params.action,
      object_type: params.objectType,
      record_id: params.recordId ?? null,
      record_name: params.recordName ?? null,
      changes: params.changes ?? {},
      ip_address: params.request ? getClientIp(params.request) : null,
    });
  } catch (err) {
    // Audit logging is evidence-critical but should not turn a completed
    // authorized operation into an inconsistent user-facing failure.
    console.error('[compliance-audit] write failed:', err);
  }
}

function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || null;
  return request.headers.get('x-real-ip');
}

export async function recordAuthAuditForUser(params: {
  admin: AuditClient;
  userId: string;
  action: string;
  request?: Request;
  recordName?: string | null;
  changes?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const { data: membership } = await params.admin
      .from('org_memberships')
      .select('org_id')
      .eq('user_id', params.userId)
      .limit(1)
      .maybeSingle();

    const orgId = (membership?.org_id as string | undefined) ?? null;
    if (!orgId) return;

    await recordComplianceAudit({
      admin: params.admin,
      ctx: { orgId, userId: params.userId },
      action: params.action,
      objectType: 'auth_session',
      recordId: params.userId,
      recordName: params.recordName ?? params.userId,
      request: params.request,
      changes: params.changes ?? {},
    });
  } catch (err) {
    console.error('[compliance-audit] auth audit failed:', err);
  }
}
