import { NextResponse } from 'next/server';
import { guardResponse, requireAdmin, requireAuth } from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';

const AUTH_AUDIT_EVENTS = new Set([
  'login_success',
  'logout',
  'password_reset_completed',
  'invitation_accepted',
  'auth_callback_success',
  'mfa_enabled',
  'mfa_disabled',
]);

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = await request.json().catch(() => ({})) as {
      event?: unknown;
      email?: unknown;
      metadata?: unknown;
    };

    const event = typeof body.event === 'string' ? body.event : '';
    if (!AUTH_AUDIT_EVENTS.has(event)) {
      return NextResponse.json({ error: 'Invalid auth audit event' }, { status: 400 });
    }

    const admin = requireAdmin();
    const email = normalizeEmail(body.email);

    await recordComplianceAudit({
      admin,
      ctx,
      action: event,
      objectType: 'auth_session',
      recordId: ctx.userId,
      recordName: email || ctx.userId,
      request,
      changes: {
        source: 'auth_audit_event',
        metadata: typeof body.metadata === 'object' && body.metadata !== null ? body.metadata : {},
      },
    });

    return NextResponse.json({ ok: true, recorded: true });
  } catch (err) {
    return guardResponse(err);
  }
}
