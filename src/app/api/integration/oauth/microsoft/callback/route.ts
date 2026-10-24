/**
 * Microsoft OAuth — 回调处理
 *
 * GET /api/integration/oauth/microsoft/callback?code=xxx&state=xxx
 * 1. 用 code 换 token
 * 2. 加密存储到 integration_tokens
 * 3. 创建/更新 integration_connections
 * 4. 重定向回 Closr
 */

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { handleCallback } from '@/lib/microsoft/auth';
import { storeToken } from '@/lib/integration/token-vault';
import { requireAdmin } from '@/lib/api-guard';

interface OAuthState {
  orgId: string;
  userId: string;
  mode: 'org' | 'personal';
  nonce: string;
  sig: string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  const baseUrl = `${url.protocol}//${url.host}`;

  // 错误处理：Microsoft 返回错误
  if (error) {
    const params = new URLSearchParams({
      integration: 'error',
      message: errorDescription ?? error,
    });
    return NextResponse.redirect(`${baseUrl}/settings?${params.toString()}`);
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(`${baseUrl}/settings?integration=error&message=missing_params`);
  }

  // 解析 state 并验证 HMAC 签名
  let state: OAuthState;
  try {
    state = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf8'));
  } catch {
    return NextResponse.redirect(`${baseUrl}/settings?integration=error&message=invalid_state`);
  }

  const stateSecret = process.env.OAUTH_STATE_SECRET;
  if (!stateSecret) {
    return NextResponse.redirect(`${baseUrl}/settings?integration=error&message=server_error`);
  }

  const { sig, ...payload } = state;
  const expectedSig = crypto
    .createHmac('sha256', stateSecret)
    .update(JSON.stringify(payload))
    .digest('base64url');

  if (!sig || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return NextResponse.redirect(`${baseUrl}/settings?integration=error&message=invalid_state`);
  }

  let supabase: ReturnType<typeof requireAdmin>;
  try {
    supabase = requireAdmin();
  } catch {
    return NextResponse.redirect(`${baseUrl}/settings?integration=error&message=server_error`);
  }

  try {
    const redirectUri = `${baseUrl}/api/integration/oauth/microsoft/callback`;

    // 1. 用 code 换 token
    const tokenResult = await handleCallback(code, redirectUri);

    // 2. 创建/更新 integration_connections
    const { data: connection, error: connError } = await supabase
      .from('integration_connections')
      .upsert(
        {
          org_id: state.orgId,
          connector_id: 'outlook',
          status: 'connected',
          config: {
            auth_mode: state.mode,
            tenant_id: tokenResult.tenantId ?? null,
          },
          scopes: tokenResult.scope ? tokenResult.scope.split(' ') : [],
          connected_at: new Date().toISOString(),
          connected_by: state.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,connector_id' },
      )
      .select('id')
      .single();

    if (connError || !connection) {
      throw new Error(`Failed to create connection: ${connError?.message}`);
    }

    // 3. 加密存储 token
    await storeToken(connection.id, tokenResult);

    // 4. 写审计日志
    await supabase.from('integration_audit_logs').insert({
      org_id: state.orgId,
      user_id: state.userId,
      connection_id: connection.id,
      connector_id: 'outlook',
      action: 'oauth_connect',
      status: 'success',
      details: { mode: state.mode, tenant_id: tokenResult.tenantId },
    });

    // 5. 重定向回 Closr
    return NextResponse.redirect(`${baseUrl}/settings?integration=success&connector=outlook`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';

    // 写审计日志（失败）
    await supabase.from('integration_audit_logs').insert({
      org_id: state.orgId,
      user_id: state.userId,
      connector_id: 'outlook',
      action: 'oauth_connect',
      status: 'error',
      error_message: message,
    });

    const params = new URLSearchParams({
      integration: 'error',
      message: 'token_exchange_failed',
    });
    return NextResponse.redirect(`${baseUrl}/settings?${params.toString()}`);
  }
}
