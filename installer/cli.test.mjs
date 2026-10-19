// Offline tests: fake servers on ephemeral loopback ports only. No Docker,
// network, real keys or runtime directory. Run: node --test installer/
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import {
  lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import {
  DEFAULT_DEPS, runDestroy, runFirstUser, runStop, runUp, safeErrorCode, serveForeground,
} from './cli.mjs';
import { connectOwned, writeFirstUserMarker } from './loopback-client.mjs';
import { RUN_RE, prepareRuntime, readRuntime, proxyConfig } from './runtime.mjs';

const RUN_ID = 'closr-community-' + '0'.repeat(20);
const LINUX_SOCKET_SPEC = Object.freeze({ runId: RUN_ID,
  dockerSocket: `/run/closr-community-test-${RUN_ID}/docker.sock` });
const USER = Object.freeze({
  email: 'closr-owner-0123456789abcdef@example.invalid', password: 'f'.repeat(48),
});
const SERVICE_KEY = 'fake-service.fake-payload.fake-signature';
const USER_ID = '11111111-2222-4333-8444-555555555555';

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

// A foreign listener that records every byte it receives.
async function occupant() {
  const received = [];
  const server = net.createServer((socket) => socket.on('data', (chunk) => received.push(chunk)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port, received,
    close: () => new Promise((resolve) => server.close(resolve)) };
}

function fakeAuthServer(responseBody) {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8') });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(responseBody));
    });
  });
  return { server, seen };
}

function firstUserDeps(port, overrides = {}) {
  const lines = [];
  const calls = { marker: [], verify: [], order: [], proxy: 0 };
  const deps = {
    ...DEFAULT_DEPS, apiPort: port, out: (line) => lines.push(line),
    makeAdapter: () => ({}),
    firstUserPrecheck: () => ({
      prepared: { runId: RUN_ID, runtimeDir: '/nonexistent/' + RUN_ID,
        material: { user: USER } },
      config: { listenPort: port, webOrigin: 'http://127.0.0.1:3000' },
      secrets: { anonKey: 'fake-anon.x.y', serviceKey: SERVICE_KEY },
    }),
    writeFirstUserMarker: (...args) => { calls.order.push('marker'); calls.marker.push(args); },
    verifyFirstUser: (...args) => { calls.order.push('verify'); calls.verify.push(args); },
    ...overrides,
  };
  return { deps, lines, calls };
}

test('up: failed preflight never reaches prepareRuntime', async (t) => {
  const busy = await occupant();
  t.after(busy.close);
  const freeWebPort = await freePort();
  const base = {
    ...DEFAULT_DEPS, platform: 'darwin', arch: 'arm64', nodeVersion: '20.19.0', euid: 501,
    out: () => {}, readMigrationSources: () => [],
    lstat: () => { const e = new Error('x'); e.code = 'ENOENT'; throw e; },
    statfs: () => ({ bavail: 10 * 1024 ** 2, bsize: 4096 }),
    dockerBinary: () => '/usr/local/bin/docker', requireLocalDockerSocket: () => {},
    makeAdapter: () => ({}), imageCheck: () => ({ platform: 'linux/arm64' }),
    apiPort: busy.port, webPort: freeWebPort,
  };
  const freeApiPort = await freePort();
  for (const [name, override, code] of [
    ['occupied port', {}, 'PORT_IN_USE'],
    ['occupied web port', { apiPort: freeApiPort, webPort: busy.port }, 'PORT_IN_USE'],
    ['image mismatch', { imageCheck: () => { throw Object.assign(new Error('x'),
      { code: 'IMAGE_POSTGRES_MISMATCH' }); } }, 'IMAGE_POSTGRES_MISMATCH'],
    ['existing run', { lstat: () => ({ isDirectory: () => true, isSymbolicLink: () => false }),
      readdir: () => [RUN_ID] }, 'EXISTING_RUNTIME_PRESENT'],
    ['low disk', { statfs: () => ({ bavail: 1, bsize: 4096 }) }, 'DISK_SPACE_LOW'],
    ['intel host', { arch: 'x64' }, 'PLATFORM_UNSUPPORTED'],
  ]) {
    let prepared = 0;
    let created = 0;
    await assert.rejects(runUp({ ...base, ...override,
      prepareRuntime: () => { prepared += 1; },
      createStack: () => { created += 1; } }),
    (error) => error.code === code, name);
    assert.equal(prepared, 0, name);
    assert.equal(created, 0, name);
  }
});

