// Local Community stack lifecycle. Every Docker mutation uses the fixed local
// socket and an inspected, run-owned resource. Nothing happens on import.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, statfsSync, writeFileSync,
  unlinkSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAndInspect, imageProfile, LOG_LIMIT, recheckBeforeStart,
  RESOURCE_LIMITS } from './community-docker-guard.mjs';
import { makeDockerApiAdapter } from './docker-api-adapter.mjs';
import { makeDockerCpFiles, stagePgFirstBootAssets } from './pg-first-boot-assets.mjs';
import { loadRuntimeConfig } from './loopback-proxy.mjs';
import { dockerBinary, requireLocalDockerSocket } from './platform.mjs';
import { assertCredentialFreshness, linuxRunPaths, proxyConfig, readRuntime,
  writeProxyConfig } from './runtime.mjs';

const SQL_FILES = Object.freeze([
  ['20261002000000_community_preview_base.sql',
    'c10d625016f6bd6d59b2eb9f7f830106d6d933e216028573362914c66f3a2c98'],
  ['20261003000000_community_manual_play_fields.sql',
    'b77e92857a8ab052c9e23bb2f873c230044f79939e77e5c3d165b15b576761bc'],
]);
const ID_RE = /^[a-f0-9]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL_RE = /^closr-owner-[a-f0-9]{16}@example\.invalid$/;
const PREVIEW_ORG = '00000000-0000-4000-8000-000000000001';
const OWNER_LABEL = 'com.closr.run-id';
const SERVICE_LABEL = 'com.closr.service';
const SERVICES = ['postgres', 'auth', 'rest'];

export class OperatorError extends Error {
  constructor(code) { super(code); this.name = 'OperatorError'; this.code = code; }
}

function requireValue(ok, code) {
  if (!ok) throw new OperatorError(code);
}

function readPrivateJson(filename) {
  const info = lstatSync(filename);
  requireValue(info.isFile() && !info.isSymbolicLink() &&
    (info.mode & 0o777) === 0o600, 'PRIVATE_FILE_INVALID');
  return JSON.parse(readFileSync(filename, 'utf8'));
}

function writePrivateJson(filename, value) {
  writeFileSync(filename, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 });
  readPrivateJson(filename);
}

function diskGate(path, minGib = 4) {
  const stat = statfsSync(path);
  requireValue(Number(stat.bavail) * Number(stat.bsize) >= minGib * 1024 ** 3,
    'DISK_SPACE_LOW');
}

export function makeDockerExec({ spawn = spawnSync, binary = dockerBinary,
  platform = process.platform, arch = process.arch, fileSystem,
} = {}) {
  return function exec(args, { input, timeout = 30000, socketSpec } = {}) {
    requireValue(Array.isArray(args) && args.every((item) =>
      typeof item === 'string' && item.length > 0), 'DOCKER_ARGUMENT_INVALID');
    const socket = requireLocalDockerSocket(socketSpec, { platform, arch, fileSystem });
    const result = spawn(binary(),
      ['--host', `unix://${socket}`, ...args], {
        env: { PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin',
          HOME: platform === 'linux' ?
            linuxRunPaths(socketSpec?.runId).runtimeDir : '/nonexistent',
          ...(platform === 'linux' ? {
            TMPDIR: linuxRunPaths(socketSpec?.runId).runtimeDir,
          } : {}) },
        input, encoding: 'utf8', timeout, maxBuffer: 1024 * 1024,
      });
    requireValue(!result.error && result.status === 0, 'DOCKER_OPERATION_FAILED');
    return result.stdout.trim();
  };
}

const docker = makeDockerExec();

export function pgSql(pgId, sql, timeout = 30000, socketSpec, exec = docker) {
  requireValue(ID_RE.test(pgId) && typeof sql === 'string' && sql.length < 1024 * 1024,
    'SQL_ARGUMENT_INVALID');
  return exec(['exec', '-i', pgId, 'psql', '-X', '-A', '-t',
    '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
  { input: sql, timeout, socketSpec });
}

function waitUntil(probe, seconds, code) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    try { if (probe()) return; } catch { /* New service may still be starting. */ }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  throw new OperatorError(code);
}

