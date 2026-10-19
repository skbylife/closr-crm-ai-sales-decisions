#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

const ARM_IMAGES = Object.freeze({
  postgres: 'public.ecr.aws/supabase/postgres@sha256:3b3484fdb09164d84c785314a0732a4abc33100f2726166b6458cb7f244f18e0',
  gotrue: 'public.ecr.aws/supabase/gotrue@sha256:994d932f081033c7ea4ed766ab73169d16930a12244767d0468d1f8f697d0a6a',
  postgrest: 'public.ecr.aws/supabase/postgrest@sha256:146be673e7821e86908cbf7fce1e6c7a7451c7975ef2058368bc494de551b87c',
});

// Pinned Linux/amd64 image references; local Docker inspect must match both
// each digest and its expected image ID before use.
const AMD_IMAGES = Object.freeze({
  postgres: 'public.ecr.aws/supabase/postgres@sha256:e4c5a3f62fed239ca9cd633b5a8e03385f636a9705cc759af0abf56de280b747',
  gotrue: 'public.ecr.aws/supabase/gotrue@sha256:9b387cd7896c3f2ea4e72e0311b1ce727ef61d3b2a3a9789cc4935925dfe9d67',
  postgrest: 'public.ecr.aws/supabase/postgrest@sha256:7924f769d8b3b173b93711c90d2fc4164667cffc563551d6a13bc5c93aca2487',
});
const PROFILES = Object.freeze({
  'darwin/arm64': Object.freeze({
    dockerPlatform: 'linux/arm64', architecture: 'arm64', images: ARM_IMAGES,
    imageIds: Object.freeze({
      [ARM_IMAGES.postgres]: 'sha256:3b3484fdb09164d84c785314a0732a4abc33100f2726166b6458cb7f244f18e0',
      [ARM_IMAGES.gotrue]: 'sha256:994d932f081033c7ea4ed766ab73169d16930a12244767d0468d1f8f697d0a6a',
      [ARM_IMAGES.postgrest]: 'sha256:146be673e7821e86908cbf7fce1e6c7a7451c7975ef2058368bc494de551b87c',
    }),
  }),
  'linux/x64': Object.freeze({
    dockerPlatform: 'linux/amd64', architecture: 'amd64', images: AMD_IMAGES,
    imageIds: Object.freeze({
      [AMD_IMAGES.postgres]: 'sha256:0fab7a426fa7aba838f6e4c746f975032237934f4ca5ace1a7222ba88deaacf7',
      [AMD_IMAGES.gotrue]: 'sha256:1a00f324d1ea23e5938de070ef2571cc8be5a7dbcd4c0be77e282e0aa1d1cae2',
      [AMD_IMAGES.postgrest]: 'sha256:8fef2fc016f1e9d785424f0d1362a7dc6b53c3519e89cb965d81419137f3fb41',
    }),
  }),
});
export function imageProfile(platform = process.platform, arch = process.arch) {
  const profile = PROFILES[`${platform}/${arch}`];
  if (!profile) fail('PLATFORM_UNSUPPORTED');
  return profile;
}
const ACTIVE_PROFILE = PROFILES[`${process.platform}/${process.arch}`];
const IMAGES = ACTIVE_PROFILE?.images ?? Object.freeze({});
const PINNED_IMAGE_IDS = ACTIVE_PROFILE?.imageIds ?? Object.freeze({});
const TRUSTED = new Set(Object.values(IMAGES));

export const RESOURCE_LIMITS = Object.freeze({
  postgres: Object.freeze({ Memory: 768 * 1024 * 1024, MemorySwap: 768 * 1024 * 1024,
    NanoCpus: 750_000_000, PidsLimit: 128 }),
  auth: Object.freeze({ Memory: 192 * 1024 * 1024, MemorySwap: 192 * 1024 * 1024,
    NanoCpus: 250_000_000, PidsLimit: 64 }),
  rest: Object.freeze({ Memory: 192 * 1024 * 1024, MemorySwap: 192 * 1024 * 1024,
    NanoCpus: 250_000_000, PidsLimit: 64 }),
});
export const LOG_LIMIT = Object.freeze({ Type: 'local',
  Config: Object.freeze({ 'max-size': '4m', 'max-file': '2' }) });

const OWNER_LABEL = 'com.closr.run-id';
const MAX_CONTAINERS = 4;
const MAX_MOUNTS = 8;

