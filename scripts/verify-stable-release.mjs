#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const required = [
  ['npm', ['run', 'verify:security']],
  ['npx', ['vitest', 'run', 'src/lib/self-hosted-readiness.test.ts', 'src/app/api/self-hosted/readiness/route.test.ts']],
  ['npx', ['tsc', '--noEmit']],
  ['npm', ['run', 'build']],
];

function run(binary, args, options = {}) {
  console.log('\n$ ' + [binary, ...args].join(' '));
  const result = spawnSync(binary, args, { stdio: 'inherit', shell: false, ...options });
  return result.status ?? 1;
}

for (const [binary, args] of required) {
  const status = run(binary, args);
  if (status !== 0) process.exit(status);
}

const dockerAvailable = spawnSync('docker', ['--version'], { stdio: 'ignore' }).status === 0;
if (dockerAvailable) {
  const status = run('docker', ['compose', '-f', 'docker-compose.self-hosted.yml', 'config']);
  if (status !== 0) process.exit(status);
} else {
  console.log('\nDocker not available; skipped docker-compose.self-hosted.yml config check.');
}

console.log('\nStable release verification passed.');