// First boot runs a transient Unix-socket-only server (listen_addresses='')
// before the final server binds TCP. Auth and REST connect over TCP, so only
// the final listener counts as ready; a Unix-socket probe is not enough.
export const PG_TCP_READY_ARGS = Object.freeze(['pg_isready', '-h', '127.0.0.1',
  '-p', '5432', '-U', 'postgres', '-d', 'postgres']);

export function waitPgTcpReady(pgId, { exec = docker, seconds = 120, socketSpec } = {}) {
  requireValue(ID_RE.test(pgId), 'PG_ID_INVALID');
  waitUntil(() => {
    exec(['exec', pgId, ...PG_TCP_READY_ARGS], { timeout: 5000, socketSpec });
    return true;
  }, seconds, 'PG_TCP_READY_TIMEOUT');
}

function verifyPgLogPolicy(pgId, socketSpec) {
  const settings = pgSql(pgId,
    "SELECT current_setting('log_statement'),current_setting('log_min_error_statement')," +
    "current_setting('log_parameter_max_length'),current_setting('log_parameter_max_length_on_error');",
  30000, socketSpec);
  requireValue(settings === 'none|panic|0|0', 'PG_LOG_POLICY_INVALID');
}

export function imageCheck(adapter = makeDockerApiAdapter(),
  platform = process.platform, arch = process.arch) {
  const profile = imageProfile(platform, arch);
  for (const [service, image] of Object.entries(profile.images)) {
    const info = adapter.inspectImage(image);
    const references = image.includes('@sha256:') ? info?.RepoDigests : info?.RepoTags;
    requireValue(info?.Id === profile.imageIds[image] &&
      Array.isArray(references) && references.includes(image) &&
      info.Os === 'linux' && info.Architecture === profile.architecture,
    `IMAGE_${service.toUpperCase()}_MISMATCH`);
  }
  return { phase: 'images_verified', platform: profile.dockerPlatform };
}

function readReceipt(prepared) {
  const receipt = readPrivateJson(join(prepared.runtimeDir, 'receipt.json'));
  requireValue(receipt.runId === prepared.runId && ID_RE.test(receipt.networkId) &&
    Array.isArray(receipt.containers) && receipt.containers.length === 3 &&
    SERVICES.every((service) => receipt.containers.some((row) =>
      row.name === `${prepared.runId}-${service}` && ID_RE.test(row.id))),
  'RECEIPT_INVALID');
  return receipt;
}

function idFor(prepared, receipt, service) {
  return receipt.containers.find((row) => row.name ===
    `${prepared.runId}-${service}`).id;
}

function states(prepared, receipt, adapter) {
  const result = {};
  for (const service of SERVICES) {
    const id = idFor(prepared, receipt, service);
    const info = adapter.inspectContainer(id);
    requireValue(info?.Id === id &&
      ['created', 'running', 'exited'].includes(info.State?.Status),
    'CONTAINER_STATE_INVALID');
    result[service] = info.State.Status;
  }
  return result;
}

function verifyStates(prepared, receipt, adapter) {
  const current = states(prepared, receipt, adapter);
  recheckBeforeStart(adapter, prepared.plan, receipt,
    SERVICES.filter((service) => current[service] === 'running'),
    SERVICES.filter((service) => current[service] === 'exited'));
  return current;
}

function socketForRun(prepared, adapter) {
  const spec = adapter?.socketSpec;
  if (process.platform === 'linux' && spec?.runId !== prepared.runId) {
    throw new OperatorError('DOCKER_SOCKET_RUN_MISMATCH');
  }
  requireLocalDockerSocket(spec);
  return spec;
}

