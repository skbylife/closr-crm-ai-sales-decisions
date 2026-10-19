// One fresh, local Community run. Importing this module has no side effects.
import { createHmac, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PG_START_CMD, PG_START_ENTRYPOINT, RESOURCE_LIMITS, SERVICE_IMAGES, SERVICE_IMAGE_IDS,
} from './community-docker-guard.mjs';

export const API_URL = 'http://127.0.0.1:54321';
export const WEB_URL = 'http://127.0.0.1:3000';
export const DEFAULT_PORTS = Object.freeze({ apiPort: 54321, webPort: 3000 });
export const RUN_RE = /^closr-community-[a-f0-9]{20}$/;
const RUN_PREFIX = 'closr-community-';
const LINUX_RUN_PARENT = '/data/closr/community-tests';
const OWNER_LABEL = 'com.closr.run-id';
const SERVICE_LABEL = 'com.closr.service';
const DEFAULT_APP_ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const DEFAULT_JWT_TTL_SECONDS = 10 * 365 * 24 * 60 * 60;
export const TEST_JWT_TTL_SECONDS = 2 * 60 * 60;

export class RuntimeError extends Error {
  constructor(code, runtimeDir) {
    super(code);
    this.name = 'RuntimeError';
    this.code = code;
    if (runtimeDir) this.runtimeDir = runtimeDir;
  }
}

function requireValue(ok, code) {
  if (!ok) throw new RuntimeError(code);
}

// Linux paths are identities, not settings supplied by a caller or the
// environment. The reviewed root runner must create the loop mount and the
// two differently owned subdirectories before any secret is made.
export function linuxRunPaths(runId) {
  requireValue(typeof runId === 'string' && RUN_RE.test(runId), 'RUN_ID_INVALID');
  const mountPoint = path.join(LINUX_RUN_PARENT, runId);
  const runtimeBase = path.join(mountPoint, 'runtime');
  return Object.freeze({ mountPoint, runtimeBase,
    runtimeDir: path.join(runtimeBase, runId),
    workDir: path.join(mountPoint, 'work') });
}

function checkedDir(fileSystem, filename, { uid, mode } = {}) {
  let info;
  try { info = fileSystem.lstatSync(filename); }
  catch { throw new RuntimeError('LINUX_RUN_PATH_INVALID'); }
  requireValue(info.isDirectory() && !info.isSymbolicLink() &&
    (uid === undefined || info.uid === uid) &&
    (mode === undefined || (info.mode & 0o777) === mode),
  'LINUX_RUN_PATH_INVALID');
  return info;
}

export function validateLinuxRunPaths(runId, fileSystem = fs) {
  const paths = linuxRunPaths(runId);
  for (const parent of ['/data', '/data/closr']) checkedDir(fileSystem, parent);
  const parent = checkedDir(fileSystem, LINUX_RUN_PARENT, { uid: 0, mode: 0o710 });
  const mount = checkedDir(fileSystem, paths.mountPoint, { uid: 0, mode: 0o710 });
  const runtimeBase = checkedDir(fileSystem, paths.runtimeBase, { uid: 0, mode: 0o700 });
  const work = checkedDir(fileSystem, paths.workDir, { mode: 0o700 });
  requireValue(work.uid > 0 && mount.dev !== parent.dev &&
    runtimeBase.dev === mount.dev && work.dev === mount.dev,
  'LINUX_RUN_PATH_INVALID');
  try {
    requireValue(fileSystem.realpathSync(paths.mountPoint) === paths.mountPoint &&
      fileSystem.statfsSync(paths.mountPoint).type === 0xef53,
    'LINUX_RUN_PATH_INVALID');
  } catch { throw new RuntimeError('LINUX_RUN_PATH_INVALID'); }
  return paths;
}

export function validatePorts(ports) {
  requireValue(ports && typeof ports === 'object' && !Array.isArray(ports) &&
    Object.keys(ports).sort().join(',') === 'apiPort,webPort' &&
    Number.isInteger(ports.apiPort) && ports.apiPort >= 1024 &&
    ports.apiPort <= 65535 && Number.isInteger(ports.webPort) &&
    ports.webPort >= 1024 && ports.webPort <= 65535 &&
    ports.apiPort !== ports.webPort, 'PORTS_INVALID');
  return Object.freeze({ apiPort: ports.apiPort, webPort: ports.webPort });
}

