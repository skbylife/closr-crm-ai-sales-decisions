/**
 * Microsoft OAuth — Server-side MSAL Confidential Client
 *
 * 支持两种授权模式：
 * - org: Admin Consent（组织级，管理员统一授权）
 * - personal: Authorization Code Flow（个人授权）
 */

import { ConfidentialClientApplication } from '@azure/msal-node';

// ─── Types ──────────────────────────────────────────────────────────

export interface TokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  tenantId?: string;
  scope: string;
}

// ─── MSAL Config ────────────────────────────────────────────────────

const msalConfig = {
  auth: {
    clientId: process.env.AZURE_AD_CLIENT_ID ?? '',
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
    authority: 'https://login.microsoftonline.com/common',
  },
};

let _msalInstance: ConfidentialClientApplication | null = null;

function getMsalInstance(): ConfidentialClientApplication {
  if (!_msalInstance) {
    if (!msalConfig.auth.clientId || !msalConfig.auth.clientSecret) {
      throw new Error('AZURE_AD_CLIENT_ID and AZURE_AD_CLIENT_SECRET must be set');
    }
    _msalInstance = new ConfidentialClientApplication(msalConfig);
  }
  return _msalInstance;
}

// ─── Scopes ─────────────────────────────────────────────────────────

const DELEGATED_SCOPES = [
  'User.Read',
  'Mail.Read',
  'Mail.ReadBasic',
  'Contacts.Read',
  'offline_access', // 需要 refresh token
];

const ADMIN_CONSENT_SCOPE = '.default';

// ─── Auth URL Generation ────────────────────────────────────────────

/**
 * 生成 OAuth 授权 URL
 * - org 模式: Admin Consent endpoint
 * - personal 模式: 标准 Authorization Code Flow
 */
export async function getAuthUrl(
  mode: 'org' | 'personal',
  redirectUri: string,
  state: string,
): Promise<string> {
  const clientId = process.env.AZURE_AD_CLIENT_ID;
  if (!clientId) {
    throw new Error('AZURE_AD_CLIENT_ID must be set');
  }

  if (mode === 'org') {
    // Admin Consent — 组织级授权
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: ADMIN_CONSENT_SCOPE,
      state,
    });
    return `https://login.microsoftonline.com/common/adminconsent?${params.toString()}`;
  }

  // Personal — 标准 Authorization Code Flow
  const msal = getMsalInstance();
  const authUrl = await msal.getAuthCodeUrl({
    scopes: DELEGATED_SCOPES,
    redirectUri,
    state,
    prompt: 'consent',
  });
  return authUrl;
}

// ─── Token Exchange ─────────────────────────────────────────────────

/**
 * 用 authorization code 换取 token
 */
export async function handleCallback(
  code: string,
  redirectUri: string,
): Promise<TokenResult> {
  const msal = getMsalInstance();

  const result = await msal.acquireTokenByCode({
    code,
    scopes: DELEGATED_SCOPES,
    redirectUri,
  });

  if (!result) {
    throw new Error('Token exchange failed: no result');
  }

  return {
    accessToken: result.accessToken,
    // MSAL Node v3 不直接暴露 refresh token，但会缓存在内部
    // 通过 acquireTokenSilent 可以自动刷新
    refreshToken: undefined,
    expiresAt: result.expiresOn ? new Date(result.expiresOn) : new Date(Date.now() + 3600 * 1000),
    tenantId: result.tenantId,
    scope: result.scopes?.join(' ') ?? '',
  };
}

/**
 * 使用 refresh token 刷新 access token
 * 注意：MSAL Node 的 ConfidentialClientApplication 内部缓存 token，
 * 但我们也支持手动传入 refresh token 进行刷新（用于从 DB 恢复的场景）
 */
export async function refreshToken(
  refreshTokenValue: string,
): Promise<TokenResult> {
  const msal = getMsalInstance();

  // MSAL Node v3: acquireTokenByRefreshToken 用于手动刷新
  const result = await (msal as ConfidentialClientApplication & {
    acquireTokenByRefreshToken(request: {
      refreshToken: string;
      scopes: string[];
    }): Promise<{
      accessToken: string;
      expiresOn: Date | null;
      tenantId?: string;
      scopes?: string[];
    } | null>;
  }).acquireTokenByRefreshToken({
    refreshToken: refreshTokenValue,
    scopes: DELEGATED_SCOPES,
  });

  if (!result) {
    throw new Error('Token refresh failed: no result');
  }

  return {
    accessToken: result.accessToken,
    refreshToken: refreshTokenValue, // refresh token 通常不变
    expiresAt: result.expiresOn ? new Date(result.expiresOn) : new Date(Date.now() + 3600 * 1000),
    tenantId: result.tenantId,
    scope: result.scopes?.join(' ') ?? '',
  };
}