export function createStack(runtimeDir, adapter = makeDockerApiAdapter()) {
  const prepared = readRuntime(runtimeDir);
  assertCredentialFreshness(prepared.material);
  socketForRun(prepared, adapter);
  diskGate(prepared.mountPoint ?? prepared.appRoot);
  imageCheck(adapter);
  const receipt = createAndInspect(adapter, prepared.plan);
  writePrivateJson(join(prepared.runtimeDir, 'receipt.json'),
    { runId: prepared.runId, ...receipt });
  writeProxyConfig(prepared, receipt);
  recheckBeforeStart(adapter, prepared.plan, receipt);
  return { runId: prepared.runId, runtimeDir: prepared.runtimeDir, phase: 'created' };
}

export async function startPg(runtimeDir, adapter = makeDockerApiAdapter()) {
  const prepared = readRuntime(runtimeDir);
  assertCredentialFreshness(prepared.material);
  const socketSpec = socketForRun(prepared, adapter);
  diskGate(prepared.mountPoint ?? prepared.appRoot);
  const receipt = readReceipt(prepared);
  recheckBeforeStart(adapter, prepared.plan, receipt);
  const pgId = idFor(prepared, receipt, 'postgres');
  const files = makeDockerCpFiles({ inspectContainer: adapter.inspectContainer,
    dockerBinary: dockerBinary(), socketSpec });
  await stagePgFirstBootAssets({
    runId: prepared.runId, containerId: pgId,
    stagingRoot: prepared.runtimeDir,
    sqlSourceDir: fileURLToPath(new URL('./vendor/supabase-cli-2.75.0/', import.meta.url)),
    randomBytes32: () => Buffer.from(prepared.material.secrets.PGSODIUM_ROOT_KEY, 'hex'),
    dockerFiles: files,
  });
  recheckBeforeStart(adapter, prepared.plan, receipt);
  docker(['start', pgId], { socketSpec });
  waitPgTcpReady(pgId, { socketSpec });
  recheckBeforeStart(adapter, prepared.plan, receipt, ['postgres']);
  verifyPgLogPolicy(pgId, socketSpec);
  return { runId: prepared.runId, phase: 'pg_running' };
}

export function startAuth(runtimeDir, adapter = makeDockerApiAdapter()) {
  const prepared = readRuntime(runtimeDir);
  assertCredentialFreshness(prepared.material);
  const socketSpec = socketForRun(prepared, adapter);
  const receipt = readReceipt(prepared);
  recheckBeforeStart(adapter, prepared.plan, receipt, ['postgres']);
  const pgId = idFor(prepared, receipt, 'postgres');
  verifyPgLogPolicy(pgId, socketSpec);
  docker(['start', idFor(prepared, receipt, 'auth')], { socketSpec });
  waitUntil(() => pgSql(pgId, "SELECT to_regclass('auth.users') IS NOT NULL;",
    30000, socketSpec) === 't',
    120, 'AUTH_SCHEMA_TIMEOUT');
  recheckBeforeStart(adapter, prepared.plan, receipt, ['postgres', 'auth']);
  return { runId: prepared.runId, phase: 'auth_schema_ready' };
}

// Pinned public migration sources. Also used as a preflight before any secret
// or Docker object exists.
export function readMigrationSources(appRoot) {
  return SQL_FILES.map(([name, expected]) => {
    const filename = join(appRoot, 'supabase', 'migrations', name);
    const info = lstatSync(filename);
    requireValue(info.isFile() && !info.isSymbolicLink(), 'MIGRATION_SOURCE_INVALID');
    const bytes = readFileSync(filename);
    requireValue(createHash('sha256').update(bytes).digest('hex') === expected,
      'MIGRATION_HASH_MISMATCH');
    return bytes.toString('utf8');
  });
}

