import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:3002';
const outDir = process.env.QA_OUT_DIR || 'docs/qa/2026-06-07-strategic-play-2-route-smoke';
const accountId = process.env.QA_STRATEGIC_PLAY_ACCOUNT_ID || 'acc_eastchina_platform_001';
const headless = process.env.QA_HEADLESS !== '0';
const hardTimeoutMs = Number(process.env.QA_HARD_TIMEOUT_MS || 120_000);

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

function normalizeUrl(path) {
  return path.startsWith('http') ? path : baseUrl + path;
}

function redactUrl(url) {
  return url.replace(/[?&](accessPassword|password|token|refresh_token|access_token|apikey)=[^&]+/gi, '$1=[redacted]');
}

function redactText(text) {
  return text
    .replace(/([?&]apikey=)[^&\s'\"]+/gi, '$1[redacted]')
    .replace(/([?&](accessPassword|password|token|refresh_token|access_token)=)[^&\s'\"]+/gi, '$1[redacted]');
}

function fail(message) {
  throw new Error(message);
}

async function waitForBodyReady(page, timeoutMs = 45_000) {
  const started = Date.now();
  let lastText = '';
  while (Date.now() - started < timeoutMs) {
    lastText = await page.locator('body').innerText().catch(() => '');
    const trimmed = lastText.trim();
    const loadingOnly = trimmed === 'Loading...' || trimmed === '加载中...';
    if (trimmed.length > 20 && !loadingOnly) return lastText;
    await page.waitForTimeout(500);
  }
  fail('Page body did not become ready. Last text: ' + lastText.slice(0, 500));
}

async function waitForHealth(timeoutMs = 15_000) {
  const started = Date.now();
  let last = '';
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(normalizeUrl('/api/health'), { cache: 'no-store' });
      if (res.ok) return;
      last = 'HTTP ' + res.status;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail('Health check failed: ' + last);
}

function collectPageEvents(page, events) {
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) {
      events.push({
        type: 'console:' + msg.type(),
        text: redactText(msg.text()).slice(0, 1200),
        url: redactUrl(msg.location().url || page.url()),
      });
    }
  });
  page.on('pageerror', (error) => {
    events.push({ type: 'pageerror', text: error.message.slice(0, 1200), url: redactUrl(page.url()) });
  });
  page.on('requestfailed', (request) => {
    events.push({
      type: 'requestfailed',
      text: request.failure()?.errorText ?? 'request failed',
      url: redactUrl(request.url()),
    });
  });
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 500) {
      events.push({ type: 'server-error', text: 'HTTP ' + response.status(), url: redactUrl(response.url()) });
    }
  });
}

function isBenignEvent(event) {
  const text = event.text || '';
  const url = event.url || '';
  if (/googletagmanager\.com|google-analytics\.com|favicon\.ico/.test(url)) return true;
  if (/ERR_ABORTED/.test(text)) return true;
  if (/Failed to fetch/.test(text) && /analytics|MorningBriefing|_getUser/i.test(text)) return true;
  if (/\[strategic-play\] judgment memory fetch failed/i.test(text)) return true;
  if (/WebSocket connection .*\/realtime\/v1\/websocket.*closed before the connection is established/i.test(text)) return true;
  return false;
}

function base64Url(value) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createCookieChunks(key, value, chunkSize = 3180) {
  if (encodeURIComponent(value).length <= chunkSize) return [{ name: key, value }];
  const chunks = [];
  let encodedValue = encodeURIComponent(value);
  while (encodedValue.length > 0) {
    let encodedChunkHead = encodedValue.slice(0, chunkSize);
    const lastEscapePos = encodedChunkHead.lastIndexOf('%');
    if (lastEscapePos > chunkSize - 3) encodedChunkHead = encodedChunkHead.slice(0, lastEscapePos);
    let valueHead = '';
    while (encodedChunkHead.length > 0) {
      try {
        valueHead = decodeURIComponent(encodedChunkHead);
        break;
      } catch (error) {
        if (error instanceof URIError && encodedChunkHead.at(-3) === '%' && encodedChunkHead.length > 3) {
          encodedChunkHead = encodedChunkHead.slice(0, encodedChunkHead.length - 3);
        } else {
          throw error;
        }
      }
    }
    chunks.push(valueHead);
    encodedValue = encodedValue.slice(encodedChunkHead.length);
  }
  return chunks.map((value, index) => ({ name: key + '.' + index, value }));
}

