// Offline tests for operator checks that run against sanitized Docker inspect
// shapes. No Docker, network or runtime directory. Run: node --test installer/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PG_TCP_READY_ARGS, verifyDestroyMounts, waitPgTcpReady } from './operator.mjs';

const RUN_ID = 'closr-community-' + '0'.repeat(20);
const PG_ID = 'a'.repeat(64);
const PLANNED = Object.freeze([Object.freeze({ Source: `${RUN_ID}-pgdata`,
  Target: '/var/lib/postgresql/data', Type: 'volume', ReadOnly: false })]);
const VOLUME = Object.freeze({ Name: `${RUN_ID}-pgdata`, Driver: 'local', Scope: 'local',
  Labels: { 'com.closr.run-id': RUN_ID }, Options: null });

// Synthetic Docker inspect shapes for a partial run.
function pgInfo(overrides = {}) {
  return {
    HostConfig: {
      Mounts: [{ Type: 'volume', Source: `${RUN_ID}-pgdata`,
        Target: '/var/lib/postgresql/data' }],
      Binds: null, VolumesFrom: null, ...overrides.HostConfig,
    },
    Mounts: 'Mounts' in overrides ? overrides.Mounts : [{ Type: 'volume', Name: `${RUN_ID}-pgdata`,
      Source: `/var/lib/docker/volumes/${RUN_ID}-pgdata/_data`,
      Destination: '/var/lib/postgresql/data', Driver: 'local', Mode: 'z',
      RW: true, Propagation: '' }],
  };
}

function plainInfo(overrides = {}) {
  return { HostConfig: { Mounts: null, Binds: null, VolumesFrom: null,
    ...overrides.HostConfig }, Mounts: 'Mounts' in overrides ? overrides.Mounts : [] };
}

function rejects(fn) {
  assert.throws(fn, (error) => error.code === 'DESTROY_MOUNTS_INVALID');
}

test('destroy mounts: inspected partial-run shapes are accepted', () => {
  verifyDestroyMounts('postgres', pgInfo(), PLANNED, VOLUME);
  verifyDestroyMounts('auth', plainInfo(), [], null);
  verifyDestroyMounts('rest', plainInfo(), [], null);
  // Omitted HostConfig.Mounts and explicit empty arrays are the same zero-mount default.
  const omitted = plainInfo();
  delete omitted.HostConfig.Mounts;
  verifyDestroyMounts('auth', omitted, [], null);
  verifyDestroyMounts('rest', plainInfo({ HostConfig: { Mounts: [], Binds: [],
    VolumesFrom: [] } }), [], null);
  // Explicit ReadOnly:false remains accepted.
  const explicit = pgInfo();
  explicit.HostConfig.Mounts[0].ReadOnly = false;
  verifyDestroyMounts('postgres', explicit, PLANNED, VOLUME);
});

test('destroy mounts: added binds, volumes-from or extra mounts are rejected', () => {
  const bind = { Type: 'bind', Source: '/etc', Destination: '/host-etc', RW: true };
  rejects(() => verifyDestroyMounts('auth', plainInfo({ HostConfig: { Binds: ['/etc:/x'] } }),
    [], null));
  rejects(() => verifyDestroyMounts('rest', plainInfo({ HostConfig: { VolumesFrom: ['other'] } }),
    [], null));
  rejects(() => verifyDestroyMounts('auth', plainInfo({ Mounts: [bind] }), [], null));
  rejects(() => verifyDestroyMounts('auth', plainInfo({ HostConfig: { Mounts: [
    { Type: 'bind', Source: '/etc', Target: '/x' }] }, Mounts: [bind] }), [], null));
  rejects(() => verifyDestroyMounts('auth', plainInfo({ Mounts: null }), [], null));
  rejects(() => verifyDestroyMounts('postgres', pgInfo({ HostConfig: { Binds: ['/etc:/x'] } }),
    PLANNED, VOLUME));
  const extra = pgInfo();
  extra.HostConfig.Mounts.push({ Type: 'bind', Source: '/etc', Target: '/x' });
  extra.Mounts.push(bind);
  rejects(() => verifyDestroyMounts('postgres', extra, PLANNED, VOLUME));
  const extraActual = pgInfo();
  extraActual.Mounts.push(bind);
  rejects(() => verifyDestroyMounts('postgres', extraActual, PLANNED, VOLUME));
  rejects(() => verifyDestroyMounts('postgres', pgInfo({ HostConfig: { Mounts: null } }),
    PLANNED, VOLUME));
  rejects(() => verifyDestroyMounts('postgres', pgInfo({ Mounts: [] }), PLANNED, VOLUME));
});

