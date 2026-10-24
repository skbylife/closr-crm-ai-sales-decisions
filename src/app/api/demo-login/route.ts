import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { requireAdmin } from '@/lib/api-guard';
import { recordAuthAuditForUser } from '@/lib/compliance-audit';
import { createClient } from '@/lib/supabase/server';
import {
  clearDemoLoginFailures,
  getClientKey,
  getDemoLoginRateLimit,
  recordDemoLoginFailure,
} from './rate-limit';

const DEMO_AUTH_TIMEOUT_MS = Number(process.env.CLOSR_DEMO_AUTH_TIMEOUT_MS || 15_000);

type DemoAuthSuccess = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user?: { id?: string; email?: string };
};

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

async function findUserByEmail(admin: SupabaseClient, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 100) break;
  }
  return null;
}

async function ensureDemoUserCanSignIn(email: string, password: string) {
  const admin = requireAdmin();
  const existingUser = await findUserByEmail(admin, email);

  if (existingUser) {
    const { error } = await admin.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(existingUser.user_metadata ?? {}),
        signup_source: 'demo',
      },
    });
    if (error) throw error;
    return;
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      signup_source: 'demo',
    },
  });
  if (error) throw error;
}

async function signInDemoWithPassword(params: {
  url: string;
  anonKey: string;
  email: string;
  password: string;
}): Promise<{
  data: {
    session: { access_token: string; refresh_token: string; expires_in?: number } | null;
    user: { id?: string; email?: string } | null;
  };
  error: { message: string } | null;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEMO_AUTH_TIMEOUT_MS);
  try {
    const res = await fetch(params.url.replace(/\/$/, '') + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        apikey: params.anonKey,
        Authorization: 'Bearer ' + params.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: params.email, password: params.password }),
    });
    const body = await res.json().catch(() => ({})) as Partial<DemoAuthSuccess> & { error_description?: string; msg?: string };
    if (!res.ok) {
      return {
        data: { session: null, user: null },
        error: { message: body.error_description ?? body.msg ?? 'Supabase auth returned HTTP ' + res.status },
      };
    }
    if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string') {
      return {
        data: { session: null, user: body.user ?? null },
        error: { message: 'Supabase auth response missing session tokens' },
      };
    }
    return {
      data: {
        session: {
          access_token: body.access_token,
          refresh_token: body.refresh_token,
          expires_in: body.expires_in,
        },
        user: body.user ?? null,
      },
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'Supabase auth timed out after ' + DEMO_AUTH_TIMEOUT_MS + 'ms'
      : error instanceof Error ? error.message : String(error);
    return { data: { session: null, user: null }, error: { message } };
  } finally {
    clearTimeout(timeout);
  }
}

// POST: Server-side demo login — returns Supabase session tokens
// Requires DEMO_ACCESS_PASSWORD proof so callers can't bypass the gate.
// DEMO_PASSWORD never leaves the server.
export async function POST(request: Request) {
  try {
    const clientKey = getClientKey(request);
    const rateLimit = getDemoLoginRateLimit(clientKey);
    if (rateLimit.blocked) {
      return NextResponse.json(
        { error: '尝试次数过多，请稍后再试' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds ?? 60) } },
      );
    }

    // Verify access password server-side (not just frontend)
    const body = await request.json().catch(() => ({})) as { accessPassword?: string };
    const expectedAccess = process.env.DEMO_ACCESS_PASSWORD;
    if (!expectedAccess) {
      console.error('[demo-login] DEMO_ACCESS_PASSWORD env var not configured');
      return NextResponse.json({ error: 'Demo 未配置（缺少 DEMO_ACCESS_PASSWORD）' }, { status: 500 });
    }
    if (!body.accessPassword || !safeEqual(body.accessPassword, expectedAccess)) {
      recordDemoLoginFailure(clientKey);
      try {
        const admin = requireAdmin();
        const demoUser = await findUserByEmail(admin, 'example-c39293aa15@example.invalid');
        if (demoUser?.id) {
          await recordAuthAuditForUser({
            admin,
            userId: demoUser.id,
            action: 'demo_login_failed',
            request,
            recordName: 'example-c39293aa15@example.invalid',
            changes: { reason: 'invalid_access_password' },
          });
        }
      } catch (auditError) {
        console.error('[demo-login] failed-login audit skipped:', auditError instanceof Error ? auditError.message : auditError);
      }
      return NextResponse.json({ error: '未授权的 demo 访问' }, { status: 401 });
    }

    const email = 'example-c39293aa15@example.invalid';
    const password = process.env.DEMO_PASSWORD;

    if (!password) {
      console.error('[demo-login] DEMO_PASSWORD env var not configured');
      return NextResponse.json({ error: 'Demo 未配置（缺少 DEMO_PASSWORD）' }, { status: 500 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error('[demo-login] Supabase env vars missing');
      return NextResponse.json({ error: 'Demo 未配置（缺少 Supabase 配置）' }, { status: 500 });
    }

    let { data, error } = await signInDemoWithPassword({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      email,
      password,
    });

    if (error || !data.session) {
      try {
        await ensureDemoUserCanSignIn(email, password);
        const retry = await signInDemoWithPassword({
          url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
          anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          email,
          password,
        });
        data = retry.data;
        error = retry.error;
      } catch (ensureError) {
        console.error('[demo-login] Demo user repair failed:', ensureError instanceof Error ? ensureError.message : ensureError);
        recordDemoLoginFailure(clientKey);
        return NextResponse.json({ error: 'Demo 账号初始化失败，请稍后重试或联系管理员' }, { status: 500 });
      }
    }

    if (error || !data.session) {
      console.error('[demo-login] Auth error:', error?.message);
      recordDemoLoginFailure(clientKey);
      if (data.user?.id) {
        try {
          const admin = requireAdmin();
          await recordAuthAuditForUser({
            admin,
            userId: data.user.id,
            action: 'demo_login_failed',
            request,
            recordName: 'example-c39293aa15@example.invalid',
            changes: { reason: error?.message ?? 'missing_session' },
          });
        } catch (auditError) {
          console.error('[demo-login] failed-auth audit skipped:', auditError instanceof Error ? auditError.message : auditError);
        }
      }
      return NextResponse.json({ error: 'Demo 账号认证失败，请稍后重试或联系管理员' }, { status: 401 });
    }

    clearDemoLoginFailures(clientKey);
    if (data.user?.id) {
      try {
        const admin = requireAdmin();
        await recordAuthAuditForUser({
          admin,
          userId: data.user.id,
          action: 'demo_login_success',
          request,
          recordName: 'example-c39293aa15@example.invalid',
        });
      } catch (auditError) {
        console.error('[demo-login] success audit skipped:', auditError instanceof Error ? auditError.message : auditError);
      }
    }

    try {
      const supabase = await createClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (sessionError) {
        console.error('[demo-login] server setSession skipped:', sessionError.message);
      }
    } catch (sessionError) {
      console.error('[demo-login] server setSession failed:', sessionError instanceof Error ? sessionError.message : sessionError);
    }

    return NextResponse.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      user: { id: data.user?.id, email: data.user?.email },
      serverSession: true,
    });
  } catch (err) {
    console.error('[demo-login] Error:', err);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