test('first-user: occupied port aborts before any key is sent', async (t) => {
  const busy = await occupant();
  t.after(busy.close);
  let proxies = 0;
  const { deps, calls } = firstUserDeps(busy.port,
    { createProxyServer: () => { proxies += 1; return http.createServer(); } });
  await assert.rejects(runFirstUser('/nonexistent/' + RUN_ID, deps),
    (error) => error.code === 'PORT_IN_USE');
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(proxies, 0);
  assert.equal(Buffer.concat(busy.received).length, 0);
  assert.equal(calls.marker.length, 0);
});

test('connectOwned refuses a connection accepted by a foreign listener', async (t) => {
  const busy = await occupant();
  t.after(busy.close);
  const ours = net.createServer();
  await assert.rejects(connectOwned(ours, busy.port, { timeoutMs: 200 }),
    (error) => error.code === 'LISTENER_NOT_OWNED');
  assert.equal(Buffer.concat(busy.received).length, 0);
});

test('first-user: exact request shape, marker, SQL verify, no secret output', async () => {
  const port = await freePort();
  const fake = fakeAuthServer({ id: USER_ID, email: USER.email });
  const { deps, lines, calls } = firstUserDeps(port, { createProxyServer: () => fake.server });
  await runFirstUser('/nonexistent/' + RUN_ID, deps);
  assert.equal(fake.seen.length, 1);
  const [request] = fake.seen;
  assert.equal(request.method, 'POST');
  assert.equal(request.url, '/auth/v1/admin/users');
  assert.equal(request.headers.host, `127.0.0.1:${port}`);
  assert.equal(request.headers.apikey, SERVICE_KEY);
  assert.equal(request.headers.authorization, `Bearer ${SERVICE_KEY}`);
  assert.equal(request.headers.origin, undefined);
  assert.deepEqual(JSON.parse(request.body),
    { email: USER.email, password: USER.password, email_confirm: true });
  assert.deepEqual(calls.marker, [['/nonexistent/' + RUN_ID,
    { runId: RUN_ID, userId: USER_ID, email: USER.email }]]);
  assert.equal(calls.verify.length, 1);
  assert.equal(calls.verify[0][1], USER_ID);
  assert.deepEqual(calls.order, ['verify', 'marker']);
  assert.equal(fake.server.listening, false);
  const output = lines.join('\n');
  assert.ok(!output.includes(SERVICE_KEY) && !output.includes(USER.password));
});

test('first-user: mismatched response writes no marker and leaks no body', async () => {
  for (const body of [
    { id: USER_ID, email: 'someone-else@example.invalid', echo: SERVICE_KEY },
    { id: 'not-a-uuid', email: USER.email, echo: SERVICE_KEY },
  ]) {
    const port = await freePort();
    const fake = fakeAuthServer(body);
    const { deps, lines, calls } = firstUserDeps(port, { createProxyServer: () => fake.server });
    let caught;
    await runFirstUser('/nonexistent/' + RUN_ID, deps).catch((error) => { caught = error; });
    assert.equal(safeErrorCode(caught), 'FIRST_USER_RESPONSE_INVALID');
    assert.ok(!String(caught.message).includes(SERVICE_KEY));
    assert.equal(calls.marker.length, 0);
    assert.equal(calls.verify.length, 0);
    assert.equal(fake.server.listening, false);
    assert.ok(!lines.join('\n').includes(SERVICE_KEY));
  }
});

test('first-user: failed SQL verification records no success', async () => {
  const port = await freePort();
  const fake = fakeAuthServer({ id: USER_ID, email: USER.email });
  const { deps, lines, calls } = firstUserDeps(port, {
    createProxyServer: () => fake.server,
    verifyFirstUser: (...args) => {
      calls.verify.push(args);
      throw Object.assign(new Error('x'), { code: 'FIRST_USER_SQL_MISMATCH' });
    },
  });
  await assert.rejects(runFirstUser('/nonexistent/' + RUN_ID, deps),
    (error) => safeErrorCode(error) === 'FIRST_USER_SQL_MISMATCH');
  assert.equal(fake.seen.length, 1);
  assert.equal(calls.verify.length, 1);
  assert.equal(calls.marker.length, 0);
  assert.equal(fake.server.listening, false);
  assert.ok(!lines.includes('first_user_created'));
});

async function listeningServer(t) {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { if (server.listening) server.close(); });
  return server;
}

