#!/usr/bin/env node
// Closr Community local installer CLI for Apple Silicon with a local Docker
// socket. Engine stays disabled. Output is fixed labels, run paths and safe
// error codes only: never keys, passwords, upstream bodies or raw errors.
// No secret is accepted as an argument. Nothing happens on import.
import { lstatSync, readdirSync, realpathSync, statfsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeDockerApiAdapter } from './docker-api-adapter.mjs';
import {
  assertPortFree, listenLoopback, postAdminUser, probePortFree, writeFirstUserMarker,
} from './loopback-client.mjs';
import { createProxyServer } from './loopback-proxy.mjs';
import {
  createStack, destroyStack, firstUserPrecheck, imageCheck, migrateCommunity,
  readMigrationSources, requireServingStack, resumeStack, stackStatus, startAuth,
  startPg, startRest, stopStack, verifyFirstUser,
} from './operator.mjs';
import { dockerBinary, requireLocalDockerSocket } from './platform.mjs';
import { linuxRunPaths, RUN_RE, prepareRuntime, readRuntime, validatePorts } from './runtime.mjs';

const API_PORT = 54321;
const WEB_PORT = 3000;
const MIN_DISK_GIB = 4;
const APP_ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const CODE_RE = /^[A-Z][A-Z0-9_]{2,63}$/;
const PROXY_CODE_RE = /^loopback_proxy_[a-z_]{1,48}$/;
const USAGE = [
  'usage: node installer/cli.mjs <command>',
  '  image-check',
  '  up [--ports <api-port> <web-port>]',
  '  first-user <absolute runtimeDir>',
  '  serve-api <absolute runtimeDir>',
  '  status <absolute runtimeDir>',
  '  stop <absolute runtimeDir>',
  '  resume <absolute runtimeDir>',
  '  destroy <absolute runtimeDir>',
].join('\n');

export class CliError extends Error {
  constructor(code, runtimeDir, { manualOnly = false } = {}) {
    super(code);
    this.name = 'CliError';
    this.code = code;
    this.runtimeDir = runtimeDir;
    this.manualOnly = manualOnly;
  }
}

function requireValue(ok, code) {
  if (!ok) throw new CliError(code);
}

// Only fixed-shape codes leave the process. Messages from JSON.parse, Docker,
// fetch or fs can echo input and are never printed.
export function safeErrorCode(error) {
  for (const field of ['code', 'message']) {
    let value;
    try { value = error?.[field]; } catch { value = undefined; }
    if (typeof value === 'string' && (CODE_RE.test(value) || PROXY_CODE_RE.test(value))) {
      return value;
    }
  }
  return 'INSTALLER_FAILED';
}

export const DEFAULT_DEPS = Object.freeze({
  appRoot: APP_ROOT, apiPort: API_PORT, webPort: WEB_PORT,
  platform: process.platform, arch: process.arch,
  nodeVersion: process.versions.node, euid: process.geteuid?.(),
  out: (line) => process.stdout.write(line + '\n'),
  statfs: statfsSync, readdir: readdirSync, lstat: lstatSync,
  // Only an in-process, reviewed operator may supply this context. No CLI
  // flag, environment variable or inherited Docker context can set it.
  socketSpec: undefined,
  dockerBinary, requireLocalDockerSocket,
  makeAdapter: (socketSpec) => makeDockerApiAdapter({ socketSpec }),
  imageCheck, readMigrationSources, assertPortFree, probePortFree, prepareRuntime,
  readRuntime,
  createStack, startPg, startAuth, migrateCommunity, startRest,
  stackStatus, stopStack, resumeStack, destroyStack,
  requireServingStack, firstUserPrecheck, verifyFirstUser,
  createProxyServer, listenLoopback, postAdminUser, writeFirstUserMarker,
});

function nodeAtLeast(version, major, minor) {
  const [a, b] = String(version).split('.').map(Number);
  return a > major || (a === major && b >= minor);
}

function runtimeArg(value) {
  requireValue(typeof value === 'string' && path.isAbsolute(value) &&
    !value.includes('\0') && RUN_RE.test(path.basename(value)), 'RUNTIME_PATH_INVALID');
  return value;
}