const ERR = Object.freeze({
  PLAN_INVALID: 'PLAN_INVALID',
  RUN_ID_INVALID: 'RUN_ID_INVALID',
  RUN_ID_MISMATCH: 'RUN_ID_MISMATCH',
  IMAGE_UNTRUSTED: 'IMAGE_UNTRUSTED',
  IMAGE_MISSING: 'IMAGE_MISSING',
  IMAGE_ID_MISMATCH: 'IMAGE_ID_MISMATCH',
  PULL_FORBIDDEN: 'PULL_FORBIDDEN',
  IMAGE_INSPECT_FAILED: 'IMAGE_INSPECT_FAILED',
  NAME_DUPLICATE: 'NAME_DUPLICATE',
  NAME_COLLISION: 'NAME_COLLISION',
  NAME_INVALID: 'NAME_INVALID',
  LABEL_INVALID: 'LABEL_INVALID',
  NETWORK_DUPLICATE: 'NETWORK_DUPLICATE',
  NETWORK_INSPECT_FAILED: 'NETWORK_INSPECT_FAILED',
  NETWORK_INVALID: 'NETWORK_INVALID',
  NETWORK_ATTACHED: 'NETWORK_ATTACHED',
  NETWORK_ID_MISMATCH: 'NETWORK_ID_MISMATCH',
  CONTAINER_MISSING: 'CONTAINER_MISSING',
  CONTAINER_INSPECT_FAILED: 'CONTAINER_INSPECT_FAILED',
  CONTAINER_ID_MISMATCH: 'CONTAINER_ID_MISMATCH',
  CONTAINER_STATE: 'CONTAINER_STATE',
  CONTAINER_IMAGE: 'CONTAINER_IMAGE',
  CONTAINER_NAME: 'CONTAINER_NAME',
  CONTAINER_LABELS: 'CONTAINER_LABELS',
  CONTAINER_MOUNTS: 'CONTAINER_MOUNTS',
  CONTAINER_NETWORK: 'CONTAINER_NETWORK',
  CONTAINER_PORTS: 'CONTAINER_PORTS',
  CONTAINER_PUBLISH: 'CONTAINER_PUBLISH',
  CONTAINER_RESTART: 'CONTAINER_RESTART',
  CONTAINER_PRIVILEGE: 'CONTAINER_PRIVILEGE',
  CONTAINER_LOGGING: 'CONTAINER_LOGGING',
  CONTAINER_RESOURCES: 'CONTAINER_RESOURCES',
  CONTAINER_CONFIG: 'CONTAINER_CONFIG',
  MOUNT_INVALID: 'MOUNT_INVALID',
  EXTRA_FIELD: 'EXTRA_FIELD',
  ADAPTER_INVALID: 'ADAPTER_INVALID',
});

class GuardError extends Error {
  constructor(code) {
    super(code);
    this.name = 'GuardError';
    this.code = code;
  }
}

function fail(code) {
  throw new GuardError(code);
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function noExtraKeys(obj, allowed) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) fail(ERR.EXTRA_FIELD);
  }
}

function isBoundedString(v, max) {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}

function checkLabelMap(map, code) {
  if (!isPlainObject(map)) fail(code);
  const out = Object.create(null);
  for (const k of Object.keys(map)) {
    if (!isBoundedString(k, 200)) fail(code);
    const v = map[k];
    if (!isBoundedString(v, 200)) fail(code);
    out[k] = v;
  }
  return out;
}

const VOLUME_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const RESOURCE_NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,127}$/;
const FULL_ID_RE = /^[a-f0-9]{64}$/;
const SERVICE_IMAGE = Object.freeze({
  postgres: IMAGES.postgres,
  auth: IMAGES.gotrue,
  rest: IMAGES.postgrest,
});
export const PG_START_ENTRYPOINT = '/usr/local/bin/closr-test-pg-start.sh';
export const PG_START_CMD = Object.freeze([
  'postgres', '-D', '/etc/postgresql',
  '-c', 'log_statement=none',
  '-c', 'log_min_error_statement=panic',
  '-c', 'log_parameter_max_length=0',
  '-c', 'log_parameter_max_length_on_error=0',
]);
const ENV_KEY_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const IMAGE_ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

function normRuntimeEnv(value) {
  if (value === undefined) return undefined;
  if (!isPlainObject(value) || Object.keys(value).length > 32) fail(ERR.PLAN_INVALID);
  const out = Object.create(null);
  for (const key of Object.keys(value)) {
    const entry = value[key];
    if (!ENV_KEY_RE.test(key) || typeof entry !== 'string' || entry.length > 4096 ||
        /[\r\n\0]/.test(entry)) fail(ERR.PLAN_INVALID);
    out[key] = entry;
  }
  return Object.freeze(out);
}

function normRuntimeArgs(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > 24 ||
      value.some((item) => typeof item !== 'string' || !item || item.length > 256 ||
        /[\r\n\0]/.test(item))) fail(ERR.PLAN_INVALID);
  return Object.freeze([...value]);
}

function emptyOrAbsent(value) {
  return value === null || value === undefined ||
    (Array.isArray(value) && value.length === 0);
}

function inspectEnv(value) {
  if (!Array.isArray(value)) fail(ERR.CONTAINER_CONFIG);
  const out = new Map();
  for (const item of value) {
    if (typeof item !== 'string' || !item.includes('=')) fail(ERR.CONTAINER_CONFIG);
    const equal = item.indexOf('=');
    const key = item.slice(0, equal);
    if (!IMAGE_ENV_KEY_RE.test(key) || out.has(key)) fail(ERR.CONTAINER_CONFIG);
    out.set(key, item.slice(equal + 1));
  }
  return out;
}