function apiUrl(ports) { return `http://127.0.0.1:${ports.apiPort}`; }
function webUrl(ports) { return `http://127.0.0.1:${ports.webPort}`; }

function hex(size, randomBytesFn) {
  const bytes = randomBytesFn(size);
  requireValue(Buffer.isBuffer(bytes) && bytes.length === size, 'RANDOM_INVALID');
  return bytes.toString('hex');
}

function jwt(secret, role, now, ttlSeconds = DEFAULT_JWT_TTL_SECONDS) {
  const encoded = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({
    iss: 'supabase', ref: '', role, aud: 'authenticated',
    iat: now, exp: now + ttlSeconds,
  })}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

export function makeRunId(randomBytesFn = randomBytes) {
  return RUN_PREFIX + hex(10, randomBytesFn);
}

export function makeMaterial({ randomBytesFn = randomBytes,
  now = Math.floor(Date.now() / 1000), testJwtTtlSeconds } = {}) {
  requireValue(Number.isSafeInteger(now) && now >= 1_700_000_000 &&
    now <= 4_000_000_000, 'TIME_INVALID');
  // The short-lived profile is opt-in for one isolated test run. Ordinary
  // Community installs retain their existing lifetime.
  requireValue(testJwtTtlSeconds === undefined ||
    testJwtTtlSeconds === TEST_JWT_TTL_SECONDS, 'JWT_TTL_INVALID');
  const ttlSeconds = testJwtTtlSeconds ?? DEFAULT_JWT_TTL_SECONDS;
  const secret = hex(48, randomBytesFn);
  const nonce = hex(8, randomBytesFn);
  return {
    secrets: {
      DB_PASSWORD: hex(32, randomBytesFn), JWT_SECRET: secret,
      ANON_KEY: jwt(secret, 'anon', now, ttlSeconds),
      SERVICE_ROLE_KEY: jwt(secret, 'service_role', now, ttlSeconds),
      PGSODIUM_ROOT_KEY: hex(32, randomBytesFn),
    },
    user: {
      email: `closr-owner-${nonce}@example.invalid`,
      password: hex(24, randomBytesFn),
    },
  };
}

function assertMaterial(material) {
  const { secrets, user } = material ?? {};
  requireValue(secrets && user &&
    /^[a-f0-9]{64}$/.test(secrets.DB_PASSWORD) &&
    /^[a-f0-9]{96}$/.test(secrets.JWT_SECRET) &&
    /^[a-f0-9]{64}$/.test(secrets.PGSODIUM_ROOT_KEY) &&
    typeof secrets.ANON_KEY === 'string' &&
    typeof secrets.SERVICE_ROLE_KEY === 'string' &&
    /^closr-owner-[a-f0-9]{16}@example\.invalid$/.test(user.email) &&
    /^[a-f0-9]{48}$/.test(user.password), 'MATERIAL_INVALID');
  let payload;
  try { payload = JSON.parse(Buffer.from(secrets.ANON_KEY.split('.')[1], 'base64url')); }
  catch { throw new RuntimeError('MATERIAL_INVALID'); }
  const ttlSeconds = payload?.exp - payload?.iat;
  requireValue(Number.isSafeInteger(payload?.iat) &&
    payload.iat >= 1_700_000_000 && payload.iat <= 4_000_000_000 &&
    Number.isSafeInteger(payload.exp) &&
    (ttlSeconds === DEFAULT_JWT_TTL_SECONDS ||
      ttlSeconds === TEST_JWT_TTL_SECONDS) &&
    secrets.ANON_KEY === jwt(secrets.JWT_SECRET, 'anon', payload.iat, ttlSeconds) &&
    secrets.SERVICE_ROLE_KEY === jwt(secrets.JWT_SECRET, 'service_role', payload.iat,
      ttlSeconds),
  'MATERIAL_INVALID');
  return { iat: payload.iat, exp: payload.exp, ttlSeconds };
}

// Start and serve actions need live keys. Status, stop and destroy still read
// an expired run so its exact resources can be inspected and removed.
export function assertCredentialFreshness(material,
  now = Math.floor(Date.now() / 1000)) {
  const { iat, exp } = assertMaterial(material);
  requireValue(Number.isSafeInteger(now) && now >= 1_700_000_000 &&
    now <= 4_000_000_000, 'TIME_INVALID');
  requireValue(now >= iat && now < exp, 'CREDENTIAL_NOT_ACTIVE');
}

