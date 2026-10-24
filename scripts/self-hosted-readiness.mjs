#!/usr/bin/env node
import nextEnv from '@next/env';
import process from 'node:process';
import { Client } from 'pg';

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd(), true);

const requiredEnv = [
  ['NEXT_PUBLIC_SUPABASE_URL', 'Supabase public URL'],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Supabase anon key'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'Supabase service role key'],
];

const optionalEnvGroups = [
  [['DATABASE_URL', 'SUPABASE_DB_URL'], 'Database migration URL'],
  [['AI_API_KEY', 'DASHSCOPE_API_KEY', 'GEMINI_API_KEY'], 'AI provider key'],
  [['AI_PROVIDER', 'AI_BASE_URL'], 'AI provider adapter'],
  [['AI_MODEL', 'SG_AI_MODEL'], 'AI model'],
  [['HEALTH_CHECK_TOKEN'], 'Tokenized health check'],
  [['ERROR_WEBHOOK_URL'], 'Error alert webhook'],
  [['WAF_PROVIDER', 'CLOSR_WAF_CONFIRMED'], 'WAF / edge protection'],
  [['UPTIME_MONITOR_URL', 'CLOSR_MONITORING_CONFIRMED'], 'Uptime monitoring'],
  [['AGENTMAIL_API_KEY', 'AGENTMAIL_INBOX', 'WEBHOOK_SECRET'], 'Mail ingress'],
  [['TAVILY_API_KEY', 'SCRAPLING_ENABLED', 'PUBLIC_WEB_EVIDENCE_ENABLED'], 'Public web evidence'],
];

const requiredTables = [
  'accounts',
  'contacts',
  'opportunities',
  'tasks',
  'source_records',
  'ai_invocation_logs',
  'org_memberships',
];

function hasAny(keys) {
  return keys.some((key) => Boolean(process.env[key]));
}

function record(rows, status, label, detail) {
  rows.push({ status, label, detail });
}

async function checkDatabase(rows) {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    record(rows, 'warn', 'Database reachability', 'DATABASE_URL/SUPABASE_DB_URL not set; skipped live DB checks.');
    return;
  }

  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    record(rows, 'pass', 'Database reachability', 'Connected with configured database URL.');

    const tableResult = await client.query(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])`,
      [requiredTables],
    );
    const present = new Set(tableResult.rows.map((row) => row.table_name));
    for (const table of requiredTables) {
      record(rows, present.has(table) ? 'pass' : 'fail', `DB table: ${table}`, present.has(table) ? 'present' : 'missing');
    }

    const rlsResult = await client.query(
      `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname = any($1::text[])`,
      [requiredTables],
    );
    for (const row of rlsResult.rows) {
      record(rows, row.relrowsecurity ? 'pass' : 'fail', `RLS: ${row.relname}`, row.relrowsecurity ? 'enabled' : 'disabled');
    }
  } catch (err) {
    record(rows, 'fail', 'Database reachability', err instanceof Error ? err.message : String(err));
  } finally {
    await client.end().catch(() => undefined);
  }
}

function printRows(rows) {
  for (const row of rows) {
    console.log(`${row.status.toUpperCase().padEnd(6)} ${row.label} - ${row.detail}`);
  }
}

const rows = [];
for (const [key, label] of requiredEnv) {
  record(rows, process.env[key] ? 'pass' : 'fail', label, key);
}
for (const [keys, label] of optionalEnvGroups) {
  record(rows, hasAny(keys) ? 'pass' : 'warn', label, keys.join(' or '));
}

await checkDatabase(rows);
printRows(rows);

const failCount = rows.filter((row) => row.status === 'fail').length;
const warnCount = rows.filter((row) => row.status === 'warn').length;
console.log(`\nSelf-hosted readiness: ${failCount} fail, ${warnCount} warn`);
if (failCount > 0) process.exit(1);
