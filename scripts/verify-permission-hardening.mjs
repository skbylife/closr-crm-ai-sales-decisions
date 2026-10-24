#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const checks = [
  {
    file: 'src/app/api/contact-profile/generate/route.ts',
    patterns: ['requireContactAccess(ctx, body.contactId)', ".eq('org_id', ctx.orgId)", "from('contacts')"],
  },
  {
    file: 'src/app/api/decode/route.ts',
    patterns: ['requireContactAccess(ctx, body.matchedContactId)', 'requireAccountAccess(ctx, matchedAccountId)', 'requireOpportunityAccess(ctx, body.opportunityId)', 'authorizedAccountIds.size > 1', 'const resolvedAccountId = authorizedAccountId'],
  },
  {
    file: 'src/app/api/accounts/[id]/analyze/route.ts',
    patterns: ['requireAccountAccess(ctx, id)', ".eq('org_id', ctx.orgId)"],
  },
  {
    file: 'src/app/api/accounts/[id]/competitors/route.ts',
    patterns: ['requireAccountAccess(ctx, id)', ".eq('org_id', ctx.orgId)"],
  },
  {
    file: 'src/app/api/accounts/[id]/knowledge/compile/route.ts',
    patterns: ['requireAccountAccess(ctx, id)', ".eq('org_id', ctx.orgId)", "from('knowledge_base')"],
  },
  {
    file: 'src/app/api/accounts/[id]/news/route.ts',
    patterns: ['requireAccountAccess(ctx, id)', ".eq('org_id', ctx.orgId)"],
  },
  {
    file: 'src/app/api/contacts/[id]/enrichment-history/route.ts',
    patterns: ['requireContactAccess(ctx, contactId)', ".eq('org_id', ctx.orgId)"],
  },
  {
    file: 'src/app/api/agent/execute-tools/route.ts',
    patterns: ['requireAccountAccess(ctx, accountId)', 'requireContactAccess(ctx, contactId)', 'requireOpportunityAccess(ctx, opportunityId)'],
  },
  {
    file: 'src/app/api/organization/members/route.ts',
    patterns: ['ORG_ROLES', 'JOB_LEVELS', "只有 Owner 可以授予高权限角色", ".eq('org_id', orgId)"],
  },
  {
    file: 'src/app/api/strategic-play/route.ts',
    patterns: ['requireContactAccess(ctx, body.targetContactId)', 'requireOpportunityAccess(ctx, body.opportunityId)', ".eq('org_id', ctx.orgId)"],
  },
  {
    file: 'src/lib/api-guard.ts',
    patterns: ['export async function requireContactAccess', 'export async function requireOpportunityAccess', "eq('org_id', ctx.orgId)", 'export function requireOwnerForDestructiveOrgData'],
  },
  {
    file: 'src/lib/compliance-audit.ts',
    patterns: ['export async function recordComplianceAudit', "from('audit_log').insert", 'ip_address'],
  },
  {
    file: 'src/app/api/organization/members/route.ts',
    patterns: ['recordComplianceAudit', 'permission_changed', 'member_removed'],
  },
  {
    file: 'src/app/api/export/route.ts',
    patterns: ['recordComplianceAudit', 'data_exported', 'rowCount'],
  },
  {
    file: 'src/app/api/integration/connections/route.ts',
    patterns: ['recordComplianceAudit', 'integration_disconnected'],
  },
  {
    file: 'src/app/api/invite/route.ts',
    patterns: ['recordComplianceAudit', 'invitation_revoked'],
  },
  {
    file: 'src/app/api/auth/audit-event/route.ts',
    patterns: ['recordComplianceAudit', 'AUTH_AUDIT_EVENTS', 'const ctx = await requireAuth()'],
  },
];

const failures = [];
for (const check of checks) {
  const source = readFileSync(check.file, 'utf8');
  for (const pattern of check.patterns) {
    if (!source.includes(pattern)) failures.push(`${check.file}: missing ${pattern}`);
  }
}

if (failures.length) {
  console.error('Permission hardening checks failed:\n' + failures.join('\n'));
  process.exit(1);
}

console.log('Permission hardening checks passed.');
