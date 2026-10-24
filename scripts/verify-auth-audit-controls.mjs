#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const checks = [
  {
    file: 'src/app/api/auth/audit-event/route.ts',
    patterns: [
      'AUTH_AUDIT_EVENTS',
      'login_success',
      'logout',
      'password_reset_completed',
      'mfa_enabled',
      'mfa_disabled',
      'recordComplianceAudit',
      'requireAuth',
    ],
  },
  {
    file: 'src/lib/auth-audit-client.ts',
    patterns: ['export async function recordAuthAuditEvent', '/api/auth/audit-event', 'credentials'],
  },
  {
    file: 'src/lib/compliance-audit.ts',
    patterns: ['export async function recordAuthAuditForUser', "objectType: 'auth_session'", "from('org_memberships')"],
  },
  {
    file: 'src/app/(auth)/login/page.tsx',
    patterns: ['recordAuthAuditEvent', 'login_success', 'demo_login_success'],
  },
  {
    file: 'src/app/(auth)/reset-password/page.tsx',
    patterns: ['recordAuthAuditEvent', 'password_reset_completed'],
  },
  {
    file: 'src/lib/auth-context.tsx',
    patterns: ['recordAuthAuditEvent', 'logout'],
  },
  {
    file: 'src/app/(dashboard)/settings/mfa-section.tsx',
    patterns: ['recordAuthAuditEvent', 'mfa_enabled', 'mfa_disabled'],
  },
  {
    file: 'docs/compliance/AUTH-ACCESS-CONTROLS.md',
    patterns: ['login_success', 'mfa_enabled', 'MFA Posture Gate', 'Generic failed login'],
  },
];

const failures = [];
for (const check of checks) {
  const source = readFileSync(check.file, 'utf8');
  for (const pattern of check.patterns) {
    if (!source.includes(pattern)) failures.push(check.file + ': missing ' + pattern);
  }
}

if (failures.length) {
  console.error('Auth audit controls verification failed:\n' + failures.join('\n'));
  process.exit(1);
}

console.log('Auth audit controls verification passed.');
