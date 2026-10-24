#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const fixtureNames = ['renewal-expansion', 'security-review', 'rfp-tender'];

const fixtureSummaries = fixtureNames.map((name) => {
  const inputPath = join(repoRoot, 'fixtures/engine', name, 'input.json');
  if (!existsSync(inputPath)) {
    return { name, status: 'missing', sourceCount: 0 };
  }
  const input = JSON.parse(readFileSync(inputPath, 'utf8'));
  return {
    name,
    status: 'present',
    tenantId: input.tenantId,
    accountId: input.accountId,
    opportunityId: input.opportunityId,
    sourceCount: Array.isArray(input.sources) ? input.sources.length : 0,
  };
});

console.log('Closr Judgment Engine fixtures');
for (const summary of fixtureSummaries) {
  console.log(`- ${summary.name}: ${summary.status}, sources=${summary.sourceCount}, account=${summary.accountId ?? 'n/a'}, opportunity=${summary.opportunityId ?? 'n/a'}`);
}

const missing = fixtureSummaries.filter((summary) => summary.status !== 'present' || summary.sourceCount === 0);
if (missing.length > 0) {
  console.error(`Fixture check failed: ${missing.map((summary) => summary.name).join(', ')}`);
  process.exit(1);
}

const result = spawnSync('npx', ['vitest', 'run', 'src/lib/engine/fixtures.test.ts'], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log('Engine fixture contract: pass');
