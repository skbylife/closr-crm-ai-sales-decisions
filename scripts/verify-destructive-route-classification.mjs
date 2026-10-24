#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const classifiedDeleteRoutes = {
  'src/app/api/accounts/[id]/knowledge/route.ts': 'resource-owner collaboration delete',
  'src/app/api/channels/route.ts': 'org-scoped collaboration delete',
  'src/app/api/comments/route.ts': 'org-scoped collaboration delete',
  'src/app/api/integration/connections/route.ts': 'integration admin disconnect with audit_log evidence',
  'src/app/api/invite/route.ts': 'admin invite revoke with audit_log evidence',
  'src/app/api/leads/[id]/route.ts': 'resource-scoped lead delete with audit_log evidence',
  'src/app/api/organization/dashboard-config/route.ts': 'admin dashboard configuration delete',
  'src/app/api/organization/members/route.ts': 'admin member removal with audit_log evidence',
  'src/app/api/organization/teams/route.ts': 'admin team delete',
  'src/app/api/opportunity-roles/[id]/route.ts': 'resource-scoped opportunity contact role delete with audit_log evidence',
  'src/app/api/play-relationships/route.ts': 'org-scoped relationship unlink',
  'src/app/api/pursuit-teams/[teamId]/members/route.ts': 'org-scoped pursuit team membership delete',
  'src/app/api/pursuit-teams/[teamId]/route.ts': 'org-scoped pursuit team delete',
  'src/app/api/rfps/competitors/route.ts': 'resource-scoped RFP competitor delete',
  'src/app/api/rfps/documents/route.ts': 'resource-scoped RFP document delete',
  'src/app/api/rfps/milestones/route.ts': 'resource-scoped RFP milestone delete',
  'src/app/api/rfps/route.ts': 'resource-scoped RFP delete',
  'src/app/api/seed-data/route.ts': 'owner-only organization destructive action with audit_log evidence',
  'src/app/api/strategic-play/route.ts': 'resource-scoped strategic play delete',
};

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    if (entry.isFile() && entry.name === 'route.ts') files.push(path);
  }
  return files;
}

const routeFiles = walk('src/app/api');
const deleteRoutes = routeFiles
  .filter((path) => readFileSync(path, 'utf8').includes('export async function DELETE'))
  .sort();

const classified = Object.keys(classifiedDeleteRoutes).sort();
const missing = deleteRoutes.filter((path) => !classifiedDeleteRoutes[path]);
const stale = classified.filter((path) => {
  try {
    return !statSync(path).isFile() || !readFileSync(path, 'utf8').includes('export async function DELETE');
  } catch {
    return true;
  }
});
const missingAudit = deleteRoutes.filter((path) => !readFileSync(path, 'utf8').includes('recordComplianceAudit'));

if (missing.length || stale.length || missingAudit.length) {
  if (missing.length) console.error('Unclassified DELETE routes:\n' + missing.join('\n'));
  if (stale.length) console.error('Stale destructive route classifications:\n' + stale.join('\n'));
  if (missingAudit.length) console.error('DELETE routes without audit_log evidence:\n' + missingAudit.join('\n'));
  process.exit(1);
}

console.log(`Destructive route classification passed: ${deleteRoutes.length} DELETE route(s) classified with audit evidence.`);