function isBoundedVolumeName(v) {
  return typeof v === 'string' && VOLUME_NAME_RE.test(v);
}

function normMount(m) {
  if (!isPlainObject(m)) fail(ERR.MOUNT_INVALID);
  noExtraKeys(m, ['Source', 'Target', 'Type', 'ReadOnly']);
  const { Source, Target, Type, ReadOnly } = m;
  if (typeof Source !== 'string' || !Source || typeof Target !== 'string' || !Target) {
    fail(ERR.MOUNT_INVALID);
  }
  // A bind mount could expose or mutate arbitrary host files on first Start.
  if (Type !== 'volume') fail(ERR.MOUNT_INVALID);
  if (typeof ReadOnly !== 'boolean') fail(ERR.MOUNT_INVALID);
  if (!isBoundedVolumeName(Source)) fail(ERR.MOUNT_INVALID);
  return { Source, Target, Type, ReadOnly };
}

function normMounts(list) {
  if (!Array.isArray(list)) fail(ERR.MOUNT_INVALID);
  if (list.length > MAX_MOUNTS) fail(ERR.MOUNT_INVALID);
  const seen = new Set();
  const out = [];
  for (const m of list) {
    const n = normMount(m);
    if (seen.has(n.Target)) fail(ERR.MOUNT_INVALID);
    seen.add(n.Target);
    out.push(n);
  }
  out.sort((a, b) => (a.Target < b.Target ? -1 : a.Target > b.Target ? 1 : 0));
  return out;
}

function normInspectMount(m) {
  if (!isPlainObject(m)) fail(ERR.MOUNT_INVALID);
  const type = m.Type;
  let source;
  if (type === 'volume') {
    if (m.Name !== undefined) {
      if (!isBoundedVolumeName(m.Name)) fail(ERR.MOUNT_INVALID);
      source = m.Name;
    } else if (m.Source !== undefined && isBoundedVolumeName(m.Source)) {
      source = m.Source;
    } else {
      fail(ERR.MOUNT_INVALID);
    }
  } else {
    source = m.Source !== undefined ? m.Source : m.Name;
  }
  const target = m.Target !== undefined ? m.Target : m.Destination;
  let ro;
  if (m.ReadOnly !== undefined && m.RW !== undefined) {
    if (typeof m.ReadOnly !== 'boolean' || typeof m.RW !== 'boolean') fail(ERR.MOUNT_INVALID);
    if (m.ReadOnly !== (m.RW === false)) fail(ERR.MOUNT_INVALID);
    ro = m.ReadOnly;
  } else if (m.ReadOnly !== undefined) {
    ro = m.ReadOnly;
  } else if (m.RW !== undefined) {
    if (typeof m.RW !== 'boolean') fail(ERR.MOUNT_INVALID);
    ro = m.RW === false;
  } else {
    ro = undefined;
  }
  if (typeof source !== 'string' || !source) fail(ERR.MOUNT_INVALID);
  if (typeof target !== 'string' || !target) fail(ERR.MOUNT_INVALID);
  if (type !== 'bind' && type !== 'volume') fail(ERR.MOUNT_INVALID);
  if (typeof ro !== 'boolean') fail(ERR.MOUNT_INVALID);
  return { Source: source, Target: target, Type: type, ReadOnly: ro };
}

function sameMounts(expected, actual) {
  if (!Array.isArray(actual)) return false;
  let na;
  try {
    na = actual.map(normInspectMount);
  } catch {
    return false;
  }
  if (expected.length !== na.length) return false;
  na.sort((a, b) => (a.Target < b.Target ? -1 : a.Target > b.Target ? 1 : 0));
  for (let i = 0; i < expected.length; i++) {
    const x = expected[i];
    const y = na[i];
    if (x.Source !== y.Source || x.Target !== y.Target || x.Type !== y.Type || x.ReadOnly !== y.ReadOnly) {
      return false;
    }
  }
  return true;
}

function normContainerName(name) {
  if (typeof name !== 'string' || !name) fail(ERR.CONTAINER_NAME);
  let n = name;
  if (n.startsWith('/')) n = n.slice(1);
  if (!n || n.includes('/')) fail(ERR.CONTAINER_NAME);
  return n;
}

function assertAdapter(adapter) {
  if (!isPlainObject(adapter)) fail(ERR.ADAPTER_INVALID);
  for (const fn of ['inspectImage', 'inspectNetwork', 'createNetwork', 'createContainer', 'inspectContainer', 'getNetworkName', 'hasNetwork', 'hasVolume', 'hasContainer']) {
    if (typeof adapter[fn] !== 'function') fail(ERR.ADAPTER_INVALID);
  }
}