export function migrateCommunity(runtimeDir, adapter = makeDockerApiAdapter()) {
  const prepared = readRuntime(runtimeDir);
  assertCredentialFreshness(prepared.material);
  const socketSpec = socketForRun(prepared, adapter);
  const receipt = readReceipt(prepared);
  recheckBeforeStart(adapter, prepared.plan, receipt, ['postgres', 'auth']);
  requireValue(!existsSync(join(prepared.runtimeDir, 'migrations.attempted')),
    'MIGRATION_ALREADY_ATTEMPTED');
  const pgId = idFor(prepared, receipt, 'postgres');
  requireValue(pgSql(pgId, "SELECT to_regclass('auth.users') IS NOT NULL;",
    30000, socketSpec) === 't',
    'AUTH_SCHEMA_MISSING');
  const sqls = readMigrationSources(prepared.appRoot);
  // An interrupted migration must never replay silently onto a partial DB.
  writePrivateJson(join(prepared.runtimeDir, 'migrations.attempted'),
    { runId: prepared.runId });
  for (const sql of sqls) pgSql(pgId, sql, 120000, socketSpec);
  writePrivateJson(join(prepared.runtimeDir, 'migrations.done'),
    { runId: prepared.runId, count: 2 });
  return { runId: prepared.runId, phase: 'community_migrated' };
}

export function startRest(runtimeDir, adapter = makeDockerApiAdapter()) {
  const prepared = readRuntime(runtimeDir);
  assertCredentialFreshness(prepared.material);
  const socketSpec = socketForRun(prepared, adapter);
  const receipt = readReceipt(prepared);
  recheckBeforeStart(adapter, prepared.plan, receipt, ['postgres', 'auth']);
  const done = readPrivateJson(join(prepared.runtimeDir, 'migrations.done'));
  requireValue(done.runId === prepared.runId && done.count === 2,
    'MIGRATION_MISSING');
  const restId = idFor(prepared, receipt, 'rest');
  docker(['start', restId], { socketSpec });
  waitUntil(() => adapter.inspectContainer(restId)?.State?.Running === true,
    30, 'REST_START_TIMEOUT');
  recheckBeforeStart(adapter, prepared.plan, receipt, SERVICES);
  return { runId: prepared.runId, phase: 'running' };
}

export function stackStatus(runtimeDir, adapter = makeDockerApiAdapter()) {
  const prepared = readRuntime(runtimeDir);
  socketForRun(prepared, adapter);
  const receipt = readReceipt(prepared);
  const current = verifyStates(prepared, receipt, adapter);
  return { runId: prepared.runId, runtimeDir: prepared.runtimeDir,
    phase: 'inspected', services: current,
    migrationsDone: existsSync(join(prepared.runtimeDir, 'migrations.done')),
    firstUserCreated: existsSync(join(prepared.runtimeDir, 'first-user.json')) };
}

// The API may only be served for a fully booted, inspected, run-owned stack
// whose saved proxy config names exactly the receipt's containers.
export function requireServingStack(runtimeDir, adapter = makeDockerApiAdapter()) {
  const prepared = readRuntime(runtimeDir);
  assertCredentialFreshness(prepared.material);
  socketForRun(prepared, adapter);
  requireValue(!existsSync(join(prepared.runtimeDir, 'destroy.attempted')),
    'DESTROY_IN_PROGRESS');
  const receipt = readReceipt(prepared);
  const done = readPrivateJson(join(prepared.runtimeDir, 'migrations.done'));
  requireValue(done.runId === prepared.runId && done.count === 2,
    'MIGRATION_MISSING');
  recheckBeforeStart(adapter, prepared.plan, receipt, SERVICES);
  let config;
  try { config = loadRuntimeConfig(join(prepared.runtimeDir, 'proxy-config.json')); }
  catch { throw new OperatorError('PROXY_CONFIG_INVALID'); }
  const expected = proxyConfig(prepared, receipt);
  requireValue(Object.keys(config).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => config[key] === value),
  'PROXY_CONFIG_MISMATCH');
  const { secrets } = prepared.material;
  return { prepared, receipt, config,
    secrets: { anonKey: secrets.ANON_KEY, serviceKey: secrets.SERVICE_ROLE_KEY } };
}

