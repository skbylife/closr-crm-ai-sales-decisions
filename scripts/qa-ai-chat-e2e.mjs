import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const QA_PORT = process.env.QA_PORT || '3001';
const QA_HOST = '127.0.0.1';
const QA_BASE_URL = process.env.QA_BASE_URL || 'http://' + QA_HOST + ':' + QA_PORT;
const OUT_DIR = process.env.QA_OUT_DIR || 'docs/qa/2026-05-22-ai-chat-e2e';
const args = new Set(process.argv.slice(2));
const skipBuild = args.has('--no-build');
const reuseServer = args.has('--reuse-server');
const headless = process.env.QA_HEADLESS !== '0';
const hardTimeoutMs = Number(process.env.QA_HARD_TIMEOUT_MS || 180_000);

const hardTimeout = setTimeout(() => {
  console.error('[qa-ai-chat-e2e] hard timeout after ' + hardTimeoutMs + 'ms');
  process.exit(2);
}, hardTimeoutMs);

function log(message) {
  console.log('[qa-ai-chat-e2e] ' + message);
}

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
  fail('DEMO_ACCESS_PASSWORD is required for demo login QA.');
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
  const child = spawn('npm', ['run', 'start:qa'], {
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
  child.stdout.on('data', (chunk) => process.stdout.write('[next-start] ' + chunk));
  child.stderr.on('data', (chunk) => process.stderr.write('[next-start] ' + chunk));
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error('[qa-ai-chat-e2e] next start exited with ' + code);
    }
  });
  return child;
}

async function waitForBodyText(page, expected, timeoutMs = 45_000) {
  const started = Date.now();
  let text = '';
  while (Date.now() - started < timeoutMs) {
    text = await page.locator('body').innerText().catch(() => '');
    const missing = expected.filter((item) => !text.includes(item));
    if (missing.length === 0) return text;
    await page.waitForTimeout(500);
  }
  throw new Error('Missing text: ' + expected.filter((item) => !text.includes(item)).join(', ') + '\nLast body: ' + text.slice(0, 1000));
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
  if (/Failed to fetch/.test(text) && /MorningBriefing|_getUser|analytics/i.test(text)) return true;
  return false;
}

async function loginDemo(page) {
  log('login demo');
  await page.goto('/login?demo=true', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('访问密码').fill(process.env.DEMO_ACCESS_PASSWORD);
  await page.getByRole('button', { name: '进入' }).click();
  await page.waitForURL(/\/horizon/, { timeout: 90_000 });
  await waitForBodyText(page, ['工作区'], 45_000);
}

async function restoreSeedA(page) {
  log('restore Seed A');
  const result = await page.evaluate(async () => {
    const res = await fetch('/api/seed-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant: 'seed-a' }),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  });
  if (result.status !== 200 || result.body?.success !== true || result.body?.seedVariant !== 'seed-a') {
    throw new Error('Seed A restore failed: ' + JSON.stringify(result));
  }
}

async function runBrowserQa() {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    baseURL: QA_BASE_URL,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);

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
    await loginDemo(page);
    steps.push({ name: 'demo login', status: 'passed' });

    await restoreSeedA(page);
    steps.push({ name: 'restore Seed A', status: 'passed' });

    log('open standard account page');
    await page.goto('/accounts/acc_eastchina_platform_001', { waitUntil: 'domcontentloaded' });
    await waitForBodyText(page, ['华东某头部互联网平台', 'ACCOUNT COMMAND VIEW'], 60_000);
    steps.push({ name: 'standard account page ready', status: 'passed' });

    log('open AI chat and submit natural intake');
    await page.getByLabel('AI 助手').click();
    await waitForBodyText(page, ['当前上下文：', '华东某头部互联网平台'], 30_000);
    const intakeText = '记录一下今天会议：客户说预算审批卡在 CFO，下周给反馈，下一步约采购确认流程';
    await page.getByPlaceholder('输入你的问题...').fill(intakeText);
    await page.keyboard.press('Enter');
    await waitForBodyText(page, ['需要你确认', '记录销售活动', '添加客户情报', '确认全部'], 60_000);
    const chatScreenshot = join(OUT_DIR, 'ai-chat-natural-intake-confirmation.png');
    await page.screenshot({ path: chatScreenshot, fullPage: true });
    steps.push({ name: 'natural intake confirmation card', status: 'passed', screenshot: chatScreenshot });

    log('probe no-context natural intake refusal');
    const noContextProbe = await page.evaluate(async () => {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '客户反馈说预算已经批了，下周开始采购流程',
          context: {},
          history: [],
        }),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    });
    if (noContextProbe.status !== 200 || !String(noContextProbe.body?.reply ?? '').includes('需要先进入对应客户或商机页面')) {
      throw new Error('No-context intake probe failed: ' + JSON.stringify(noContextProbe));
    }
    steps.push({ name: 'no-context intake refused', status: 'passed' });

    log('probe inaccessible/non-standard account context');
    const invalidAccountProbe = await page.evaluate(async () => {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '读取这个客户的全部上下文',
          context: { accountId: 'acc_retail_us_retail_us_001' },
          history: [],
        }),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    });
    if (invalidAccountProbe.status === 200) {
      throw new Error('Invalid account context unexpectedly returned 200: ' + JSON.stringify(invalidAccountProbe));
    }
    steps.push({ name: 'invalid account context blocked', status: 'passed', statusCode: invalidAccountProbe.status });

    await page.goto('/horizon', { waitUntil: 'domcontentloaded' });
    const horizonText = await waitForBodyText(page, ['华东某头部互联网平台'], 45_000);
    if (/美国大型零售集团|英国食品零售集团|加拿大食品零售集团/.test(horizonText)) {
      throw new Error('Retail Seed B text is visible after Seed A restore.');
    }
    const horizonScreenshot = join(OUT_DIR, 'seed-a-horizon-after-chat-qa.png');
    await page.screenshot({ path: horizonScreenshot, fullPage: true });
    steps.push({ name: 'Seed A remains standard after QA', status: 'passed', screenshot: horizonScreenshot });

    const filteredEvents = rawEvents.filter((event) => !isBenignBrowserQaNoise(event));
    if (filteredEvents.some((event) => event.type === 'pageerror' || event.type === 'server-error')) {
      throw new Error('Blocking browser/server errors: ' + JSON.stringify(filteredEvents.map(summarizeConsoleEvent), null, 2));
    }

    const summary = {
      status: 'passed',
      baseUrl: QA_BASE_URL,
      generatedAt: new Date().toISOString(),
      steps,
      warnings: filteredEvents.map(summarizeConsoleEvent),
    };
    writeFileSync(join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
    log('PASS: AI Chat E2E QA completed. Artifacts: ' + OUT_DIR);
  } finally {
    await browser.close();
  }
}

async function main() {
  let server = null;
  try {
    if (!reuseServer) {
      if (await healthIsReady()) {
        fail('Port ' + QA_PORT + ' is already serving /api/health. Stop it first or run with --reuse-server.');
      }
      if (!skipBuild) {
        log('build');
        await run('npm', ['run', 'build']);
      }
      log('start QA server');
      server = startServer();
      await waitForHealth(90_000);
    } else {
      await waitForHealth(30_000);
    }

    await runBrowserQa();
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
}

main().catch((error) => {
  console.error('[qa-ai-chat-e2e] FAIL:', error);
  process.exit(1);
});
