import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import EngineDocsPage from './page';

const repoRoot = process.cwd();

function read(relativePath: string) {
  const { readFileSync } = require('node:fs');
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('/engine/docs API reference', () => {
  it('has its own docs page for the Closr Judgment Engine API', () => {
    const docsPath = join(repoRoot, 'src/app/engine/docs/page.tsx');
    expect(existsSync(docsPath)).toBe(true);

    const page = read('src/app/engine/docs/page.tsx');
    expect(page).toContain('API Reference');
    expect(page).toContain('API 参考文档');
    expect(page).toContain('/api/engine/judgment/snapshot');
    expect(page).toContain('/api/engine/decode');
    expect(page).toContain('/api/engine/strategic-play');
    expect(page).toContain('judgmentSummary');
    expect(page).toContain('proposal_only');
    expect(page).toContain('curl');
  });

  it('documents all three API endpoints', () => {
    const html = renderToStaticMarkup(createElement(EngineDocsPage));

    expect(html).toContain('POST');
    expect(html).toContain('/api/engine/judgment/snapshot');
    expect(html).toContain('/api/engine/decode');
    expect(html).toContain('/api/engine/strategic-play');
    expect(html).toContain('closr_judgment_engine_v1');
    expect(html).toContain('proposal_only');
    expect(html).toContain('规范化信号 + 证据片段 + 信号画像');
    expect(html).toContain('传入已有判断 + 赢单缺口 + 可选谋局目标');
    expect(html).toContain('快捷路径');
  });

  it('documents the decode and strategic-play API details', () => {
    const html = renderToStaticMarkup(createElement(EngineDocsPage));

    expect(html).toMatch(/<h2\b[^>]*>5\. Decode API<\/h2>/);
    expect(html).toMatch(/<h2\b[^>]*>6\. Strategic Play API<\/h2>/);
    expect(html).toContain('signalProfile');
    expect(html).toContain('signalStrength');
    expect(html).toContain('evidenceRefs');
    expect(html).toContain('moves');
    expect(html).toContain('winGaps');
  });

  it('documents the error codes', () => {
    const html = renderToStaticMarkup(createElement(EngineDocsPage));

    expect(html).toContain('400');
    expect(html).toContain('tenantId is required');
    expect(html).toContain('accountId is required');
    expect(html).toContain('judgments are required');
    expect(html).toContain('winGaps are required');
  });

  it('documents integration patterns', () => {
    const html = renderToStaticMarkup(createElement(EngineDocsPage));

    expect(html).toContain('集成模式');
    for (const pattern of ['模式 A：全链路 Snapshot', '模式 B：解读 → 判断 → 谋局', '模式 C：带目标的谋局', '模式 D：仅用谋局']) {
      expect(html).toMatch(new RegExp(`<h3\\b[^>]*>${pattern}</h3>`));
    }
    expect(html).toContain('playGoal');
  });

  it('offers the localized Engine marketing entrypoint without exposing API docs on the homepage', () => {
    const homepage = read('src/app/page.tsx');

    expect(homepage).toContain('href={locale === "en" ? "/engine?lang=en" : "/engine"}');
    expect(homepage).toContain('{copy.engineLink}');
    expect(homepage).toContain('engineLink: "引擎"');
    expect(homepage).toContain('engineLink: "Engine"');
    expect(homepage).not.toContain('/engine/docs');
    expect(homepage).not.toContain('/api/engine/');
    expect(homepage).not.toMatch(/Closr Judgment Engine|Judgment Engine/);
  });
});
