// Prepare only a newly created Community PG container. Import has no
// Docker, credential, or filesystem side effect.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireLocalDockerSocket } from './platform.mjs';
import { linuxRunPaths, validateLinuxRunPaths } from './runtime.mjs';

const OWNER_LABEL = 'com.closr.run-id';
const SERVICE_LABEL = 'com.closr.service';
const ID_RE = /^[a-f0-9]{64}$/;
const RUN_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const WRAPPER_PATH = fileURLToPath(new URL('./closr-test-pg-start.sh', import.meta.url));
const WRAPPER_SHA = 'da69717df779d489194f8888d9ab8e5b8a488b57de212fd83da2616f984bc5ef';
const BRIDGE_PATH = fileURLToPath(new URL('./http-bridge.py', import.meta.url));
const BRIDGE_SHA = 'd99c6d8eeef0ccec2a0739583b547be6313e843c01300736b6ec3e942824aba0';
const SQL = Object.freeze([
  ['schema.sql', '3a9f39fb79d67d4fb2f5e54638dca1d06894a3e1a57419bc188e4ee09c72556f', 702],
  ['webhook.sql', 'aa956b7b1f205284a524882fe0d580c72d86374aea9c9c2e93ac398df5e07d0b', 8399],
  ['_supabase.sql', 'ced0d2dd073c86f402e409ff540ecda07455997e6a0a1e8a738c154c6b962a20', 421],
]);
export const PG_ASSET_TARGETS = Object.freeze([
  '/etc/postgresql.schema.sql',
  '/etc/postgresql-custom/pgsodium_root.key',
  '/usr/local/bin/closr-test-pg-start.sh',
  '/usr/local/bin/closr-test-v7-http-bridge.py',
]);

export class PgAssetError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PgAssetError';
    this.code = code;
  }
}

