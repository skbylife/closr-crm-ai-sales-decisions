/**
 * Microsoft OAuth — 启动授权流程
 *
 * GET /api/integration/oauth/microsoft?mode=org|personal
 * → 重定向到 Microsoft 授权页面
 */

import crypto from 'crypto';
import { requireAuth, requireRole, guardResponse } from '@/lib/api-guard';
import { getAuthUrl } from '@/lib/microsoft/auth';

export async function GET(request: Request) {
  try {
  const ctx = await requireAuth();
  // 只有 owner/admin 可以发起对接
  requireRole(ctx, 'admin');

  const url = new URL(request.url);
  const mode = (url.searchParams.get('mode') ?? 'personal') as 'org' | 'personal';

  // state 包含 orgId + userId + mode + nonce，HMAC 签名防 CSRF
  const stateSecret = process.env.OAUTH_STATE_SECRET;
  if (!stateSecret) {
    return Response.json({ error: 'OAUTH_STATE_SECRET not configured' }, { status: 500 });
  }

  const nonce = crypto.randomUUID();
  const payload = { orgId: ctx.orgId, userId: ctx.userId, mode, nonce };
  const sig = crypto
    .createHmac('sha256', stateSecret)
    .update(JSON.stringify(payload))
    .digest('base64url');

  const state = Buffer.from(JSON.stringify({ ...payload, sig })).toString('base64url');

  const baseUrl = `${url.protocol}//${url.host}`;
  const redirectUri = `${baseUrl}/api/integration/oauth/microsoft/callback`;

  try {
    const authorizationUrl = await getAuthUrl(mode, redirectUri, state);
    return Response.redirect(authorizationUrl);
  } catch (oauthErr) {
    const message = oauthErr instanceof Error ? oauthErr.message : 'OAuth error';
    return Response.json({ error: message }, { status: 500 });
  }
  } catch (err) {
    return guardResponse(err);
  }
}