async function fetchDemoSession(artifacts, mark) {
  mark('login:verify api');
  const verifyResponse = await fetch(normalizeUrl('/api/verify-demo'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.DEMO_ACCESS_PASSWORD }),
  });
  const verifyBody = await verifyResponse.json().catch(() => null);
  artifacts.login = { verifyStatus: verifyResponse.status, verifyOk: verifyResponse.ok, verifyBody };
  if (!verifyResponse.ok) fail('/api/verify-demo failed with HTTP ' + verifyResponse.status);

  mark('login:demo-login api');
  const loginResponse = await fetch(normalizeUrl('/api/demo-login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessPassword: process.env.DEMO_ACCESS_PASSWORD }),
  });
  const loginBody = await loginResponse.json().catch(() => null);
  artifacts.login.loginStatus = loginResponse.status;
  artifacts.login.loginOk = loginResponse.ok;
  artifacts.login.loginBodyKeys = loginBody && typeof loginBody === 'object' ? Object.keys(loginBody).sort() : [];
  if (!loginResponse.ok || !loginBody?.access_token || !loginBody?.refresh_token) {
    fail('/api/demo-login failed with HTTP ' + loginResponse.status);
  }
  return loginBody;
}

async function installDemoSession(context, loginBody, mark) {
  mark('login:install session cookie');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const storageKey = 'sb-' + new URL(supabaseUrl).hostname.split('.')[0] + '-auth-token';
  const session = {
    access_token: loginBody.access_token,
    refresh_token: loginBody.refresh_token,
    expires_in: loginBody.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + Number(loginBody.expires_in ?? 3600),
    token_type: 'bearer',
    user: loginBody.user,
  };
  const encoded = 'base64-' + base64Url(JSON.stringify(session));
  void context.addInitScript(({ chunks, key, rawSession }) => {
    for (const cookie of chunks) {
      document.cookie = cookie.name + '=' + cookie.value + '; path=/; SameSite=Lax';
    }
    document.cookie = 'closr-demo-mode=true; path=/; SameSite=Lax';
    window.localStorage.setItem(key, rawSession);
    window.localStorage.setItem('closr-locale', 'zh');
  }, {
    chunks: createCookieChunks(storageKey, encoded),
    key: storageKey,
    rawSession: JSON.stringify(session),
  }).catch((error) => {
    console.error('[qa-strategic-play-route-smoke] addInitScript failed:', error);
  });
}

async function checkRouteSurface(page, viewportName) {
  await page.goto(normalizeUrl('/accounts/' + accountId + '?tab=plays'), { waitUntil: 'domcontentloaded' });
  const apiSnapshot = await page.evaluate(async (id) => {
    const res = await fetch('/api/strategic-play?accountId=' + encodeURIComponent(id));
    const body = await res.json().catch(() => null);
    const goals = Array.isArray(body?.plays)
      ? body.plays.map((play) => play?.goalDescription).filter((goal) => typeof goal === 'string' && goal.trim().length > 0)
      : [];
    const preferredGoal = goals.find((goal) => /CTO|AIOps|iMaster|技术评审/i.test(goal)) ?? goals[0] ?? null;
    return {
      status: res.status,
      playCount: Array.isArray(body?.plays) ? body.plays.length : null,
      goals,
      preferredGoal,
    };
  }, accountId).catch((error) => ({ status: 0, playCount: null, goals: [], preferredGoal: String(error) }));
  if (apiSnapshot.preferredGoal) {
    await page.waitForFunction((goal) => document.body.innerText.includes(goal), apiSnapshot.preferredGoal, { timeout: 30_000 }).catch(() => {});
  }
  const preferredTarget = apiSnapshot.preferredGoal
    ? page.getByText(apiSnapshot.preferredGoal, { exact: false }).first()
    : null;
  const fallbackTarget = page.getByText(/获得( CTO|技术负责人)|AIOps|iMaster|技术评审会参与/i).first();
  const firstPlayTarget = preferredTarget && await preferredTarget.count() > 0 ? preferredTarget : fallbackTarget;
  if (await firstPlayTarget.count() > 0) {
    await firstPlayTarget.click();
    await page.waitForFunction(() => /当前路线图|Current Route Map/i.test(document.body.innerText), null, { timeout: 30_000 }).catch(() => {});
  }
  const text = await waitForBodyReady(page, 60_000);
  const forbidden = [/Application error/i, /Unhandled Runtime Error/i, /服务器错误|运行时错误/];
  const forbiddenHit = forbidden.find((pattern) => pattern.test(text));
  if (forbiddenHit) {
    fail(viewportName + ' runtime failure matched ' + forbiddenHit);
  }

  const required = [
    /当前路线图|Current Route Map/i,
    /当前目标|Current goal/i,
    /最大缺口|Largest gap/i,
    /下一步为什么做|Why the next move/i,
    /成功后确认什么|Success confirms/i,
    /失败后改什么线|If it fails, revise/i,
    /最近改线信号|Latest route-changing signal/i,
  ];
  const missing = required
    .map((pattern) => pattern.source)
    .filter((_, index) => !required[index].test(text));

  const screenshot = join(outDir, 'route-' + viewportName + '.png');
  await page.screenshot({ path: screenshot, fullPage: true });

  return {
    viewport: viewportName,
    url: page.url(),
    screenshot,
    missing,
    apiSnapshot,
    textSample: text.slice(0, 2500),
  };
}