export function makePlan(runId, material, selectedPorts = DEFAULT_PORTS) {
  requireValue(RUN_RE.test(runId), 'RUN_ID_INVALID');
  assertMaterial(material);
  const ports = validatePorts(selectedPorts);
  const { secrets } = material;
  const pgName = `${runId}-postgres`;
  const container = (service, image, env, extra = {}) => ({
    name: `${runId}-${service}`, image,
    expectedImageId: SERVICE_IMAGE_IDS[image],
    labels: { [OWNER_LABEL]: runId, [SERVICE_LABEL]: service },
    mounts: [], resources: RESOURCE_LIMITS[service], env, ...extra,
  });
  return {
    runId,
    network: { name: `${runId}-net`, labels: { [OWNER_LABEL]: runId } },
    containers: [
      container('postgres', SERVICE_IMAGES.postgres, {
        POSTGRES_PASSWORD: secrets.DB_PASSWORD,
        PGPASSWORD: secrets.DB_PASSWORD,
        POSTGRES_HOST: '/var/run/postgresql',
        JWT_SECRET: secrets.JWT_SECRET, JWT_EXP: '3600',
      }, {
        mounts: [{ Source: `${runId}-pgdata`, Target: '/var/lib/postgresql/data',
          Type: 'volume', ReadOnly: false }],
        cmd: [...PG_START_CMD], entrypoint: [PG_START_ENTRYPOINT],
      }),
      container('auth', SERVICE_IMAGES.gotrue, {
        API_EXTERNAL_URL: apiUrl(ports),
        GOTRUE_API_HOST: '0.0.0.0', GOTRUE_API_PORT: '9999',
        GOTRUE_DB_DRIVER: 'postgres',
        GOTRUE_DB_DATABASE_URL:
          `postgresql://supabase_auth_admin:${secrets.DB_PASSWORD}@${pgName}:5432/postgres`,
        GOTRUE_SITE_URL: webUrl(ports), GOTRUE_DISABLE_SIGNUP: 'true',
        GOTRUE_JWT_ADMIN_ROLES: 'service_role', GOTRUE_JWT_AUD: 'authenticated',
        GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated', GOTRUE_JWT_EXP: '3600',
        GOTRUE_JWT_SECRET: secrets.JWT_SECRET,
        GOTRUE_JWT_ISSUER: `${apiUrl(ports)}/auth/v1`,
        GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
        GOTRUE_MAILER_AUTOCONFIRM: 'true',
      }),
      container('rest', SERVICE_IMAGES.postgrest, {
        PGRST_DB_URI:
          `postgresql://authenticator:${secrets.DB_PASSWORD}@${pgName}:5432/postgres`,
        PGRST_DB_SCHEMAS: 'public', PGRST_DB_EXTRA_SEARCH_PATH: 'public,extensions',
        PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: secrets.JWT_SECRET,
        PGRST_ADMIN_SERVER_PORT: '3001',
      }),
    ],
  };
}

function appRootPath(appRoot, fileSystem) {
  requireValue(typeof appRoot === 'string' && path.isAbsolute(appRoot), 'APP_ROOT_INVALID');
  const resolved = fileSystem.realpathSync(appRoot);
  requireValue(!fileSystem.lstatSync(appRoot).isSymbolicLink() &&
    fileSystem.statSync(resolved).isDirectory(),
    'APP_ROOT_INVALID');
  for (const name of ['package.json', 'supabase/migrations/20261002000000_community_preview_base.sql',
    'supabase/migrations/20261003000000_community_manual_play_fields.sql']) {
    const entry = path.join(resolved, name);
    const info = fileSystem.lstatSync(entry);
    requireValue(info.isFile() && !info.isSymbolicLink(), 'APP_SOURCE_INVALID');
  }
  return resolved;
}

function checkPrivateFile(fileSystem, filename) {
  const info = fileSystem.lstatSync(filename);
  requireValue(info.isFile() && !info.isSymbolicLink() &&
    (info.mode & 0o777) === 0o600, 'PRIVATE_FILE_INVALID');
  return fileSystem.readFileSync(filename, 'utf8');
}