function validatePlan(plan) {
  if (!isPlainObject(plan)) fail(ERR.PLAN_INVALID);
  noExtraKeys(plan, ['runId', 'network', 'containers']);
  const { runId, network, containers } = plan;
  if (typeof runId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(runId)) fail(ERR.RUN_ID_INVALID);
  if (!isPlainObject(network)) fail(ERR.PLAN_INVALID);
  noExtraKeys(network, ['name', 'labels']);
  if (typeof network.name !== 'string' || !RESOURCE_NAME_RE.test(network.name)) fail(ERR.PLAN_INVALID);
  const netLabels = checkLabelMap(network.labels, ERR.LABEL_INVALID);
  if (Object.hasOwn(netLabels, '__proto__')) fail(ERR.LABEL_INVALID);
  if (Object.keys(netLabels).length !== 1) fail(ERR.LABEL_INVALID);
  if (netLabels[OWNER_LABEL] !== runId) fail(ERR.RUN_ID_MISMATCH);
  if (!network.name.startsWith(runId + '-')) fail(ERR.RUN_ID_MISMATCH);
  if (!Array.isArray(containers) || containers.length === 0) fail(ERR.PLAN_INVALID);
  if (containers.length > MAX_CONTAINERS) fail(ERR.PLAN_INVALID);
  const names = new Set();
  const services = new Set();
  const volumeSources = new Set();
  const cleaned = [];
  for (const c of containers) {
    if (!isPlainObject(c)) fail(ERR.PLAN_INVALID);
    noExtraKeys(c, ['name', 'image', 'expectedImageId', 'labels', 'mounts', 'resources', 'env', 'cmd', 'entrypoint']);
    const { name, image, expectedImageId, labels, mounts, resources } = c;
    if (typeof name !== 'string' || !RESOURCE_NAME_RE.test(name)) fail(ERR.NAME_INVALID);
    if (names.has(name)) fail(ERR.NAME_DUPLICATE);
    names.add(name);
    if (!name.startsWith(runId + '-')) fail(ERR.RUN_ID_MISMATCH);
    if (typeof image !== 'string' || !TRUSTED.has(image)) fail(ERR.IMAGE_UNTRUSTED);
    if (expectedImageId !== PINNED_IMAGE_IDS[image]) fail(ERR.IMAGE_ID_MISMATCH);
    const cLabels = checkLabelMap(labels, ERR.LABEL_INVALID);
    if (cLabels[OWNER_LABEL] !== runId) fail(ERR.RUN_ID_MISMATCH);
    const service = cLabels['com.closr.service'];
    if (Object.keys(cLabels).length !== 2 || !Object.hasOwn(SERVICE_IMAGE, service) ||
        name !== runId + '-' + service || image !== SERVICE_IMAGE[service] ||
        services.has(service)) fail(ERR.PLAN_INVALID);
    services.add(service);
    if (!isPlainObject(resources) ||
        Object.keys(resources).sort().join(',') !== 'Memory,MemorySwap,NanoCpus,PidsLimit' ||
        Object.entries(RESOURCE_LIMITS[service]).some(([key, value]) => resources[key] !== value)) {
      fail(ERR.CONTAINER_RESOURCES);
    }
    const normedMounts = normMounts(mounts);
    if (normedMounts.length !== (service === 'postgres' ? 1 : 0)) fail(ERR.MOUNT_INVALID);
    for (const m of normedMounts) {
      if (!m.Source.startsWith(runId + '-')) fail(ERR.MOUNT_INVALID);
      if (image !== IMAGES.postgres || m.Target !== '/var/lib/postgresql/data' || m.ReadOnly) fail(ERR.MOUNT_INVALID);
      if (volumeSources.has(m.Source)) fail(ERR.NAME_DUPLICATE);
      volumeSources.add(m.Source);
    }
    const env = normRuntimeEnv(c.env);
    const cmd = normRuntimeArgs(c.cmd);
    const entrypoint = normRuntimeArgs(c.entrypoint);
    if (service === 'postgres') {
      if (JSON.stringify(cmd) !== JSON.stringify(PG_START_CMD) ||
          JSON.stringify(entrypoint) !== JSON.stringify([PG_START_ENTRYPOINT]) ||
          !env || !['POSTGRES_PASSWORD', 'PGPASSWORD', 'POSTGRES_HOST', 'JWT_SECRET', 'JWT_EXP']
            .every((key) => Object.hasOwn(env, key)) ||
          !env.POSTGRES_PASSWORD || env.PGPASSWORD !== env.POSTGRES_PASSWORD ||
          env.POSTGRES_HOST !== '/var/run/postgresql' || !env.JWT_SECRET ||
          !/^\d+$/.test(env.JWT_EXP)) fail(ERR.PLAN_INVALID);
    } else if (cmd !== undefined || entrypoint !== undefined) {
      fail(ERR.PLAN_INVALID);
    }
    cleaned.push({
      name,
      image,
      expectedImageId,
      labels: Object.freeze(cLabels),
      mounts: Object.freeze(normedMounts),
      resources: RESOURCE_LIMITS[service],
      env,
      cmd,
      entrypoint,
    });
  }
  return {
    runId,
    network: { name: network.name, labels: Object.freeze(netLabels) },
    containers: Object.freeze(cleaned),
  };
}

