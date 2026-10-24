/**
 * POST /api/company-intel
 * 调用 Python 爬虫脚本获取公司情报，可选写入 knowledge base
 *
 * Body: { companyName: string, websiteUrl?: string, contactId?: string, accountId?: string }
 */

import { requireAuth, requireAdmin, requireAccountAccess, guardResponse } from '@/lib/api-guard';
import { buildPublicWebSourceRecords } from '@/lib/public-web-evidence';
import { execFile } from 'child_process';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import path from 'path';

interface CompanyIntelRequestBody {
  companyName: string;
  websiteUrl?: string;
  /** If provided, intel is saved to this account's knowledge base */
  accountId?: string;
}

interface CompanyIntelResult {
  company_name: string;
  timestamp: string;
  website: {
    url?: string;
    title?: string;
    description?: string;
    about?: string;
    key_messages?: string[];
    scraped_at?: string;
    error?: string | null;
  };
  news: Array<{
    title?: string;
    url?: string;
    published_at?: string;
    summary?: string;
    error?: string;
  }>;
  public_pages?: Array<{
    url?: string;
    title?: string;
    summary?: string;
    key_messages?: string[];
    page_type?: string;
    scraped_at?: string;
    error?: string | null;
  }>;
  social_signals: Record<string, string>;
  errors?: string[];
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[(.*)]$/, '$1').replace(/\.$/, '');
}

function isPublicIpAddress(hostname: string) {
  const host = normalizeHostname(hostname);
  const ipVersion = isIP(host);

  if (ipVersion === 0) return null;

  if (ipVersion === 4) {
    const parts = host.split('.').map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return false;
    }

    const [a, b] = parts;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    ) {
      return false;
    }

    return true;
  }

  const withoutZone = host.split('%', 1)[0];
  const mappedIpv4 = withoutZone.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIpv4) {
    return isPublicIpAddress(mappedIpv4[1]);
  }
  const mappedIpv4Hex = withoutZone.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedIpv4Hex) {
    const high = Number.parseInt(mappedIpv4Hex[1], 16);
    const low = Number.parseInt(mappedIpv4Hex[2], 16);
    return isPublicIpAddress([
      (high >> 8) & 255,
      high & 255,
      (low >> 8) & 255,
      low & 255,
    ].join('.'));
  }

  return !(
    withoutZone === '::' ||
    withoutZone === '::1' ||
    withoutZone.startsWith('fc') ||
    withoutZone.startsWith('fd') ||
    withoutZone.startsWith('fe80:') ||
    withoutZone.startsWith('ff') ||
    withoutZone.startsWith('2001:db8:')
  );
}

async function isAllowedPublicHttpUrl(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }

  const host = normalizeHostname(url.hostname);
  if (!host || host === 'localhost' || host.endsWith('.internal') || host.endsWith('.local')) {
    return false;
  }

  const literalCheck = isPublicIpAddress(host);
  if (literalCheck !== null) {
    return literalCheck;
  }

  let addresses: Array<{ address: string }> = [];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    return false;
  }

  return addresses.length > 0 && addresses.every((entry) => isPublicIpAddress(entry.address) === true);
}

/**
 * Run the Python scraper and return parsed JSON output.
 * Resolves Python script path relative to project root (process.cwd()).
 */
function runScraper(
  companyName: string,
  websiteUrl?: string,
  timeoutMs = 30_000
): Promise<CompanyIntelResult> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'company-scraper.py');
    const args = [scriptPath, companyName];
    if (websiteUrl) {
      args.push('--url', websiteUrl);
    }

    const child = execFile('python3', args, { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        // Timeout is surfaced as SIGTERM
        if (error.killed) {
          return reject(new Error('Company scraper timed out after 30 seconds'));
        }
        return reject(new Error(`Scraper exited with code ${error.code}: ${error.message}`));
      }
      try {
        const data = JSON.parse(stdout) as CompanyIntelResult;
        resolve(data);
      } catch {
        reject(new Error(`Failed to parse scraper output as JSON: ${stdout.slice(0, 200)}`));
      }
    });

    // Belt-and-suspenders: kill after timeoutMs if execFile callback hasn't fired
    setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);
  });
}

