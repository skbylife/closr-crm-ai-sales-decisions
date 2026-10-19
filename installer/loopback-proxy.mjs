#!/usr/bin/env node
// Loopback API surface for the two routes used by Community.
// Runtime configuration must refer to one inspected, run-owned stack. This process
// receives synthetic local keys through its environment and never logs requests.

import { timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dockerBinary, requireLocalDockerSocket } from './platform.mjs';
import { linuxRunPaths } from './runtime.mjs';

const LISTEN_HOST = '127.0.0.1';
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_BRIDGE_METADATA_BYTES = 16384;
const MAX_BRIDGE_OUTPUT_BYTES = 4 + MAX_BRIDGE_METADATA_BYTES + MAX_RESPONSE_BYTES;
const BRIDGE_PATH = '/usr/local/bin/closr-test-v7-http-bridge.py';
const RUN_ID_RE = /^closr-community-[a-f0-9]{20}$/;
const ID_RE = /^[a-f0-9]{64}$/;
const WEB_ORIGIN_RE = /^http:\/\/127\.0\.0\.1:([0-9]{2,5})$/;
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const CORS_HEADERS = new Set([
  'accept', 'accept-profile', 'apikey', 'authorization', 'content-profile',
  'content-type', 'if-match', 'if-none-match', 'prefer', 'range',
  'x-client-info', 'x-supabase-api-version',
]);
const REQUEST_HEADERS = new Set([
  ...CORS_HEADERS, 'accept-language', 'user-agent',
]);
const RESPONSE_HEADERS = new Set([
  'cache-control', 'content-disposition', 'content-encoding', 'content-language',
  'content-length', 'content-location', 'content-profile', 'content-range',
  'content-type', 'etag', 'expires', 'last-modified', 'location',
  'preference-applied', 'vary', 'www-authenticate',
]);
const ROUTES = [
  { prefix: '/auth/v1/', target: 'auth' },
  { prefix: '/rest/v1/', target: 'rest' },
];
const REST_TABLES = new Set([
  'organizations', 'org_memberships', 'accounts', 'contacts',
  'opportunities', 'strategic_plays',
]);
const AUTH_METHODS = new Map([
  ['token', new Set(['POST'])],
  ['user', new Set(['GET'])],
  ['signup', new Set(['POST'])],
  ['logout', new Set(['POST'])],
  ['admin/users', new Set(['GET', 'POST'])],
]);

const jwtShape = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function validateRuntimeConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== [
        'authContainer', 'dbContainerId', 'listenPort', 'restContainer',
        'runId', 'webOrigin',
      ].join(',') ||
      typeof value.runId !== 'string' || !RUN_ID_RE.test(value.runId) ||
      typeof value.dbContainerId !== 'string' || !ID_RE.test(value.dbContainerId) ||
      value.authContainer !== `${value.runId}-auth` ||
      value.restContainer !== `${value.runId}-rest` ||
      !Number.isInteger(value.listenPort) || value.listenPort < 1024 ||
      value.listenPort > 65535 || typeof value.webOrigin !== 'string') {
    throw new Error('loopback_proxy_configuration_invalid');
  }
  const origin = WEB_ORIGIN_RE.exec(value.webOrigin);
  const webPort = Number(origin?.[1]);
  if (!origin || webPort < 1024 || webPort > 65535 ||
      webPort === value.listenPort) throw new Error('loopback_proxy_configuration_invalid');
  return Object.freeze({ ...value });
}

export function loadRuntimeConfig(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new Error('loopback_proxy_configuration_invalid');
  }
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size < 2 || stat.size > 4096 ||
        stat.uid !== process.geteuid() || (stat.mode & 0o077) !== 0) {
      throw new Error('loopback_proxy_configuration_invalid');
    }
    return validateRuntimeConfig(JSON.parse(readFileSync(fd, 'utf8')));
  } finally {
    closeSync(fd);
  }
}

export function validateSecrets(anonKey, serviceKey) {
  if (typeof anonKey !== 'string' || typeof serviceKey !== 'string' ||
      anonKey === serviceKey || !jwtShape.test(anonKey) ||
      !jwtShape.test(serviceKey)) throw new Error('loopback_proxy_configuration_invalid');
  return Object.freeze({ anonKey, serviceKey });
}

function sameSecret(actual, expected) {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function exactlyOneHeader(req, name) {
  let count = 0;
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (req.rawHeaders[i].toLowerCase() === name) count += 1;
  }
  return count <= 1 && !Array.isArray(req.headers[name]);
}