test('destroy mounts: read-only, mismatched or nonlocal PG volume is rejected', () => {
  const mutate = (fn) => { const info = pgInfo(); fn(info); return info; };
  const host = (info) => info.HostConfig.Mounts[0];
  const actual = (info) => info.Mounts[0];
  for (const info of [
    mutate((i) => { host(i).ReadOnly = true; }),
    mutate((i) => { host(i).ReadOnly = 'false'; }),
    mutate((i) => { actual(i).RW = false; }),
    mutate((i) => { delete actual(i).RW; }),
    mutate((i) => { host(i).Source = 'other-pgdata'; }),
    mutate((i) => { host(i).Target = '/data'; }),
    mutate((i) => { host(i).Type = 'bind'; }),
    mutate((i) => { host(i).VolumeOptions = { DriverConfig: { Name: 'nfs' } }; }),
    mutate((i) => { actual(i).Name = 'other-pgdata'; }),
    mutate((i) => { actual(i).Destination = '/data'; }),
    mutate((i) => { actual(i).Type = 'bind'; }),
    mutate((i) => { actual(i).Driver = 'nfs'; }),
  ]) rejects(() => verifyDestroyMounts('postgres', info, PLANNED, VOLUME));
  rejects(() => verifyDestroyMounts('postgres', pgInfo(), PLANNED, null));
  rejects(() => verifyDestroyMounts('postgres', pgInfo(), PLANNED,
    { ...VOLUME, Name: 'other-pgdata' }));
  rejects(() => verifyDestroyMounts('postgres', pgInfo(), PLANNED,
    { ...VOLUME, Driver: 'nfs' }));
  // A plan that is not the single writable private volume never relaxes.
  rejects(() => verifyDestroyMounts('postgres', pgInfo(), [], VOLUME));
  rejects(() => verifyDestroyMounts('postgres', pgInfo(),
    [{ ...PLANNED[0], ReadOnly: true }], VOLUME));
  rejects(() => verifyDestroyMounts('auth', plainInfo(), PLANNED, VOLUME));
});

test('pg readiness: transient Unix-socket server is not ready; TCP listener is', () => {
  // Simulated first boot: the transient server answers only on the Unix socket
  // for the first probes, then the final server binds 0.0.0.0:5432.
  const seen = [];
  const exec = (args) => {
    seen.push(args);
    const tcp = args.includes('-h') && args[args.indexOf('-h') + 1] === '127.0.0.1' &&
      args.includes('-p') && args[args.indexOf('-p') + 1] === '5432';
    if (!tcp) return '/var/run/postgresql:5432 - accepting connections';
    if (seen.length < 3) throw new Error('127.0.0.1:5432 - no response');
    return '127.0.0.1:5432 - accepting connections';
  };
  waitPgTcpReady(PG_ID, { exec, seconds: 10 });
  assert.equal(seen.length, 3);
  for (const args of seen) assert.deepEqual(args, ['exec', PG_ID, ...PG_TCP_READY_ARGS]);
});

test('pg readiness: bounded timeout with a fixed code, and exact container id', () => {
  const started = Date.now();
  assert.throws(() => waitPgTcpReady(PG_ID, { exec: () => {
    throw new Error('connection refused');
  }, seconds: 1 }), (error) => error.code === 'PG_TCP_READY_TIMEOUT');
  assert.ok(Date.now() - started < 5000);
  assert.throws(() => waitPgTcpReady('closr-pg', { exec: () => 'ok', seconds: 1 }),
    (error) => error.code === 'PG_ID_INVALID');
});
