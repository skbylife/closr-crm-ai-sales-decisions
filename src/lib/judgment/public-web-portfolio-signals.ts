export type PublicWebSignalSeverity = 'warning' | 'focus';

export interface PublicWebSourceRecordRow {
  id?: string | null;
  account_id?: string | null;
  source_kind?: string | null;
  source_table?: string | null;
  source_row_id?: string | null;
  title?: string | null;
  summary?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface PublicWebPortfolioSignal {
  id: string;
  accountId: string;
  accountName: string;
  severity: PublicWebSignalSeverity;
  publicWebType: 'official_site' | 'official_page' | 'news';
  pageType: string;
  title: string;
  summary: string;
  occurredAt: string;
  sourceUrl: string | null;
  capturedAt: string;
  extractionMethod: 'scrapling_company_scraper' | string;
  auditLabel: string;
  evidenceStrengthLabel: string;
  judgmentImpact: string;
  recommendedAction: string;
  evidenceRefs: Array<{
    sourceKind: 'source_record';
    sourceId: string;
    sourceTable: 'source_records';
    sourceRowId: string;
    title?: string;
  }>;
  drilldownHref: string;
}

export interface PublicWebSignalSummary {
  status: 'ready' | 'no_public_web_evidence';
  totalEvidence: number;
  emittedSignals: number;
  watchCount: number;
  calibrationNote: string;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizePublicWebType(value: string | null): PublicWebPortfolioSignal['publicWebType'] {
  if (value === 'official_site' || value === 'official_page' || value === 'news') return value;
  return 'official_page';
}

function classifySeverity(publicWebType: PublicWebPortfolioSignal['publicWebType'], pageType: string): PublicWebSignalSeverity {
  if (publicWebType === 'news') return 'warning';
  if (['leadership', 'procurement', 'case_study'].includes(pageType)) return 'warning';
  return 'focus';
}

function recommendedActionFor(pageType: string, publicWebType: PublicWebPortfolioSignal['publicWebType']): string {
  if (pageType === 'leadership') return '让客户负责人核验关键人/组织结构是否变化，并补一条一手沟通证据。';
  if (pageType === 'procurement') return '让负责人确认采购流程、供应商入口或招采节奏是否影响当前推进。';
  if (pageType === 'case_study') return '让推进组判断公开案例/方案方向是否改变客户关注点。';
  if (publicWebType === 'news') return '让负责人核验这条公开新闻是否会改变当前客户判断或推进优先级。';
  return '让负责人确认公开网页信息是否仍然支持当前客户判断。';
}

function auditLabelFor(publicWebType: PublicWebPortfolioSignal['publicWebType'], pageType: string): string {
  if (publicWebType === 'official_site') return '官网公开证据';
  if (publicWebType === 'news') return '公开新闻证据';
  if (pageType === 'leadership') return '关键人公开证据';
  if (pageType === 'procurement') return '采购入口公开证据';
  if (pageType === 'case_study') return '案例公开证据';
  return '公开网页证据';
}

function judgmentImpactFor(pageType: string, publicWebType: PublicWebPortfolioSignal['publicWebType']): string {
  if (pageType === 'leadership') return '可能影响关键人路径、组织覆盖和 sponsor 判断。';
  if (pageType === 'procurement') return '可能影响采购流程、供应商准入和推进节奏判断。';
  if (pageType === 'case_study') return '可能影响价值叙事、对标案例和方案优先级判断。';
  if (publicWebType === 'news') return '可能影响客户优先级、风险窗口或近期沟通时机。';
  return '可作为客户背景判断的公开证据，但需要一手信息校准。';
}

export function buildPublicWebPortfolioSignals(params: {
  rows: PublicWebSourceRecordRow[];
  accountNames: Record<string, string>;
  limit?: number;
}): { signals: PublicWebPortfolioSignal[]; summary: PublicWebSignalSummary } {
  const limit = Math.max(0, Math.min(Math.floor(params.limit ?? 6), 20));
  const usableRows = params.rows.filter((row) => row.source_kind === 'public_web' && row.account_id);

  const signals = [...usableRows]
    .sort((a, b) => {
      const at = new Date(a.occurred_at ?? a.created_at ?? 0).getTime();
      const bt = new Date(b.occurred_at ?? b.created_at ?? 0).getTime();
      return bt - at;
    })
    .slice(0, limit)
    .map((row): PublicWebPortfolioSignal => {
      const metadata = row.metadata ?? {};
      const accountId = row.account_id as string;
      const publicWebType = normalizePublicWebType(asString(metadata.public_web_type));
      const pageType = asString(metadata.page_type) ?? (publicWebType === 'news' ? 'news' : 'public_page');
      const sourceRecordId = row.id ?? row.source_row_id ?? 'public_web:' + accountId;
      const title = row.title || (publicWebType === 'news' ? '公开新闻变化' : '公开网页变化');
      const capturedAt = asString(metadata.captured_at) ?? row.occurred_at ?? row.created_at ?? new Date().toISOString();
      const sourceUrl = asString(metadata.url);
      const extractionMethod = asString(metadata.extraction_method) ?? 'scrapling_company_scraper';

      return {
        id: 'public-web:' + sourceRecordId,
        accountId,
        accountName: params.accountNames[accountId] ?? '未知客户',
        severity: classifySeverity(publicWebType, pageType),
        publicWebType,
        pageType,
        title,
        summary: row.summary || '公开网页有新证据，需要负责人核验其业务含义。',
        occurredAt: row.occurred_at ?? row.created_at ?? new Date().toISOString(),
        sourceUrl,
        capturedAt,
        extractionMethod,
        auditLabel: auditLabelFor(publicWebType, pageType),
        evidenceStrengthLabel: sourceUrl ? '可追溯公开来源' : '来源 URL 待补齐',
        judgmentImpact: judgmentImpactFor(pageType, publicWebType),
        recommendedAction: recommendedActionFor(pageType, publicWebType),
        evidenceRefs: [{
          sourceKind: 'source_record',
          sourceId: sourceRecordId,
          sourceTable: 'source_records',
          sourceRowId: sourceRecordId,
          ...(row.title ? { title: row.title } : {}),
        }],
        drilldownHref: '/accounts/' + encodeURIComponent(accountId) + '?tab=knowledge&targetKind=source_record&targetId=' + encodeURIComponent(sourceRecordId),
      };
    });

  return {
    signals,
    summary: {
      status: usableRows.length > 0 ? 'ready' : 'no_public_web_evidence',
      totalEvidence: usableRows.length,
      emittedSignals: signals.length,
      watchCount: signals.filter((signal) => signal.severity === 'warning').length,
      calibrationNote: usableRows.length > 0
        ? '公开网页只作为待核验证据，不自动改写联系人/客户判断。'
        : '暂无公开网页 source_records；组合视图不会伪造外部变化。',
    },
  };
}