// A previous run, even a partial one, must be destroyed before a new one.
function requireNoExistingRuntime(deps) {
  const base = deps.platform === 'linux' ?
    linuxRunPaths(deps.socketSpec?.runId).runtimeBase :
    path.join(deps.appRoot, '.closr-local');
  let info;
  try { info = deps.lstat(base); }
  catch (error) {
    if (error?.code === 'ENOENT' && deps.platform !== 'linux') return;
    throw new CliError('RUNTIME_ROOT_INVALID');
  }
  requireValue(info.isDirectory() && !info.isSymbolicLink(), 'RUNTIME_ROOT_INVALID');
  requireValue(deps.readdir(base).length === 0, 'EXISTING_RUNTIME_PRESENT');
}

// An old .env.local would carry another run's keys. lstat does not follow
// links, so a dangling symlink is refused too. env.example is not consulted.
function requireNoEnvLocal(deps) {
  try { deps.lstat(path.join(deps.appRoot, '.env.local')); }
  catch (error) {
    if (error?.code === 'ENOENT') return;
    throw new CliError('ENV_LOCAL_CHECK_FAILED');
  }
  throw new CliError('ENV_LOCAL_PRESENT');
}

// serve-api routes to these containers; never stop or remove them under it.
// Any loopback listener on the API port refuses, including unrelated ones.
async function requireApiProxyStopped(runtimeDir, deps) {
  const port = deps.readRuntime(runtimeDir,
    { appRoot: deps.appRoot, platform: deps.platform }).ports.apiPort;
  try { await deps.probePortFree(port); }
  catch (error) {
    throw new CliError(error?.code === 'PORT_IN_USE' ? 'API_PROXY_RUNNING' :
      safeErrorCode(error));
  }
}

function diskGate(deps) {
  const location = deps.platform === 'linux' ?
    linuxRunPaths(deps.socketSpec?.runId).mountPoint : deps.appRoot;
  const stat = deps.statfs(location);
  requireValue(Number(stat.bavail) * Number(stat.bsize) >= MIN_DISK_GIB * 1024 ** 3,
    'DISK_SPACE_LOW');
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server?.listening) { resolve(); return; }
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

export function runImageCheck(deps = DEFAULT_DEPS) {
  requireValue(deps.platform === 'darwin' && deps.arch === 'arm64' ||
    deps.platform === 'linux' && deps.arch === 'x64', 'PLATFORM_UNSUPPORTED');
  deps.dockerBinary();
  deps.requireLocalDockerSocket(deps.socketSpec,
    { platform: deps.platform, arch: deps.arch });
  const result = deps.imageCheck(deps.makeAdapter(deps.socketSpec), deps.platform, deps.arch);
  deps.out(`images_verified ${result.platform}`);
}

