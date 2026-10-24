/**
 * Token Vault — 加密存储 OAuth Tokens
 *
 * 使用 AES-256-GCM 加密 access_token 和 refresh_token，
 * 存储到 integration_tokens 表。
 * 自动检测过期并刷新。
 */

import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { refreshToken as refreshMsalToken, type TokenResult } from '@/lib/microsoft/auth';
import { refreshWeComToken } from '@/lib/wecom/auth';
import { logAudit } from './audit-logger';

// ─── Encryption ─────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM 推荐 12 bytes

function getEncryptionKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be set (32 bytes hex = 64 hex chars)');
  }
  const keyBuf = Buffer.from(key, 'hex');
  if (keyBuf.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  }
  return keyBuf;
}

export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  // 格式: iv:tag:ciphertext (全部 hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decrypt(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const ciphertext = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ─── Token Storage ──────────────────────────────────────────────────

/**
 * 存储 token（加密后写入 DB）
 */
export async function storeToken(
  connectionId: string,
  token: TokenResult,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Supabase admin client not configured');

  const encryptedAccess = encrypt(token.accessToken);
  const encryptedRefresh = token.refreshToken ? encrypt(token.refreshToken) : null;

  // Upsert: 一个 connection 只保留一条 token 记录
  const { error } = await supabase
    .from('integration_tokens')
    .upsert(
      {
        connection_id: connectionId,
        access_token_encrypted: encryptedAccess,
        refresh_token_encrypted: encryptedRefresh,
        expires_at: token.expiresAt.toISOString(),
        token_type: 'Bearer',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'connection_id' },
    );

  if (error) {
    throw new Error(`Failed to store token: ${error.message}`);
  }
}

/**
 * 获取 token（从 DB 读取并解密）
 * 如果即将过期（<5min），自动刷新
 */
export async function getToken(connectionId: string): Promise<TokenResult | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Supabase admin client not configured');

  const { data, error } = await supabase
    .from('integration_tokens')
    .select('*')
    .eq('connection_id', connectionId)
    .single();

  if (error || !data) return null;

  const token: TokenResult = {
    accessToken: decrypt(data.access_token_encrypted),
    refreshToken: data.refresh_token_encrypted ? decrypt(data.refresh_token_encrypted) : undefined,
    expiresAt: new Date(data.expires_at),
    scope: '',
  };

  // 检查是否即将过期（<5 分钟）
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);
  if (token.expiresAt < fiveMinFromNow) {
    return refreshIfNeeded(connectionId, token);
  }

  return token;
}

/**
 * 自动刷新 token — 按 connector 类型分派
 */
async function refreshIfNeeded(
  connectionId: string,
  currentToken: TokenResult,
): Promise<TokenResult> {
  const supabaseForAudit = getSupabaseAdmin();

  // 查 connection 获取 connector_id 以决定刷新方式
  let connectorId = 'outlook';
  let connOrgId: string | null = null;

  if (supabaseForAudit) {
    const { data: conn } = await supabaseForAudit
      .from('integration_connections')
      .select('org_id, connector_id')
      .eq('id', connectionId)
      .single();

    if (conn) {
      connectorId = conn.connector_id as string;
      connOrgId = conn.org_id as string;
    }
  }

  // 企业微信：用 refreshWeComToken 刷新
  if (connectorId === 'wecom') {
    await refreshWeComToken(connectionId);
    // 重新读取更新后的 token（避免递归，直接从 DB 读）
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error('Supabase admin client not configured');
    const { data } = await supabase
      .from('integration_tokens')
      .select('*')
      .eq('connection_id', connectionId)
      .single();
    if (!data) throw new Error('Failed to read refreshed WeCom token');

    if (connOrgId) {
      await logAudit({ orgId: connOrgId, connectionId, connectorId, action: 'token_refresh', status: 'success' });
    }

    return {
      accessToken: decrypt(data.access_token_encrypted),
      refreshToken: data.refresh_token_encrypted ? decrypt(data.refresh_token_encrypted) : undefined,
      expiresAt: new Date(data.expires_at),
      scope: '',
    };
  }

  // Microsoft: 用 MSAL 刷新
  if (!currentToken.refreshToken) {
    throw new Error('Token expired and no refresh token available');
  }

  const newToken = await refreshMsalToken(currentToken.refreshToken);

  // 保留原有的 refresh token（如果新 token 没返回新的）
  if (!newToken.refreshToken) {
    newToken.refreshToken = currentToken.refreshToken;
  }

  // 更新 DB
  await storeToken(connectionId, newToken);

  if (connOrgId) {
    await logAudit({ orgId: connOrgId, connectionId, connectorId, action: 'token_refresh', status: 'success' });
  }

  return newToken;
}

/**
 * 撤销 token（删除 DB 记录）
 */
export async function revokeToken(connectionId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Supabase admin client not configured');

  // 获取 connection 信息用于审计（在删除前）
  const { data: conn } = await supabase
    .from('integration_connections')
    .select('org_id, connector_id')
    .eq('id', connectionId)
    .single();

  const { error } = await supabase
    .from('integration_tokens')
    .delete()
    .eq('connection_id', connectionId);

  if (error) {
    throw new Error(`Failed to revoke token: ${error.message}`);
  }

  if (conn) {
    await logAudit({
      orgId: conn.org_id as string,
      connectionId,
      connectorId: conn.connector_id as string,
      action: 'token_revoke',
      status: 'success',
    });
  }
}
