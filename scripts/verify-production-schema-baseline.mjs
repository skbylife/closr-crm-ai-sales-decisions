#!/usr/bin/env node
import process from 'node:process';
import { Client } from 'pg';

const criticalTables = [
  'organizations',
  'org_memberships',
  'accounts',
  'contacts',
  'opportunities',
  'tasks',
  'source_records',
  'account_memory_snapshots',
  'memory_conflicts',
  'account_knowledge_pages',
  'account_claims',
  'account_evidence',
  'account_open_questions',
  'knowledge_update_log',
  'strategic_plays',
  'pursuit_teams',
  'responsibility_catalog',
  'pursuit_team_members',
  'pursuit_team_member_responsibilities',
  'contact_coverage_assignments',
  'contact_coverage_responsibilities',
  'relationship_signals',
  'relationship_edges',
  'rfps',
  'rfp_documents',
  'rfp_milestones',
  'rfp_competitors',
  'rfp_ai_analyses',
  'ai_invocation_logs',
  'audit_log',
  'activity_logs',
  'knowledge_base',
  'integration_connections',
  'integration_tokens',
  'integration_emails',
];

const policyRequiredTables = [
  'accounts',
  'contacts',
  'opportunities',
  'tasks',
  'source_records',
  'strategic_plays',
  'ai_invocation_logs',
  'audit_log',
  'activity_logs',
  'integration_connections',
  'integration_tokens',
  'integration_emails',
];

const plannedTables = [
  'pallas_artifacts',
  'pallas_artifact_versions',
  'pallas_action_proposals',
  'pallas_tool_runs',
];

function formatTable(rows) {
  const headers = Object.keys(rows[0] ?? {});
  if (headers.length === 0) return '(none)';
  const widths = headers.map((header) =>
    Math.max(header.length, ...rows.map((row) => String(row[header] ?? '').length)),
  );
  const line = (values) => values.map((value, index) => String(value ?? '').padEnd(widths[index])).join('  ');
  return [
    line(headers),
    line(headers.map((header, index) => '-'.repeat(widths[index]))),
    ...rows.map((row) => line(headers.map((header) => row[header]))),
  ].join('\n');
}

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error('Set DATABASE_URL or SUPABASE_DB_URL to run the live schema baseline check.');
    process.exit(2);
  }

  const allowSelfSignedSsl = process.env.CLOSR_DB_SSL_NO_VERIFY === '1';
  let normalizedConnectionString = connectionString;
  if (allowSelfSignedSsl) {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    normalizedConnectionString = url.toString();
  }
  const client = new Client({
    connectionString: normalizedConnectionString,
    connectionTimeoutMillis: 8000,
    ssl: allowSelfSignedSsl ? { rejectUnauthorized: false } : undefined,
  });
  const failures = [];
  const warnings = [];

  try {
    await client.connect();

    const tableResult = await client.query(
      [
        'with required(table_name) as (select unnest($1::text[])),',
        'policy_counts as (',
        '  select tablename, count(*)::int as policy_count',
        '  from pg_policies',
        "  where schemaname = 'public'",
        '  group by tablename',
        ')',
        'select',
        '  r.table_name,',
        '  (c.relname is not null) as present,',
        '  coalesce(c.relrowsecurity, false) as rls_enabled,',
        '  coalesce(pc.policy_count, 0)::int as policy_count',
        'from required r',
        'left join pg_class c',
        '  on c.relname = r.table_name',
        " and c.relnamespace = 'public'::regnamespace",
        " and c.relkind = 'r'",
        'left join policy_counts pc on pc.tablename = r.table_name',
        'order by r.table_name',
      ].join('\n'),
      [criticalTables],
    );

    for (const row of tableResult.rows) {
      if (!row.present) failures.push(`${row.table_name}: missing critical table`);
      if (row.present && !row.rls_enabled) failures.push(`${row.table_name}: RLS disabled`);
      if (row.present && policyRequiredTables.includes(row.table_name) && row.policy_count === 0) {
        failures.push(`${row.table_name}: no RLS policies found`);
      }
    }

    const plannedResult = await client.query(
      [
        'select r.table_name, (c.relname is not null) as present, coalesce(c.relrowsecurity, false) as rls_enabled',
        'from (select unnest($1::text[]) as table_name) r',
        'left join pg_class c',
        '  on c.relname = r.table_name',
        " and c.relnamespace = 'public'::regnamespace",
        " and c.relkind = 'r'",
        'order by r.table_name',
      ].join('\n'),
      [plannedTables],
    );

    for (const row of plannedResult.rows) {
      if (!row.present) warnings.push(`${row.table_name}: planned Pallas table is not present in live DB`);
      else if (!row.rls_enabled) warnings.push(`${row.table_name}: planned Pallas table present but RLS disabled`);
    }

    const disabledResult = await client.query(
      [
        'select relname',
        'from pg_class',
        "where relnamespace = 'public'::regnamespace",
        "  and relkind = 'r'",
        '  and not relrowsecurity',
        'order by relname',
      ].join('\n'),
    );

    for (const row of disabledResult.rows) {
      if (!criticalTables.includes(row.relname)) warnings.push(`${row.relname}: public table has RLS disabled`);
    }

    const migrationResult = await client.query(
      [
        'select version, name',
        'from supabase_migrations.schema_migrations',
        'order by version',
      ].join('\n'),
    );

    console.log('Production schema baseline');
    console.log(`critical_tables=${criticalTables.length}`);
    console.log(`migration_ledger_entries=${migrationResult.rows.length}`);
    console.log('\nCritical table status');
    console.log(formatTable(tableResult.rows));
    console.log('\nPlanned table status');
    console.log(formatTable(plannedResult.rows));
    console.log('\nLive migration ledger');
    console.log(formatTable(migrationResult.rows));

    if (warnings.length) {
      console.log('\nWarnings');
      for (const warning of warnings) console.log(`- ${warning}`);
    }

    if (failures.length) {
      console.error('\nFailures');
      for (const failure of failures) console.error(`- ${failure}`);
      process.exit(1);
    }

    console.log('\nProduction schema baseline passed with warnings=' + warnings.length);
  } finally {
    await client.end().catch(() => undefined);
  }
}

await main();
