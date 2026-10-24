import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const QA_HOST = '127.0.0.1';
const QA_PORT = process.env.QA_PORT || '3001';
const QA_BASE_URL = process.env.QA_BASE_URL || 'http://' + QA_HOST + ':' + QA_PORT;
const OUT_DIR = process.env.QA_OUT_DIR || 'docs/qa/2026-05-20-sales-judgment-p05-logged-in';
const args = new Set(process.argv.slice(2));
const reuseServer = args.has('--reuse-server');
const skipBuild = args.has('--no-build');
const headless = process.env.QA_HEADLESS !== '0';
const hardTimeoutMs = Number(process.env.QA_HARD_TIMEOUT_MS || 120_000);

const hardTimeout = setTimeout(() => {
  console.error('[qa-logged-in-judgment] hard timeout after ' + hardTimeoutMs + 'ms');
  process.exit(2);
}, hardTimeoutMs);

function log(message) {
  console.log('[qa-logged-in-judgment] ' + message);
}

const ROUTES = [
  { name: 'horizon', path: '/horizon', checks: ['工作区', '全景'] },
  { name: 'leaderboard', path: '/leaderboard', checks: ['团队判断看板'] },
  { name: 'performance', path: '/performance', checks: ['销售判断复盘'] },
  { name: 'pipeline', path: '/pipeline', checks: ['销售管线'] },
  { name: 'forecast', path: '/forecast', checks: ['销售预测'] },
  { name: 'account', path: '/accounts/acc_eastchina_platform_001', checks: ['客户管理', '华东某头部互联网平台', '客户全景'] },
];

function fail(message) {
  throw new Error(message);
}

function loadEnv(path = '.env.local') {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

if (!process.env.DEMO_ACCESS_PASSWORD) {
  fail('DEMO_ACCESS_PASSWORD is required.');
}

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env },
    });
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(command + ' ' + commandArgs.join(' ') + ' exited with ' + code));
    });
  });
}

