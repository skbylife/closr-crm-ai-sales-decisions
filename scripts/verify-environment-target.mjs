#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';

const TARGETS = new Set([
  'local',
  'cn-prod',
  'cn-reference',
  'customer-self-hosted-lite',
  'customer-self-hosted-enterprise',
  'global-staging',
  'global-prod',
]);
const LEGACY_CN_CLOUD_SUPABASE_PROJECT_REF = 'example-legacy-project-ref';
const LEGACY_CN_CLOUD_SUPABASE_ORIGIN = 'https://' + LEGACY_CN_CLOUD_SUPABASE_PROJECT_REF + '.supabase.co';
const CN_SELF_HOSTED_SUPABASE_ORIGIN = 'https://supabase.example.invalid';
const CN_APP_ORIGINS = new Set(['https://supabase.example.invalid', 'https://app.example.invalid']);
const GLOBAL_TARGETS = new Set(['global-staging', 'global-prod']);
const PROD_TARGETS = new Set(['cn-prod', 'global-prod']);
const SELF_HOSTED_TARGETS = new Set([
  'local',
  'cn-prod',
  'cn-reference',
  'customer-self-hosted-lite',
  'customer-self-hosted-enterprise',
]);
const CN_SELF_HOSTED_TARGETS = new Set(['local', 'cn-prod', 'cn-reference']);
const OFFLINE_LICENSE_TARGETS = new Set([
  'cn-prod',
  'cn-reference',
  'customer-self-hosted-lite',
  'customer-self-hosted-enterprise',
]);
const HOSTED_SUPABASE_TARGETS = new Set(['global-staging', 'global-prod']);

