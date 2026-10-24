import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { chromium } from '@playwright/test';

const QA_PORT = '3001';
const QA_HOST = '127.0.0.1';
const QA_BASE_URL = 'http://' + QA_HOST + ':' + QA_PORT;
const args = new Set(process.argv.slice(2));
const skipBuild = args.has('--no-build');
const reuseServer = args.has('--reuse-server');
const headless = process.env.QA_HEADLESS !== '0';

function fail(message) {
  console.error('[local-prod-qa] ' + message);
  process.exit(1);
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

if (process.env.PORT && process.env.PORT !== QA_PORT) {
  fail('PORT must be ' + QA_PORT + ' for local production QA, got ' + process.env.PORT + '.');
}

for (const key of ['QA_BASE_URL', 'CLOSR_LOCAL_QA_BASE_URL']) {
  if (process.env[key] && process.env[key] !== QA_BASE_URL) {
    fail(key + ' must be ' + QA_BASE_URL + '; local QA is pinned to port ' + QA_PORT + '.');
  }
}

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
  throw new Error('Timed out waiting for ' + QA_BASE_URL + '/api/health: ' + lastError);
}

async function healthIsReady() {
  try {
    const res = await fetch(QA_BASE_URL + '/api/health', { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

function startServer() {
  const child = spawn('npm', ['run', 'start:qa'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: QA_PORT,
      QA_BASE_URL: QA_BASE_URL,
      CLOSR_LOCAL_QA_BASE_URL: QA_BASE_URL,
    },
  });
  child.stdout.on('data', (chunk) => process.stdout.write('[next-start] ' + chunk));
  child.stderr.on('data', (chunk) => process.stderr.write('[next-start] ' + chunk));
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error('[local-prod-qa] next start exited with ' + code);
    }
  });
  return child;
}

async function waitForBodyText(page, expected, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const text = await page.locator('body').innerText().catch(() => '');
    if (expected.every((item) => text.includes(item))) return text;
    await page.waitForTimeout(300);
  }
  const text = await page.locator('body').innerText().catch(() => '');
  throw new Error('Missing text: ' + expected.filter((item) => !text.includes(item)).join(', '));
}

function summarizeConsoleEvent(event) {
  return {
    type: event.type,
    text: event.text.slice(0, 800),
    url: event.url,
  };
}

function isHmrEvent(event) {
  const haystack = event.text + ' ' + (event.url ?? '');
  return /webpack-hmr|hot-update|Hot Module|\bHMR\b|__nextjs|EventSource|WebSocket/i.test(haystack);
}

function isBenignBrowserQaNoise(event) {
  const url = event.url ?? '';
  const text = event.text ?? '';
  if (/googletagmanager\.com|google-analytics\.com/.test(url)) return true;
  if (event.type === 'requestfailed' && text === 'net::ERR_ABORTED') return true;
  if (event.type === 'error' && /\[MorningBriefing\] fetch error: TypeError: Failed to fetch/.test(text)) return true;
  if (event.type === 'error' && /TypeError: Failed to fetch[\s\S]*_useSession[\s\S]*_getUser/.test(text)) return true;
  return false;
}