// Fresh database only: no Auth user, no preview rows, and the public migration
// trigger present and enabled on auth.users.
export function firstUserPrecheck(runtimeDir, adapter = makeDockerApiAdapter()) {
  const serving = requireServingStack(runtimeDir, adapter);
  const socketSpec = socketForRun(serving.prepared, adapter);
  requireValue(!existsSync(join(serving.prepared.runtimeDir, 'first-user.json')),
    'FIRST_USER_ALREADY_CREATED');
  const pgId = idFor(serving.prepared, serving.receipt, 'postgres');
  const row = pgSql(pgId,
    "SELECT (SELECT count(*) FROM auth.users)::text || '|' ||" +
    " (SELECT count(*) FROM public.organizations)::text || '|' ||" +
    " (SELECT count(*) FROM public.org_memberships)::text || '|' ||" +
    " (SELECT count(*) FROM public.accounts)::text || '|' ||" +
    " (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid" +
    " JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'auth'" +
    " AND c.relname = 'users' AND t.tgname = 'community_preview_first_user'" +
    " AND NOT t.tgisinternal AND t.tgenabled = 'O')::text;", 30000, socketSpec);
  requireValue(row === '0|0|0|0|1', 'FIRST_USER_DATABASE_NOT_FRESH');
  return serving;
}

// Confirms the AFTER INSERT trigger produced exactly one org, one owner
// membership and the sample account for this user, and nothing else.
export function verifyFirstUser(runtimeDir, userId, adapter = makeDockerApiAdapter()) {
  const prepared = readRuntime(runtimeDir);
  const socketSpec = socketForRun(prepared, adapter);
  const receipt = readReceipt(prepared);
  recheckBeforeStart(adapter, prepared.plan, receipt, SERVICES);
  const email = prepared.material.user.email;
  requireValue(typeof userId === 'string' && UUID_RE.test(userId) &&
    EMAIL_RE.test(email), 'FIRST_USER_ARGUMENT_INVALID');
  const user = `'${userId}'::uuid`;
  const org = `'${PREVIEW_ORG}'::uuid`;
  const row = pgSql(idFor(prepared, receipt, 'postgres'),
    "SELECT (SELECT count(*) FROM auth.users)::text || '|' ||" +
    ` (SELECT count(*) FROM auth.users WHERE id = ${user} AND lower(email) = '${email}'` +
    " AND email_confirmed_at IS NOT NULL)::text || '|' ||" +
    " (SELECT count(*) FROM public.organizations)::text || '|' ||" +
    ` (SELECT count(*) FROM public.organizations WHERE id = ${org})::text || '|' ||` +
    " (SELECT count(*) FROM public.org_memberships)::text || '|' ||" +
    ` (SELECT count(*) FROM public.org_memberships WHERE user_id = ${user}` +
    ` AND org_id = ${org} AND role = 'owner')::text || '|' ||` +
    " (SELECT count(*) FROM public.accounts)::text || '|' ||" +
    " (SELECT count(*) FROM public.accounts WHERE id = 'preview-first-account'" +
    ` AND org_id = ${org} AND owner_id = ${user} AND user_id = ${user})::text;`,
  30000, socketSpec);
  requireValue(row === '1|1|1|1|1|1|1|1', 'FIRST_USER_SQL_MISMATCH');
  return { runId: prepared.runId, phase: 'first_user_verified' };
}

export function stopStack(runtimeDir, adapter = makeDockerApiAdapter()) {
  const prepared = readRuntime(runtimeDir);
  const socketSpec = socketForRun(prepared, adapter);
  const receipt = readReceipt(prepared);
  const current = verifyStates(prepared, receipt, adapter);
  for (const service of [...SERVICES].reverse()) {
    if (current[service] === 'running') {
      verifyStates(prepared, receipt, adapter);
      docker(['stop', '--time', '15', idFor(prepared, receipt, service)],
        { timeout: 25000, socketSpec });
    }
  }
  return { runId: prepared.runId, phase: 'stopped', dataPreserved: true };
}

