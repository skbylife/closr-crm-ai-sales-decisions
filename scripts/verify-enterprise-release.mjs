#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const target = process.env.DEPLOY_TARGET || 'local';
const requireLiveDb = process.env.CLOSR_REQUIRE_LIVE_DB_BASELINE !== '0';

const steps = [
  ['npm', ['audit', '--audit-level=moderate']],
  ['npm', ['run', 'verify:compliance-evidence']],
  ['npm', ['run', 'verify:enterprise-go-live']],
  ['npm', ['run', 'verify:ai-provider']],
  ['npm', ['run', 'verify:production-controls']],
  ['npm', ['run', 'verify:env'], { env: { ...process.env, DEPLOY_TARGET: target } }],
  ['npm', ['run', 'verify:security']],
  ['npx', ['tsc', '--noEmit']],
  ['npm', ['run', 'build']],
];

if (requireLiveDb) {
  steps.splice(3, 0, ['npm', ['run', 'verify:schema-baseline']]);
}

function run(binary, args, options = {}) {
  console.log('\n$ ' + [binary, ...args].join(' '));
  const result = spawnSync(binary, args, { stdio: 'inherit', shell: false, ...options });
  return result.status ?? 1;
}

console.log('[verify-enterprise-release] target=' + target + ' requireLiveDb=' + requireLiveDb);

for (const [binary, args, options] of steps) {
  const status = run(binary, args, options);
  if (status !== 0) {
    console.error('[verify-enterprise-release] failed at: ' + [binary, ...args].join(' '));
    process.exit(status);
  }
}

console.log('\nEnterprise release verification passed.');