test('serve-api: runtime error or unexpected close exits nonzero exactly once', async (t) => {
  for (const [name, trigger] of [
    ['server error', (server) => server.emit('error', new Error('x'))],
    ['unexpected close', (server) => server.close()],
    ['error then signal', (server, signals) => {
      server.emit('error', new Error('x'));
      signals.emit('SIGINT');
    }],
  ]) {
    const server = await listeningServer(t);
    const signals = new EventEmitter();
    const settled = serveForeground(server, signals);
    trigger(server, signals);
    assert.equal(await settled, 1, name);
    assert.equal(server.listening, false, name);
    assert.equal(signals.listenerCount('SIGINT'), 0, name);
    assert.equal(signals.listenerCount('SIGTERM'), 0, name);
    // A late error after settlement must not throw as unhandled.
    server.emit('error', new Error('late'));
  }
});

test('serve-api: SIGINT/SIGTERM shutdown exits 0', async (t) => {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const server = await listeningServer(t);
    const signals = new EventEmitter();
    const settled = serveForeground(server, signals);
    signals.emit(signal);
    assert.equal(await settled, 0, signal);
    assert.equal(server.listening, false, signal);
    assert.equal(signals.listenerCount('SIGINT'), 0, signal);
    assert.equal(signals.listenerCount('SIGTERM'), 0, signal);
  }
});

test('safeErrorCode drops free-text messages that may echo secrets', () => {
  assert.equal(safeErrorCode(new Error(`bad key ${SERVICE_KEY}`)), 'INSTALLER_FAILED');
  let parseError;
  try { JSON.parse(`{"k":"${SERVICE_KEY}"`); } catch (error) { parseError = error; }
  assert.equal(safeErrorCode(parseError), 'INSTALLER_FAILED');
  assert.equal(safeErrorCode(new Error(SERVICE_KEY)), 'INSTALLER_FAILED');
  assert.equal(safeErrorCode(new Error('f'.repeat(48))), 'INSTALLER_FAILED');
  assert.equal(safeErrorCode({ code: 'MIGRATION_ALREADY_ATTEMPTED' }),
    'MIGRATION_ALREADY_ATTEMPTED');
  assert.equal(safeErrorCode(new Error('loopback_proxy_configuration_invalid')),
    'loopback_proxy_configuration_invalid');
});

test('first-user marker is exclusive and 0600', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'closr-cli-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const record = { runId: RUN_ID, userId: USER_ID, email: USER.email };
  const filename = writeFirstUserMarker(dir, record);
  assert.equal(statSync(filename).mode & 0o777, 0o600);
  assert.throws(() => writeFirstUserMarker(dir, record), (error) => error.code === 'EEXIST');
});

// Placeholder app tree in a temp dir; contents are never parsed here.
function tempAppRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'closr-cli-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'supabase', 'migrations'), { recursive: true });
  for (const name of ['package.json',
    'supabase/migrations/20261002000000_community_preview_base.sql',
    'supabase/migrations/20261003000000_community_manual_play_fields.sql']) {
    writeFileSync(join(root, name), '{}\n');
  }
  return root;
}

test('prepareRuntime: failed write rolls back the fresh run dir, or reports it', (t) => {
  const failSecondWrite = (overrides = {}) => {
    let writes = 0;
    return { ...fs, ...overrides, writeFileSync: (file, value, options) => {
      writes += 1;
      if (writes === 1) return fs.writeFileSync(file, value, options);
      fs.writeFileSync(file, 'partial', options);
      throw Object.assign(new Error('x'), { code: 'ENOSPC' });
    } };
  };
  const root = tempAppRoot(t);
  assert.throws(() => prepareRuntime({ appRoot: root, fileSystem: failSecondWrite() }),
    (error) => error.code === 'ENOSPC');
  assert.deepEqual(readdirSync(join(root, '.closr-local')), []);

  const stuck = failSecondWrite({ unlinkSync: () => {
    throw Object.assign(new Error('x'), { code: 'EPERM' });
  } });
  assert.throws(() => prepareRuntime({ appRoot: root, fileSystem: stuck }), (error) =>
    error.code === 'RUNTIME_ROLLBACK_FAILED' && error.message === error.code &&
    RUN_RE.test(basename(error.runtimeDir)));
});

