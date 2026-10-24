#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.CLOSR_QA_BASE_URL ?? 'http://localhost:3001';
const demoPassword = process.env.DEMO_ACCESS_PASSWORD ?? process.env.DEMO_PASSWORD;
const outDir = process.env.CLOSR_QA_OUT_DIR
  ?? 'docs/qa/latest-english-visible-scan';

const routes = [
  '/horizon',
  '/dashboard',
  '/atlas',
  '/accounts',
  '/accounts/acc_eastchina_platform_001?tab=overview',
  '/accounts/acc_eastchina_platform_001?tab=contacts',
  '/accounts/acc_eastchina_platform_001?tab=team',
  '/accounts/acc_eastchina_platform_001?tab=org',
  '/accounts/acc_eastchina_platform_001?tab=activity',
  '/accounts/acc_eastchina_platform_001?tab=knowledge',
  '/accounts/acc_eastchina_platform_001?tab=analysis',
  '/accounts/acc_eastchina_platform_001?tab=plays',
  '/pipeline',
  '/pipeline/opp_customer_a_ri_001',
  '/pipeline/opp_cmcc_5g_003',
  '/contacts',
  '/decode',
  '/compose',
  '/plays',
  '/forecast',
  '/reports',
  '/leaderboard',
  '/performance',
  '/notifications',
  '/tasks',
  '/settings',
  '/forge',
  '/intel',
  '/competitive-analysis',
  '/financial-analysis',
  '/products',
  '/pool',
  '/pulse',
  '/calendar',
  '/channels',
  '/organization',
  '/help',
];

const cjkPattern = /[\u3400-\u9fff]/;
const forbiddenEnglishFallbackPatterns = [
  /Account analysis for this sales scenario/i,
  /Sales detail/i,
  /Sales signal/i,
  /Sales-context summary/i,
  /Customer-facing detail/i,
  /Named account record/i,
  /Named business item/i,
  /Account evidence item \d+/i,
  /\bevidence item \d+\b/i,
  /Account evidence detail/i,
  /Evidence-backed account note/i,
  /Review customer evidence/i,
  /Customer evidence requires a specific follow-up action/i,
  /highlights a stakeholder question/i,
  /points to a specific stakeholder question/i,
  /Sanitized customer communication excerpt/i,
  /Stakeholder contact/i,
  /Stakeholder owner(?!ship)/i,
  /Business context detail/i,
  /Evidence review step/i,
  /Strategic play detail/i,
  /customerStatus:/i,
  /\bNEXT STEPACTION\b/i,
  /\bCustomer value\b/i,
  /\bCustomer signal\b/i,
  /\bCustomer item\b/i,
  /\bStrategic play value\b/i,
];

function linesWithCjk(text) {
  return [
    ...new Set(
      text
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => cjkPattern.test(line) && line.length > 0),
    ),
  ];
}

function linesWithForbiddenFallback(text) {
  return [
    ...new Set(
      text
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => forbiddenEnglishFallbackPatterns.some((pattern) => pattern.test(line))),
    ),
  ];
}

function fileSlug(route) {
  return route.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'root';
}

if (!demoPassword) {
  console.error('Set DEMO_ACCESS_PASSWORD or DEMO_PASSWORD before running the English visible-text scan.');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.setDefaultTimeout(45_000);

const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

try {
  await page.goto(`${baseUrl}/login?demo=true&lang=en`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.getByPlaceholder(/访问密码|Access password/i).fill(demoPassword);
  await page.getByRole('button', { name: /进入|Enter/i }).click();
  await page.waitForFunction(() => location.pathname === '/horizon', null, { timeout: 90_000 });
  await page.evaluate(() => localStorage.setItem('closr-locale', 'en'));
  const seedResult = await page.evaluate(async () => {
    const res = await fetch('/api/seed-data', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ variant: 'seed-a', seedLocale: 'en' }),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  });
  if (seedResult.status !== 200 || seedResult.body?.success !== true || seedResult.body?.seedLocale !== 'en') {
    throw new Error('English seed restore failed: ' + JSON.stringify(seedResult));
  }

  const results = [];
  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1_600);

    const body = await page.locator('body').innerText().catch((error) => String(error));
    const hits = [...linesWithCjk(body), ...linesWithForbiddenFallback(body)];
    results.push({ path: route, hits });
    console.log(JSON.stringify({ path: route, hits: hits.length }));

    if (hits.length > 0) {
      await page.screenshot({
        path: path.join(outDir, `${fileSlug(route)}.png`),
        fullPage: true,
      }).catch(() => {});
    }
  }

  const summary = {
    outDir,
    totalPages: routes.length,
    pagesWithHits: results.filter((result) => result.hits.length > 0).length,
    totalHits: results.reduce((total, result) => total + result.hits.length, 0),
    results,
    errors,
  };

  fs.writeFileSync(path.join(outDir, 'full-scan.json'), JSON.stringify(summary, null, 2));
  console.log('SUMMARY', JSON.stringify({
    outDir: summary.outDir,
    totalPages: summary.totalPages,
    pagesWithHits: summary.pagesWithHits,
    totalHits: summary.totalHits,
    errors: summary.errors.length,
  }, null, 2));

  if (summary.totalHits > 0) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}

process.exit(process.exitCode ?? 0);