// Every check that cannot write runs before prepareRuntime creates secrets.
export async function runUp(deps = DEFAULT_DEPS,
  selectedPorts = { apiPort: deps.apiPort, webPort: deps.webPort }, explicitPorts = false) {
  const ports = validatePorts(selectedPorts);
  requireValue(deps.platform === 'darwin' && deps.arch === 'arm64' ||
    deps.platform === 'linux' && deps.arch === 'x64', 'PLATFORM_UNSUPPORTED');
  requireValue(nodeAtLeast(deps.nodeVersion, 20, 9), 'NODE_VERSION_UNSUPPORTED');
  requireValue(deps.euid !== 0, 'ROOT_UNSUPPORTED');
  if (deps.platform === 'linux') {
    requireValue(explicitPorts && ports.apiPort >= 49152 && ports.webPort >= 49152,
      'LINUX_HIGH_PORTS_REQUIRED');
    requireValue(typeof deps.socketSpec?.runId === 'string' &&
      RUN_RE.test(deps.socketSpec.runId), 'DOCKER_SOCKET_CONTEXT_REQUIRED');
    // A nonroot CLI cannot write the root-owned mount runtime. Linux up must
    // be orchestrated by the separately reviewed root runner, not by this CLI.
    throw new CliError('LINUX_ROOT_RUNNER_REQUIRED');
  }
  deps.readMigrationSources(deps.appRoot);
  requireNoExistingRuntime(deps);
  requireNoEnvLocal(deps);
  diskGate(deps);
  deps.dockerBinary();
  deps.requireLocalDockerSocket(deps.socketSpec,
    { platform: deps.platform, arch: deps.arch });
  const adapter = deps.makeAdapter(deps.socketSpec);
  deps.imageCheck(adapter, deps.platform, deps.arch);
  await deps.assertPortFree(ports.apiPort);
  await deps.assertPortFree(ports.webPort);
  deps.out('preflight_ok');

  let prepared;
  try { prepared = deps.prepareRuntime({ appRoot: deps.appRoot, ports,
    runId: deps.platform === 'linux' ? deps.socketSpec?.runId : undefined,
    platform: deps.platform }); }
  catch (error) {
    const left = error?.runtimeDir;
    if (error?.code === 'RUNTIME_ROLLBACK_FAILED' && typeof left === 'string' &&
        RUN_RE.test(path.basename(left))) {
      throw new CliError('RUNTIME_ROLLBACK_FAILED', left, { manualOnly: true });
    }
    throw new CliError(safeErrorCode(error));
  }
  const dir = prepared.runtimeDir;
  deps.out(`runtime_dir ${dir}`);
  try {
    deps.createStack(dir, adapter);
    deps.out('stack_created');
    await deps.startPg(dir, adapter);
    deps.out('postgres_running');
    deps.startAuth(dir, adapter);
    deps.out('auth_running');
    deps.migrateCommunity(dir, adapter);
    deps.out('migrations_applied');
    deps.startRest(dir, adapter);
  } catch (error) {
    const code = safeErrorCode(error);
    try {
      deps.destroyStack(dir, adapter);
      deps.out('failed_run_resources_removed');
    } catch {
      // Never remove by label alone after a mismatch. Keep the private run
      // directory and ask the operator to inspect the exact failed instance.
      throw new CliError('RUNTIME_CLEANUP_REQUIRES_INSPECTION', dir,
        { manualOnly: true });
    }
    throw new CliError(code);
  }
  deps.out('stack_running');
  deps.out('engine disabled');
  deps.out(`app_env_file ${path.join(dir, 'app.env')}`);
  deps.out(`next node installer/cli.mjs first-user ${dir}`);
}

export async function runFirstUser(runtimeDir, deps = DEFAULT_DEPS) {
  const adapter = deps.makeAdapter(deps.socketSpec);
  const serving = deps.firstUserPrecheck(runtimeDir, adapter);
  const port = serving.config.listenPort;
  validatePorts({ apiPort: port, webPort: Number(new URL(serving.config.webOrigin).port) });
  // Fail before any key exists in a socket buffer if anything already listens.
  await deps.probePortFree(port);
  const server = deps.createProxyServer(serving.config, serving.secrets, deps.socketSpec);
  let user;
  try {
    await deps.listenLoopback(server, port);
    user = await deps.postAdminUser({ server, port,
      serviceKey: serving.secrets.serviceKey, user: serving.prepared.material.user });
  } finally {
    await closeServer(server);
  }
  // The marker records success, so it is written only after SQL proves the
  // trigger result; a failed verification leaves no marker behind.
  deps.verifyFirstUser(runtimeDir, user.id, adapter);
  deps.writeFirstUserMarker(serving.prepared.runtimeDir,
    { runId: serving.prepared.runId, userId: user.id, email: user.email });
  deps.out('first_user_created');
  deps.out(`email ${user.email}`);
  deps.out(`password_file ${path.join(serving.prepared.runtimeDir, 'users.json')}`);
}

export async function runServeApi(runtimeDir, deps = DEFAULT_DEPS) {
  const serving = deps.requireServingStack(runtimeDir, deps.makeAdapter(deps.socketSpec));
  const port = serving.config.listenPort;
  validatePorts({ apiPort: port, webPort: Number(new URL(serving.config.webOrigin).port) });
  await deps.probePortFree(port);
  const server = deps.createProxyServer(serving.config, serving.secrets, deps.socketSpec);
  await deps.listenLoopback(server, port);
  deps.out(`closr_api_ready http://127.0.0.1:${port}`);
  return server;
}

export function runStatus(runtimeDir, deps = DEFAULT_DEPS) {
  const result = deps.stackStatus(runtimeDir, deps.makeAdapter(deps.socketSpec));
  deps.out(`run_id ${result.runId}`);
  for (const service of ['postgres', 'auth', 'rest']) {
    deps.out(`${service} ${result.services[service]}`);
  }
  deps.out(`migrations_done ${result.migrationsDone === true}`);
  deps.out(`first_user_created ${result.firstUserCreated === true}`);
  deps.out('engine disabled');
}

