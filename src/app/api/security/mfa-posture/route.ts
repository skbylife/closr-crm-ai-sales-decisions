import { NextResponse } from 'next/server';
import { requireAdmin, requireAuth, requireRole, guardResponse } from '@/lib/api-guard';
import { buildPrivilegedMfaStatus, summarizePrivilegedMfaPosture } from '@/lib/mfa-posture';

type PrivilegedRole = 'owner' | 'admin';

interface MembershipRow {
  user_id: string;
  role: PrivilegedRole;
}

export async function GET() {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, 'admin');

    const admin = requireAdmin();
    const { data: memberships, error } = await admin
      .from('org_memberships')
      .select('user_id, role')
      .eq('org_id', ctx.orgId)
      .in('role', ['owner', 'admin']);

    if (error) {
      console.error('[api/security/mfa-posture] membership lookup failed:', error);
      return NextResponse.json({ error: '无法读取高权限成员' }, { status: 500 });
    }

    const subjects = await Promise.all(
      ((memberships ?? []) as MembershipRow[]).map(async (membership) => {
        const { data, error: userError } = await admin.auth.admin.getUserById(membership.user_id);
        if (userError) {
          console.warn('[api/security/mfa-posture] auth user lookup failed:', {
            userId: membership.user_id,
            message: userError.message,
          });
        }

        return buildPrivilegedMfaStatus({
          userId: membership.user_id,
          role: membership.role,
          user: data?.user ?? null,
        });
      }),
    );

    const summary = summarizePrivilegedMfaPosture(subjects);

    return NextResponse.json({
      orgId: ctx.orgId,
      generatedAt: new Date().toISOString(),
      summary,
      subjects,
      nonClaims: [
        'This endpoint reports Supabase verified MFA factors visible to the service role for current owner/admin members.',
        'Customer-approved MFA exception records are not implemented yet; missing privileged MFA is reported as fail.',
      ],
    });
  } catch (err) {
    return guardResponse(err);
  }
}
