#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const routeTest = 'src/app/api/engine/judgment/snapshot/route.test.ts';
const routeTestPath = join(repoRoot, routeTest);

console.log('Closr Judgment Engine API smoke');
console.log('- checks: persist=false default, persist=true explicit write boundary');
console.log(`- route test: ${routeTest}`);

if (!existsSync(routeTestPath)) {
  console.error(`Missing route smoke test: ${routeTest}`);
  process.exit(1);
}

const result = spawnSync('npx', ['vitest', 'run', routeTest], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log('Engine API smoke: pass');
