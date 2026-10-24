#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const command = process.argv[2] ?? 'help';
const backupDir = process.env.CLOSR_BACKUP_DIR || 'backups';
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

function usage() {
  console.log(`Usage:
  node scripts/self-hosted-ops.mjs backup [--execute]
  node scripts/self-hosted-ops.mjs restore <dump-file> --execute
  node scripts/self-hosted-ops.mjs export-ai-usage [--execute]

Defaults are dry-run. Restore always requires --execute.`);
}

function requireDbUrl() {
  if (!dbUrl) {
    console.error('DATABASE_URL/SUPABASE_DB_URL is required.');
    process.exit(1);
  }
}

function run(binary, args, execute) {
  console.log([binary, ...args.map((arg) => (arg.includes(' ') ? JSON.stringify(arg) : arg))].join(' '));
  if (!execute) return;
  const result = spawnSync(binary, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

if (command === 'help' || command === '--help' || command === '-h') {
  usage();
  process.exit(0);
}

const execute = process.argv.includes('--execute');

if (command === 'backup') {
  requireDbUrl();
  mkdirSync(backupDir, { recursive: true });
  const output = join(backupDir, `closr-backup-${stamp()}.dump`);
  run('pg_dump', [dbUrl, '--format=custom', '--no-owner', '--no-privileges', '--file', output], execute);
  if (!execute) console.log('Dry-run only. Add --execute to create the dump.');
  else console.log(`Backup written to ${output}`);
  process.exit(0);
}

if (command === 'restore') {
  requireDbUrl();
  const file = process.argv.find((arg, index) => index > 2 && !arg.startsWith('--'));
  if (!file) {
    console.error('Restore requires a dump file.');
    usage();
    process.exit(1);
  }
  if (!execute) {
    console.error('Restore is destructive and requires --execute.');
    run('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--dbname', '<DATABASE_URL>', basename(file)], false);
    process.exit(1);
  }
  run('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--dbname', dbUrl, file], true);
  process.exit(0);
}

if (command === 'export-ai-usage') {
  requireDbUrl();
  mkdirSync(backupDir, { recursive: true });
  const output = join(backupDir, `closr-ai-usage-${stamp()}.csv`);
  const sql = `\\copy (select org_id, route, use_case, provider, model, tokens_input, tokens_output, duration_ms, error, created_at from ai_invocation_logs order by created_at desc limit 50000) to '${output}' with csv header`;
  run('psql', [dbUrl, '-c', sql], execute);
  if (!execute) console.log('Dry-run only. Add --execute to export CSV.');
  else console.log(`AI usage export written to ${output}`);
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
usage();
process.exit(1);