export function resumeStack(runtimeDir, adapter = makeDockerApiAdapter()) {
  const prepared = readRuntime(runtimeDir);
  assertCredentialFreshness(prepared.material);
  const socketSpec = socketForRun(prepared, adapter);
  const receipt = readReceipt(prepared);
  const done = readPrivateJson(join(prepared.runtimeDir, 'migrations.done'));
  requireValue(done.runId === prepared.runId && done.count === 2,
    'MIGRATION_MISSING');
  let current = verifyStates(prepared, receipt, adapter);
  requireValue(SERVICES.every((service) => current[service] !== 'created'),
    'RESUME_REQUIRES_COMPLETED_BOOT');
  for (const service of SERVICES) {
    current = verifyStates(prepared, receipt, adapter);
    if (current[service] === 'exited') {
      if (service !== 'postgres') {
        requireValue(current.postgres === 'running', 'PG_NOT_RUNNING');
        verifyPgLogPolicy(idFor(prepared, receipt, 'postgres'), socketSpec);
      }
      docker(['start', idFor(prepared, receipt, service)], { socketSpec });
      if (service === 'postgres') {
        const pgId = idFor(prepared, receipt, 'postgres');
        waitPgTcpReady(pgId, { socketSpec });
        verifyStates(prepared, receipt, adapter);
        verifyPgLogPolicy(pgId, socketSpec);
      }
      if (service === 'auth') {
        const pgId = idFor(prepared, receipt, 'postgres');
        waitUntil(() => pgSql(pgId, "SELECT to_regclass('auth.users') IS NOT NULL;",
          30000, socketSpec) === 't',
          120, 'AUTH_SCHEMA_TIMEOUT');
      }
    }
  }
  verifyStates(prepared, receipt, adapter);
  return { runId: prepared.runId, phase: 'running', dataPreserved: true };
}

function emptyOrNull(value) {
  return value == null || (Array.isArray(value) && value.length === 0);
}

// Destroy-only mount check against Docker's inspected shapes. Docker reports
// HostConfig.Mounts as null for a container created with zero mounts, and
// omits ReadOnly for a writable mount; both are accepted only where the plan
// itself has zero mounts or one writable private volume. Create/start still
// uses the strict guard in community-docker-guard.mjs.
export function verifyDestroyMounts(service, info, plannedMounts, volume) {
  const hostConfig = info?.HostConfig;
  requireValue(hostConfig && typeof hostConfig === 'object' &&
    Array.isArray(plannedMounts) &&
    plannedMounts.length === (service === 'postgres' ? 1 : 0) &&
    emptyOrNull(hostConfig.Binds) && emptyOrNull(hostConfig.VolumesFrom) &&
    Array.isArray(info.Mounts), 'DESTROY_MOUNTS_INVALID');
  if (plannedMounts.length === 0) {
    requireValue(emptyOrNull(hostConfig.Mounts) && info.Mounts.length === 0,
      'DESTROY_MOUNTS_INVALID');
    return;
  }
  const expected = plannedMounts[0];
  const hostMounts = hostConfig.Mounts;
  requireValue(Array.isArray(hostMounts) && hostMounts.length === 1 &&
    info.Mounts.length === 1, 'DESTROY_MOUNTS_INVALID');
  const host = hostMounts[0];
  const actual = info.Mounts[0];
  requireValue(expected?.Type === 'volume' && expected.ReadOnly === false &&
    volume?.Name === expected.Source && volume.Driver === 'local' &&
    host && typeof host === 'object' &&
    Object.keys(host).every((key) =>
      ['Type', 'Source', 'Target', 'ReadOnly'].includes(key)) &&
    host.Type === 'volume' && host.Source === expected.Source &&
    host.Target === expected.Target &&
    (host.ReadOnly === undefined || host.ReadOnly === false) &&
    actual && typeof actual === 'object' && actual.Type === 'volume' &&
    actual.Name === expected.Source && actual.Destination === expected.Target &&
    (actual.Driver === undefined || actual.Driver === 'local') &&
    actual.RW === true, 'DESTROY_MOUNTS_INVALID');
}

