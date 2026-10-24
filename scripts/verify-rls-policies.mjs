#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { Client } from 'pg';

const criticalTables = [
  'accounts',
  'contacts',
  'opportunities',
  'tasks',
  'source_records',
  'ai_invocation_logs',
  'knowledge_base',
  'integration_connections',
  'integration_tokens',
  'integration_emails',
  'audit_log',
];

const migrationProtectedTables = [
  'source_records',
  'knowledge_base',
  'integration_connections',
  'integration_tokens',
  'integration_emails',
  'audit_log',
];

const migrationFiles = [
  'src/lib/migrations/004_permissions_and_ownership.sql',
  'src/lib/migrations/011_integration_rls.sql',
  'src/lib/migrations/016_missing_rls.sql',
  'src/lib/migrations/017_knowledge_base_org_rls.sql',
];

const failures = [];
const migrationText = migrationFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

for (const table of migrationProtectedTables) {
  if (!migrationText.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)) {
    failures.push(`${table}: missing ENABLE ROW LEVEL SECURITY in migrations`);
  }
}

for (const table of ['source_records', 'audit_log', 'integration_connections', 'integration_emails']) {
  const start = migrationText.indexOf(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  const tableBlock = start >= 0 ? migrationText.slice(start, start + 1500) : '';
  if (!tableBlock.includes('org_id') && !tableBlock.includes('org_isolation')) {
    failures.push(`${table}: missing org isolation policy marker`);
  }
}

if (migrationText.includes('CREATE POLICY "knowledge_base_authenticated"')) {
  const lastKnowledgePolicy = migrationText.lastIndexOf('CREATE POLICY "knowledge_base_authenticated"');
  const fixPolicy = migrationText.lastIndexOf('CREATE POLICY "knowledge_base_org_isolation"');
  if (fixPolicy < lastKnowledgePolicy) {
    failures.push('knowledge_base: authenticated-only policy appears after org isolation fix');
  }
}

async function verifyLiveRls() {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.log('Live RLS check skipped: DATABASE_URL/SUPABASE_DB_URL not set.');
    return;
  }
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const result = await client.query(
      `select relname, relrowsecurity
       from pg_class
       where relnamespace = 'public'::regnamespace
         and relkind = 'r'
         and relname = any($1::text[])
       order by relname`,
      [criticalTables],
    );
    const seen = new Set(result.rows.map((row) => row.relname));
    for (const table of criticalTables) {
      if (!seen.has(table)) failures.push(`${table}: table missing in live database`);
    }
    for (const row of result.rows) {
      if (!row.relrowsecurity) failures.push(`${row.relname}: RLS disabled in live database`);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

await verifyLiveRls();

if (failures.length) {
  console.error('RLS policy verification failed:\n' + failures.join('\n'));
  process.exit(1);
}

console.log('RLS policy verification passed.');