function assertLabelsMatch(expected, actual, code) {
  if (!isPlainObject(actual)) fail(code);
  const ek = Object.keys(expected);
  const ak = Object.keys(actual);
  if (ek.length !== ak.length) fail(code);
  for (const k of ek) {
    if (expected[k] !== actual[k]) fail(code);
  }
}

function checkImage(adapter, image, expectedImageId) {
  if (!TRUSTED.has(image)) fail(ERR.IMAGE_UNTRUSTED);
  let info;
  try {
    info = adapter.inspectImage(image);
  } catch {
    fail(ERR.IMAGE_INSPECT_FAILED);
  }
  if (info === null || info === undefined) fail(ERR.IMAGE_MISSING);
  if (isPlainObject(info) && info.pull === true) fail(ERR.PULL_FORBIDDEN);
  if (!isPlainObject(info) || typeof info.Id !== 'string' || !info.Id) fail(ERR.IMAGE_MISSING);
  if (info.Id !== expectedImageId) fail(ERR.IMAGE_ID_MISMATCH);
  const digested = image.includes('@sha256:');
  const references = digested ? info.RepoDigests : info.RepoTags;
  if (!Array.isArray(references) || !references.includes(image)) {
    fail(ERR.IMAGE_UNTRUSTED);
  }
  if (info.Os !== 'linux' || info.Architecture !== ACTIVE_PROFILE?.architecture) {
    fail(ERR.IMAGE_UNTRUSTED);
  }
  if (!isPlainObject(info.Config) || !Array.isArray(info.Config.Env)) fail(ERR.IMAGE_INSPECT_FAILED);
  const imageEnv = inspectEnv(info.Config.Env);
  const imageLabels = info.Config.Labels === null || info.Config.Labels === undefined
    ? {} : info.Config.Labels;
  if (!isPlainObject(imageLabels) ||
      Object.hasOwn(imageLabels, OWNER_LABEL) ||
      Object.hasOwn(imageLabels, 'com.closr.service')) fail(ERR.IMAGE_INSPECT_FAILED);
  return { id: info.Id, env: imageEnv,
    cmd: info.Config.Cmd, entrypoint: info.Config.Entrypoint,
    labels: imageLabels };
}

function checkNetworkInspect(info, expectedName, expectedLabels) {
  if (!isPlainObject(info)) fail(ERR.NETWORK_INVALID);
  if (typeof info.Id !== 'string' || !FULL_ID_RE.test(info.Id)) fail(ERR.NETWORK_INVALID);
  if (info.Name !== expectedName) fail(ERR.NETWORK_INVALID);
  if (info.Driver !== 'bridge') fail(ERR.NETWORK_INVALID);
  if (info.Internal !== true) fail(ERR.NETWORK_INVALID);
  assertLabelsMatch(expectedLabels, info.Labels, ERR.NETWORK_INVALID);
  const containers = info.Containers;
  if (!isPlainObject(containers)) fail(ERR.NETWORK_ATTACHED);
  if (Object.keys(containers).length !== 0) fail(ERR.NETWORK_ATTACHED);
  return info.Id;
}