/**
 * Persist company intel to the account's knowledge base as a single entry.
 */
async function saveIntelToKnowledgeBase(
  orgId: string,
  accountId: string,
  intel: CompanyIntelResult
): Promise<void> {
  const admin = requireAdmin();

  const newsSnippets = intel.news
    .filter((n) => !n.error && n.title)
    .slice(0, 5)
    .map((n) => `• ${n.title}${n.published_at ? ` (${n.published_at})` : ''}`)
    .join('\n');

  const websiteInfo = intel.website?.description
    ? `**公司描述：** ${intel.website.description}\n\n**关键信息：** ${(intel.website.key_messages || []).filter(Boolean).join(' | ')}`
    : '';

  const content = [
    `# 公司情报：${intel.company_name}`,
    `*抓取时间：${intel.timestamp}*`,
    websiteInfo,
    newsSnippets ? `\n## 近期新闻\n${newsSnippets}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  await admin.from('knowledge_base').insert({
    org_id: orgId,
    account_id: accountId,
    title: `公司情报 - ${intel.company_name}`,
    content,
    category: 'competitive',
    applicable_scenarios: ['prospecting', 'discovery', 'competitive'],
  });
}

async function savePublicWebEvidence(
  orgId: string,
  accountId: string,
  intel: CompanyIntelResult,
): Promise<{ written: number; skipped: number }> {
  const admin = requireAdmin();
  const rows = buildPublicWebSourceRecords({ orgId, accountId, intel });

  if (rows.length === 0) {
    return { written: 0, skipped: 0 };
  }

  const { error } = await admin
    .from('source_records')
    .upsert(rows, { onConflict: 'org_id,source_kind,source_row_id' });

  if (error) {
    const message = error.message ?? '';
    if (
      message.includes('source_records')
      || message.includes('schema cache')
      || message.includes('does not exist')
    ) {
      console.warn('[company-intel] source_records unavailable, skipped public web evidence:', message);
      return { written: 0, skipped: rows.length };
    }
    throw error;
  }

  return { written: rows.length, skipped: 0 };
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = (await request.json()) as CompanyIntelRequestBody;

    if (!body.companyName?.trim()) {
      return Response.json({ error: 'companyName is required' }, { status: 400 });
    }

    // Validate companyName: allow CJK, Latin letters/digits, spaces and basic punctuation only.
    // Prevents argument smuggling / injection into downstream Python script.
    const companyName = body.companyName.trim().slice(0, 200);
    if (!/^[\p{L}\p{N}\s\-_.,&()（）·、]+$/u.test(companyName)) {
      return Response.json({ error: 'companyName 含有不允许的字符' }, { status: 400 });
    }

    // Validate optional websiteUrl: must be http/https and not target internal hosts.
    let websiteUrl: string | undefined;
    if (body.websiteUrl?.trim()) {
      try {
        const parsed = new URL(body.websiteUrl.trim());
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return Response.json({ error: 'websiteUrl 必须为 http/https' }, { status: 400 });
        }
        if (!(await isAllowedPublicHttpUrl(parsed))) {
          return Response.json({ error: '不允许访问该地址' }, { status: 400 });
        }
        websiteUrl = parsed.toString();
      } catch {
        return Response.json({ error: 'websiteUrl 格式不正确' }, { status: 400 });
      }
    }

    // If accountId provided, enforce account visibility before running the expensive external scraper.
    if (body.accountId) {
      await requireAccountAccess(ctx, body.accountId);
    }

    // Run Python scraper (max 30 s)
    const intel = await runScraper(companyName, websiteUrl);

    let evidenceResult: { written: number; skipped: number } | undefined;

    // If accountId provided, persist public web evidence without overwriting contact fields.
    if (body.accountId) {
      evidenceResult = await savePublicWebEvidence(ctx.orgId, body.accountId, intel);
      saveIntelToKnowledgeBase(ctx.orgId, body.accountId, intel).catch((err) =>
        console.error('[company-intel] Failed to save to knowledge base:', err)
      );
    }

    return Response.json({ ok: true, intel, evidence: evidenceResult });
  } catch (err) {
    console.error('[company-intel] Error:', err);
    return guardResponse(err);
  }
}
