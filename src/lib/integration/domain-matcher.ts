/**
 * Domain Matcher — 邮件域名 → Account 匹配
 *
 * 从 accounts 表读取 website 字段，提取域名，
 * 然后匹配邮件地址的域名到对应 Account。
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';

// ─── Domain Extraction ──────────────────────────────────────────────

/**
 * 从邮件地址提取域名
 * 'example-359df521aa@example.invalid' → 'microsoft.com'
 */
export function extractDomain(email: string): string {
  const atIndex = email.lastIndexOf('@');
  if (atIndex < 0) return '';
  return email.substring(atIndex + 1).toLowerCase().trim();
}

/**
 * 从 URL 或域名字符串提取根域名
 * 'https://www.microsoft.com/en-us' → 'microsoft.com'
 * 'www.acme.co.uk' → 'acme.co.uk'
 */
function extractDomainFromWebsite(website: string): string {
  let host = website.trim().toLowerCase();

  // 移除协议
  host = host.replace(/^https?:\/\//, '');

  // 移除路径
  const slashIndex = host.indexOf('/');
  if (slashIndex > 0) {
    host = host.substring(0, slashIndex);
  }

  // 移除端口
  const colonIndex = host.indexOf(':');
  if (colonIndex > 0) {
    host = host.substring(0, colonIndex);
  }

  // 移除 www. 前缀
  if (host.startsWith('www.')) {
    host = host.substring(4);
  }

  return host;
}

// ─── Account Domain Map ─────────────────────────────────────────────

/**
 * 获取 org 下所有 account 的域名映射
 * 返回 domain → accountId
 */
export async function getAccountDomains(
  orgId: string,
): Promise<Map<string, string>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return new Map();

  const { data, error } = await supabase
    .from('accounts')
    .select('id, website')
    .eq('org_id', orgId)
    .not('website', 'is', null);

  if (error || !data) return new Map();

  const domainMap = new Map<string, string>();

  for (const row of data) {
    const website = row.website as string | null;
    if (!website) continue;

    const domain = extractDomainFromWebsite(website);
    if (domain) {
      domainMap.set(domain, row.id as string);
    }
  }

  return domainMap;
}

// ─── Email Matching ─────────────────────────────────────────────────

/**
 * 匹配邮件地址到 Account
 * 返回 accountId 或 null
 */
export function matchEmailToAccount(
  email: string,
  domainMap: Map<string, string>,
): string | null {
  const domain = extractDomain(email);
  if (!domain) return null;
  return domainMap.get(domain) ?? null;
}
