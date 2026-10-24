import { createHash } from 'crypto';

export interface CompanyIntelWebsite {
  url?: string;
  title?: string;
  description?: string;
  about?: string;
  key_messages?: string[];
  scraped_at?: string;
  error?: string | null;
}

export interface CompanyIntelPublicPage {
  url?: string;
  title?: string;
  summary?: string;
  key_messages?: string[];
  page_type?: string;
  scraped_at?: string;
  error?: string | null;
}

export interface CompanyIntelNewsItem {
  title?: string;
  url?: string;
  published_at?: string;
  summary?: string;
  error?: string;
}

export interface CompanyIntelForEvidence {
  company_name: string;
  timestamp: string;
  website?: CompanyIntelWebsite;
  public_pages?: CompanyIntelPublicPage[];
  news?: CompanyIntelNewsItem[];
}

export interface PublicWebSourceRecord {
  org_id: string;
  account_id: string;
  source_kind: 'public_web';
  source_table: 'public_web';
  source_row_id: string;
  title: string;
  summary: string;
  occurred_at: string;
  metadata: {
    company_name: string;
    url: string | null;
    public_web_type: 'official_site' | 'official_page' | 'news';
    page_type?: string | null;
    captured_at: string;
    extraction_method: 'scrapling_company_scraper';
    visibility: 'public';
    should_auto_writeback: false;
  };
}

function compactText(parts: Array<string | null | undefined>, maxLength: number): string {
  const text = parts
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' | ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function stableId(parts: Array<string | null | undefined>): string {
  const raw = parts.map((part) => part ?? '').join('|').toLowerCase();
  return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

export function buildPublicWebSourceRecords(params: {
  orgId: string;
  accountId: string;
  intel: CompanyIntelForEvidence;
}): PublicWebSourceRecord[] {
  const capturedAt = params.intel.timestamp || new Date().toISOString();
  const rows: PublicWebSourceRecord[] = [];

  const website = params.intel.website;
  if (website && !website.error && (website.url || website.title || website.description || website.about)) {
    const summary = compactText(
      [
        website.description,
        website.about,
        ...(website.key_messages ?? []),
      ],
      420,
    );

    if (summary) {
      rows.push({
        org_id: params.orgId,
        account_id: params.accountId,
        source_kind: 'public_web',
        source_table: 'public_web',
        source_row_id: `official-site:${stableId([params.accountId, website.url, params.intel.company_name])}`,
        title: compactText([website.title, `${params.intel.company_name} 官网公开信息`], 160),
        summary,
        occurred_at: website.scraped_at || capturedAt,
        metadata: {
          company_name: params.intel.company_name,
          url: website.url ?? null,
          public_web_type: 'official_site',
          page_type: 'home',
          captured_at: capturedAt,
          extraction_method: 'scrapling_company_scraper',
          visibility: 'public',
          should_auto_writeback: false,
        },
      });
    }
  }

  for (const page of params.intel.public_pages ?? []) {
    if (page.error || !page.url) continue;
    const summary = compactText([page.summary, ...(page.key_messages ?? [])], 420);
    if (!summary) continue;

    rows.push({
      org_id: params.orgId,
      account_id: params.accountId,
      source_kind: 'public_web',
      source_table: 'public_web',
      source_row_id: `official-page:${stableId([params.accountId, page.url])}`,
      title: compactText([page.title, page.page_type, `${params.intel.company_name} 公开页面`], 160),
      summary,
      occurred_at: page.scraped_at || capturedAt,
      metadata: {
        company_name: params.intel.company_name,
        url: page.url,
        public_web_type: 'official_page',
        page_type: page.page_type ?? null,
        captured_at: capturedAt,
        extraction_method: 'scrapling_company_scraper',
        visibility: 'public',
        should_auto_writeback: false,
      },
    });
  }

  for (const item of params.intel.news ?? []) {
    if (item.error || !item.title) continue;
    const summary = compactText([item.summary, item.title], 420);
    if (!summary) continue;

    rows.push({
      org_id: params.orgId,
      account_id: params.accountId,
      source_kind: 'public_web',
      source_table: 'public_web',
      source_row_id: `news:${stableId([params.accountId, item.url, item.title])}`,
      title: compactText([item.title], 160),
      summary,
      occurred_at: item.published_at || capturedAt,
      metadata: {
        company_name: params.intel.company_name,
        url: item.url ?? null,
        public_web_type: 'news',
        page_type: 'news',
        captured_at: capturedAt,
        extraction_method: 'scrapling_company_scraper',
        visibility: 'public',
        should_auto_writeback: false,
      },
    });
  }

  return rows;
}