async function runBrowserQa() {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    baseURL: QA_BASE_URL,
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  const consoleEvents = [];
  const pageErrors = [];
  const failedRequests = [];
  const serverErrors = [];
  const seedResponses = [];
  const steps = [];

  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) {
      consoleEvents.push({ type: msg.type(), text: msg.text(), url: msg.location().url });
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push({ type: 'pageerror', text: error.message, url: page.url() });
  });
  page.on('requestfailed', (request) => {
    failedRequests.push({
      type: 'requestfailed',
      text: request.failure()?.errorText ?? 'request failed',
      url: request.url(),
    });
  });
  page.on('response', async (response) => {
    const url = response.url();
    if (url.startsWith(QA_BASE_URL) && response.status() >= 500) {
      serverErrors.push({ type: 'server-error', text: 'HTTP ' + response.status(), url });
    }
    if (url.startsWith(QA_BASE_URL + '/api/seed-data')) {
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      seedResponses.push({ status: response.status(), url, body });
    }
  });

  async function step(name, action) {
    const started = Date.now();
    try {
      const detail = await action();
      steps.push({ name, status: 'pass', durationMs: Date.now() - started, detail });
    } catch (error) {
      steps.push({
        name,
        status: 'fail',
        durationMs: Date.now() - started,
        detail: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  try {
    await step('/register renders', async () => {
      await page.goto('/register', { waitUntil: 'domcontentloaded' });
      await waitForBodyText(page, ['创建账号', '邮箱', '密码']);
      return page.url();
    });

    await step('/login?demo=true demo login redirects to /horizon', async () => {
      await page.goto('/login?demo=true', { waitUntil: 'domcontentloaded' });
      await page.getByPlaceholder('访问密码').fill(process.env.DEMO_ACCESS_PASSWORD);
      await page.getByRole('button', { name: '进入' }).click();
      await page.waitForURL(/\/horizon/, { timeout: 60_000 });
      await waitForBodyText(page, ['Closr']);
      return page.url();
    });

    await step('/api/seed-data accepts Seed B in authenticated demo session', async () => {
      const result = await page.evaluate(async () => {
        const res = await fetch('/api/seed-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variant: 'seed-b-retail', seedPassword: 'EXAMPLE_ONLY_NOT_A_PASSWORD' }),
        });
        return { status: res.status, body: await res.json().catch(() => null) };
      });
      if (result.status !== 200 || result.body?.success !== true || result.body?.seedVariant !== 'seed-b-retail') {
        throw new Error('Unexpected seed-data response: ' + JSON.stringify(result));
      }
      return result;
    });

    await step('/horizon renders Seed B retail accounts', async () => {
      await page.goto('/horizon', { waitUntil: 'domcontentloaded' });
      const text = await waitForBodyText(page, ['美国大型零售集团', '英国食品零售集团', '加拿大食品零售集团'], 45_000);
      return text.slice(0, 500);
    });

    await step('/settings data tab exposes Seed B controls', async () => {
      await page.goto('/settings', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /^数据$/ }).click();
      await page.getByRole('button', { name: /Seed B · 零售 Demo/ }).click();
      await page.getByLabel('Seed B 零售 Demo 密码').fill('EXAMPLE_ONLY_NOT_A_PASSWORD');
      const text = await page.locator('body').innerText();
      if (!text.includes('Seed B 零售 Demo 密码') || !text.includes('只有输入正确密码后')) {
        throw new Error('Seed B controls were not visible in settings data tab.');
      }
      return 'Seed B controls visible and password input accepts text';
    });

    await step('/api/seed-data restores Seed A standard demo after Seed B checks', async () => {
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
      return result;
    });

    await step('/horizon renders Seed A standard accounts after restore', async () => {
      // After switching demo datasets, use a fresh browser context so client-side
      // router cache from the Seed B pass cannot create a false positive.
      const storageState = await context.storageState();
      await context.close();
      const seedAContext = await browser.newContext({
        baseURL: QA_BASE_URL,
        viewport: { width: 1440, height: 1100 },
        storageState,
      });
      const seedAPage = await seedAContext.newPage();
      seedAPage.setDefaultTimeout(30_000);
      await seedAPage.goto('/horizon?qaSeed=seed-a-' + Date.now(), { waitUntil: 'domcontentloaded' });
      const text = await waitForBodyText(seedAPage, ['华东某头部互联网平台', '某全国性股份制银行', '某全国性通信运营商集团'], 45_000);
      await seedAContext.close();
      if (text.includes('美国大型零售集团')) {
        throw new Error('Retail seed content remained after Seed A restore.');
      }
      return text.slice(0, 500);
    });
  } finally {
    await browser.close();
  }

  const rawErrorEvents = [
    ...consoleEvents.filter((event) => event.type === 'error'),
    ...pageErrors,
    ...failedRequests,
    ...serverErrors,
  ];
  const errorEvents = rawErrorEvents.filter((event) => !isBenignBrowserQaNoise(event));
  const hmrEvents = errorEvents.filter(isHmrEvent);

  return {
    baseUrl: QA_BASE_URL,
    mode: 'next build + next start',
    port: Number(QA_PORT),
    headless,
    steps,
    seedResponses,
    consoleErrors: errorEvents.map(summarizeConsoleEvent),
    ignoredConsoleNoise: rawErrorEvents.filter(isBenignBrowserQaNoise).map(summarizeConsoleEvent),
    hmrErrors: hmrEvents.map(summarizeConsoleEvent),
  };
}

let server;

try {
  if (!skipBuild) {
    await run('npm', ['run', 'build'], { env: { NODE_ENV: 'production' } });
  }

  if (!reuseServer) {
    if (await healthIsReady()) {
      fail('Port 3001 is already serving /api/health. Stop it first or run npm run qa:local:reuse intentionally.');
    }
    server = startServer();
  }

  await waitForHealth();
  const summary = await runBrowserQa();

  console.log(JSON.stringify(summary, null, 2));

  if (summary.steps.some((item) => item.status !== 'pass')) {
    fail('One or more QA steps failed.');
  }
  if (summary.hmrErrors.length !== 0) {
    fail('HMR errors must be 0, got ' + summary.hmrErrors.length + '.');
  }
  if (summary.consoleErrors.length !== 0) {
    fail('Console/runtime errors must be reviewed, got ' + summary.consoleErrors.length + '.');
  }

  console.log('[local-prod-qa] PASS: local production QA completed on http://127.0.0.1:3001 with HMR errors=0.');
} finally {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      server.kill('SIGTERM');
    }
  }
}