test('stop/destroy: occupied API port refuses before any Docker mutation', async (t) => {
  const busy = await occupant();
  t.after(busy.close);
  const freeApiPort = await freePort();
  for (const run of [runStop, runDestroy]) {
    const calls = { adapter: 0, mutate: 0 };
    const deps = { ...DEFAULT_DEPS, apiPort: busy.port, out: () => {},
      readRuntime: () => ({ ports: { apiPort: busy.port, webPort: 3000 } }),
      makeAdapter: () => { calls.adapter += 1; return {}; },
      stopStack: () => { calls.mutate += 1; return { phase: 'stopped', runId: RUN_ID }; },
      destroyStack: () => { calls.mutate += 1; return { phase: 'destroyed', runId: RUN_ID }; },
    };
    await assert.rejects(run('/nonexistent/' + RUN_ID, deps),
      (error) => error.code === 'API_PROXY_RUNNING', run.name);
    assert.equal(calls.adapter, 0, run.name);
    assert.equal(calls.mutate, 0, run.name);
    await run('/nonexistent/' + RUN_ID, { ...deps,
      readRuntime: () => ({ ports: { apiPort: freeApiPort, webPort: 3000 } }) });
    assert.equal(calls.mutate, 1, run.name);
  }
  assert.equal(Buffer.concat(busy.received).length, 0);
});

test('Linux up always requires a separate root runner before Docker or secrets', async () => {
  let prepared = 0;
  await assert.rejects(runUp({ ...DEFAULT_DEPS, platform: 'linux', arch: 'x64',
    euid: 0, prepareRuntime: () => { prepared += 1; } },
  { apiPort: 50123, webPort: 50124 }, true),
  (error) => error.code === 'ROOT_UNSUPPORTED');
  await assert.rejects(runUp({ ...DEFAULT_DEPS, platform: 'linux', arch: 'x64',
    euid: 1000, prepareRuntime: () => { prepared += 1; } },
  { apiPort: 3000, webPort: 50124 }, true),
  (error) => error.code === 'LINUX_HIGH_PORTS_REQUIRED');
  assert.equal(prepared, 0);
  const checked = [];
  await assert.rejects(runUp({ ...DEFAULT_DEPS, platform: 'linux', arch: 'x64',
    euid: 1000, socketSpec: LINUX_SOCKET_SPEC,
    readMigrationSources: () => { checked.push('migrations'); },
    dockerBinary: () => { checked.push('docker'); },
    imageCheck: () => { checked.push('images'); },
    assertPortFree: async (port) => { checked.push(port); },
    out: () => {}, prepareRuntime: () => { prepared += 1; },
  }, { apiPort: 50123, webPort: 50124 }, true),
  (error) => error.code === 'LINUX_ROOT_RUNNER_REQUIRED');
  assert.equal(prepared, 0);
  assert.deepEqual(checked, []);
});

test('explicit ports flow through preflight and runtime preparation', async () => {
  const checked = [];
  let preparedPorts;
  const ports = { apiPort: 50123, webPort: 50124 };
  await assert.rejects(runUp({ ...DEFAULT_DEPS,
    platform: 'darwin', arch: 'arm64', euid: 501,
    readMigrationSources: () => [],
    lstat: () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
    statfs: () => ({ bavail: 10 * 1024 ** 2, bsize: 4096 }),
    dockerBinary: () => '/usr/bin/docker', requireLocalDockerSocket: () => {},
    makeAdapter: () => ({}), imageCheck: () => ({ platform: 'linux/arm64' }),
    assertPortFree: async (port) => { checked.push(port); },
    out: () => {}, prepareRuntime: ({ ports: got }) => {
      preparedPorts = got;
      throw Object.assign(new Error('test'), { code: 'PREPARE_REACHED' });
    },
  }, ports, true), (error) => error.code === 'PREPARE_REACHED');
  assert.deepEqual(checked, [50123, 50124]);
  assert.deepEqual(preparedPorts, ports);
});

test('up: failed create cleans only the prepared run; cleanup refusal leaves it for inspection', async () => {
  const events = [];
  const runtimeDir = '/synthetic/' + RUN_ID;
  const base = { ...DEFAULT_DEPS,
    platform: 'darwin', arch: 'arm64', euid: 501,
    readMigrationSources: () => [],
    lstat: () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
    statfs: () => ({ bavail: 10 * 1024 ** 2, bsize: 4096 }),
    dockerBinary: () => '/usr/bin/docker', requireLocalDockerSocket: () => {},
    makeAdapter: () => ({}), imageCheck: () => ({ platform: 'linux/arm64' }),
    assertPortFree: async () => {}, out: (line) => events.push(line),
    prepareRuntime: () => ({ runtimeDir }),
    createStack: () => { throw Object.assign(new Error('synthetic'),
      { code: 'CONTAINER_RESOURCES' }); },
    destroyStack: (dir) => { events.push(`destroy:${dir}`); },
  };
  const ports = { apiPort: 50123, webPort: 50124 };
  await assert.rejects(runUp(base, ports, true),
    (error) => error.code === 'CONTAINER_RESOURCES' && !error.runtimeDir);
  assert.deepEqual(events.slice(-2), [`destroy:${runtimeDir}`, 'failed_run_resources_removed']);
  await assert.rejects(runUp({ ...base, destroyStack: () => {
    throw new Error('synthetic refusal');
  } }, ports, true), (error) => error.code === 'RUNTIME_CLEANUP_REQUIRES_INSPECTION' &&
    error.runtimeDir === runtimeDir && error.manualOnly === true);
});

