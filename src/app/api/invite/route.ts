import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';

const VALID_ROLES = ['admin', 'manager', 'member'] as const;
const MFA_SETUP_PATH = '/settings?tab=security';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error ?? 'unknown_error');
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { email, role, jobTitle, jobLevel, orgId } = await request.json();

    // Validate
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: '请输入有效的邮箱地址' }, { status: 400 });
    }
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: '请选择有效的组织角色' }, { status: 400 });
    }
    if (!Number.isInteger(jobLevel) || jobLevel < 0 || jobLevel > 4) {
      return NextResponse.json({ error: '请选择成员职级' }, { status: 400 });
    }
    if (!orgId) {
      return NextResponse.json({ error: '缺少组织 ID' }, { status: 400 });
    }

    // Check caller's permission (must be owner or admin)
    const { data: membership } = await supabase
      .from('org_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }

    // Admin cannot invite admin
    if (membership.role === 'admin' && role === 'admin') {
      return NextResponse.json({ error: 'Admin 不能邀请 Admin' }, { status: 403 });
    }

    // Check if already a member
    const admin = requireAdmin();

    // Check for existing pending invitation
    const { data: existingInv } = await admin
      .from('org_invitations')
      .select('id')
      .eq('org_id', orgId)
      .eq('email', email.toLowerCase())
      .is('accepted_at', null)
      .limit(1);

    if (existingInv && existingInv.length > 0) {
      return NextResponse.json({ error: '该邮箱已有待处理的邀请' }, { status: 400 });
    }

    // Create invitation
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invitation, error: insertErr } = await admin
      .from('org_invitations')
      .insert({
        org_id: orgId,
        email: email.toLowerCase(),
        role,
        token,
        invited_by: user.id,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    // Build invitation link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const inviteLink = `${appUrl.replace(/\/$/, '')}/register?invitation=${token}`;



    // Check if user already exists in auth (targeted lookup — avoids listing
    // the entire platform's user table which scales poorly and leaks user count).
    // If DATABASE_URL is not configured (local dev without direct pg access),
    // degrade gracefully to the "new user" path (send invite email).
    let existingUser: { id: string; email: string } | null = null;
    try {
      const { queryOne } = await import('@/lib/postgres');
      existingUser = await queryOne<{ id: string; email: string }>(
        'SELECT id, email FROM auth.users WHERE lower(email) = lower($1) LIMIT 1',
        [email],
      );
    } catch (pgErr) {
      console.warn('[api/invite] auth.users lookup failed, falling back to invite email:', pgErr);
    }

    if (existingUser) {
      // User already registered — add directly to org
      const { data: existingMembership } = await admin
        .from('org_memberships')
        .select('id')
        .eq('user_id', existingUser.id)
        .eq('org_id', orgId)
        .single();

      if (existingMembership) {
        return NextResponse.json({ error: '该用户已是组织成员' }, { status: 400 });
      }

      // Add to org directly
      const memberFields: Record<string, unknown> = {
        user_id: existingUser.id,
        org_id: orgId,
        role,
      };
      if (jobLevel !== undefined) {
        memberFields.job_level = jobLevel;
        memberFields.role_level = jobLevel;
        const levelToTitle: Record<number, string> = { 0: 'ae', 1: 'manager', 2: 'executive', 3: 'executive', 4: 'executive' };
        memberFields.job_title = levelToTitle[jobLevel as number] ?? 'ae';
      } else if (jobTitle) {
        memberFields.job_title = jobTitle;
      }
      await admin.from('org_memberships').insert(memberFields);

      // Mark invitation as accepted
      await admin.from('org_invitations').update({
        accepted_at: new Date().toISOString(),
      }).eq('id', invitation.id);

      return NextResponse.json({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        inviteLink,
        expiresAt,
        directlyAdded: true,
        requiresMfaSetup: role === 'admin',
        mfaSetupPath: role === 'admin' ? MFA_SETUP_PATH : undefined,
        message: '用户已注册，已直接加入组织',
      });
    }

    // User not registered — send invite email via Resend
    let orgName = 'Closr';
    try {
      const { data: org } = await admin.from('organizations').select('name').eq('id', orgId).single();
      if (org?.name) orgName = org.name as string;
    } catch { /* use default */ }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error('[api/invite] RESEND_API_KEY not configured');
    } else {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${orgName} <example-d4b1c9e1e2@example.invalid>`,
            to: [email.toLowerCase()],
            subject: `${orgName} 邀请你加入 Closr`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 8px;">你收到了一份邀请</h2>
                <p style="color: #666; font-size: 14px; line-height: 1.6;">
                  <strong>${user.email}</strong> 邀请你加入 <strong>${orgName}</strong> 的 Closr 团队，角色为 <strong>${role}</strong>。
                </p>
                <a href="${inviteLink}" style="display: inline-block; margin: 24px 0; padding: 12px 28px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
                  接受邀请
                </a>
                <p style="color: #999; font-size: 12px; margin-top: 24px;">
                  此邀请 7 天内有效。如果你不认识发件人，可以忽略此邮件。
                </p>
                ${role === 'admin' ? `
                  <div style="margin-top: 18px; padding: 12px; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px;">
                    <p style="margin: 0; color: #3730a3; font-size: 12px; line-height: 1.5;">
                      重要：管理员账号接受邀请并完成登录后，请前往 Settings &gt; Security 启用两步验证。企业上线前会检查管理员 MFA 状态。
                    </p>
                  </div>
                ` : ''}
                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                <p style="color: #bbb; font-size: 11px;">Closr — AI-Native CRM</p>
              </div>
            `,
          }),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw new Error(`Resend ${res.status}: ${errBody}`);
        }
      } catch (emailErr) {
        const emailErrorMessage = getErrorMessage(emailErr);
        console.error('[api/invite] Email send failed:', emailErrorMessage);
        const failureMessage = '邀请已创建，但邮件发送失败。请手动将邀请链接发给对方。';
        return NextResponse.json({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          inviteLink,
          expiresAt,
          emailFailed: true,
          error: failureMessage,
          message: failureMessage,
          warning: failureMessage,
        }, { status: 502 });
      }
    }

    return NextResponse.json({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      inviteLink,
      expiresAt,
      requiresMfaSetup: role === 'admin',
      mfaSetupPath: role === 'admin' ? MFA_SETUP_PATH : undefined,
    });
  } catch (e) {
    console.error('[api/invite] POST failed:', e);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// GET: List pending invitations for an org
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');
    if (!orgId) {
      return NextResponse.json({ error: '缺少组织 ID' }, { status: 400 });
    }

    // Check membership
    const { data: membership } = await supabase
      .from('org_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single();

    if (!membership) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }

    const { data: invitations } = await supabase
      .from('org_invitations')
      .select('*')
      .eq('org_id', orgId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false });

    return NextResponse.json(invitations ?? []);
  } catch (e) {
    console.error('[api/invite] GET failed:', e);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// DELETE: Revoke a pending invitation
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { invitationId, orgId } = await request.json();
    if (!invitationId || !orgId) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }

    // Check caller's permission
    const { data: membership } = await supabase
      .from('org_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }

    const admin = requireAdmin();

    await admin
      .from('org_invitations')
      .delete()
      .eq('id', invitationId)
      .eq('org_id', orgId);

    await recordComplianceAudit({
      admin,
      ctx: { orgId, userId: user.id },
      action: 'invitation_revoked',
      objectType: 'org_invitation',
      recordId: invitationId,
      recordName: invitationId,
      request,
      changes: {
        invitationId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[api/invite] DELETE failed:', e);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