function fail(code) {
  throw new PgAssetError(code);
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function regularFile(path) {
  let info;
  try {
    info = lstatSync(path);
  } catch {
    fail('ASSET_SOURCE_INVALID');
  }
  if (!info.isFile() || info.isSymbolicLink()) fail('ASSET_SOURCE_INVALID');
  return info;
}

function checkedSource(path, expectedSha, expectedBytes) {
  const info = regularFile(path);
  if (expectedBytes !== undefined && info.size !== expectedBytes) fail('ASSET_SOURCE_INVALID');
  const bytes = readFileSync(path);
  if (digest(bytes) !== expectedSha) fail('ASSET_HASH_MISMATCH');
  return bytes;
}

function writePrivate(path, bytes, mode) {
  writeFileSync(path, bytes, { flag: 'wx', mode });
  chmodSync(path, mode);
  if ((regularFile(path).mode & 0o777) !== mode) fail('ASSET_MODE_INVALID');
}

function ensureCreatedPg(info, containerId, runId) {
  if (!info || info.Id !== containerId ||
      info.State?.Status !== 'created' || info.State?.Running !== false ||
      info.Config?.Labels?.[OWNER_LABEL] !== runId ||
      info.Config?.Labels?.[SERVICE_LABEL] !== 'postgres') {
    fail('ASSET_CONTAINER_INVALID');
  }
}

// dockerFiles must implement inspectContainer(id), copyIn(id, target, source),
// readBack(id, target), which returns actual archive bytes and header mode.
// The full container ID and target paths are fixed and checked at both layers.
export async function stagePgFirstBootAssets({
  runId, containerId, sqlSourceDir, randomBytes32, dockerFiles,
  platform = process.platform, stagingRoot,
}) {
  if (typeof runId !== 'string' || !RUN_RE.test(runId) ||
      typeof containerId !== 'string' || !ID_RE.test(containerId) ||
      typeof sqlSourceDir !== 'string' || !isAbsolute(sqlSourceDir) ||
      typeof randomBytes32 !== 'function' || !dockerFiles ||
      ['inspectContainer', 'copyIn', 'readBack'].some((name) =>
        typeof dockerFiles[name] !== 'function')) fail('ASSET_ARGUMENT_INVALID');
  if (platform === 'linux') {
    try {
      const paths = validateLinuxRunPaths(runId);
      const info = lstatSync(paths.runtimeDir);
      const mount = lstatSync(paths.mountPoint);
      if (stagingRoot !== paths.runtimeDir || !info.isDirectory() ||
          info.isSymbolicLink() || info.uid !== 0 ||
          (info.mode & 0o777) !== 0o700 || info.dev !== mount.dev) {
        fail('ASSET_STAGING_INVALID');
      }
    } catch { fail('ASSET_STAGING_INVALID'); }
  } else if (platform === 'darwin') {
    // The caller supplies the run's 0700 runtime directory on its selected
    // data volume. Never stage database keys in the host's default /tmp.
    try {
      const expected = join(realpathSync(fileURLToPath(new URL('../', import.meta.url))),
        '.closr-local', runId);
      const info = lstatSync(stagingRoot);
      const parent = lstatSync(dirname(stagingRoot));
      if (typeof stagingRoot !== 'string' || !isAbsolute(stagingRoot) ||
          stagingRoot !== expected || basename(stagingRoot) !== runId ||
          realpathSync(stagingRoot) !== stagingRoot ||
          !parent.isDirectory() || parent.isSymbolicLink() ||
          parent.uid !== process.getuid() || (parent.mode & 0o777) !== 0o700 ||
          !info.isDirectory() || info.isSymbolicLink() ||
          info.uid !== process.getuid() || (info.mode & 0o777) !== 0o700) {
        fail('ASSET_STAGING_INVALID');
      }
    } catch { fail('ASSET_STAGING_INVALID'); }
  } else {
    fail('ASSET_STAGING_INVALID');
  }
  try {
    const dirInfo = lstatSync(sqlSourceDir);
    if (!dirInfo.isDirectory() || dirInfo.isSymbolicLink()) fail('ASSET_SOURCE_INVALID');
  } catch (error) {
    if (error instanceof PgAssetError) throw error;
    fail('ASSET_SOURCE_INVALID');
  }

  // Read and pin all public assets before any Docker mutation.
  const sqlParts = SQL.map(([name, sha, bytes]) =>
    checkedSource(join(sqlSourceDir, name), sha, bytes));
  const wrapper = checkedSource(WRAPPER_PATH, WRAPPER_SHA);
  if ((regularFile(WRAPPER_PATH).mode & 0o777) !== 0o755) fail('ASSET_MODE_INVALID');
  const bridge = checkedSource(BRIDGE_PATH, BRIDGE_SHA);
  if ((regularFile(BRIDGE_PATH).mode & 0o777) !== 0o644) fail('ASSET_MODE_INVALID');
  ensureCreatedPg(await dockerFiles.inspectContainer(containerId), containerId, runId);
  const entropy = randomBytes32();
  if (!(entropy instanceof Uint8Array) || entropy.byteLength !== 32) {
    fail('ASSET_RANDOM_INVALID');
  }
  const key = Buffer.from(Buffer.from(entropy).toString('hex') + '\n', 'ascii');
  if (key.length !== 65) fail('ASSET_RANDOM_INVALID');

  const staging = mkdtempSync(join(stagingRoot,
    'closr-community-' + runId + '-'));
  try {
    if ((lstatSync(staging).mode & 0o777) !== 0o700) fail('ASSET_MODE_INVALID');
    const files = [
      { source: join(staging, 'postgresql.schema.sql'),
        target: PG_ASSET_TARGETS[0], bytes: Buffer.concat(sqlParts), mode: 0o600 },
      { source: join(staging, 'pgsodium_root.key'),
        target: PG_ASSET_TARGETS[1], bytes: key, mode: 0o600 },
      { source: join(staging, 'closr-test-pg-start.sh'),
        target: PG_ASSET_TARGETS[2], bytes: wrapper, mode: 0o755 },
      { source: join(staging, 'closr-test-v7-http-bridge.py'),
        target: PG_ASSET_TARGETS[3], bytes: bridge, mode: 0o644 },
    ];
    for (const file of files) writePrivate(file.source, file.bytes, file.mode);
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      ensureCreatedPg(await dockerFiles.inspectContainer(containerId), containerId, runId);
      await dockerFiles.copyIn(containerId, file.target, file.source);
      const readback = await dockerFiles.readBack(containerId, file.target);
      if (!readback || !Buffer.isBuffer(readback.bytes) ||
          readback.mode !== file.mode || readback.bytes.length !== file.bytes.length ||
          digest(readback.bytes) !== digest(file.bytes)) {
        fail('ASSET_READBACK_MISMATCH');
      }
    }
    ensureCreatedPg(await dockerFiles.inspectContainer(containerId), containerId, runId);
    return Object.freeze({ containerId, verifiedFileCount: files.length });
  } finally {
    key.fill(0);
    rmSync(staging, { recursive: true, force: true });
  }
}

function tarNumber(field) {
  const value = field.toString('ascii').replace(/\0.*$/s, '').trim();
  if (!/^[0-7]+$/.test(value)) fail('ASSET_DOCKER_ARCHIVE_INVALID');
  const number = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(number)) fail('ASSET_DOCKER_ARCHIVE_INVALID');
  return number;
}

function tarString(field) {
  return field.toString('utf8').replace(/\0.*$/s, '');
}

function paxFields(bytes) {
  const result = {};
  let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(0x20, offset);
    if (space < 0 || space - offset > 8) fail('ASSET_DOCKER_ARCHIVE_INVALID');
    const lengthText = bytes.subarray(offset, space).toString('ascii');
    if (!/^[1-9][0-9]*$/.test(lengthText)) fail('ASSET_DOCKER_ARCHIVE_INVALID');
    const length = Number(lengthText);
    if (!Number.isSafeInteger(length) || length < 4 || offset + length > bytes.length ||
        bytes[offset + length - 1] !== 0x0a) fail('ASSET_DOCKER_ARCHIVE_INVALID');
    const record = bytes.subarray(space + 1, offset + length - 1).toString('utf8');
    const equals = record.indexOf('=');
    if (equals < 1) fail('ASSET_DOCKER_ARCHIVE_INVALID');
    result[record.slice(0, equals)] = record.slice(equals + 1);
    offset += length;
  }
  return result;
}

