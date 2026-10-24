import { describe, expect, it } from 'vitest';

import { buildPublicWebPortfolioSignals } from '@/lib/judgment/public-web-portfolio-signals';

describe('buildPublicWebPortfolioSignals', () => {
  it('turns public web source_records into manager-verifiable portfolio signals', () => {
    const result = buildPublicWebPortfolioSignals({
      accountNames: { acc_1: '华南某高端制造集团' },
      rows: [
        {
          id: 'sr_public_1',
          account_id: 'acc_1',
          source_kind: 'public_web',
          source_table: 'public_web',
          source_row_id: 'official-page:1',
          title: '管理团队更新',
          summary: '官网出现新的数字化负责人介绍。',
          occurred_at: '2026-05-16T04:00:00.000Z',
          metadata: {
            public_web_type: 'official_page',
            page_type: 'leadership',
            url: 'https://example.com/about/leadership',
            captured_at: '2026-05-16T04:05:00.000Z',
            extraction_method: 'scrapling_company_scraper',
            should_auto_writeback: false,
          },
        },
      ],
    });

    expect(result.summary).toMatchObject({ status: 'ready', totalEvidence: 1, emittedSignals: 1, watchCount: 1 });
    expect(result.signals[0]).toMatchObject({
      accountName: '华南某高端制造集团',
      severity: 'warning',
      publicWebType: 'official_page',
      pageType: 'leadership',
      sourceUrl: 'https://example.com/about/leadership',
      capturedAt: '2026-05-16T04:05:00.000Z',
      auditLabel: '关键人公开证据',
      evidenceStrengthLabel: '可追溯公开来源',
      judgmentImpact: expect.stringContaining('关键人路径'),
      recommendedAction: expect.stringContaining('核验关键人'),
      evidenceRefs: [{ sourceKind: 'source_record', sourceId: 'sr_public_1', sourceTable: 'source_records', sourceRowId: 'sr_public_1', title: '管理团队更新' }],
    });
  });

  it('marks records without source urls as needing source completion', () => {
    const result = buildPublicWebPortfolioSignals({
      accountNames: { acc_1: '华东零售集团' },
      rows: [
        {
          id: 'sr_public_2',
          account_id: 'acc_1',
          source_kind: 'public_web',
          title: '公开新闻',
          summary: '客户发布新门店计划。',
          created_at: '2026-05-16T04:00:00.000Z',
          metadata: { public_web_type: 'news' },
        },
      ],
    });

    expect(result.signals[0]).toMatchObject({
      sourceUrl: null,
      capturedAt: '2026-05-16T04:00:00.000Z',
      auditLabel: '公开新闻证据',
      evidenceStrengthLabel: '来源 URL 待补齐',
      judgmentImpact: expect.stringContaining('近期沟通时机'),
    });
  });

  it('does not emit signals for non-public-web records', () => {
    const result = buildPublicWebPortfolioSignals({
      accountNames: {},
      rows: [{ id: 'sr_1', account_id: 'acc_1', source_kind: 'email_decode' }],
    });

    expect(result.signals).toEqual([]);
    expect(result.summary.status).toBe('no_public_web_evidence');
  });
});