function checkContainerInspect(info, planC, networkId, networkName, imageConfig,
    expectedState = 'created') {
  if (!isPlainObject(info)) fail(ERR.CONTAINER_INSPECT_FAILED);
  if (typeof info.Id !== 'string' || !FULL_ID_RE.test(info.Id)) fail(ERR.CONTAINER_INSPECT_FAILED);
  const state = isPlainObject(info.State) ? info.State.Status : undefined;
  if (state !== expectedState || info.State.Running !== (expectedState === 'running')) {
    fail(ERR.CONTAINER_STATE);
  }
  if (info.Image !== planC.expectedImageId) fail(ERR.CONTAINER_IMAGE);
  if (normContainerName(info.Name) !== planC.name) fail(ERR.CONTAINER_NAME);
  assertLabelsMatch({ ...imageConfig.labels, ...planC.labels },
    info.Config && isPlainObject(info.Config.Labels) ? info.Config.Labels : {}, ERR.CONTAINER_LABELS);
  if (info.Config.Image !== planC.image) fail(ERR.CONTAINER_CONFIG);
  const expectedEnv = new Map(imageConfig.env);
  for (const [key, value] of Object.entries(planC.env ?? {})) expectedEnv.set(key, value);
  const actualEnv = inspectEnv(info.Config.Env);
  if (actualEnv.size !== expectedEnv.size ||
      [...expectedEnv].some(([key, value]) => actualEnv.get(key) !== value)) fail(ERR.CONTAINER_CONFIG);
  const expectedCmd = planC.cmd ?? imageConfig.cmd;
  const expectedEntrypoint = planC.entrypoint ?? imageConfig.entrypoint;
  if (JSON.stringify(info.Config.Cmd) !== JSON.stringify(expectedCmd)) {
    fail(ERR.CONTAINER_CONFIG);
  }
  if (JSON.stringify(info.Config.Entrypoint) !== JSON.stringify(expectedEntrypoint)) {
    fail(ERR.CONTAINER_CONFIG);
  }
  if (!isPlainObject(info.HostConfig)) fail(ERR.CONTAINER_PORTS);
  if (info.HostConfig.NetworkMode === 'host') fail(ERR.CONTAINER_NETWORK);
  if (info.HostConfig.NetworkMode !== networkId) fail(ERR.CONTAINER_NETWORK);
  if (info.HostConfig.Privileged !== false ||
      !emptyOrAbsent(info.HostConfig.CapAdd) ||
      !emptyOrAbsent(info.HostConfig.CapDrop) ||
      !emptyOrAbsent(info.HostConfig.Devices) ||
      !emptyOrAbsent(info.HostConfig.DeviceRequests) ||
      !emptyOrAbsent(info.HostConfig.Binds) ||
      !emptyOrAbsent(info.HostConfig.VolumesFrom) ||
      !emptyOrAbsent(info.HostConfig.SecurityOpt) ||
      !emptyOrAbsent(info.HostConfig.ExtraHosts) ||
      !emptyOrAbsent(info.HostConfig.Dns) ||
      !emptyOrAbsent(info.HostConfig.Links) ||
      info.HostConfig.AutoRemove === true ||
      ![undefined, null, ''].includes(info.HostConfig.PidMode) ||
      ![undefined, null, '', 'private'].includes(info.HostConfig.IpcMode) ||
      ![undefined, null, ''].includes(info.HostConfig.UsernsMode) ||
      ![undefined, null, '', 'private'].includes(info.HostConfig.CgroupnsMode)) {
    fail(ERR.CONTAINER_PRIVILEGE);
  }
  if (!isPlainObject(info.HostConfig.LogConfig) ||
      info.HostConfig.LogConfig.Type !== LOG_LIMIT.Type ||
      !isPlainObject(info.HostConfig.LogConfig.Config) ||
      Object.keys(info.HostConfig.LogConfig.Config).sort().join(',') !== 'max-file,max-size' ||
      Object.entries(LOG_LIMIT.Config).some(([key, value]) =>
        info.HostConfig.LogConfig.Config[key] !== value)) {
    fail(ERR.CONTAINER_LOGGING);
  }
  if (Object.entries(planC.resources).some(([key, value]) => info.HostConfig[key] !== value)) {
    fail(ERR.CONTAINER_RESOURCES);
  }
  const ns = info.NetworkSettings;
  const networks = isPlainObject(ns) && isPlainObject(ns.Networks) ? ns.Networks : null;
  if (!networks) fail(ERR.CONTAINER_NETWORK);
  const keys = Object.keys(networks);
  if (keys.length !== 1 || keys[0] !== networkName) fail(ERR.CONTAINER_NETWORK);
  const endpoint = networks[keys[0]];
  if (!isPlainObject(endpoint) ||
      (expectedState !== 'running'
        ? !['', networkId].includes(endpoint.NetworkID)
        : endpoint.NetworkID !== networkId)) fail(ERR.CONTAINER_NETWORK);
  const pb = info.HostConfig.PortBindings;
  if (!isPlainObject(pb) || Object.keys(pb).length !== 0) fail(ERR.CONTAINER_PORTS);
  if (info.HostConfig.PublishAllPorts !== false) fail(ERR.CONTAINER_PUBLISH);
  const rp = info.HostConfig.RestartPolicy;
  if (!isPlainObject(rp) || rp.Name !== 'no') fail(ERR.CONTAINER_RESTART);
  const mounts = info.Mounts;
  if (!Array.isArray(mounts)) fail(ERR.CONTAINER_MOUNTS);
  if (!sameMounts(planC.mounts, mounts)) fail(ERR.CONTAINER_MOUNTS);
  return info.Id;
}

function safeAdapterCall(fn, arg) {
  try {
    return fn(arg);
  } catch {
    return undefined;
  }
}

const GUARD_CODES = new Set(Object.values(ERR));

function normalizeGuardError(e, fallbackCode) {
  let code;
  try {
    code = e === null || e === undefined ? undefined : e.code;
  } catch {
    code = undefined;
  }
  if (typeof code === 'string' && GUARD_CODES.has(code)) {
    return new GuardError(code);
  }
  return new GuardError(fallbackCode);
}

export function createAndInspect(adapter, plan) {
  try {
    return runCreateAndInspect(adapter, plan);
  } catch (e) {
    throw normalizeGuardError(e, ERR.PLAN_INVALID);
  }
}