function corsHeaders(origin, config) {
  return origin === config.webOrigin
    ? {
        'Access-Control-Allow-Origin': config.webOrigin,
        'Access-Control-Expose-Headers':
          'content-range, content-profile, preference-applied, location, etag, www-authenticate',
        Vary: 'Origin',
      }
    : {};
}

function sendError(res, status, code, origin, config) {
  if (res.headersSent || res.writableEnded) return;
  const body = Buffer.from(JSON.stringify({ error: code }));
  res.writeHead(status, {
    ...corsHeaders(origin, config),
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'Content-Length': body.length,
    Connection: 'close',
  });
  res.end(body);
}

export function validLocation(location, config) {
  if (!location) return true;
  if (Array.isArray(location)) return false;
  if (location.startsWith('/') && !location.startsWith('//') &&
      !location.includes('\\') && !/[\x00-\x1f\x7f]/.test(location)) return true;
  try {
    const url = new URL(location);
    return url.protocol === 'http:' && url.hostname === LISTEN_HOST &&
      !url.username && !url.password &&
      (url.origin === `http://${LISTEN_HOST}:${config.listenPort}` ||
       url.origin === config.webOrigin);
  } catch {
    return false;
  }
}

export function requestTarget(req) {
  const target = req.url;
  if (typeof target !== 'string' || target.length > 8192 || !target.startsWith('/') ||
      target.startsWith('//') || target.includes('#')) return null;
  const queryAt = target.indexOf('?');
  const pathname = queryAt < 0 ? target : target.slice(0, queryAt);
  // Community needs plain ASCII route segments. Reject ambiguous URL decoding.
  if (pathname.includes('%') || pathname.includes('\\') || pathname.includes('//') ||
      pathname.split('/').some((segment) => segment === '.' || segment === '..')) return null;
  const route = ROUTES.find(({ prefix }) => pathname.startsWith(prefix));
  if (!route) return null;
  const suffix = pathname.slice(route.prefix.length);
  if (route.target === 'auth' && !AUTH_METHODS.has(suffix)) return null;
  if (route.target === 'rest' && !REST_TABLES.has(suffix)) return null;
  return {
    target: route.target, path: '/' + target.slice(route.prefix.length),
    methods: route.target === 'auth' ? AUTH_METHODS.get(suffix) : ALLOWED_METHODS,
  };
}

function readBoundedBody(req) {
  return new Promise((resolve, reject) => {
    const length = req.headers['content-length'];
    if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_REQUEST_BYTES)) {
      reject(new Error('request_too_large'));
      return;
    }
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        req.pause();
        reject(new Error('request_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('aborted', () => reject(new Error('request_aborted')));
    req.on('error', () => reject(new Error('request_invalid')));
  });
}

export function upstreamHeaders(req, body, authorization) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (REQUEST_HEADERS.has(name) && typeof value === 'string') headers[name] = value;
  }
  headers.authorization = authorization;
  headers['content-length'] = String(body.length);
  return headers;
}

export function parseBridgeOutput(output, config) {
  if (output.length < 6) throw new Error('short_bridge_output');
  const metadataLength = output.readUInt32BE(0);
  if (metadataLength < 2 || metadataLength > MAX_BRIDGE_METADATA_BYTES ||
      output.length < 4 + metadataLength) throw new Error('invalid_bridge_metadata');
  const metadata = JSON.parse(output.subarray(4, 4 + metadataLength).toString('utf8'));
  const payload = output.subarray(4 + metadataLength);
  if (!metadata || !Number.isInteger(metadata.status) ||
      metadata.status < 200 || metadata.status > 599 ||
      !Number.isInteger(metadata.body_length) ||
      metadata.body_length !== payload.length || payload.length > MAX_RESPONSE_BYTES ||
      !metadata.headers || typeof metadata.headers !== 'object' ||
      Array.isArray(metadata.headers)) throw new Error('invalid_bridge_response');
  const headers = {};
  for (const [name, value] of Object.entries(metadata.headers)) {
    if (!RESPONSE_HEADERS.has(name) ||
        typeof value !== 'string' || /[\r\n]/.test(value)) {
      throw new Error('invalid_bridge_header');
    }
    headers[name] = value;
  }
  if (!validLocation(headers.location, config)) throw new Error('unsafe_redirect');
  headers['content-length'] = String(payload.length);
  return { status: metadata.status, headers, payload };
}