async function restoreSeedA(page, mark) {
  mark('seed:restore seed-a');
  const result = await page.evaluate(async () => {
    const res = await fetch('/api/seed-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant: 'seed-a' }),
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, body };
  });
  if (result.status !== 200 || result.body?.success !== true) {
    fail('Seed A restore failed: ' + JSON.stringify(result));
  }
  return result;
}

loadEnv();
mkdirSync(outDir, { recursive: true });

if (!process.env.DEMO_ACCESS_PASSWORD) {
  fail('DEMO_ACCESS_PASSWORD is required but was not found in env or .env.local.');
}

const hardTimeout = setTimeout(() => {
  console.error('[qa-strategic-play-route-smoke] hard timeout after ' + hardTimeoutMs + 'ms');
  process.exit(2);
}, hardTimeoutMs);

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  accountId,
  headless,
  login: null,
  checks: [],
  events: [],
};

function persist(status, phase) {
  summary.status = status;
  summary.phase = phase;
  writeFileSync(join(outDir, 'route-smoke.json'), JSON.stringify(summary, null, 2));
  console.log('[qa-strategic-play-route-smoke] ' + phase);
}

persist('started', 'start ' + baseUrl);

let browser;
try {
  persist('running', 'health');
  await waitForHealth();
  persist('running', 'login demo');
  const loginBody = await fetchDemoSession(summary, (phase) => persist('running', phase));
  persist('running', 'launch chromium');
  browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, baseURL: baseUrl });
  await installDemoSession(context, loginBody, (phase) => persist('running', phase));
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(30_000);
  collectPageEvents(page, summary.events);

  await page.goto(normalizeUrl('/horizon'), { waitUntil: 'domcontentloaded' });
  await waitForBodyReady(page, 45_000);
  summary.seed = await restoreSeedA(page, (phase) => persist('running', phase));
  await page.goto(normalizeUrl('/horizon?qaSeed=seed-a-' + Date.now()), { waitUntil: 'domcontentloaded' });
  await waitForBodyReady(page, 45_000);
  persist('running', 'check desktop route');
  summary.checks.push(await checkRouteSurface(page, 'desktop'));

  await page.setViewportSize({ width: 390, height: 844 });
  persist('running', 'check mobile route');
  summary.checks.push(await checkRouteSurface(page, 'mobile'));

  const failedCheck = summary.checks.find((check) => check.missing.length > 0);
  const relevantEvents = summary.events.filter((event) => !isBenignEvent(event));
  summary.events = relevantEvents;
  persist(failedCheck || relevantEvents.length > 0 ? 'failed' : 'passed', 'finished');

  if (failedCheck) {
    fail('Missing route UI text on ' + failedCheck.viewport + ': ' + failedCheck.missing.join(', '));
  }
  if (relevantEvents.length > 0) {
    fail('Browser QA captured ' + relevantEvents.length + ' non-benign error event(s).');
  }
  console.log(JSON.stringify({
    status: summary.status,
    outDir,
    checks: summary.checks.map((check) => ({
      viewport: check.viewport,
      missing: check.missing,
      screenshot: check.screenshot,
    })),
  }, null, 2));
} catch (error) {
  summary.status = 'failed';
  summary.error = error instanceof Error ? error.message : String(error);
  writeFileSync(join(outDir, 'route-smoke.json'), JSON.stringify(summary, null, 2));
  console.error('[qa-strategic-play-route-smoke] ' + summary.error);
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  await browser?.close().catch(() => {});
}
