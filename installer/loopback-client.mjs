// Loopback-only listener and first-user helpers. A service-role key is only
// written to a TCP connection this process's own listener has accepted.
// Importing this module has no side effects.
import { lstatSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { join } from 'node:path';

export const LISTEN_HOST = '127.0.0.1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL_RE = /^closr-owner-[a-f0-9]{16}@example\.invalid$/;
const MAX_RESPONSE_BYTES = 64 * 1024;

export class LoopbackError extends Error {
  constructor(code) { super(code); this.name = 'LoopbackError'; this.code = code; }
}

function requireValue(ok, code) {
  if (!ok) throw new LoopbackError(code);
}

// A connect probe also sees wildcard listeners, which a 127.0.0.1 bind with
// SO_REUSEADDR on macOS would not reject.
export function probePortFree(port, { host = LISTEN_HOST, timeoutMs = 1500 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => done(new LoopbackError('PORT_PROBE_TIMEOUT')), timeoutMs);
    let settled = false;
    function done(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error); else resolve();
    }
    socket.once('connect', () => done(new LoopbackError('PORT_IN_USE')));
    socket.once('error', (error) =>
      done(error?.code === 'ECONNREFUSED' ? null : new LoopbackError('PORT_PROBE_FAILED')));
  });
}

export function listenLoopback(server, port, { host = LISTEN_HOST } = {}) {
  return new Promise((resolve, reject) => {
    const onError = () => {
      server.off('listening', onListening);
      reject(new LoopbackError('PORT_IN_USE'));
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      if (!address || typeof address !== 'object' || address.address !== host ||
          (port !== 0 && address.port !== port)) {
        server.close();
        reject(new LoopbackError('LISTENER_ADDRESS_INVALID'));
        return;
      }
      resolve(address.port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ host, port, exclusive: true });
  });
}

// Bind-and-release check for preflight; nothing is served.
export async function assertPortFree(port, { host = LISTEN_HOST } = {}) {
  await probePortFree(port, { host });
  const server = net.createServer((socket) => socket.destroy());
  await listenLoopback(server, port, { host });
  await new Promise((resolve) => server.close(resolve));
}

// Resolves with a client socket only once `server` itself reports accepting
// that exact connection (matched by the client's local address and port).
export function connectOwned(server, port, { host = LISTEN_HOST, timeoutMs = 2000 } = {}) {
  return new Promise((resolve, reject) => {
    const accepted = new Set();
    let localKey = null;
    let settled = false;
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => finish(new LoopbackError('LISTENER_NOT_OWNED')), timeoutMs);
    function onConnection(peer) {
      accepted.add(`${peer.remoteAddress}|${peer.remotePort}`);
      check();
    }
    function check() {
      if (localKey && accepted.has(localKey)) finish();
    }
    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.off('connection', onConnection);
      if (error) {
        socket.destroy();
        reject(error);
      } else resolve(socket);
    }
    server.on('connection', onConnection);
    socket.once('connect', () => {
      localKey = `${socket.localAddress}|${socket.localPort}`;
      check();
    });
    socket.once('error', () => finish(new LoopbackError('LISTENER_CONNECT_FAILED')));
  });
}

export function validateAdminUserResponse(status, body, email) {
  requireValue(status === 200 || status === 201, 'FIRST_USER_REJECTED');
  let parsed;
  try { parsed = JSON.parse(body.toString('utf8')); }
  catch { throw new LoopbackError('FIRST_USER_RESPONSE_INVALID'); }
  requireValue(parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
    typeof parsed.id === 'string' && UUID_RE.test(parsed.id) &&
    typeof parsed.email === 'string' && parsed.email === email,
  'FIRST_USER_RESPONSE_INVALID');
  return { id: parsed.id, email: parsed.email };
}

// POST one admin user over a connection proven to belong to `server`.
// Upstream bodies and errors are reduced to fixed codes.
export async function postAdminUser({ server, port, serviceKey, user,
  host = LISTEN_HOST, timeoutMs = 20000 }) {
  requireValue(typeof serviceKey === 'string' && serviceKey.length > 0 &&
    EMAIL_RE.test(user?.email ?? '') && typeof user.password === 'string' &&
    user.password.length >= 32, 'FIRST_USER_ARGUMENT_INVALID');
  const socket = await connectOwned(server, port, { host });
  const body = Buffer.from(JSON.stringify({
    email: user.email, password: user.password, email_confirm: true,
  }));
  const response = await new Promise((resolve, reject) => {
    const request = http.request({
      host, port, method: 'POST', path: '/auth/v1/admin/users',
      createConnection: () => socket,
      headers: {
        apikey: serviceKey, authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json', 'content-length': String(body.length),
        connection: 'close',
      },
    }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          res.destroy();
          reject(new LoopbackError('FIRST_USER_RESPONSE_INVALID'));
        } else chunks.push(chunk);
      });
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      res.on('error', () => reject(new LoopbackError('FIRST_USER_REQUEST_FAILED')));
    });
    request.setTimeout(timeoutMs, () =>
      request.destroy(new LoopbackError('FIRST_USER_REQUEST_TIMEOUT')));
    request.on('error', (error) => reject(error instanceof LoopbackError
      ? error : new LoopbackError('FIRST_USER_REQUEST_FAILED')));
    request.end(body);
  });
  return validateAdminUserResponse(response.status, response.body, user.email);
}

// Exclusive create: an existing marker is never overwritten.
export function writeFirstUserMarker(runtimeDir, record) {
  const filename = join(runtimeDir, 'first-user.json');
  requireValue(UUID_RE.test(record?.userId ?? '') && EMAIL_RE.test(record?.email ?? ''),
    'FIRST_USER_ARGUMENT_INVALID');
  writeFileSync(filename, JSON.stringify({ runId: record.runId, userId: record.userId,
    email: record.email }) + '\n', { flag: 'wx', mode: 0o600 });
  const info = lstatSync(filename);
  requireValue(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o777) === 0o600,
    'PRIVATE_FILE_INVALID');
  return filename;
}