export function classifyCredentials(headers, origin, config, secrets) {
  const apiKey = headers.apikey;
  const anon = typeof apiKey === 'string' && sameSecret(apiKey, secrets.anonKey);
  const service = typeof apiKey === 'string' && sameSecret(apiKey, secrets.serviceKey);
  if (!anon && !service) return { error: 'apikey_rejected' };
  const authorization = headers.authorization ?? `Bearer ${apiKey}`;
  if (typeof authorization !== 'string' ||
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)) {
    return { error: 'authorization_rejected' };
  }
  // Browsers send Origin for cross-origin apikey requests. Site/destination
  // metadata and Referer also mark browser traffic if Origin is absent.
  // Node's server-side fetch sends sec-fetch-mode: cors by itself, so that
  // header alone cannot classify a request as browser traffic.
  const browserLike = origin !== undefined || headers.referer !== undefined ||
    ['sec-fetch-site', 'sec-fetch-dest', 'sec-fetch-user'].some((name) =>
      headers[name] !== undefined);
  if (browserLike && (service || sameSecret(authorization.slice(7), secrets.serviceKey))) {
    return { error: 'apikey_rejected' };
  }
  if (origin !== undefined && origin !== config.webOrigin) {
    return { error: 'request_origin_rejected' };
  }
  return {
    authorization,
    serviceRole: service && sameSecret(authorization.slice(7), secrets.serviceKey),
  };
}

export function routeCredentialsAllowed(target, credentials) {
  return !(target.target === 'auth' && target.path.split('?', 1)[0] === '/admin/users' &&
    !credentials.serviceRole);
}

// The production bridge and offline argv checks share this exact spawn path.
export function spawnBridgeProcess(rawConfig, socketSpec, {
  spawnProcess = spawn, binary = dockerBinary,
  platform = process.platform, arch = process.arch, fileSystem,
} = {}) {
  const config = validateRuntimeConfig(rawConfig);
  if (platform === 'linux' && socketSpec?.runId !== config.runId) {
    throw new Error('loopback_proxy_docker_socket_invalid');
  }
  let socket;
  try { socket = requireLocalDockerSocket(socketSpec, { platform, arch, fileSystem }); }
  catch { throw new Error('loopback_proxy_docker_socket_invalid'); }
  return spawnProcess(binary(), [
    '--host', `unix://${socket}`, 'exec', '-i',
    '-e', `CLOSR_COMMUNITY_RUN_ID=${config.runId}`,
    '-e', `CLOSR_COMMUNITY_AUTH_CONTAINER=${config.authContainer}`,
    '-e', `CLOSR_COMMUNITY_REST_CONTAINER=${config.restContainer}`,
    config.dbContainerId, 'python3', BRIDGE_PATH,
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { PATH: '/usr/local/bin:/usr/bin:/bin',
      ...(platform === 'linux' ? {
        HOME: linuxRunPaths(config.runId).runtimeDir,
        TMPDIR: linuxRunPaths(config.runId).runtimeDir,
      } : {}) },
  });
}

function forward(req, res, target, body, authorization, origin, config, socketSpec) {
  const headers = upstreamHeaders(req, body, authorization);
  delete headers['content-length'];
  const metadata = Buffer.from(JSON.stringify({
    target: target.target, method: req.method, path: target.path,
    headers, body_length: body.length,
  }));
  if (metadata.length > MAX_BRIDGE_METADATA_BYTES) {
    sendError(res, 431, 'request_headers_too_large', origin, config);
    return;
  }
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(metadata.length);
  // -i only; no TTY. Keys and bodies cross stdin, never argv, shell, or logs.
  let bridge;
  try { bridge = spawnBridgeProcess(config, socketSpec); }
  catch {
    sendError(res, 502, 'bridge_unavailable', origin, config);
    return;
  }
  const chunks = [];
  let size = 0;
  let stderrSize = 0;
  let failed = false;
  const timer = setTimeout(() => bridge.kill('SIGKILL'), 15000);
  bridge.stdout.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BRIDGE_OUTPUT_BYTES) {
      failed = true;
      bridge.kill('SIGKILL');
    } else chunks.push(chunk);
  });
  bridge.stderr.on('data', (chunk) => {
    stderrSize += chunk.length;
    if (stderrSize > 8192) {
      failed = true;
      bridge.kill('SIGKILL');
    }
  });
  bridge.on('error', () => {
    failed = true;
    clearTimeout(timer);
    sendError(res, 502, 'bridge_unavailable', origin, config);
  });
  bridge.on('close', (code) => {
    clearTimeout(timer);
    if (failed || code !== 0) {
      sendError(res, 502, 'bridge_unavailable', origin, config);
      return;
    }
    try {
      const incoming = parseBridgeOutput(Buffer.concat(chunks), config);
      const cors = corsHeaders(origin, config);
      if (cors.Vary && incoming.headers.vary) {
        cors.Vary = `${incoming.headers.vary}, Origin`;
      }
      res.writeHead(incoming.status, { ...incoming.headers, ...cors });
      res.end(req.method === 'HEAD' ? undefined : incoming.payload);
    } catch {
      sendError(res, 502, 'bridge_invalid_response', origin, config);
    }
  });
  bridge.stdin.on('error', () => {});
  bridge.stdin.end(Buffer.concat([length, metadata, body]));
}

