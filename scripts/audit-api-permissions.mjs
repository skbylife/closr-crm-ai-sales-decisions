#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (p.endsWith('/route.ts')) out.push(p);
  }
  return out;
}

const files = walk('src/app/api').sort();

const categories = {
  public: [],
  'auth-only': [],
  'org-scoped': [],
  'resource-scoped': [],
  'admin-only': [],
  'cron-secret': [],
  'webhook-secret': [],
  risky: [],
};

function methods(src) {
  return [...src.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/g)].map((m) => m[1]);
}

function hasAny(src, needles) {
  return needles.some((n) => src.includes(n));
}

const rows = files.map((file) => {
  const src = readFileSync(file, 'utf8');
  const rel = relative(process.cwd(), file);
  const flags = {
    requireAuth: src.includes('requireAuth(') || src.includes('getAuthUser(') || src.includes('supabase.auth.getUser('),
    requireAdmin: src.includes('requireAdmin(') || src.includes('getSupabaseAdmin('),
    orgScoped: src.includes('ctx.orgId') || src.includes("eq('org_id'") || src.includes('.eq("org_id"') || src.includes('orgId'),
    resourceScoped: hasAny(src, [
      'requireAccountAccess(',
      'requireContactAccess(',
      'requireOpportunityAccess(',
      'requireOwnership(',
      'assertPallasContextAccess(',
    ]),
    ownerScoped: hasAny(src, ['ctx.userId', 'authUser.id', 'teamMemberIds', 'jobLevel', "eq('user_id'", "eq('owner_id'", "in(ownerColumn"]),
    connectionScoped: src.includes('integration_connections') && src.includes("eq('org_id'") && (src.includes("eq('id'") || src.includes("eq('connector_id'")),
    roleScoped: src.includes('requireRole(') || src.includes('orgRole') || src.includes("role')") || src.includes('callerMembership'),
    cronSecret: src.includes('CRON_SECRET'),
    webhookSecret: hasAny(src, ['WEBHOOK_SECRET', 'webhook', 'x-webhook', 'clientState']),
    signedState: hasAny(src, ['OAUTH_STATE_SECRET', 'timingSafeEqual', 'invitationToken', 'HEALTH_CHECK_TOKEN']),
    safePublicMinimal: rel.endsWith('/health/route.ts') && src.includes("{ status: 'ok' }") && src.includes('HEALTH_CHECK_TOKEN'),
    serviceRole: hasAny(src, ['requireAdmin(', 'getSupabaseAdmin(', 'auth.admin']),
  };

  let category = 'public';
  if (flags.cronSecret) category = 'cron-secret';
  else if (flags.webhookSecret && !flags.requireAuth) category = 'webhook-secret';
  else if (flags.resourceScoped) category = 'resource-scoped';
  else if (flags.roleScoped) category = 'admin-only';
  else if (flags.orgScoped && flags.requireAuth) category = 'org-scoped';
  else if (flags.requireAuth) category = 'auth-only';

  const riskReasons = [];
  if (flags.serviceRole && !flags.requireAuth && !flags.cronSecret && !flags.webhookSecret && !flags.signedState && !flags.safePublicMinimal) riskReasons.push('service-role-without-auth/secret');
  if (flags.serviceRole && flags.requireAuth && !flags.orgScoped && !flags.resourceScoped && !flags.ownerScoped && !flags.connectionScoped && !flags.roleScoped && !flags.cronSecret) riskReasons.push('service-role-without-org-scope');
  if (/accounts\/\[id\]|contacts\/\[id\]|opportunit|strategic-play|knowledge|intel|export|agent|integration/.test(rel)) {
    if (flags.requireAuth && flags.serviceRole && !flags.resourceScoped && !flags.ownerScoped && !flags.connectionScoped && !flags.roleScoped && !flags.cronSecret && !flags.webhookSecret) {
      riskReasons.push('high-value-route-without-resource/role-guard');
    }
  }
  if (rel.includes('/organization/') && /PATCH|DELETE/.test(methods(src).join(',')) && !flags.roleScoped) riskReasons.push('org-write-without-role-guard');
  if (rel.endsWith('/organization/route.ts') && methods(src).includes('POST') && !src.includes('already belongs') && !src.includes('已经属于一个组织')) riskReasons.push('org-create-without-membership-boundary');

  const row = { file: rel, methods: methods(src), category, flags, riskReasons };
  categories[category].push(row);
  if (riskReasons.length) categories.risky.push(row);
  return row;
});

console.log('API Permission Matrix Summary');
for (const [category, items] of Object.entries(categories)) {
  if (category === 'risky') continue;
  console.log(`- ${category}: ${items.length}`);
}
console.log(`- risky: ${categories.risky.length}`);

console.log('\nMatrix:');
for (const row of rows) {
  console.log(`${row.category.padEnd(15)} ${row.methods.join(',').padEnd(14)} ${row.file}${row.riskReasons.length ? `  RISK=${row.riskReasons.join('|')}` : ''}`);
}

if (categories.risky.length) {
  console.log('\nRisky routes requiring manual review:');
  for (const row of categories.risky) console.log(`- ${row.file}: ${row.riskReasons.join(', ')}`);
}