// Call immediately before starting one of the three main containers. This
// only inspects current state; it does not grant a Start operation.
export function recheckBeforeStart(adapter, plan, receipt, runningServices = [], stoppedServices = []) {
  try {
    if (!isPlainObject(adapter) || typeof adapter.inspectVolume !== 'function') fail(ERR.ADAPTER_INVALID);
    const p = validatePlan(plan);
    if (p.containers.length !== 3 ||
        new Set(p.containers.map((c) => c.labels['com.closr.service'])).size !== 3) fail(ERR.PLAN_INVALID);
    if (!isPlainObject(receipt) || !FULL_ID_RE.test(receipt.networkId) ||
        !Array.isArray(receipt.containers) || receipt.containers.length !== 3) fail(ERR.PLAN_INVALID);
    if (!Array.isArray(runningServices) || !Array.isArray(stoppedServices) ||
        runningServices.some((s) => !['postgres', 'auth', 'rest'].includes(s)) ||
        stoppedServices.some((s) => !['postgres', 'auth', 'rest'].includes(s)) ||
        new Set(runningServices).size !== runningServices.length ||
        new Set(stoppedServices).size !== stoppedServices.length ||
        stoppedServices.some((s) => runningServices.includes(s))) fail(ERR.PLAN_INVALID);
    const receiptByName = new Map();
    for (const row of receipt.containers) {
      if (!isPlainObject(row) || typeof row.name !== 'string' ||
          typeof row.id !== 'string' || !FULL_ID_RE.test(row.id) ||
          receiptByName.has(row.name)) fail(ERR.PLAN_INVALID);
      receiptByName.set(row.name, row.id);
    }
    if (p.containers.some((c) => !receiptByName.has(c.name)) ||
        new Set(receiptByName.values()).size !== 3) fail(ERR.PLAN_INVALID);
    const imageConfigs = new Map();
    for (const c of p.containers) imageConfigs.set(c.image,
      checkImage(adapter, c.image, c.expectedImageId));
    const net = adapter.inspectNetwork(receipt.networkId);
    if (!isPlainObject(net) || net.Id !== receipt.networkId ||
        net.Name !== p.network.name || net.Driver !== 'bridge' || net.Internal !== true ||
        !isPlainObject(net.Containers)) fail(ERR.NETWORK_INVALID);
    assertLabelsMatch(p.network.labels, net.Labels, ERR.NETWORK_INVALID);
    const ids = new Set(receiptByName.values());
    for (const [id, endpoint] of Object.entries(net.Containers)) {
      if (!ids.has(id) || !isPlainObject(endpoint) ||
          !receiptByName.has(endpoint.Name) || receiptByName.get(endpoint.Name) !== id) {
        fail(ERR.NETWORK_ATTACHED);
      }
    }
    for (const c of p.containers) {
      const service = c.labels['com.closr.service'];
      const id = receiptByName.get(c.name);
      const state = runningServices.includes(service) ? 'running' :
        stoppedServices.includes(service) ? 'exited' : 'created';
      const inspected = checkContainerInspect(adapter.inspectContainer(id), c,
        receipt.networkId, p.network.name, imageConfigs.get(c.image), state);
      if (inspected !== id) fail(ERR.CONTAINER_ID_MISMATCH);
      for (const mount of c.mounts) {
        const volume = adapter.inspectVolume(mount.Source);
        if (!isPlainObject(volume) || volume.Name !== mount.Source ||
            volume.Driver !== 'local' || volume.Scope !== 'local' ||
            !(volume.Options === null || (isPlainObject(volume.Options) &&
              Object.keys(volume.Options).length === 0))) fail(ERR.MOUNT_INVALID);
        assertLabelsMatch({ [OWNER_LABEL]: p.runId }, volume.Labels, ERR.MOUNT_INVALID);
      }
    }
    return true;
  } catch (e) {
    throw normalizeGuardError(e, ERR.CONTAINER_INSPECT_FAILED);
  }
}

