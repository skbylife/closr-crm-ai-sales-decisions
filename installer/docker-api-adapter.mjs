// Local, create-only Docker Engine adapter for the isolated Community installer
// candidate. Importing this module performs no Docker request.
import { spawnSync } from 'node:child_process';
import { LOG_LIMIT, PG_START_CMD, PG_START_ENTRYPOINT, RESOURCE_LIMITS,
  SERVICE_IMAGES } from './community-docker-guard.mjs';
import { requireLocalDockerSocket } from './platform.mjs';
import { linuxRunPaths } from './runtime.mjs';

const API = '/v1.51';
const CURL = '/usr/bin/curl';
const STATUS_MARKER = '\nCLOSR_HTTP_STATUS:';
const NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,127}$/;
const ID_RE = /^[a-f0-9]{64}$/;
const VOLUME_TARGET = '/var/lib/postgresql/data';
const OWNER_LABEL = 'com.closr.run-id';
const SERVICE_LABEL = 'com.closr.service';
const IMAGE_SET = new Set(Object.values(SERVICE_IMAGES));
export const PG_ENTRYPOINT = PG_START_ENTRYPOINT;
export const PG_CMD = PG_START_CMD;
const ENV_ALLOWED = Object.freeze({
  postgres: new Set(['POSTGRES_PASSWORD', 'PGPASSWORD', 'POSTGRES_HOST', 'JWT_SECRET', 'JWT_EXP']),
  auth: new Set([
    'API_EXTERNAL_URL', 'GOTRUE_API_HOST', 'GOTRUE_API_PORT', 'GOTRUE_DB_DRIVER',
    'GOTRUE_DB_DATABASE_URL', 'GOTRUE_SITE_URL', 'GOTRUE_DISABLE_SIGNUP',
    'GOTRUE_JWT_ADMIN_ROLES', 'GOTRUE_JWT_AUD', 'GOTRUE_JWT_DEFAULT_GROUP_NAME',
    'GOTRUE_JWT_EXP', 'GOTRUE_JWT_SECRET', 'GOTRUE_JWT_ISSUER',
    'GOTRUE_EXTERNAL_EMAIL_ENABLED', 'GOTRUE_MAILER_AUTOCONFIRM',
  ]),
  rest: new Set([
    'PGRST_DB_URI', 'PGRST_DB_SCHEMAS', 'PGRST_DB_EXTRA_SEARCH_PATH',
    'PGRST_DB_ANON_ROLE', 'PGRST_JWT_SECRET', 'PGRST_ADMIN_SERVER_PORT',
  ]),
});
const ALLOWED_GET = [
  /^\/v1\.51\/images\/[A-Za-z0-9%._~-]+\/json$/,
  /^\/v1\.51\/networks\/[a-z0-9_.-]+$/,
  /^\/v1\.51\/containers\/[a-z0-9_.-]+\/json$/,
  /^\/v1\.51\/volumes\/[a-z0-9_.-]+$/,
];
const ALLOWED_POST = [
  /^\/v1\.51\/networks\/create$/,
  /^\/v1\.51\/volumes\/create$/,
  /^\/v1\.51\/containers\/create\?name=[a-z0-9_.-]+$/,
];

export class DockerAdapterError extends Error {
  constructor(code) {
    super(code);
    this.name = 'DockerAdapterError';
    this.code = code;
  }
}

