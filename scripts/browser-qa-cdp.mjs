import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.QA_BASE_URL || 'http://localhost:3100';
const outDir = process.env.QA_OUT_DIR || 'docs/qa/2026-05-12-closr-2-final-browser-qa';
mkdirSync(outDir, { recursive: true });

function loadEnv(path = '.env.local') {
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const userDataDir = `/tmp/closr-cdp-${Date.now()}`;
const port = 9333 + Math.floor(Math.random() * 1000);
const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1440,1200',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let seq = 0;
const pending = new Map();
const events = [];
let ws;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function waitForWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const targets = await getJson(`http://127.0.0.1:${port}/json/list`);
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(100);
  }
  throw new Error('Chrome CDP did not start');
}

function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
}

async function connect() {
  const wsUrl = await waitForWsUrl();
  ws = new WebSocket(wsUrl);
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id && pending.has(data.id)) {
      const item = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) item.reject(new Error(`${item.method}: ${data.error.message}`));
      else item.resolve(data.result);
    } else if (data.method) {
      if (['Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded'].includes(data.method)) events.push(data);
    }
  };
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
}

async function navigate(path) {
  const url = path.startsWith('http') ? path : `${base}${path}`;
  await send('Page.navigate', { url });
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      const text = await evalJs('document.body?.innerText || ""');
      if (text && text.trim() !== 'Loading...') break;
    } catch {}
  }
  await sleep(3500);
}

async function evalJs(expression, awaitPromise = true) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime exception');
  return result.result?.value;
}

async function screenshot(name) {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  return file;
}

async function loginAndSeed() {
  await navigate('/login');
  const access = JSON.stringify(process.env.DEMO_ACCESS_PASSWORD || '');
  await evalJs(`(async () => {
    const input = document.querySelector('button[type="button"]:last-of-type');
    return document.body.innerText;
  })()`);
  await evalJs(`(async () => {
    const buttons = [...document.querySelectorAll('button')];
    const demo = buttons.find(b => /Demo|演示|试用/.test(b.innerText));
    if (!demo) throw new Error('demo button not found');
    demo.click();
    await new Promise(r => setTimeout(r, 300));
    const input = [...document.querySelectorAll('input[type="password"]')].at(-1);
    if (!input) throw new Error('demo password input not found');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter.call(input, ${access});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const enter = [...document.querySelectorAll('button')].reverse().find(b => /进入|Enter|开始/.test(b.innerText));
    if (!enter) throw new Error('demo enter button not found');
    enter.click();
    return true;
  })()`);
  for (let i = 0; i < 80; i++) {
    const href = await evalJs('location.href');
    const text = await evalJs('document.body.innerText.slice(0, 500)');
    if (href.includes('/horizon')) return { ok: true, href };
    if (/失败|未授权|错误/.test(text)) return { ok: false, href, text };
    await sleep(500);
  }
  return { ok: false, href: await evalJs('location.href'), text: await evalJs('document.body.innerText.slice(0, 1000)') };
}

async function buildPages() {
  const eastPlays = await evalJs(`(async () => { const r = await fetch('/api/strategic-play?accountId=acc_eastchina_platform_001'); return await r.json(); })()`);
  const carrierPlays = await evalJs(`(async () => { const r = await fetch('/api/strategic-play?accountId=acc_chinamobile_002'); return await r.json(); })()`);
  const choosePlayable = (plays) => plays?.find((p) => p.status === 'active' || p.status === 'in_progress') ?? plays?.[0];
  const eastPlayId = choosePlayable(eastPlays?.plays)?.id;
  const carrierPlayId = choosePlayable(carrierPlays?.plays)?.id;
  return [
    { name: 'horizon', path: '/horizon', checks: ['今日', '局势'] },
    { name: 'account-overview', path: '/accounts/acc_eastchina_platform_001?tab=overview', checks: ['当前局势', '下一步', '判断'] },
    { name: 'account-plays-decode', path: `/accounts/acc_eastchina_platform_001?tab=plays${eastPlayId ? `&playId=${eastPlayId}` : ''}`, checks: ['单局赢单路径', '失败说明什么'] },
    { name: 'rfp-tab', path: '/pipeline/opp_cmcc_5g_003?tab=rfp&rfpId=11111111-1111-1111-1111-111111111016', checks: ['RFP 管理', '判断：谨慎投标'] }, 
    { name: 'rfp-linked-play', path: `/accounts/acc_chinamobile_002?tab=plays${carrierPlayId ? `&playId=${carrierPlayId}` : ''}`, checks: ['单局赢单路径', '失败说明什么'] },
    { name: 'decode', path: '/decode', checks: ['解读', '信号录入'] },
  ];
}

try {
  await connect();
  const login = await loginAndSeed();
  const results = [];
  let verify = null;
  if (login.ok) {
    try {
      verify = await evalJs(`(async () => { const r = await fetch('/api/verify-demo'); return { status: r.status, body: await r.json().catch(() => null) }; })()`);
    } catch (e) { verify = { error: String(e) }; }
    const pages = await buildPages();
    for (const page of pages) {
      await navigate(page.path);
      if (page.action) {
        await evalJs(page.action);
        await sleep(3500);
      }
      const text = await evalJs('document.body.innerText');
      const href = await evalJs('location.href');
      const file = await screenshot(page.name);
      results.push({
        ...page,
        href,
        screenshot: file,
        textSample: text.slice(0, 2000),
        checks: page.checks.map(c => ({ text: c, present: text.includes(c) })),
      });
    }
  }
  const relevantEvents = events.map(e => ({ method: e.method, params: e.params })).filter(e => {
    const s = JSON.stringify(e);
    return /error|Error|exception|failed|warn/i.test(s) && !/favicon|middleware/i.test(s);
  }).slice(-80);
  const summary = { base, login, verify, results, relevantEvents };
  writeFileSync(join(outDir, 'browser-qa.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ outDir, login, verifyStatus: verify?.status, pages: results.map(r => ({ name: r.name, checks: r.checks })), eventCount: relevantEvents.length }, null, 2));
} finally {
  try { ws?.close(); } catch {}
  chrome.kill('SIGTERM');
}
