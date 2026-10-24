import { isNativeDatabase } from '@/lib/database-backend';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guard';

/**
 * Resolves ghost auth.users entries created by old inviteUserByEmail calls.
 * When a user tries to register with an invitation token but their email
 * already exists in auth.users (ghost entry with no password), this endpoint
 * sets their password and confirms their email so they can sign in.
 */
export async function POST(request: Request) {
  if (isNativeDatabase()) return NextResponse.json({ error: 'This account already exists. Sign in or use password recovery before accepting the invitation.' }, { status: 409 });
  try {
    const { email, password, invitationToken } = await request.json();

    if (!email || !password || !invitationToken) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }

    const admin = requireAdmin();

    // Verify invitation exists, matches email, and is not yet accepted
    const { data: invitation } = await admin
      .from('org_invitations')
      .select('id, email')
      .eq('token', invitationToken)
      .is('accepted_at', null)
      .single();

    if (!invitation || invitation.email !== email.toLowerCase()) {
      return NextResponse.json({ error: '邀请无效或邮箱不匹配' }, { status: 400 });
    }

    // Find the ghost user via direct postgres query
    let existingUserId: string | null = null;
    try {
      const { queryOne } = await import('@/lib/postgres');
      const row = await queryOne<{ id: string }>(
        'SELECT id FROM auth.users WHERE lower(email) = lower($1) LIMIT 1',
        [email],
      );
      existingUserId = row?.id ?? null;
    } catch {
      // If postgres not available, this endpoint can't help
      return NextResponse.json({ error: '无法查询用户' }, { status: 503 });
    }

    if (!existingUserId) {
      return NextResponse.json({ error: '未找到用户记录' }, { status: 404 });
    }

    // Update the ghost user: set password and confirm email
    const { error: updateErr } = await admin.auth.admin.updateUserById(existingUserId, {
      password,
      email_confirm: true,
    });

    if (updateErr) {
      console.error('[resolve-invited-user] Update failed:', updateErr.message);
      return NextResponse.json({ error: '更新用户失败' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[resolve-invited-user] Failed:', e);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