async function healthIsReady() {
  try {
    const res = await fetch(QA_BASE_URL + '/api/health', { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(timeoutMs = 60_000) {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(QA_BASE_URL + '/api/health', { cache: 'no-store' });
      if (res.ok) return;
      lastError = 'HTTP ' + res.status;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error('Timed out waiting for health: ' + lastError);
}

function startServer() {
  return spawn('npm', ['run', 'start:qa'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: QA_PORT,
      QA_BASE_URL,
      CLOSR_LOCAL_QA_BASE_URL: QA_BASE_URL,
    },
  });
}

async function waitForDashboardReady(page, timeoutMs = 30_000) {
  const started = Date.now();
  let lastText = '';
  while (Date.now() - started < timeoutMs) {
    lastText = await page.locator('body').innerText().catch(() => '');
    const trimmed = lastText.trim();
    const loadingOnly = trimmed === 'Loading...' || /^Loading\.\.\.$/.test(trimmed);
    const hasDashboardShell = lastText.includes('工作区') || lastText.includes('Demo · 高管') || lastText.includes('Closr Demo');
    const hasRuntimeFailure = /Application error|Unhandled Runtime Error|服务器错误/.test(lastText);
    if (!loadingOnly && hasDashboardShell && !hasRuntimeFailure) return lastText;
    await page.waitForTimeout(500);
  }
  throw new Error('Dashboard did not become ready. Last body text: ' + lastText.slice(0, 500));
}

async function waitForRouteText(page, route, timeoutMs = 30_000) {
  const started = Date.now();
  let lastText = '';
  let lastError = '';
  while (Date.now() - started < timeoutMs) {
    try {
      lastText = await waitForDashboardReady(page, Math.min(5_000, timeoutMs));
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await page.waitForTimeout(500);
      continue;
    }
    const missing = route.checks.filter((item) => !lastText.includes(item));
    if (missing.length === 0) return { text: lastText, missing: [] };
    await page.waitForTimeout(500);
  }
  if (!lastText && lastError) {
    throw new Error(lastError);
  }
  return {
    text: lastText,
    missing: route.checks.filter((item) => !lastText.includes(item)),
  };
}

function summarizeConsoleEvent(event) {
  return {
    type: event.type,
    text: event.text.slice(0, 800),
    url: event.url,
  };
}

function isBenignBrowserQaNoise(event) {
  const url = event.url ?? '';
  const text = event.text ?? '';
  if (/googletagmanager\.com|google-analytics\.com/.test(url)) return true;
  if (event.type === 'requestfailed' && text === 'net::ERR_ABORTED') return true;
  if (
    event.type === 'error' &&
    /\[db\] (get(Decodes|IntelItems|Knowledge|ComposedEmails)|load(AIAdvices|DecodeFeedbacks)) failed:/.test(text) &&
    /TypeError: Failed to fetch/.test(text)
  ) {
    return true;
  }
  if (/Failed to fetch/.test(text) && /MorningBriefing|_getUser|analytics/i.test(text)) return true;
  return false;
}

async function runBrowserQa() {
  mkdirSync(OUT_DIR, { recursive: true });
  log('launch browser');
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    baseURL: QA_BASE_URL,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  const rawEvents = [];
  const steps = [];

  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) {
      rawEvents.push({ type: msg.type(), text: msg.text(), url: msg.location().url });
    }
  });
  page.on('pageerror', (error) => rawEvents.push({ type: 'pageerror', text: error.message, url: page.url() }));
  page.on('requestfailed', (request) => rawEvents.push({
    type: 'requestfailed',
    text: request.failure()?.errorText ?? 'request failed',
    url: request.url(),
  }));
  page.on('response', (response) => {
    if (response.url().startsWith(QA_BASE_URL) && response.status() >= 500) {
      rawEvents.push({ type: 'server-error', text: 'HTTP ' + response.status(), url: response.url() });
    }
  });

  try {
    log('login demo');
    await page.goto('/login?demo=true', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('访问密码').fill(process.env.DEMO_ACCESS_PASSWORD);
    await page.getByRole('button', { name: '进入' }).click();
    await page.waitForURL(/\/horizon/, { timeout: 90_000 });
    await waitForDashboardReady(page, 45_000);

    for (const route of ROUTES) {
      log('check ' + route.path);
      const started = Date.now();
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      const routeTimeoutMs = route.name === 'forecast' || route.name === 'account' || route.name === 'pipeline' ? 60_000 : 45_000;
      const { text, missing } = await waitForRouteText(page, route, routeTimeoutMs);
      const screenshot = join(OUT_DIR, route.name + '-desktop.png');
      await page.screenshot({ path: screenshot, fullPage: false });
      steps.push({
        name: route.name,
        path: route.path,
        url: page.url(),
        status: missing.length === 0 ? 'pass' : 'fail',
        missing,
        durationMs: Date.now() - started,
        screenshot,
        textSample: text.slice(0, 500),
      });
    }
  } finally {
    await browser.close();
  }

  const errorEvents = rawEvents.filter((event) => !isBenignBrowserQaNoise(event));
  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: QA_BASE_URL,
    headless,
    steps,
    consoleErrors: errorEvents.map(summarizeConsoleEvent),
    ignoredConsoleNoise: rawEvents.filter(isBenignBrowserQaNoise).map(summarizeConsoleEvent),
  };
  writeFileSync(join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  return summary;
}

let server;

try {
  if (!skipBuild) {
    await run('npm', ['run', 'build'], { env: { NODE_ENV: 'production' } });
  }

  if (!reuseServer) {
    if (await healthIsReady()) {
      fail('Port ' + QA_PORT + ' is already serving /api/health. Stop it or use --reuse-server.');
    }
    server = startServer();
  }

  await waitForHealth();
  const summary = await runBrowserQa();
  console.log(JSON.stringify(summary, null, 2));

  if (summary.steps.some((step) => step.status !== 'pass')) {
    fail('One or more logged-in Judgment Layer routes failed.');
  }
  if (summary.consoleErrors.length > 0) {
    fail('Console/runtime/server errors must be reviewed, got ' + summary.consoleErrors.length + '.');
  }

  console.log('[qa-logged-in-judgment] PASS: ' + summary.steps.length + ' routes checked. Artifacts: ' + OUT_DIR);
  clearTimeout(hardTimeout);
} finally {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      server.kill('SIGTERM');
    }
  }
  clearTimeout(hardTimeout);
}
