import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { dbAcceptInvitation, dbMigrateUserDataToOrg } from '@/lib/db-server';
import { requireAdmin } from '@/lib/api-guard';
import { recordAuthAuditForUser } from '@/lib/compliance-audit';

function getAppBaseUrl(request: Request) {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }

  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const baseUrl = getAppBaseUrl(request);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';
  const invitationToken = searchParams.get('invitation');

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const userId = data.user.id;
      await recordAuthAuditForUser({
        admin: requireAdmin(),
        userId,
        action: 'auth_callback_success',
        request,
        recordName: data.user.email ?? userId,
        changes: { next, hasInvitationToken: Boolean(invitationToken) },
      });

      // Recovery flow: if the user just verified a password reset token,
      // always go to /reset-password regardless of `next` param
      // (Supabase may strip query params from redirect_to during verify)
      const isRecovery = next === '/reset-password'
        || (data.user.recovery_sent_at
          && Date.now() - new Date(data.user.recovery_sent_at).getTime() < 600_000);
      if (isRecovery) {
        return NextResponse.redirect(`${baseUrl}/reset-password`);
      }

      // Check if user has an invitation token
      if (invitationToken) {
        const result = await dbAcceptInvitation(invitationToken, userId);
        if (result) {
          // Migrate any existing data to the org
          await dbMigrateUserDataToOrg(userId, result.orgId);
          return NextResponse.redirect(`${baseUrl}${next}`);
        }
        // Invitation failed (expired, already used) — fall through to onboarding
      }

      // Check if user already has an org
      const { data: memberships } = await supabase
        .from('org_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .limit(1);

      if (memberships && memberships.length > 0) {
        // Already has an org, go to dashboard
        return NextResponse.redirect(`${baseUrl}${next}`);
      }

      // No org — redirect to onboarding to create one
      return NextResponse.redirect(`${baseUrl}/onboarding`);
    }
  }

  // Return to login with error
  return NextResponse.redirect(`${baseUrl}/login?error=auth_callback_failed`);
}