function loadEnvFile(path = '.env.local') {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function fail(message) {
  console.error('[verify-environment-target] ' + message);
  process.exit(1);
}

function projectRefFromSupabaseUrl(value) {
  if (!value) return '';
  try {
    const host = new URL(value).hostname;
    const match = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

function isHostedSupabaseUrl(value) {
  if (!value) return false;
  try {
    return new URL(value).hostname.endsWith('.supabase.co');
  } catch {
    return false;
  }
}

function originFromUrl(value) {
  if (!value) return '';
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

loadEnvFile();

const target = process.env.DEPLOY_TARGET || 'local';
if (!TARGETS.has(target)) {
  fail('DEPLOY_TARGET must be one of ' + Array.from(TARGETS).join(', ') + ', got "' + target + '".');
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
const appOrigin = originFromUrl(appUrl);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseOrigin = originFromUrl(supabaseUrl);
const actualProjectRef = projectRefFromSupabaseUrl(supabaseUrl);
const expectedProjectRef = process.env.CLOSR_EXPECTED_SUPABASE_PROJECT_REF || '';
const dangerousOperation = process.env.CLOSR_DANGEROUS_OPERATION || '';
const confirmProdTarget = process.env.CLOSR_CONFIRM_PROD_TARGET || '';
const publicTarget = process.env.NEXT_PUBLIC_DEPLOY_TARGET || '';
const selfHostedSupabase = process.env.CLOSR_SELF_HOSTED_SUPABASE === '1';
const licenseMode = process.env.CLOSR_LICENSE_MODE || '';
const licensePublicKey = process.env.CLOSR_LICENSE_PUBLIC_KEY || '';

if (!supabaseUrl) {
  fail('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required.');
}

if (HOSTED_SUPABASE_TARGETS.has(target) && !actualProjectRef) {
  fail(target + ' requires a hosted Supabase URL (*.supabase.co), got ' + supabaseUrl + '.');
}

if (publicTarget && publicTarget !== target) {
  fail('NEXT_PUBLIC_DEPLOY_TARGET (' + publicTarget + ') must match DEPLOY_TARGET (' + target + ').');
}

if (expectedProjectRef && expectedProjectRef !== actualProjectRef) {
  fail('CLOSR_EXPECTED_SUPABASE_PROJECT_REF is ' + expectedProjectRef + ', but NEXT_PUBLIC_SUPABASE_URL points to ' + actualProjectRef + '.');
}

if (target === 'local') {
  if (supabaseOrigin !== CN_SELF_HOSTED_SUPABASE_ORIGIN) {
    fail('Local Closr testing must use the Singapore self-hosted Supabase endpoint ' + CN_SELF_HOSTED_SUPABASE_ORIGIN + '; got ' + supabaseOrigin + '.');
  }
}

if (target === 'cn-prod') {
  if (!CN_APP_ORIGINS.has(appOrigin)) {
    fail('cn-prod requires NEXT_PUBLIC_APP_URL=https://supabase.example.invalid or https://app.example.invalid, got ' + (appUrl || '(missing)') + '.');
  }
}

if (target === 'cn-reference') {
  if (!CN_APP_ORIGINS.has(appOrigin)) {
    fail('cn-reference requires NEXT_PUBLIC_APP_URL=https://supabase.example.invalid or https://app.example.invalid, got ' + (appUrl || '(missing)') + '.');
  }
}

if (SELF_HOSTED_TARGETS.has(target)) {
  if (!selfHostedSupabase) {
    fail(target + ' requires CLOSR_SELF_HOSTED_SUPABASE=1.');
  }
  if (isHostedSupabaseUrl(supabaseUrl)) {
    fail(target + ' must use self-hosted Supabase, not Supabase Cloud (' + supabaseOrigin + ').');
  }
  if (CN_SELF_HOSTED_TARGETS.has(target) && supabaseOrigin !== CN_SELF_HOSTED_SUPABASE_ORIGIN) {
    fail(target + ' must use the Singapore self-hosted Supabase endpoint ' + CN_SELF_HOSTED_SUPABASE_ORIGIN + ', got ' + supabaseOrigin + '.');
  }
  if (OFFLINE_LICENSE_TARGETS.has(target) && licenseMode !== 'offline') {
    fail(target + ' requires CLOSR_LICENSE_MODE=offline.');
  }
  if (OFFLINE_LICENSE_TARGETS.has(target) && !licensePublicKey) {
    fail(target + ' requires CLOSR_LICENSE_PUBLIC_KEY for offline license verification.');
  }
}

if (target === 'customer-self-hosted-enterprise' && confirmProdTarget !== target) {
  fail('customer-self-hosted-enterprise requires CLOSR_CONFIRM_PROD_TARGET=customer-self-hosted-enterprise before release packaging.');
}

if (GLOBAL_TARGETS.has(target)) {
  if (actualProjectRef === LEGACY_CN_CLOUD_SUPABASE_PROJECT_REF || supabaseOrigin === LEGACY_CN_CLOUD_SUPABASE_ORIGIN) {
    fail(target + ' must not use the legacy CN Supabase Cloud project ' + LEGACY_CN_CLOUD_SUPABASE_PROJECT_REF + '.');
  }
  if (!expectedProjectRef) {
    fail(target + ' requires CLOSR_EXPECTED_SUPABASE_PROJECT_REF so CI can catch cross-environment Supabase mistakes.');
  }
  if (target === 'global-prod' && appOrigin !== 'https://app.example.invalid') {
    fail('global-prod requires NEXT_PUBLIC_APP_URL=https://app.example.invalid, got ' + (appUrl || '(missing)') + '.');
  }
}

if (dangerousOperation && PROD_TARGETS.has(target) && confirmProdTarget !== target) {
  fail(dangerousOperation + ' is a dangerous production operation. Set CLOSR_CONFIRM_PROD_TARGET=' + target + ' to continue.');
}

console.log('[verify-environment-target] ok ' + JSON.stringify({
  target,
  appOrigin: appOrigin || null,
  supabaseOrigin: supabaseOrigin || null,
  supabaseProjectRef: actualProjectRef || null,
  selfHostedSupabase,
  licenseMode: licenseMode || null,
  dangerousOperation: dangerousOperation || null,
}));
