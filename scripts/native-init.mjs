#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve(process.argv[2] || '.env.self-hosted');
const appUrl = process.argv[3] || 'http://localhost:3000';
const url = new URL(appUrl);
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
  throw new Error('Use an HTTP(S) application origin without credentials, query or path');
}
const content = [
  '# Generated locally for this installation. Keep private and back up securely.',
  `POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}`,
  `NEXT_PUBLIC_APP_URL=${url.origin}`,
  'CLOSR_BIND_ADDRESS=127.0.0.1',
  'CLOSR_PORT=3000',
  '',
].join('\n');
try {
  await writeFile(output, content, { flag: 'wx', mode: 0o600 });
  console.log(`Created private installation configuration: ${output}`);
} catch (error) {
  if (error.code === 'EEXIST') throw new Error('Configuration already exists; refusing to overwrite credentials');
  throw error;
}