function parseDockerFileArchive(archive, target) {
  if (!Buffer.isBuffer(archive) || archive.length < 1024 ||
      archive.length > 131072 || archive.length % 512 !== 0) {
    fail('ASSET_DOCKER_ARCHIVE_INVALID');
  }
  const names = new Set([basename(target), './' + basename(target), target.slice(1)]);
  let offset = 0;
  let found;
  let globalPax = {};
  let localPax = {};
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      if (archive.subarray(offset).some((byte) => byte !== 0)) {
        fail('ASSET_DOCKER_ARCHIVE_INVALID');
      }
      break;
    }
    const expectedCheck = tarNumber(header.subarray(148, 156));
    let actualCheck = 0;
    for (let byte = 0; byte < 512; byte += 1) {
      actualCheck += byte >= 148 && byte < 156 ? 0x20 : header[byte];
    }
    if (expectedCheck !== actualCheck) fail('ASSET_DOCKER_ARCHIVE_INVALID');
    const size = tarNumber(header.subarray(124, 136));
    const mode = tarNumber(header.subarray(100, 108));
    if (size > 65536 || mode > 0o7777) fail('ASSET_DOCKER_ARCHIVE_INVALID');
    const bodyStart = offset + 512;
    const next = bodyStart + Math.ceil(size / 512) * 512;
    if (next > archive.length) fail('ASSET_DOCKER_ARCHIVE_INVALID');
    const body = archive.subarray(bodyStart, bodyStart + size);
    const type = header[156];
    if (type === 0x78 || type === 0x67) {
      const fields = paxFields(body);
      if (type === 0x67) globalPax = { ...globalPax, ...fields };
      else localPax = fields;
    } else if (type === 0 || type === 0x30) {
      const rawName = tarString(header.subarray(0, 100));
      const prefix = tarString(header.subarray(345, 500));
      const name = localPax.path ?? globalPax.path ?? (prefix ? prefix + '/' + rawName : rawName);
      if (found || !names.has(name)) fail('ASSET_DOCKER_ARCHIVE_INVALID');
      found = { bytes: Buffer.from(body), mode };
      localPax = {};
    } else {
      fail('ASSET_DOCKER_ARCHIVE_INVALID');
    }
    offset = next;
  }
  if (!found) fail('ASSET_DOCKER_ARCHIVE_INVALID');
  return found;
}

// Optional local Docker CLI copy transport. It never uses names, a shell,
// inherited Docker hosts, or a network endpoint. Importing does not call it.
export function makeDockerCpFiles({
  inspectContainer, spawn = spawnSync, dockerBinary = '/usr/local/bin/docker',
  socketSpec, platform = process.platform, arch = process.arch, fileSystem,
} = {}) {
  if (typeof inspectContainer !== 'function' || typeof spawn !== 'function' ||
      typeof dockerBinary !== 'string' || !isAbsolute(dockerBinary)) {
    fail('ASSET_ARGUMENT_INVALID');
  }
  function argsFor(id, target) {
    if (typeof id !== 'string' || !ID_RE.test(id) || !PG_ASSET_TARGETS.includes(target)) {
      fail('ASSET_ARGUMENT_INVALID');
    }
    let socket;
    try { socket = requireLocalDockerSocket(socketSpec, { platform, arch, fileSystem }); }
    catch { fail('ASSET_DOCKER_SOCKET_INVALID'); }
    return ['--host', `unix://${socket}`, 'cp'];
  }
  function copy(args, maxBuffer) {
    let result;
    try {
      result = spawn(dockerBinary, args, {
          env: { PATH: '/usr/bin:/bin',
            HOME: platform === 'linux' ?
              linuxRunPaths(socketSpec?.runId).runtimeDir : '/nonexistent',
            ...(platform === 'linux' ? {
              TMPDIR: linuxRunPaths(socketSpec?.runId).runtimeDir,
            } : {}) },
          encoding: null, timeout: 15000, maxBuffer,
        });
    } catch {
      fail('ASSET_DOCKER_COPY_FAILED');
    }
    if (!result || result.status !== 0 || result.error) fail('ASSET_DOCKER_COPY_FAILED');
    return result.stdout;
  }
  return Object.freeze({
    inspectContainer,
    copyIn(id, target, localPath) {
      const args = argsFor(id, target);
      if (typeof localPath !== 'string' || !isAbsolute(localPath)) fail('ASSET_ARGUMENT_INVALID');
      copy([...args, localPath, id + ':' + target], 4096);
    },
    readBack(id, target) {
      const args = argsFor(id, target);
      return parseDockerFileArchive(copy([...args, id + ':' + target, '-'], 131072), target);
    },
  });
}
