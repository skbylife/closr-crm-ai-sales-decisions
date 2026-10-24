import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import EngineLanding from './page';

const repoRoot = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('/engine marketing landing page', () => {
  it('has its own route page for the Closr Engine', () => {
    const pagePath = join(repoRoot, 'src/app/engine/page.tsx');
    expect(existsSync(pagePath)).toBe(true);

    const page = read('src/app/engine/page.tsx');
    expect(page).toContain('Closr Engine');
    expect(page).toContain('销售判断系统');
    expect(page).toContain('CRM');
    expect(page).toContain('无需替换');
    expect(page).toContain('私有化部署');
    expect(page).toContain('申请 PoC');
  });

  it('renders the hero with key value proposition', () => {
    const html = renderToStaticMarkup(createElement(EngineLanding));

    expect(html).toContain('把 CRM 变成');
    expect(html).toContain('销售判断系统');
    expect(html).toContain('不需要替换 CRM');
    expect(html).toContain('解释这意味着什么');
    expect(html).toContain('申请 PoC');
  });

  it('explains the problem and Engine solution', () => {
    const html = renderToStaticMarkup(createElement(EngineLanding));

    expect(html).toContain('CRM 只记录字段');
    expect(html).toContain('不是替代，是增强');
    expect(html).toContain('不改 CRM 字段');
    expect(html).toContain('对接现有系统');
    expect(html).toContain('私有化部署');
  });

  it('explains the three capabilities without exposing API endpoints', () => {
    const html = renderToStaticMarkup(createElement(EngineLanding));

    expect(html).toContain('从原始信号到可执行谋局');
    for (const capability of ['信号解读', '局势判断', '谋局建议']) {
      expect(html).toMatch(new RegExp(`<h3\\b[^>]*>${capability}</h3>`));
    }
    for (const endpoint of ['/decode', '/judgment/snapshot', '/strategic-play']) {
      expect(html).not.toContain(endpoint);
    }
  });

  it('shows the three use case scenarios', () => {
    const html = renderToStaticMarkup(createElement(EngineLanding));

    expect(html).toContain('续约扩容');
    expect(html).toContain('安全评审');
    expect(html).toContain('RFP 投标');
    expect(html).toContain('finance/procurement blocker');
    expect(html).toContain('security/compliance blocker');
    expect(html).toContain('rfp/tender process blocker');
  });

  it('highlights enterprise features', () => {
    const html = renderToStaticMarkup(createElement(EngineLanding));

    expect(html).toContain('Docker Compose 部署');
    expect(html).toContain('Writeback 安全策略');
    expect(html).toContain('BYOM');
    expect(html).toContain('多租户隔离');
    expect(html).toContain('Postgres + pgvector');
    expect(html).toContain('proposal_only');
  });

  it('routes sales and PoC calls to action to sales, keeping API docs off the marketing page', () => {
    const html = renderToStaticMarkup(createElement(EngineLanding));

    const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    for (const label of ['联系销售', '申请 PoC']) {
      const matchingLinks = links.filter((link) => link[2].includes(label));
      expect(matchingLinks.length).toBeGreaterThan(0);
      for (const link of matchingLinks) expect(link[1]).toBe('/contact-sales');
    }
    expect(html).not.toContain('/engine/docs');
    expect(html).not.toContain('查看 API');
    expect(html).not.toContain('API 文档');
  });
});
