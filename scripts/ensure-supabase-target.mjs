import nextEnv from '@next/env';

const REQUIRED_CN_SELF_HOSTED_SUPABASE_URL = 'https://supabase.example.invalid';
const LEGACY_CN_CLOUD_SUPABASE_URL = 'https://project.example.invalid';
const TARGETS_USING_CN_SELF_HOSTED_SUPABASE = new Set(['local', 'cn-prod', 'cn-reference']);
const SELF_HOSTED_TARGETS = new Set([
  'local',
  'cn-prod',
  'cn-reference',
  'customer-self-hosted-lite',
  'customer-self-hosted-enterprise',
]);

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd(), true);

if (process.env.CLOSR_DATABASE_BACKEND === 'postgres') {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL for your PostgreSQL instance');
  console.log('[database] PostgreSQL backend selected');
  process.exit(0);
}

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const deployTarget = process.env.DEPLOY_TARGET || 'local';

function fail(message) {
  console.error('[ensure-supabase-target] ' + message);
  process.exit(1);
}

if (!configuredUrl) {
  fail('NEXT_PUBLIC_SUPABASE_URL is missing. Local/CN Closr testing must use ' + REQUIRED_CN_SELF_HOSTED_SUPABASE_URL + '.');
}

let parsedUrl;
try {
  parsedUrl = new URL(configuredUrl);
} catch {
  fail('NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ' + configuredUrl);
}

if (TARGETS_USING_CN_SELF_HOSTED_SUPABASE.has(deployTarget) && parsedUrl.origin !== REQUIRED_CN_SELF_HOSTED_SUPABASE_URL) {
  fail(
    deployTarget +
      ' must use the Singapore self-hosted Supabase endpoint ' +
      REQUIRED_CN_SELF_HOSTED_SUPABASE_URL +
      ', got ' +
      parsedUrl.origin +
      '. Do not point local/CN QA at Supabase Cloud or 127.0.0.1:54321.'
  );
}

if (SELF_HOSTED_TARGETS.has(deployTarget)) {
  if (process.env.CLOSR_SELF_HOSTED_SUPABASE !== '1') {
    fail(deployTarget + ' requires CLOSR_SELF_HOSTED_SUPABASE=1.');
  }
  if (parsedUrl.hostname.endsWith('.supabase.co')) {
    fail(deployTarget + ' must use a self-hosted Supabase URL, got Supabase Cloud URL ' + parsedUrl.origin + '.');
  }
}

if (deployTarget.startsWith('global-') && parsedUrl.origin === LEGACY_CN_CLOUD_SUPABASE_URL) {
  fail('Global targets must not use the legacy CN Supabase Cloud project ' + LEGACY_CN_CLOUD_SUPABASE_URL + '.');
}

console.log('[ensure-supabase-target] target ' + deployTarget + ' using Supabase ' + parsedUrl.origin);
