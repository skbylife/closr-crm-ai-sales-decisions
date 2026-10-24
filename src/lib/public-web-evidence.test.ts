import { describe, expect, it } from 'vitest';

import { buildPublicWebSourceRecords } from '@/lib/public-web-evidence';

describe('buildPublicWebSourceRecords', () => {
  it('builds public source_records without enabling automatic contact writeback', () => {
    const rows = buildPublicWebSourceRecords({
      orgId: 'org_1',
      accountId: 'acc_1',
      intel: {
        company_name: '华南某高端制造集团',
        timestamp: '2026-05-16T04:00:00.000Z',
        website: {
          url: 'https://example.com',
          title: 'Example Manufacturing',
          description: '智能制造与工业数据平台公开介绍。',
          key_messages: ['工业数据中台', '供应链协同'],
          scraped_at: '2026-05-16T04:01:00.000Z',
        },
        public_pages: [
          {
            url: 'https://example.com/news',
            title: '新闻中心',
            summary: '集团发布数字化转型计划。',
            page_type: 'news',
            scraped_at: '2026-05-16T04:02:00.000Z',
          },
        ],
        news: [
          {
            title: '集团启动新一轮工业 AI 项目',
            url: 'https://news.example.com/1',
            published_at: 'Sat, 16 May 2026 00:00:00 GMT',
            summary: '公开新闻显示集团启动工业 AI 项目。',
          },
        ],
      },
    });

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.source_kind === 'public_web')).toBe(true);
    expect(rows.every((row) => row.source_table === 'public_web')).toBe(true);
    expect(rows.every((row) => row.metadata.visibility === 'public')).toBe(true);
    expect(rows.every((row) => row.metadata.should_auto_writeback === false)).toBe(true);
    expect(rows.map((row) => row.source_row_id)).toEqual([
      expect.stringMatching(/^official-site:/),
      expect.stringMatching(/^official-page:/),
      expect.stringMatching(/^news:/),
    ]);
  });

  it('skips empty and errored public pages', () => {
    const rows = buildPublicWebSourceRecords({
      orgId: 'org_1',
      accountId: 'acc_1',
      intel: {
        company_name: '测试客户',
        timestamp: '2026-05-16T04:00:00.000Z',
        website: { url: 'https://example.com', error: 'blocked' },
        public_pages: [
          { url: 'https://example.com/about', error: 'robots disallow' },
          { url: 'https://example.com/team', title: '团队页' },
        ],
        news: [{ error: 'rss failed' }],
      },
    });

    expect(rows).toEqual([]);
  });
});
