/**
 * 企业微信认证 — corpId + corpSecret 直接获取 token
 *
 * 与 OAuth 不同，不需要浏览器弹窗授权。
 * token 有效期 2h，通过重新调用 gettoken 接口刷新。
 * corpSecret 加密存储在 integration_tokens 的 refresh_token_encrypted 字段。
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { decrypt, storeToken } from '@/lib/integration/token-vault';
import { getAccessToken, getDepartmentList, getDepartmentMembers } from './api';

// ─── Connect ────────────────────────────────────────────────────────

/**
 * 连接企业微信：验证凭据 → 存储 token → 创建 connection
 */
export async function connectWeCom(
  orgId: string,
  userId: string,
  corpId: string,
  corpSecret: string,
): Promise<{ success: boolean; error?: string; memberCount?: number; departmentCount?: number }> {
  // 1. 用 corpId + corpSecret 获取 access_token（验证凭据有效性）
  let accessToken: string;
  let expiresAt: Date;
  try {
    const result = await getAccessToken({ corpId, corpSecret });
    accessToken = result.accessToken;
    expiresAt = result.expiresAt;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `凭据验证失败: ${msg}` };
  }

  // 2. 验证 token 有效（调一个简单接口）
  let departmentCount = 0;
  try {
    const departments = await getDepartmentList(accessToken);
    departmentCount = departments.length;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `API 验证失败: ${msg}` };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { success: false, error: 'Supabase admin client not configured' };
  }

  // 3. 创建/更新 integration_connections 记录
  const { data: conn, error: connErr } = await supabase
    .from('integration_connections')
    .upsert(
      {
        org_id: orgId,
        connector_id: 'wecom',
        status: 'connected',
        config: { corpId },
        connected_at: new Date().toISOString(),
        connected_by: userId,
        sync_status: 'idle',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,connector_id' },
    )
    .select('id')
    .single();

  if (connErr || !conn) {
    return { success: false, error: `创建连接记录失败: ${connErr?.message}` };
  }

  const connectionId = conn.id as string;

  // 4. 加密存储 token + corpSecret
  //    accessToken → access_token_encrypted
  //    corpSecret → refresh_token_encrypted（用于后续刷新 token）
  await storeToken(connectionId, {
    accessToken,
    refreshToken: corpSecret, // corpSecret 作为 "refresh credential"
    expiresAt,
    scope: 'wecom',
  });

  // 5. 获取成员数量作为连接成功的确认
  let memberCount = 0;
  try {
    // 获取根部门（id=1）成员来统计
    const members = await getDepartmentMembers(accessToken, 1);
    memberCount = members.length;
  } catch {
    // 根部门可能没权限，尝试不指定部门
    memberCount = 0;
  }

  // 6. 写审计日志
  await supabase.from('integration_audit_logs').insert({
    org_id: orgId,
    user_id: userId,
    connection_id: connectionId,
    connector_id: 'wecom',
    action: 'wecom_connect',
    details: { corpId, departmentCount, memberCount },
    status: 'success',
  });

  return { success: true, memberCount, departmentCount };
}

// ─── Token Refresh ──────────────────────────────────────────────────

/**
 * 刷新企业微信 token
 * 与 OAuth refresh 不同，直接用 corpSecret 重新调 gettoken 接口
 */
export async function refreshWeComToken(connectionId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Supabase admin client not configured');

  // 读取 connection 的 corpId
  const { data: conn } = await supabase
    .from('integration_connections')
    .select('config')
    .eq('id', connectionId)
    .single();

  if (!conn?.config) throw new Error('Connection config not found');
  const corpId = (conn.config as { corpId?: string }).corpId;
  if (!corpId) throw new Error('corpId not found in connection config');

  // 读取加密的 corpSecret（存在 refresh_token_encrypted 里）
  const { data: tokenRow } = await supabase
    .from('integration_tokens')
    .select('refresh_token_encrypted')
    .eq('connection_id', connectionId)
    .single();

  if (!tokenRow?.refresh_token_encrypted) {
    throw new Error('corpSecret not found in token store');
  }

  const corpSecret = decrypt(tokenRow.refresh_token_encrypted as string);

  // 重新获取 access_token
  const result = await getAccessToken({ corpId, corpSecret });

  // 更新 DB
  await storeToken(connectionId, {
    accessToken: result.accessToken,
    refreshToken: corpSecret,
    expiresAt: result.expiresAt,
    scope: 'wecom',
  });

  return result.accessToken;
}

// ─── Get Valid Token ────────────────────────────────────────────────

/**
 * 获取有效的企业微信 access_token
 * 如果即将过期（<5min），自动刷新
 */
export async function getWeComToken(connectionId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Supabase admin client not configured');

  const { data: tokenRow } = await supabase
    .from('integration_tokens')
    .select('access_token_encrypted, expires_at')
    .eq('connection_id', connectionId)
    .single();

  if (!tokenRow) throw new Error('Token not found for connection');

  const expiresAt = new Date(tokenRow.expires_at as string);
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

  // 即将过期 → 刷新
  if (expiresAt < fiveMinFromNow) {
    return refreshWeComToken(connectionId);
  }

  return decrypt(tokenRow.access_token_encrypted as string);
}
