#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const checks = [
  {
    file: 'src/lib/compiled-intelligence/context.ts',
    patterns: ['ctx: UserContext', 'assertCILAccountScope(params)', 'requireAccountAccess(params.ctx, params.accountId)', 'loadCILAccountContextScoped', 'loadCILAccountContextUnsafeInternal'],
  },
  {
    file: 'src/lib/knowledge-engine.ts',
    patterns: ['searchKnowledgeScoped(\n  ctx: UserContext', 'injectKnowledgeContextScoped(\n  ctx: UserContext', 'searchKnowledgeUnsafeInternal', 'injectKnowledgeContextUnsafeInternal', 'requireAccountAccess(ctx, accountId)'],
  },
  {
    file: 'src/lib/evidence-memory/server.ts',
    patterns: ['assertEvidenceAccountScope(accountId, orgId, ctx)', 'loadEvidenceRecordsUnsafeInternal(accountId: string, orgId: string)', 'loadEvidenceRecordsScoped(ctx: UserContext, accountId: string', 'getEvidenceBundlePayload(accountId: string, play: StrategicPlay, orgId: string, ctx?: UserContext)', 'getUnifiedMemoryPayload(accountId: string, accountName: string, orgId: string, windowDays = 30, ctx?: UserContext)'],
  },
  {
    file: 'src/lib/evidence-memory/ai-analysis.ts',
    patterns: ['ctx?: UserContext', 'requireAccountAccess(ctx, accountId)', 'ctx ? loadEvidenceRecordsScoped(ctx, accountId, orgId) : loadEvidenceRecordsUnsafeInternal(accountId, orgId)'],
  },
  {
    file: 'src/app/api/decode/route.ts',
    patterns: ['const authorizedAccountId = [...authorizedAccountIds][0]', 'const resolvedAccountId = authorizedAccountId', 'accountId: resolvedAccountId', 'requestContext: ctx'],
  },
  {
    file: 'src/lib/babel-engine/decode-service.ts',
    patterns: ['const cilPromise = input.requestContext', 'loadCILAccountContextScoped({ orgId, accountId: resolvedAccountId, limitEvidence: 8, limitClaims: 10, ctx: input.requestContext })', 'injectKnowledgeContextScoped(input.requestContext, resolvedAccountId, queryHint, 5)'],
  },
  {
    file: 'src/app/api/accounts/[id]/analyze/route.ts',
    patterns: ['requireAccountAccess(ctx, id)', 'streamAccountAIAnalysis({', 'ctx,'],
  },
  {
    file: 'src/app/api/accounts/[id]/memory-payload/route.ts',
    patterns: ['requireAccountAccess(ctx, id)', 'getUnifiedMemoryPayload(', 'windowDays,\n        ctx,'],
  },
  {
    file: 'src/app/api/accounts/[id]/evidence-panel/route.ts',
    patterns: ['requireAccountAccess(ctx, id)', 'getEvidenceBundlePayload(id, play, ctx.orgId, ctx)', 'confidence: Number(body.confidence ?? 0),\n        ctx,'],
  },
  {
    file: 'src/app/api/account-strategy/route.ts',
    patterns: ['requireAccountAccess(ctx, body.accountId)', 'loadCILAccountContextScoped({ orgId: ctx.orgId, accountId: body.accountId, limitEvidence: 8, limitClaims: 10, ctx })', 'getAccountMemoryPayload(body.accountId, body.account.name, ctx.orgId, ctx)', 'injectKnowledgeContextScoped(\n          ctx,\n          body.accountId,'],
  },
  {
    file: 'src/app/api/strategy/route.ts',
    patterns: ['requireAccountAccess(ctx, body.accountId)', 'loadCILAccountContextScoped({ orgId: ctx.orgId, accountId: body.accountId, limitEvidence: 8, limitClaims: 10, ctx })', 'injectKnowledgeContextScoped(ctx, body.accountId, queryHint, 5)'],
  },
  {
    file: 'src/app/api/ai-forecast/route.ts',
    patterns: ['requireOpportunityAccess(ctx, opportunityId)', ".eq('org_id', ctx.orgId)", 'injectKnowledgeContextScoped(\n          ctx,\n          String(opp.account_id),', 'loadCILAccountContextScoped({'],
  },
  {
    file: 'src/app/api/competitive-analysis/route.ts',
    patterns: ['requireOpportunityAccess(ctx, opportunityId)', ".eq('org_id', ctx.orgId)", 'injectKnowledgeContextScoped(\n          ctx,\n          String(opp.account_id),'],
  },
  {
    file: 'src/app/api/win-loss-analysis/route.ts',
    patterns: ['requireOpportunityAccess(ctx, opportunityId)', ".eq('org_id', ctx.orgId)", 'injectKnowledgeContextScoped(\n          ctx,\n          String(opp.account_id),'],
  },
  {
    file: 'src/app/api/agent/intelligence/signals/route.ts',
    patterns: ['requireAccountAccess(ctx, accountId)', 'visibleAccountIds', 'signals = signals.filter'],
  },
];

const failures = [];
for (const check of checks) {
  const source = readFileSync(check.file, 'utf8');
  for (const pattern of check.patterns) {
    if (!source.includes(pattern)) failures.push(`${check.file}: missing ${JSON.stringify(pattern)}`);
  }
}

function listTsFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) files.push(...listTsFiles(path));
    else if (path.endsWith('.ts') || path.endsWith('.tsx')) files.push(path);
  }
  return files;
}

const routeForbidden = [
  'searchKnowledgeUnsafeInternal',
  'injectKnowledgeContextUnsafeInternal',
  'loadEvidenceRecordsUnsafeInternal',
  'loadCILAccountContextUnsafeInternal',
];
for (const file of listTsFiles('src/app/api')) {
  const source = readFileSync(file, 'utf8');
  for (const forbidden of routeForbidden) {
    if (source.includes(forbidden)) failures.push(`${file}: route must not reference unsafe loader ${forbidden}`);
  }
}

const routeLegacy = [
  'searchKnowledge(',
  'injectKnowledgeContext(',
  'loadCILAccountContext(',
  'loadEvidenceRecords(',
];
for (const file of listTsFiles('src/app/api')) {
  const source = readFileSync(file, 'utf8');
  for (const legacy of routeLegacy) {
    if (source.includes(legacy)) failures.push(`${file}: route must use explicit Scoped API instead of ${legacy}`);
  }
}

if (failures.length) {
  console.error('Judgment scoping checks failed:\n' + failures.join('\n'));
  process.exit(1);
}

console.log('Judgment scoping checks passed.');