test('stop checks persisted proxy port before Docker mutation', async () => {
  const seen = [];
  await runStop('/nonexistent/' + RUN_ID, { ...DEFAULT_DEPS,
    readRuntime: () => ({ ports: { apiPort: 50123, webPort: 50124 } }),
    probePortFree: async (port) => { seen.push(`probe:${port}`); },
    makeAdapter: () => { seen.push('adapter'); return {}; },
    stopStack: () => { seen.push('stop'); return { phase: 'stopped', runId: RUN_ID }; },
    out: () => {},
  });
  assert.deepEqual(seen, ['probe:50123', 'adapter', 'stop']);
});

test('runtime persists distinct loopback ports and rejects plan drift', (t) => {
  const root = tempAppRoot(t);
  const ports = { apiPort: 50123, webPort: 50124 };
  const run = prepareRuntime({ appRoot: root, ports });
  const restored = readRuntime(run.runtimeDir, { appRoot: root });
  assert.deepEqual(restored.ports, ports);
  const auth = restored.plan.containers.find((row) => row.name.endsWith('-auth'));
  assert.equal(auth.env.API_EXTERNAL_URL, 'http://127.0.0.1:50123');
  assert.equal(auth.env.GOTRUE_SITE_URL, 'http://127.0.0.1:50124');
  assert.equal(proxyConfig(restored, { networkId: '1'.repeat(64), containers: [
    { name: `${run.runId}-postgres`, id: '2'.repeat(64) },
    { name: `${run.runId}-auth`, id: '3'.repeat(64) },
    { name: `${run.runId}-rest`, id: '4'.repeat(64) },
  ] }).listenPort, ports.apiPort);
  const planFile = join(run.runtimeDir, 'plan.json');
  const saved = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  saved.ports.apiPort = 50125;
  writeFileSync(planFile, JSON.stringify(saved) + '\n');
  assert.throws(() => readRuntime(run.runtimeDir, { appRoot: root }),
    (error) => ['RUNTIME_INVALID', 'PLAN_INVALID'].includes(error.code));
});

test('up: existing .env.local (file or dangling symlink) fails preflight', async (t) => {
  const [apiPort, webPort] = [await freePort(), await freePort()];
  for (const [name, setup, code] of [
    ['regular file', (root) => writeFileSync(join(root, '.env.local'), 'X=1\n'),
      'ENV_LOCAL_PRESENT'],
    ['dangling symlink', (root) => symlinkSync(join(root, 'missing'),
      join(root, '.env.local')), 'ENV_LOCAL_PRESENT'],
    ['env.example only', (root) => writeFileSync(join(root, 'env.example'), 'X=\n'),
      'PREPARE_REACHED'],
  ]) {
    const root = tempAppRoot(t);
    setup(root);
    let prepared = 0;
    await assert.rejects(runUp({
      ...DEFAULT_DEPS, appRoot: root, apiPort, webPort,
      platform: 'darwin', arch: 'arm64', nodeVersion: '20.19.0', euid: 501,
      out: () => {}, readMigrationSources: () => [], lstat: lstatSync, readdir: readdirSync,
      statfs: () => ({ bavail: 10 * 1024 ** 2, bsize: 4096 }),
      dockerBinary: () => '/usr/local/bin/docker', requireLocalDockerSocket: () => {},
      makeAdapter: () => ({}), imageCheck: () => ({ platform: 'linux/arm64' }),
      prepareRuntime: () => {
        prepared += 1;
        throw Object.assign(new Error('x'), { code: 'PREPARE_REACHED' });
      },
    }), (error) => error.code === code, name);
    assert.equal(prepared, code === 'PREPARE_REACHED' ? 1 : 0, name);
  }
});