// Destruction may be the only way to clean an interrupted create. Recheck the
// fixed resource/log policy before touching even a partial run by name.
export function verifyDestroyResourcePolicy(service, info) {
  const host = info?.HostConfig;
  const limits = RESOURCE_LIMITS[service];
  const empty = (value) => value == null ||
    (Array.isArray(value) && value.length === 0);
  requireValue(host && limits &&
    Object.entries(limits).every(([key, value]) => host[key] === value) &&
    host.LogConfig?.Type === LOG_LIMIT.Type &&
    host.LogConfig?.Config &&
    Object.keys(host.LogConfig.Config).sort().join(',') === 'max-file,max-size' &&
    Object.entries(LOG_LIMIT.Config).every(([key, value]) =>
      host.LogConfig.Config[key] === value) &&
    host.RestartPolicy?.Name === 'no' &&
    empty(host.CapAdd) && empty(host.CapDrop) && empty(host.Devices) &&
    empty(host.DeviceRequests) && empty(host.SecurityOpt) &&
    empty(host.ExtraHosts) && empty(host.Dns) && empty(host.Links) &&
    host.AutoRemove !== true &&
    [undefined, null, ''].includes(host.PidMode) &&
    [undefined, null, '', 'private'].includes(host.IpcMode) &&
    [undefined, null, ''].includes(host.UsernsMode) &&
    [undefined, null, '', 'private'].includes(host.CgroupnsMode),
  'DESTROY_RESOURCES_INVALID');
}

function ownedPartial(prepared, adapter) {
  const runId = prepared.runId;
  const network = adapter.inspectNetworkByName(prepared.plan.network.name);
  const volume = adapter.inspectVolume(`${runId}-pgdata`);
  const containers = SERVICES.map((service) => ({
    service, info: adapter.inspectContainerByName(`${runId}-${service}`),
  }));
  if (network) {
    requireValue(ID_RE.test(network.Id) &&
      network.Name === prepared.plan.network.name &&
      network.Driver === 'bridge' && network.Internal === true &&
      network.Labels?.[OWNER_LABEL] === runId &&
      Object.keys(network.Labels).length === 1, 'DESTROY_NETWORK_INVALID');
  }
  if (volume) {
    requireValue(volume.Name === `${runId}-pgdata` && volume.Driver === 'local' &&
      volume.Scope === 'local' && volume.Labels?.[OWNER_LABEL] === runId &&
      Object.keys(volume.Labels).length === 1 &&
      (volume.Options === null ||
        (volume.Options && Object.keys(volume.Options).length === 0)),
    'DESTROY_VOLUME_INVALID');
  }
  const found = new Map();
  for (const { service, info } of containers) {
    if (!info) continue;
    const plan = prepared.plan.containers.find((row) =>
      row.labels[SERVICE_LABEL] === service);
    requireValue(plan, 'DESTROY_CONTAINER_INVALID');
    verifyDestroyMounts(service, info, plan.mounts, volume);
    verifyDestroyResourcePolicy(service, info);
    const attachedNetworks = Object.keys(info.NetworkSettings?.Networks ?? {});
    requireValue(ID_RE.test(info.Id) &&
      info.Name === `/${runId}-${service}` && info.Image === plan.expectedImageId &&
      info.Config?.Image === plan.image &&
      info.Config?.Labels?.[OWNER_LABEL] === runId &&
      info.Config?.Labels?.[SERVICE_LABEL] === service &&
      info.HostConfig?.NetworkMode === network?.Id &&
      info.HostConfig?.PublishAllPorts === false &&
      Object.keys(info.HostConfig?.PortBindings ?? {}).length === 0 &&
      info.HostConfig?.Privileged === false &&
      ['created', 'running', 'exited'].includes(info.State?.Status) &&
      attachedNetworks.length === 1 &&
      attachedNetworks[0] === prepared.plan.network.name,
    'DESTROY_CONTAINER_INVALID');
    found.set(info.Id, { service, info });
  }
  if (network) {
    requireValue(Object.keys(network.Containers ?? {}).every((id) => found.has(id)),
      'DESTROY_NETWORK_ATTACHED');
  }
  return { network, volume, containers: found };
}