export function createProxyServer(rawConfig, rawSecrets, socketSpec) {
  const config = validateRuntimeConfig(rawConfig);
  if (process.platform === 'linux') {
    if (socketSpec?.runId !== config.runId) {
      throw new Error('loopback_proxy_docker_socket_invalid');
    }
    try { requireLocalDockerSocket(socketSpec); }
    catch { throw new Error('loopback_proxy_docker_socket_invalid'); }
  }
  const secrets = validateSecrets(rawSecrets?.anonKey, rawSecrets?.serviceKey);
  const server = http.createServer({ maxHeaderSize: 16384 }, async (req, res) => {
  const origin = req.headers.origin;
  if (req.headers.host !== `${LISTEN_HOST}:${config.listenPort}` ||
      !['host', 'origin', 'authorization', 'apikey'].every((name) => exactlyOneHeader(req, name)) ||
      (origin !== undefined && origin !== config.webOrigin)) {
    sendError(res, 403, 'request_origin_rejected', origin, config);
    return;
  }
  if (!ALLOWED_METHODS.has(req.method)) {
    sendError(res, 405, 'method_not_allowed', origin, config);
    return;
  }
  const target = requestTarget(req);
  if (!target) {
    sendError(res, 404, 'route_not_found', origin, config);
    return;
  }
  if (req.method === 'OPTIONS') {
    if (origin !== config.webOrigin ||
        !target.methods.has(req.headers['access-control-request-method']) ||
        req.headers['access-control-request-method'] === 'OPTIONS') {
      sendError(res, 403, 'preflight_rejected', origin, config);
      return;
    }
    const requested = (req.headers['access-control-request-headers'] ?? '')
      .split(',').map((header) => header.trim().toLowerCase()).filter(Boolean);
    if (!requested.every((header) => CORS_HEADERS.has(header))) {
      sendError(res, 403, 'preflight_headers_rejected', origin, config);
      return;
    }
    res.writeHead(204, {
      ...corsHeaders(origin, config),
      'Access-Control-Allow-Methods': [...target.methods].join(', '),
      'Access-Control-Allow-Headers': [...CORS_HEADERS].join(', '),
      'Cache-Control': 'no-store',
    });
    res.end();
    return;
  }
  if (!target.methods.has(req.method)) {
    sendError(res, 405, 'method_not_allowed', origin, config);
    return;
  }
  const credentials = classifyCredentials(req.headers, origin, config, secrets);
  if (credentials.error) {
    sendError(res, 401, credentials.error, origin, config);
    return;
  }
  if (!routeCredentialsAllowed(target, credentials)) {
    sendError(res, 403, 'admin_route_rejected', origin, config);
    return;
  }
  try {
    const body = await readBoundedBody(req);
    forward(req, res, target, body, credentials.authorization, origin, config, socketSpec);
  } catch (error) {
    sendError(res, error?.message === 'request_too_large' ? 413 : 400,
      error?.message === 'request_too_large' ? 'request_too_large' : 'request_invalid',
      origin, config);
    req.resume();
  }
  });

  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 2000;
  server.maxRequestsPerSocket = 100;
  server.on('clientError', (_error, socket) => socket.destroy());
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = loadRuntimeConfig(process.env.CLOSR_COMMUNITY_PROXY_CONFIG);
    const server = createProxyServer(config, {
      anonKey: process.env.CLOSR_COMMUNITY_ANON_KEY,
      serviceKey: process.env.CLOSR_COMMUNITY_SERVICE_ROLE_KEY,
    });
    server.on('error', () => {
      process.stderr.write('loopback_proxy_listen_failed\n');
      process.exitCode = 1;
    });
    server.listen(config.listenPort, LISTEN_HOST,
      () => process.stdout.write('loopback_proxy_ready\n'));
  } catch {
    process.stderr.write('loopback_proxy_configuration_invalid\n');
    process.exitCode = 2;
  }
}
