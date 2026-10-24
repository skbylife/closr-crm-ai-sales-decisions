#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';

const repoRoot = process.cwd();
const endpoint = '/api/engine/judgment/snapshot';
const fixtureNames = ['renewal-expansion', 'security-review', 'rfp-tender'];
const args = new Set(process.argv.slice(2));
const shouldBuild = !args.has('--no-build');
const timeoutMs = Number(process.env.ENGINE_HTTP_TIMEOUT_MS || 30_000);
const explicitPort = process.env.CLOSR_ENGINE_HTTP_SMOKE_PORT;
let serverProcess;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readFixture(name) {
  const fixturePath = join(repoRoot, 'fixtures/engine', name, 'input.json');
  assert(existsSync(fixturePath), `Missing engine fixture: ${fixturePath}`);
  return JSON.parse(readFileSync(fixturePath, 'utf8'));
}

async function getFreePort() {
  if (explicitPort) return Number(explicitPort);

  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => probe.close(resolve));
  assert(port > 0, 'Could not allocate a local smoke port');
  return port;
}

function runBuild() {
  console.log('- build: npm run build');
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function startServer(port) {
  console.log(`- start: next start on 127.0.0.1:${port}`);
  const child = spawn('npx', ['next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      DATABASE_URL: 'postgresql://EXAMPLE_USER:EXAMPLE_PASSWORD@127.0.0.1:9/closr_engine_http_smoke',
      SUPABASE_DB_URL: 'postgresql://EXAMPLE_USER:EXAMPLE_PASSWORD@127.0.0.1:9/closr_engine_http_smoke',
      PG_SSL: 'false',
    },
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[next] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[next] ${chunk}`));
  return child;
}

async function stopServer(child) {
  if (!child?.pid) return;

  const exited = new Promise((resolve) => child.once('exit', () => resolve(true)));
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }

  const done = await Promise.race([exited, sleep(5_000).then(() => false)]);
  if (!done) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

async function fetchJson(baseUrl, path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        fail(`Expected JSON from ${path}, got: ${text.slice(0, 240)}`);
      }
    }
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForReady(baseUrl) {
  const startedAt = Date.now();
  let lastError = '';
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await fetch(`${baseUrl}${endpoint}`, {
        method: 'GET',
        signal: AbortSignal.timeout(1_000),
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await sleep(300);
    }
  }
  fail(`Timed out waiting for ${baseUrl}: ${lastError}`);
}

function validateSnapshotResponse(fixtureName, input, body) {
  assert(body?.snapshot, `${fixtureName}: missing snapshot`);
  assert(body?.persistence?.persisted === false, `${fixtureName}: HTTP smoke must not persist`);
  assert(body.persistence.snapshotId === undefined, `${fixtureName}: snapshotId must not appear when persist=false`);
  assert(body.persistence.counts === undefined, `${fixtureName}: counts must not appear when persist=false`);

  const snapshot = body.snapshot;
  assert(snapshot.schemaVersion === 'closr_judgment_engine_v1', `${fixtureName}: invalid schemaVersion`);
  assert(snapshot.tenantId === input.tenantId, `${fixtureName}: tenantId mismatch`);
  assert(snapshot.accountId === input.accountId, `${fixtureName}: accountId mismatch`);
  assert(snapshot.opportunityId === input.opportunityId, `${fixtureName}: opportunityId mismatch`);
  assert(snapshot.judgmentSummary?.health === 'at_risk', `${fixtureName}: expected at_risk health`);
  assert(typeof snapshot.judgmentSummary?.primaryRisk === 'string', `${fixtureName}: missing primaryRisk`);
  assert(snapshot.writebackPolicy?.mode === 'proposal_only', `${fixtureName}: expected proposal_only writeback`);
  assert(Array.isArray(snapshot.writebackPolicy?.prohibitedFields), `${fixtureName}: prohibitedFields must be an array`);
  for (const field of ['opportunity.stage', 'opportunity.amount', 'opportunity.forecast_category', 'opportunity.close_date', 'opportunity.owner']) {
    assert(snapshot.writebackPolicy.prohibitedFields.includes(field), `${fixtureName}: missing prohibited field ${field}`);
  }
  assert(Array.isArray(snapshot.crmFieldUpdates), `${fixtureName}: crmFieldUpdates must be an array`);
  assert(snapshot.crmFieldUpdates.length === 0, `${fixtureName}: crmFieldUpdates must stay empty`);
  assert(Array.isArray(snapshot.sources) && snapshot.sources.length === input.sources.length, `${fixtureName}: source count mismatch`);
  assert(Array.isArray(snapshot.evidenceRefs) && snapshot.evidenceRefs.length > 0, `${fixtureName}: missing evidenceRefs`);
  assert(Array.isArray(snapshot.judgments) && snapshot.judgments.length === 1, `${fixtureName}: expected one judgment`);
  assert(snapshot.judgments[0].status === 'proposed', `${fixtureName}: judgment must stay proposed`);
  assert(Array.isArray(snapshot.winGaps) && snapshot.winGaps.length === 1, `${fixtureName}: expected one win gap`);
  assert(snapshot.winGaps[0].status === 'open', `${fixtureName}: win gap must stay open`);
  assert(Array.isArray(snapshot.moves) && snapshot.moves.length === 1, `${fixtureName}: expected one move`);
  assert(snapshot.moves[0].status === 'proposed', `${fixtureName}: move must stay proposed`);
  assert(snapshot.moves[0].approvalRequired === true, `${fixtureName}: move must require approval`);
  assert(snapshot.moves[0].winGapId === snapshot.winGaps[0].id, `${fixtureName}: move must link to win gap`);
}

async function smokeFixture(baseUrl, fixtureName) {
  const input = readFixture(fixtureName);
  const requestBody = {
    ...input,
    persist: false,
  };
  assert(requestBody.persist === false, `${fixtureName}: refusing to send persist !== false`);

  const { response, body } = await fetchJson(baseUrl, endpoint, {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
  assert(response.status === 200, `${fixtureName}: expected HTTP 200, got ${response.status}`);
  validateSnapshotResponse(fixtureName, input, body);
  console.log(`  ✓ ${fixtureName}: ${body.snapshot.judgmentSummary.primaryRisk}, persisted=false`);
}

async function smokeInvalidPayload(baseUrl) {
  const { response, body } = await fetchJson(baseUrl, endpoint, {
    method: 'POST',
    body: JSON.stringify({
      tenantId: 'tenant_demo',
      accountId: 'acct_invalid_http_smoke',
      persist: false,
      sources: [
        {
          id: 'src_invalid_http_smoke',
          tenantId: 'tenant_demo',
          sourceType: 'email',
          accountId: 'acct_invalid_http_smoke',
          occurredAt: 'not-a-date',
          content: '',
        },
      ],
    }),
  });
  assert(response.status === 400, `invalid payload: expected HTTP 400, got ${response.status}`);
  assert(typeof body?.error === 'string', 'invalid payload: expected error message');
  console.log('  ✓ invalid payload: HTTP 400');
}

async function main() {
  console.log('Closr Judgment Engine HTTP smoke');
  console.log('- checks: real Next HTTP POST, persist=false, proposal-only writeback, invalid payload 400');
  console.log('- DB write guard: DATABASE_URL/SUPABASE_DB_URL overridden to local blackhole');

  if (shouldBuild) runBuild();
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`- base url: ${baseUrl}`);

  serverProcess = startServer(port);
  try {
    await waitForReady(baseUrl);
    for (const fixtureName of fixtureNames) {
      await smokeFixture(baseUrl, fixtureName);
    }
    await smokeInvalidPayload(baseUrl);
    console.log('Engine HTTP smoke: pass');
  } finally {
    await stopServer(serverProcess);
  }
}

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.once(signal, async () => {
    await stopServer(serverProcess);
    process.exit(code);
  });
}

main().catch(async (error) => {
  await stopServer(serverProcess);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