// `created` collects every name this call may have created: 'wx' fails with
// EEXIST before touching an existing entry, any other failure may leave a
// partial file of ours behind.
function writePrivate(fileSystem, filename, value, created) {
  try { fileSystem.writeFileSync(filename, value, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (created && error?.code !== 'EEXIST') created.push(filename);
    throw error;
  }
  created?.push(filename);
  checkPrivateFile(fileSystem, filename);
}

// Removes only the fresh run directory and the regular files this invocation
// created. Symlinks or unknown entries are left alone, so rmdir cannot finish
// and the caller gets a fixed code plus the run path for manual inspection.
function rollbackRuntime(fileSystem, runtimeDir, created) {
  let complete = true;
  for (const filename of [...created].reverse()) {
    try {
      const info = fileSystem.lstatSync(filename);
      if (info.isFile() && !info.isSymbolicLink()) fileSystem.unlinkSync(filename);
      else complete = false;
    } catch (error) {
      if (error?.code !== 'ENOENT') complete = false;
    }
  }
  if (complete) {
    try { fileSystem.rmdirSync(runtimeDir); } catch { complete = false; }
  }
  if (!complete) throw new RuntimeError('RUNTIME_ROLLBACK_FAILED', runtimeDir);
}

function privateFiles(material, ports) {
  const { secrets, user } = material;
  return {
    'secrets.json': JSON.stringify(secrets) + '\n',
    'users.json': JSON.stringify({ owner: user }) + '\n',
    'app.env': [
      `CLOSR_SUPABASE_URL=${apiUrl(ports)}`,
      `CLOSR_SUPABASE_ANON_KEY=${secrets.ANON_KEY}`,
      `SUPABASE_SERVICE_ROLE_KEY=${secrets.SERVICE_ROLE_KEY}`,
      'CLOSR_ENABLE_ENGINE_PREVIEW=false', 'CLOSR_ENGINE_URL=',
      'CLOSR_ENABLE_FULL_ENGINE=false', 'CLOSR_FULL_ENGINE_URL=', '',
    ].join('\n'),
    'pgsodium_root.key': secrets.PGSODIUM_ROOT_KEY + '\n',
  };
}

export function prepareRuntime({ appRoot = DEFAULT_APP_ROOT, fileSystem = fs,
  randomBytesFn = randomBytes, now = Math.floor(Date.now() / 1000),
  ports: selectedPorts = DEFAULT_PORTS, runId: selectedRunId, testJwtTtlSeconds,
  platform = process.platform } = {}) {
  // An isolated Linux operator chooses this ID before binding its run-derived
  // Docker socket. The ordinary local path still generates its own random ID.
  requireValue(selectedRunId === undefined ||
    typeof selectedRunId === 'string' && RUN_RE.test(selectedRunId), 'RUN_ID_INVALID');
  const ports = validatePorts(selectedPorts);
  const root = appRootPath(appRoot, fileSystem);
  requireValue(platform === 'darwin' || platform === 'linux', 'PLATFORM_UNSUPPORTED');
  requireValue(platform !== 'linux' || selectedRunId !== undefined,
    'LINUX_RUN_CONTEXT_REQUIRED');
  const runId = selectedRunId ?? makeRunId(randomBytesFn);
  const linuxPaths = platform === 'linux' ?
    validateLinuxRunPaths(runId, fileSystem) : undefined;
  const base = linuxPaths?.runtimeBase ?? path.join(root, '.closr-local');
  if (!linuxPaths) {
    try { fileSystem.mkdirSync(base, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const baseInfo = fileSystem.lstatSync(base);
  requireValue(baseInfo.isDirectory() && !baseInfo.isSymbolicLink() &&
    (baseInfo.mode & 0o777) === 0o700 &&
    (!linuxPaths || baseInfo.uid === 0), 'RUNTIME_ROOT_INVALID');
  const material = makeMaterial({ randomBytesFn, now, testJwtTtlSeconds });
  const plan = makePlan(runId, material, ports);
  const runtimeDir = path.join(base, runId);
  fileSystem.mkdirSync(runtimeDir, { mode: 0o700 });
  // A partial run would block every later `up`, so undo exactly what we made.
  const created = [];
  try {
    const runtimeInfo = fileSystem.lstatSync(runtimeDir);
    requireValue(runtimeInfo.isDirectory() && !runtimeInfo.isSymbolicLink() &&
      (runtimeInfo.mode & 0o777) === 0o700 &&
      (!linuxPaths || runtimeInfo.uid === 0 &&
        runtimeInfo.dev === fileSystem.lstatSync(linuxPaths.mountPoint).dev),
      'PRIVATE_DIR_INVALID');
    for (const [name, value] of Object.entries(privateFiles(material, ports))) {
      writePrivate(fileSystem, path.join(runtimeDir, name), value, created);
    }
    writePrivate(fileSystem, path.join(runtimeDir, 'plan.json'),
      JSON.stringify({ runId, ports, plan }) + '\n', created);
  } catch (error) {
    rollbackRuntime(fileSystem, runtimeDir, created);
    throw error;
  }
  return { appRoot: root, runtimeDir, runId, ports, plan, material,
    mountPoint: linuxPaths?.mountPoint, workDir: linuxPaths?.workDir };
}

export function readRuntime(runtimeDir, { appRoot = DEFAULT_APP_ROOT,
  fileSystem = fs, platform = process.platform } = {}) {
  const root = appRootPath(appRoot, fileSystem);
  requireValue(platform === 'darwin' || platform === 'linux', 'PLATFORM_UNSUPPORTED');
  const runId = typeof runtimeDir === 'string' ? path.basename(runtimeDir) : '';
  const linuxPaths = platform === 'linux' ?
    validateLinuxRunPaths(runId, fileSystem) : undefined;
  const base = linuxPaths?.runtimeBase ?? path.join(root, '.closr-local');
  requireValue(typeof runtimeDir === 'string' && path.isAbsolute(runtimeDir) &&
    (!linuxPaths || runtimeDir === linuxPaths.runtimeDir) &&
    fileSystem.realpathSync(runtimeDir) === path.join(base, path.basename(runtimeDir)) &&
    RUN_RE.test(path.basename(runtimeDir)), 'RUNTIME_PATH_INVALID');
  for (const dir of [base, runtimeDir]) {
    const info = fileSystem.lstatSync(dir);
    requireValue(info.isDirectory() && !info.isSymbolicLink() &&
      (info.mode & 0o777) === 0o700 &&
      (!linuxPaths || info.uid === 0 &&
        info.dev === fileSystem.lstatSync(linuxPaths.mountPoint).dev),
    'PRIVATE_DIR_INVALID');
  }
  const secret = JSON.parse(checkPrivateFile(fileSystem, path.join(runtimeDir, 'secrets.json')));
  const users = JSON.parse(checkPrivateFile(fileSystem, path.join(runtimeDir, 'users.json')));
  const material = { secrets: secret, user: users.owner };
  assertMaterial(material);
  const saved = JSON.parse(checkPrivateFile(fileSystem, path.join(runtimeDir, 'plan.json')));
  requireValue(saved && typeof saved === 'object' && !Array.isArray(saved) &&
    Object.keys(saved).sort().join(',') === 'plan,ports,runId', 'PLAN_INVALID');
  const ports = validatePorts(saved.ports);
  const expectedFiles = privateFiles(material, ports);
  for (const [name, expected] of Object.entries(expectedFiles)) {
    requireValue(checkPrivateFile(fileSystem, path.join(runtimeDir, name)) === expected,
      'RUNTIME_INVALID');
  }
  const plan = makePlan(path.basename(runtimeDir), material, ports);
  requireValue(saved.runId === plan.runId && JSON.stringify(saved.plan) === JSON.stringify(plan),
    'PLAN_INVALID');
  return { appRoot: root, runtimeDir, runId: plan.runId, ports, plan, material,
    mountPoint: linuxPaths?.mountPoint, workDir: linuxPaths?.workDir };
}

export function proxyConfig(prepared, receipt) {
  requireValue(receipt?.networkId && Array.isArray(receipt.containers) &&
    receipt.containers.length === 3, 'RECEIPT_INVALID');
  const pg = receipt.containers.find((row) =>
    row.name === `${prepared.runId}-postgres`);
  requireValue(/^[a-f0-9]{64}$/.test(pg?.id ?? ''), 'RECEIPT_INVALID');
  return {
    runId: prepared.runId, dbContainerId: pg.id,
    authContainer: `${prepared.runId}-auth`,
    restContainer: `${prepared.runId}-rest`,
    listenPort: prepared.ports.apiPort, webOrigin: webUrl(prepared.ports),
  };
}

export function writeProxyConfig(prepared, receipt, { fileSystem = fs } = {}) {
  writePrivate(fileSystem, path.join(prepared.runtimeDir, 'proxy-config.json'),
    JSON.stringify(proxyConfig(prepared, receipt)) + '\n');
}
