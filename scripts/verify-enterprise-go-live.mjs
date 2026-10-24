#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';

const enterpriseTargets = new Set([
  'cn-prod',
  'global-prod',
  'customer-self-hosted',
  'customer-self-hosted-lite',
  'customer-self-hosted-enterprise',
]);

const target = process.env.DEPLOY_TARGET || 'local';
const formalGoLive = process.env.CLOSR_ENTERPRISE_GO_LIVE === '1';
const enterpriseLikeTarget = enterpriseTargets.has(target);
const requireTargetEvidence = formalGoLive || enterpriseLikeTarget;

const sourceChecks = [
  {
    file: 'docs/compliance/ENTERPRISE-GO-LIVE-CHECKLIST.md',
    markers: [
      '# Enterprise Go-Live Checklist',
      'Required Technical Gates',
      'Required Customer-Specific Approvals',
      'Required Environment Evidence',
      'Release Gate',
      'Non-Claims',
    ],
  },
  {
    file: 'docs/compliance/README.md',
    markers: ['ENTERPRISE-GO-LIVE-CHECKLIST.md', 'npm run verify:enterprise-go-live'],
  },
  {
    file: 'docs/compliance/EVIDENCE-MATRIX.md',
    markers: ['Enterprise go-live readiness', 'verify:enterprise-go-live'],
  },
  {
    file: 'scripts/verify-enterprise-release.mjs',
    markers: ["'npm', ['run', 'verify:enterprise-go-live']"],
  },
];

const failures = [];

for (const check of sourceChecks) {
  if (!existsSync(check.file)) {
    failures.push('missing ' + check.file);
    continue;
  }
  const source = readFileSync(check.file, 'utf8');
  for (const marker of check.markers) {
    if (!source.includes(marker)) failures.push(check.file + ': missing ' + marker);
  }
  if (!failures.some((failure) => failure.startsWith(check.file + ':') || failure === 'missing ' + check.file)) {
    console.log('PASS ' + check.file);
  }
}

if (formalGoLive && !enterpriseLikeTarget) {
  failures.push('CLOSR_ENTERPRISE_GO_LIVE=1 requires DEPLOY_TARGET to be an enterprise target');
}

if (requireTargetEvidence) {
  requireAny(['DATABASE_URL', 'SUPABASE_DB_URL'], 'target database URL for live schema/RLS and MFA posture checks');
  requireNot('CLOSR_REQUIRE_LIVE_DB_BASELINE', '0', 'live DB baseline must remain enabled for enterprise go-live');
  requireOne('HEALTH_CHECK_TOKEN', 'tokenized detailed health check');
  requireOne('ERROR_WEBHOOK_URL', 'error alert destination');
  requireAny(['WAF_PROVIDER', 'CLOSR_WAF_CONFIRMED'], 'WAF or equivalent gateway confirmation');
  requireAny(['UPTIME_MONITOR_URL', 'CLOSR_MONITORING_CONFIRMED'], 'uptime monitoring confirmation');

  requireFlag('CLOSR_DPA_APPROVED', 'customer-specific DPA approval');
  requireFlag('CLOSR_SUBPROCESSORS_APPROVED', 'customer-specific subprocessor approval');
  requireFlag('CLOSR_AI_TERMS_APPROVED', 'customer AI provider and no-training terms approval');
  requireFlag('CLOSR_DATA_RESIDENCY_APPROVED', 'customer data residency approval');
  requireFlag('CLOSR_RETENTION_APPROVED', 'customer retention/deletion approval');
  requireFlag('CLOSR_INCIDENT_CONTACTS_CONFIRMED', 'customer incident contacts and notice path');
  requireFlag('CLOSR_RESTORE_DRILL_CONFIRMED', 'target restore drill evidence');
  requireFlag('CLOSR_ADMIN_MFA_REVIEW_CONFIRMED', 'target admin/owner MFA review');

  const provider = (process.env.AI_PROVIDER || '').toLowerCase();
  if (provider && provider !== 'gemini' && process.env.CLOSR_VERIFY_AI_PROVIDER_LIVE !== '1') {
    failures.push('customer-owned/non-Gemini AI provider requires CLOSR_VERIFY_AI_PROVIDER_LIVE=1 for go-live');
  }
}

if (failures.length) {
  console.error('Enterprise go-live verification failed:\n' + failures.map((failure) => '- ' + failure).join('\n'));
  process.exit(1);
}

console.log('\nEnterprise go-live checklist verification passed.');
if (!requireTargetEvidence) {
  console.log('Target-specific go-live evidence not required for DEPLOY_TARGET=' + target + '. Set CLOSR_ENTERPRISE_GO_LIVE=1 for formal production approval.');
}

function requireOne(key, label) {
  if (!process.env[key]) failures.push('missing ' + key + ' (' + label + ')');
}

function requireAny(keys, label) {
  if (!keys.some((key) => Boolean(process.env[key]))) {
    failures.push('missing one of ' + keys.join(', ') + ' (' + label + ')');
  }
}

function requireFlag(key, label) {
  if (process.env[key] !== '1') failures.push(key + '=1 required (' + label + ')');
}

function requireNot(key, disallowed, label) {
  if (process.env[key] === disallowed) failures.push(key + ' must not be ' + disallowed + ' (' + label + ')');
}
