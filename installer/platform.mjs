// Local Unix sockets only. Linux requires a run-derived separate-daemon
// socket supplied by the reviewed operator; no inherited Docker context.
import * as fs from 'node:fs';

export const DOCKER_SOCKET = '/var/run/docker.sock';
const RUN_RE = /^closr-community-[a-f0-9]{20}$/;

export function dockerBinary() {
  for (const candidate of ['/usr/local/bin/docker', '/opt/homebrew/bin/docker',
    '/usr/bin/docker']) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch { /* Try the next fixed local path. */ }
  }
  throw new Error('DOCKER_CLI_MISSING');
}

export function requireLocalDockerSocket(spec, {
  platform = process.platform, arch = process.arch, fileSystem = fs,
} = {}) {
  if (platform === 'darwin' && arch === 'arm64') {
    if (spec !== undefined) throw new Error('DOCKER_SOCKET_CONTEXT_INVALID');
    try {
      if (fileSystem.statSync(DOCKER_SOCKET).isSocket()) return DOCKER_SOCKET;
    } catch { /* Stable error below. */ }
    throw new Error('DOCKER_LOCAL_SOCKET_MISSING');
  }
  if (platform !== 'linux' || arch !== 'x64') throw new Error('PLATFORM_UNSUPPORTED');
  if (!spec || typeof spec !== 'object' || Array.isArray(spec) ||
      Object.keys(spec).sort().join(',') !== 'dockerSocket,runId' ||
      typeof spec.runId !== 'string' || !RUN_RE.test(spec.runId) ||
      typeof spec.dockerSocket !== 'string') {
    throw new Error('DOCKER_SOCKET_CONTEXT_REQUIRED');
  }
  const expected = `/run/closr-community-test-${spec.runId}/docker.sock`;
  if (spec.dockerSocket !== expected || spec.dockerSocket === DOCKER_SOCKET) {
    throw new Error('DOCKER_PRODUCTION_SOCKET_FORBIDDEN');
  }
  try {
    const runDir = `/run/closr-community-test-${spec.runId}`;
    const runParent = fileSystem.lstatSync('/run');
    const ownerDir = fileSystem.lstatSync(runDir);
    const socket = fileSystem.lstatSync(expected);
    if (runParent.isSymbolicLink() || !runParent.isDirectory() ||
        runParent.uid !== 0 || (runParent.mode & 0o022) !== 0 ||
        ownerDir.isSymbolicLink() || !ownerDir.isDirectory() ||
        ownerDir.uid !== 0 || (ownerDir.mode & 0o777) !== 0o700 ||
        socket.isSymbolicLink() || !socket.isSocket() ||
        socket.uid !== 0 || (socket.mode & 0o777) !== 0o600 ||
        fileSystem.realpathSync(expected) !== expected) {
      throw new Error('DOCKER_ISOLATED_SOCKET_INVALID');
    }
    let production;
    try { production = fileSystem.statSync(DOCKER_SOCKET); }
    catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    if (production && production.dev === socket.dev &&
        production.ino === socket.ino) {
      throw new Error('DOCKER_PRODUCTION_SOCKET_FORBIDDEN');
    }
    return expected;
  } catch (error) {
    if (error?.message === 'DOCKER_PRODUCTION_SOCKET_FORBIDDEN') throw error;
    throw new Error('DOCKER_ISOLATED_SOCKET_INVALID');
  }
}
