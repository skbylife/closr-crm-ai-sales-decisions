import { nativeAuthPost } from '@/lib/native-auth/handler';
import { isNativeDatabase } from '@/lib/database-backend';
import { createNativeServerClient } from '@/lib/native-client/server';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/api-guard';

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const SIGN_IN_RETRY_DELAYS_MS = [0, 250, 750];

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validatePassword(value: unknown): value is string {
  return typeof value === 'string' && PASSWORD_RE.test(value);
}

function createAnonAuthClient() {
  if (isNativeDatabase()) return createNativeServerClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function signInNewUser(email: string, password: string) {
  const authClient = createAnonAuthClient();
  if (!authClient) {
    return { session: null, error: 'Supabase 配置缺失' };
  }

  let lastError = '自动登录失败';
  for (const delay of SIGN_IN_RETRY_DELAYS_MS) {
    if (delay > 0) await sleep(delay);
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (!error && data.session) {
      return { session: data.session, error: null };
    }
    lastError = error?.message ?? lastError;
  }

  return { session: null, error: lastError };
}

export async function POST(request: Request) {
  if (isNativeDatabase()) {
    const response = await nativeAuthPost(request, 'register');
    const result = await response.json();
    return NextResponse.json({ ok: !result.error, session: result.data?.session ?? null, error: result.error?.message }, { status: response.status, headers: response.headers });
  }
  try {
    const body = await request.json().catch(() => ({})) as {
      email?: string;
      password?: string;
      invitationToken?: string | null;
    };

    const email = normalizeEmail(body.email);
    const password = body.password;
    const invitationToken = typeof body.invitationToken === 'string'
      ? body.invitationToken.trim()
      : '';

    if (!invitationToken) {
      return NextResponse.json(
        { error: '公开注册已关闭，请联系销售团队开通账号' },
        { status: 403 },
      );
    }

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: '邮箱格式无效' }, { status: 400 });
    }
    if (!validatePassword(password)) {
      return NextResponse.json({ error: '密码至少 8 位，需包含大小写字母和数字' }, { status: 400 });
    }
    const validPassword = password;

    const admin = requireAdmin();

    if (invitationToken) {
      const { data: invitation } = await admin
        .from('org_invitations')
        .select('id, email')
        .eq('token', invitationToken)
        .is('accepted_at', null)
        .single();

      if (!invitation || String(invitation.email).toLowerCase() !== email) {
        return NextResponse.json({ error: '邀请无效或邮箱不匹配' }, { status: 400 });
      }
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: validPassword,
      email_confirm: true,
      user_metadata: {
        signup_source: 'invitation',
      },
    });

    if (error || !data.user) {
      const message = error?.message ?? '注册失败';
      const alreadyRegistered = /already|registered|exists/i.test(message);
      return NextResponse.json(
        { error: alreadyRegistered ? '该邮箱已注册' : message },
        { status: alreadyRegistered ? 409 : 400 },
      );
    }

    const signInResult = await signInNewUser(email, validPassword);

    return NextResponse.json({
      ok: true,
      session: signInResult.session ? {
        access_token: signInResult.session.access_token,
        refresh_token: signInResult.session.refresh_token,
        expires_in: signInResult.session.expires_in,
      } : null,
      signInError: signInResult.error,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });
  } catch (e) {
    console.error('[api/auth/register] POST failed:', e);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