function fail(code) {
  throw new DockerAdapterError(code);
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return plain(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}

function validName(value) {
  return typeof value === 'string' && NAME_RE.test(value);
}

function validId(value) {
  return typeof value === 'string' && ID_RE.test(value);
}

function validLabels(labels, runId, service) {
  if (!plain(labels) || labels[OWNER_LABEL] !== runId) return false;
  if (service === undefined) return Object.keys(labels).length === 1;
  return labels[SERVICE_LABEL] === service && Object.keys(labels).length === 2;
}

function validRuntimeEnv(env, service) {
  if (env === undefined) return true;
  if (!Array.isArray(env) || env.length > ENV_ALLOWED[service].size) return false;
  const seen = new Set();
  for (const item of env) {
    if (typeof item !== 'string' || item.length > 4160 || /[\r\n\0]/.test(item)) return false;
    const equal = item.indexOf('=');
    if (equal < 1) return false;
    const key = item.slice(0, equal);
    if (!ENV_ALLOWED[service].has(key) || seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function decodeJson(response) {
  if (!plain(response) || !Number.isInteger(response.status) ||
      typeof response.body !== 'string') fail('DOCKER_RESPONSE_INVALID');
  if (response.status < 200 || response.status >= 300) fail('DOCKER_API_ERROR');
  try {
    return JSON.parse(response.body);
  } catch {
    fail('DOCKER_RESPONSE_INVALID');
  }
}

function localGet(transport, path, allowMissing = false) {
  const response = transport('GET', API + path);
  if (!plain(response) || !Number.isInteger(response.status) ||
      typeof response.body !== 'string') fail('DOCKER_RESPONSE_INVALID');
  if (allowMissing && response.status === 404) return null;
  return decodeJson(response);
}

function localPost(transport, path, body) {
  return decodeJson(transport('POST', API + path, body));
}

function pathName(name) {
  if (!validName(name)) fail('DOCKER_ARGUMENT_INVALID');
  return encodeURIComponent(name);
}

function pathId(id) {
  if (!validId(id)) fail('DOCKER_ARGUMENT_INVALID');
  return id;
}

function imagePath(image) {
  if (typeof image !== 'string' || !IMAGE_SET.has(image)) fail('DOCKER_ARGUMENT_INVALID');
  return encodeURIComponent(image);
}

// All requests use a fixed local Unix socket. Request JSON goes through stdin;
// Docker errors, inspect payloads and curl stderr are never printed.
export function makeCurlTransport({ spawn = spawnSync, socketSpec,
  platform = process.platform, arch = process.arch, fileSystem,
} = {}) {
  const selectedSpec = socketSpec === undefined ? undefined : Object.freeze({ ...socketSpec });
  return function transport(method, path, body) {
    if (typeof path !== 'string' ||
        !(method === 'GET' ? ALLOWED_GET : method === 'POST' ? ALLOWED_POST : [])
          .some((pattern) => pattern.test(path))) fail('DOCKER_ARGUMENT_INVALID');
    if (method === 'GET' && body !== undefined) fail('DOCKER_ARGUMENT_INVALID');
    if (method === 'POST' && !plain(body)) fail('DOCKER_ARGUMENT_INVALID');
    let socket;
    try { socket = requireLocalDockerSocket(selectedSpec, { platform, arch, fileSystem }); }
    catch { fail('DOCKER_SOCKET_INVALID'); }
    const args = [
      '--disable', '--silent', '--show-error', '--noproxy', '*',
      '--proto', '=http', '--unix-socket', socket,
      '--connect-timeout', '2', '--max-time', '8',
      '--request', method, '--header', 'Accept: application/json',
    ];
    if (method === 'POST') {
      args.push('--header', 'Content-Type: application/json', '--data-binary', '@-');
    }
    args.push('--write-out', STATUS_MARKER + '%{http_code}', 'http://docker' + path);
    let result;
    try {
      result = spawn(CURL, args, {
        encoding: 'utf8',
        input: method === 'POST' ? JSON.stringify(body) : undefined,
        timeout: 9000,
        maxBuffer: 1024 * 1024,
        env: { PATH: '/usr/bin:/bin',
          ...(platform === 'linux' ? {
            HOME: linuxRunPaths(selectedSpec?.runId).runtimeDir,
            TMPDIR: linuxRunPaths(selectedSpec?.runId).runtimeDir,
          } : {}) },
      });
    } catch {
      fail('DOCKER_UNAVAILABLE');
    }
    if (!plain(result) || result.error || result.status !== 0 ||
        typeof result.stdout !== 'string') fail('DOCKER_UNAVAILABLE');
    const split = result.stdout.lastIndexOf(STATUS_MARKER);
    if (split < 0) fail('DOCKER_RESPONSE_INVALID');
    const statusText = result.stdout.slice(split + STATUS_MARKER.length);
    if (!/^\d{3}$/.test(statusText)) fail('DOCKER_RESPONSE_INVALID');
    return { status: Number(statusText), body: result.stdout.slice(0, split) };
  };
}

export function makeDockerApiAdapter({ transport, socketSpec,
  platform = process.platform, arch = process.arch, fileSystem,
} = {}) {
  const selectedSpec = socketSpec === undefined ? undefined : Object.freeze({ ...socketSpec });
  transport ??= makeCurlTransport({ socketSpec: selectedSpec, platform, arch, fileSystem });
  if (typeof transport !== 'function') fail('DOCKER_ARGUMENT_INVALID');

  function inspectVolume(name) {
    return localGet(transport, '/volumes/' + pathName(name), true);
  }

  function ensureOwnedVolume(mount, runId) {
    const name = mount.Source;
    if (!validName(name) || !name.startsWith(runId + '-') ||
        mount.Type !== 'volume' || mount.Target !== VOLUME_TARGET ||
        mount.ReadOnly !== false) fail('DOCKER_ARGUMENT_INVALID');
    // Docker volume Create is idempotent. A second name check narrows the
    // hasVolume-to-Create race; exact metadata checks reject foreign volumes.
    if (inspectVolume(name) !== null) fail('DOCKER_VOLUME_COLLISION');
    const created = localPost(transport, '/volumes/create', {
      Name: name, Driver: 'local', DriverOpts: {},
      Labels: { [OWNER_LABEL]: runId },
    });
    const inspected = inspectVolume(name);
    if (!plain(created) || created.Name !== name ||
        created.Driver !== 'local' || !validLabels(created.Labels, runId) ||
        !plain(inspected) || inspected.Name !== name ||
        inspected.Driver !== 'local' || inspected.Scope !== 'local' ||
        !(inspected.Options === null || exactKeys(inspected.Options, [])) ||
        !(created.Options === null || exactKeys(created.Options, [])) ||
        created.Scope !== 'local' ||
        !validLabels(inspected.Labels, runId)) fail('DOCKER_VOLUME_INVALID');
  }

  return Object.freeze({
    socketSpec: selectedSpec,
    inspectVolume(name) {
      return inspectVolume(name);
    },
    inspectNetworkByName(name) {
      return localGet(transport, '/networks/' + pathName(name), true);
    },
    inspectContainerByName(name) {
      return localGet(transport, '/containers/' + pathName(name) + '/json', true);
    },
    inspectImage(image) {
      return localGet(transport, '/images/' + imagePath(image) + '/json', true);
    },
    hasNetwork(name) {
      return localGet(transport, '/networks/' + pathName(name), true) !== null;
    },
    hasContainer(name) {
      return localGet(transport, '/containers/' + pathName(name) + '/json', true) !== null;
    },
    hasVolume(name) {
      return inspectVolume(name) !== null;
    },
    createNetwork(request) {
      if (!exactKeys(request, ['Name', 'Driver', 'Internal', 'Labels', 'CheckDuplicate']) ||
          !validName(request.Name) || request.Driver !== 'bridge' ||
          request.Internal !== true || request.CheckDuplicate !== true) fail('DOCKER_ARGUMENT_INVALID');
      const runId = request.Labels?.[OWNER_LABEL];
      if (!validName(runId) || !request.Name.startsWith(runId + '-') ||
          !validLabels(request.Labels, runId)) fail('DOCKER_ARGUMENT_INVALID');
      const created = localPost(transport, '/networks/create', {
        Name: request.Name, Driver: 'bridge', Internal: true, CheckDuplicate: true,
        Attachable: false, EnableIPv6: false, Ingress: false,
        Labels: { [OWNER_LABEL]: runId },
      });
      if (!plain(created) || !validId(created.Id)) fail('DOCKER_RESPONSE_INVALID');
      return created;
    },
    getNetworkName(id) {
      const info = localGet(transport, '/networks/' + pathId(id));
      if (!plain(info) || typeof info.Name !== 'string') fail('DOCKER_RESPONSE_INVALID');
      return info.Name;
    },
    inspectNetwork(id) {
      return localGet(transport, '/networks/' + pathId(id));
    },
    createContainer(request) {
      if (!plain(request) ||
          !['name', 'Image', 'Labels', 'HostConfig', 'NetworkingConfig']
            .every((key) => Object.hasOwn(request, key)) ||
          Object.keys(request).some((key) => ![
            'name', 'Image', 'Labels', 'HostConfig', 'NetworkingConfig',
            'Env', 'Cmd', 'Entrypoint',
          ].includes(key)) ||
          !validName(request.name) || !IMAGE_SET.has(request.Image) ||
          !plain(request.HostConfig) || !plain(request.NetworkingConfig)) fail('DOCKER_ARGUMENT_INVALID');
      const runId = request.Labels?.[OWNER_LABEL];
      const service = request.Labels?.[SERVICE_LABEL];
      if (!validName(runId) || !request.name.startsWith(runId + '-') ||
          !['postgres', 'auth', 'rest'].includes(service) ||
          !validLabels(request.Labels, runId, service) ||
          request.Image !== SERVICE_IMAGES[service === 'auth' ? 'gotrue' :
            service === 'rest' ? 'postgrest' : 'postgres'] ||
          !validRuntimeEnv(request.Env, service)) fail('DOCKER_ARGUMENT_INVALID');
      if (service === 'postgres') {
        if (JSON.stringify(request.Cmd) !== JSON.stringify(PG_CMD)) {
          fail('DOCKER_ARGUMENT_INVALID');
        }
        if (JSON.stringify(request.Entrypoint) !== JSON.stringify([PG_ENTRYPOINT])) {
          fail('DOCKER_ARGUMENT_INVALID');
        }
      } else if (request.Cmd !== undefined || request.Entrypoint !== undefined) {
        fail('DOCKER_ARGUMENT_INVALID');
      }
      const host = request.HostConfig;
      const networkId = host.NetworkMode;
      if (!validId(networkId) || !exactKeys(host, [
        'NetworkMode', 'PortBindings', 'PublishAllPorts', 'RestartPolicy',
        'Privileged', 'LogConfig', 'Mounts',
        'Memory', 'MemorySwap', 'NanoCpus', 'PidsLimit',
      ]) || !exactKeys(host.PortBindings, []) || host.PublishAllPorts !== false ||
          !exactKeys(host.RestartPolicy, ['Name']) || host.RestartPolicy.Name !== 'no' ||
          host.Privileged !== false || !exactKeys(host.LogConfig, ['Type', 'Config']) ||
          host.LogConfig.Type !== LOG_LIMIT.Type ||
          !exactKeys(host.LogConfig.Config, ['max-size', 'max-file']) ||
          Object.entries(LOG_LIMIT.Config).some(([key, value]) =>
            host.LogConfig.Config[key] !== value) ||
          Object.entries(RESOURCE_LIMITS[service]).some(([key, value]) => host[key] !== value) ||
          !Array.isArray(host.Mounts) ||
          host.Mounts.length > 1 ||
          !exactKeys(request.NetworkingConfig, ['EndpointsConfig']) ||
          !exactKeys(request.NetworkingConfig.EndpointsConfig, [networkId]) ||
          !exactKeys(request.NetworkingConfig.EndpointsConfig[networkId], [])) {
        fail('DOCKER_ARGUMENT_INVALID');
      }
      if (service !== 'postgres' && host.Mounts.length !== 0) fail('DOCKER_ARGUMENT_INVALID');
      for (const mount of host.Mounts) ensureOwnedVolume(mount, runId);
      const created = localPost(transport,
        '/containers/create?name=' + encodeURIComponent(request.name), {
          Image: request.Image,
          Labels: { [OWNER_LABEL]: runId, [SERVICE_LABEL]: service },
          ...(request.Env === undefined ? {} : { Env: [...request.Env] }),
          ...(request.Cmd === undefined ? {} : { Cmd: [...request.Cmd] }),
          ...(request.Entrypoint === undefined ? {} : { Entrypoint: [...request.Entrypoint] }),
          HostConfig: {
            NetworkMode: networkId, PortBindings: {}, PublishAllPorts: false,
            RestartPolicy: { Name: 'no' }, Privileged: false,
            LogConfig: { Type: LOG_LIMIT.Type, Config: { ...LOG_LIMIT.Config } },
            ...RESOURCE_LIMITS[service],
            Mounts: host.Mounts.map((mount) => ({ ...mount })),
          },
          NetworkingConfig: { EndpointsConfig: { [networkId]: {} } },
        });
      if (!plain(created) || !validId(created.Id)) fail('DOCKER_RESPONSE_INVALID');
      return created;
    },
    inspectContainer(id) {
      return localGet(transport, '/containers/' + pathId(id) + '/json');
    },
  });
}
