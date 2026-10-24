#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { Client } from 'pg';

const sourceChecks = [
  {
    file: 'src/app/api/security/mfa-posture/route.ts',
    patterns: [
      'requireAuth',
      "requireRole(ctx, 'admin')",
      "from('org_memberships')",
      ".in('role', ['owner', 'admin'])",
      'admin.auth.admin.getUserById',
      'summarizePrivilegedMfaPosture',
    ],
  },
  {
    file: 'src/lib/mfa-posture.ts',
    patterns: ['countVerifiedMfaFactors', "status === 'verified'", 'buildPrivilegedMfaStatus', 'summarizePrivilegedMfaPosture'],
  },
  {
    file: 'docs/compliance/AUTH-ACCESS-CONTROLS.md',
    patterns: ['MFA Posture Gate', '/api/security/mfa-posture', 'verify-mfa-posture-controls', 'auth.mfa_factors', 'Settings > Security'],
  },
  {
    file: 'src/app/(dashboard)/settings/mfa-section.tsx',
    patterns: ['Owner/Admin', '企业上线 gate', '启用两步验证'],
  },
  {
    file: 'src/app/api/invite/route.ts',
    patterns: ['requiresMfaSetup', 'MFA_SETUP_PATH', 'Settings &gt; Security'],
  },
  {
    file: 'docs/compliance/EVIDENCE-MATRIX.md',
    patterns: ['MFA and privileged auth posture', '/api/security/mfa-posture', 'verify-mfa-posture-controls'],
  },
];

const failures = [];

for (const check of sourceChecks) {
  const source = readFileSync(check.file, 'utf8');
  for (const pattern of check.patterns) {
    if (!source.includes(pattern)) failures.push(check.file + ': missing ' + pattern);
  }
}

if (failures.length) {
  console.error('MFA posture source verification failed:\n' + failures.join('\n'));
  process.exit(1);
}

async function verifyLivePosture() {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.log('MFA posture live DB check skipped: DATABASE_URL/SUPABASE_DB_URL not set.');
    return;
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

  try {
    await client.connect();
    const result = await client.query(
      [
        'with privileged as (',
        '  select user_id, org_id, role',
        '  from public.org_memberships',
        "  where role in ('owner', 'admin')",
        '), verified_factors as (',
        '  select user_id, count(*)::int as verified_factor_count',
        '  from auth.mfa_factors',
        "  where status = 'verified'",
        '  group by user_id',
        ')',
        'select',
        '  p.org_id,',
        '  p.user_id,',
        '  p.role,',
        '  coalesce(v.verified_factor_count, 0)::int as verified_factor_count',
        'from privileged p',
        'left join verified_factors v on v.user_id = p.user_id',
        'order by p.org_id, p.role, p.user_id',
      ].join('\n'),
    );

    const missing = result.rows.filter((row) => Number(row.verified_factor_count) < 1);
    console.log('MFA posture live DB check');
    console.log('privileged_members=' + result.rows.length);
    console.log('missing_mfa=' + missing.length);

    if (missing.length) {
      for (const row of missing) {
        console.error('missing_mfa org=' + row.org_id + ' role=' + row.role + ' user=' + row.user_id + ' verified_factors=' + row.verified_factor_count);
      }
      console.error('Privileged MFA posture failed: owner/admin accounts without verified MFA factor.');
      process.exit(1);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

await verifyLivePosture();
console.log('MFA posture controls verification passed.');