export function destroyStack(runtimeDir, adapter = makeDockerApiAdapter()) {
  const prepared = readRuntime(runtimeDir);
  const socketSpec = socketForRun(prepared, adapter);
  const receiptPath = join(prepared.runtimeDir, 'receipt.json');
  const destroyAttempted = join(prepared.runtimeDir, 'destroy.attempted');
  if (existsSync(receiptPath)) {
    const receipt = readReceipt(prepared);
    const discovered = ownedPartial(prepared, adapter);
    requireValue((discovered.network?.Id === receipt.networkId ||
      (existsSync(destroyAttempted) && !discovered.network)) &&
      receipt.containers.every((row) =>
        (existsSync(destroyAttempted) || discovered.containers.has(row.id)) &&
        (!discovered.containers.has(row.id) ||
          discovered.containers.get(row.id).info.Name === `/${row.name}`)) &&
      [...discovered.containers.keys()].every((id) =>
        receipt.containers.some((row) => row.id === id)),
    'DESTROY_RECEIPT_MISMATCH');
  }
  if (!existsSync(destroyAttempted)) {
    writePrivateJson(destroyAttempted, { runId: prepared.runId });
  } else {
    requireValue(readPrivateJson(destroyAttempted).runId === prepared.runId,
      'DESTROY_MARKER_INVALID');
  }
  let discovered = ownedPartial(prepared, adapter);
  for (const service of [...SERVICES].reverse()) {
    discovered = ownedPartial(prepared, adapter);
    const row = [...discovered.containers.values()].find((item) => item.service === service);
    if (!row) continue;
    if (row.info.State.Status === 'running') {
      docker(['stop', '--time', '15', row.info.Id], { timeout: 25000, socketSpec });
      discovered = ownedPartial(prepared, adapter);
    }
    const stopped = [...discovered.containers.values()].find((item) =>
      item.service === service);
    requireValue(stopped?.info.Id === row.info.Id &&
      stopped.info.State.Status !== 'running', 'DESTROY_STATE_CHANGED');
    docker(['rm', row.info.Id], { socketSpec });
  }
  discovered = ownedPartial(prepared, adapter);
  requireValue(discovered.containers.size === 0, 'DESTROY_CONTAINERS_REMAIN');
  if (discovered.network) {
    requireValue(Object.keys(discovered.network.Containers ?? {}).length === 0,
      'DESTROY_NETWORK_ATTACHED');
    docker(['network', 'rm', discovered.network.Id], { socketSpec });
  }
  discovered = ownedPartial(prepared, adapter);
  if (discovered.volume) docker(['volume', 'rm', discovered.volume.Name], { socketSpec });
  discovered = ownedPartial(prepared, adapter);
  requireValue(!discovered.network && !discovered.volume &&
    discovered.containers.size === 0, 'DESTROY_RESOURCE_REMAINS');
  // Only exact installer files are removed. Any unexpected file stops cleanup.
  const allowed = ['secrets.json', 'users.json', 'app.env', 'pgsodium_root.key',
    'plan.json', 'receipt.json', 'proxy-config.json', 'migrations.attempted',
    'migrations.done', 'first-user.json', 'destroy.attempted'];
  const entries = new Set(readdirSync(prepared.runtimeDir));
  requireValue([...entries].every((entry) => allowed.includes(entry)),
    'RUNTIME_EXTRA_FILES');
  for (const name of allowed) {
    const filename = join(prepared.runtimeDir, name);
    if (existsSync(filename)) {
      const info = lstatSync(filename);
      requireValue(info.isFile() && !info.isSymbolicLink() &&
        (info.mode & 0o777) === 0o600, 'PRIVATE_FILE_INVALID');
      unlinkSync(filename);
    }
  }
  rmdirSync(prepared.runtimeDir);
  return { runId: prepared.runId, phase: 'destroyed', dataPreserved: false };
}