function runCreateAndInspect(adapter, plan) {
  try {
    assertAdapter(adapter);
  } catch (e) {
    throw normalizeGuardError(e, ERR.ADAPTER_INVALID);
  }
  let p;
  try {
    p = validatePlan(plan);
  } catch (e) {
    throw normalizeGuardError(e, ERR.PLAN_INVALID);
  }

  const imageConfigs = new Map();
  for (const c of p.containers) {
    try {
      imageConfigs.set(c.image, checkImage(adapter, c.image, c.expectedImageId));
    } catch (e) {
      throw normalizeGuardError(e, ERR.ADAPTER_INVALID);
    }
  }

  let netExists;
  try {
    netExists = adapter.hasNetwork(p.network.name);
  } catch {
    fail(ERR.NAME_COLLISION);
  }
  if (netExists !== false) fail(ERR.NAME_COLLISION);
  for (const c of p.containers) {
    let exists;
    try {
      exists = adapter.hasContainer(c.name);
    } catch {
      fail(ERR.NAME_COLLISION);
    }
    if (exists !== false) fail(ERR.NAME_COLLISION);
  }
  for (const c of p.containers) {
    for (const m of c.mounts) {
      if (m.Type !== 'volume') continue;
      let exists;
      try {
        exists = adapter.hasVolume(m.Source);
      } catch {
        fail(ERR.NAME_COLLISION);
      }
      if (exists !== false) fail(ERR.NAME_COLLISION);
    }
  }

  let created;
  try {
    created = adapter.createNetwork({
      Name: p.network.name,
      Driver: 'bridge',
      Internal: true,
      Labels: { ...p.network.labels },
      CheckDuplicate: true,
    });
  } catch {
    fail(ERR.NETWORK_INSPECT_FAILED);
  }
  if (!isPlainObject(created) || typeof created.Id !== 'string' || !created.Id) {
    fail(ERR.NETWORK_INSPECT_FAILED);
  }
  let createdName;
  if (typeof created.Name === 'string' && created.Name) {
    createdName = created.Name;
  } else {
    try {
      createdName = adapter.getNetworkName(created.Id);
    } catch {
      fail(ERR.NETWORK_INSPECT_FAILED);
    }
  }
  if (createdName !== p.network.name) fail(ERR.NETWORK_ID_MISMATCH);

  let netInfo;
  try {
    netInfo = adapter.inspectNetwork(created.Id);
  } catch {
    fail(ERR.NETWORK_INSPECT_FAILED);
  }
  const networkId = checkNetworkInspect(netInfo, p.network.name, p.network.labels);
  if (networkId !== created.Id) fail(ERR.NETWORK_ID_MISMATCH);

  const results = [];
  for (const c of p.containers) {
    let createdContainer;
    try {
      createdContainer = adapter.createContainer({
        name: c.name,
        Image: c.image,
        Labels: { ...c.labels },
        HostConfig: {
          NetworkMode: networkId,
          PortBindings: {},
          PublishAllPorts: false,
          RestartPolicy: { Name: 'no' },
          Privileged: false,
          LogConfig: { Type: LOG_LIMIT.Type, Config: { ...LOG_LIMIT.Config } },
          ...c.resources,
          Mounts: c.mounts.map((m) => ({ ...m })),
        },
        NetworkingConfig: {
          EndpointsConfig: { [networkId]: {} },
        },
        ...(c.env === undefined ? {} : { Env: Object.entries(c.env).map(([key, value]) => key + '=' + value) }),
        ...(c.cmd === undefined ? {} : { Cmd: [...c.cmd] }),
        ...(c.entrypoint === undefined ? {} : { Entrypoint: [...c.entrypoint] }),
      });
    } catch {
      fail(ERR.CONTAINER_MISSING);
    }
    if (!isPlainObject(createdContainer) || typeof createdContainer.Id !== 'string' || !createdContainer.Id) {
      fail(ERR.CONTAINER_MISSING);
    }
    if (typeof createdContainer.Name === 'string' && createdContainer.Name && normContainerName(createdContainer.Name) !== c.name) {
      fail(ERR.CONTAINER_NAME);
    }
    let info;
    try {
      info = adapter.inspectContainer(createdContainer.Id);
    } catch {
      fail(ERR.CONTAINER_INSPECT_FAILED);
    }
    const inspectedId = checkContainerInspect(info, c, networkId, p.network.name,
      imageConfigs.get(c.image));
    if (inspectedId !== createdContainer.Id) fail(ERR.CONTAINER_ID_MISMATCH);
    results.push({ name: c.name, id: createdContainer.Id });
  }

  return { networkId, containers: results };
}

export function printPlan(images = IMAGES) {
  const lines = [
    'closr community docker guard (plan only)',
    'mode: read-only; no create/start/pull/remove/prune',
    'fixed images:',
  ];
  for (const k of Object.keys(images)) lines.push(`  ${k}: ${images[k]}`);
  lines.push('required checks:');
  lines.push('  image metadata present, exact repo tag/digest, config ID and architecture match');
  lines.push('  plan bounded: <=4 containers, run-id owns names/labels');
  lines.push('  network: bridge, internal=true, zero attached containers');
  lines.push('  containers: state=created, owned network only, no ports, restart=no, fixed CPU/memory/PIDs/log limits');
  lines.push('  no secrets printed; later code must recheck before any start');
  return lines.join('\n');
}

export const SERVICE_IMAGES = IMAGES;
export const SERVICE_IMAGE_IDS = PINNED_IMAGE_IDS;
export const ERROR_CODES = ERR;
export { GuardError };

function main(argv) {
  const args = argv.slice(2);
  if (args.length === 1 && args[0] === '--plan') {
    process.stdout.write(printPlan() + '\n');
    return 0;
  }
  process.stderr.write('usage: community-docker-guard.mjs --plan\n');
  return 2;
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invoked === import.meta.url) {
  process.exitCode = main(process.argv);
}