function runLifecycle(fn, runtimeDir, deps) {
  const result = fn(runtimeDir, deps.makeAdapter(deps.socketSpec));
  deps.out(`${result.phase} ${result.runId}`);
  if (typeof result.dataPreserved === 'boolean') {
    deps.out(`data_preserved ${result.dataPreserved}`);
  }
}

export async function runStop(runtimeDir, deps = DEFAULT_DEPS) {
  await requireApiProxyStopped(runtimeDir, deps);
  runLifecycle(deps.stopStack, runtimeDir, deps);
}

export async function runDestroy(runtimeDir, deps = DEFAULT_DEPS) {
  await requireApiProxyStopped(runtimeDir, deps);
  runLifecycle(deps.destroyStack, runtimeDir, deps);
}

// Settles exactly once: 0 only for a SIGINT/SIGTERM shutdown, 1 for any
// runtime error or a close the command did not start. The first trigger wins.
export function serveForeground(server, signals = process) {
  return new Promise((resolve) => {
    let stopping = false;
    const stop = (code, label) => {
      if (stopping) return;
      stopping = true;
      signals.off('SIGINT', onSignal);
      signals.off('SIGTERM', onSignal);
      server.off('close', onClose);
      if (label) process.stderr.write(`error ${label}\n`);
      closeServer(server).then(() => resolve(code), () => resolve(1));
    };
    const onSignal = () => stop(0);
    const onClose = () => stop(1, 'API_SERVER_CLOSED');
    // Stays attached so a later error cannot become an uncaught exception.
    server.on('error', () => stop(1, 'API_SERVER_FAILED'));
    server.once('close', onClose);
    signals.once('SIGINT', onSignal);
    signals.once('SIGTERM', onSignal);
  });
}

export async function main(argv, deps = DEFAULT_DEPS) {
  const [command, ...rest] = argv;
  const needsDir = ['first-user', 'serve-api', 'status', 'stop', 'resume', 'destroy'];
  const portOption = command === 'up' && rest.length === 3 && rest[0] === '--ports' &&
    rest.slice(1).every((value) => /^[0-9]{4,5}$/.test(value));
  if (!command || (needsDir.includes(command) ? rest.length !== 1 :
    command === 'up' ? !(rest.length === 0 || portOption) :
      command !== 'image-check' || rest.length !== 0)) {
    process.stderr.write(USAGE + '\n');
    return 2;
  }
  try {
    if (command === 'image-check') runImageCheck(deps);
    else if (command === 'up') await runUp(deps,
      portOption ? { apiPort: Number(rest[1]), webPort: Number(rest[2]) } :
        { apiPort: deps.apiPort, webPort: deps.webPort }, portOption);
    else {
      const dir = runtimeArg(rest[0]);
      if (command === 'first-user') await runFirstUser(dir, deps);
      else if (command === 'serve-api') {
        return await serveForeground(await runServeApi(dir, deps));
      } else if (command === 'status') runStatus(dir, deps);
      else if (command === 'stop') await runStop(dir, deps);
      else if (command === 'resume') runLifecycle(deps.resumeStack, dir, deps);
      else await runDestroy(dir, deps);
    }
    return 0;
  } catch (error) {
    const code = safeErrorCode(error);
    process.stderr.write(`error ${code}\n`);
    if (code === 'API_PROXY_RUNNING') {
      process.stderr.write('stop serve-api with Ctrl-C first, then retry\n');
    } else if (code === 'ENV_LOCAL_PRESENT') {
      process.stderr.write('move .env.local aside; up writes app.env inside the run directory\n');
    }
    if (error instanceof CliError && error.runtimeDir && error.manualOnly) {
      process.stderr.write(`manual_inspect ${error.runtimeDir}\n`);
    } else if (error instanceof CliError && error.runtimeDir) {
      process.stderr.write(`partial_state ${error.runtimeDir}\n`);
      process.stderr.write(`inspect: node installer/cli.mjs status ${error.runtimeDir}\n`);
      process.stderr.write(`remove: node installer/cli.mjs destroy ${error.runtimeDir}\n`);
    }
    return 1;
  }
}

// import.meta.url is the realpath (/tmp is a symlink on macOS).
let invoked = '';
try { invoked = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : ''; }
catch { invoked = ''; }
if (invoked === import.meta.url) {
  process.exitCode = await main(process.argv.slice(2));
}
