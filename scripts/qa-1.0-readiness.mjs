#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const checks = [
  {
    label: 'AI CIL analysis changes by organization scope',
    file: 'src/lib/evidence-memory/ai-analysis.ts',
    patterns: [
      'function assertAnalysisAccountScope(ctx: UserContext | undefined, accountId: string, orgId: string)',
      'if (ctx.orgId !== orgId)',
      "throw new ApiError(403, '组织上下文不匹配，无法加载 AI 分析上下文')",
      'await assertAnalysisAccountScope(ctx, accountId, orgId)',
      ".eq('org_id', orgId)",
      ".eq('account_id', accountId)",
    ],
  },
  {
    label: 'AI analysis route passes caller organization scope',
    file: 'src/app/api/accounts/[id]/analyze/route.ts',
    patterns: [
      'await requireAccountAccess(ctx, id)',
      ".eq('org_id', ctx.orgId)",
      'orgId: ctx.orgId',
      'ctx,',
    ],
  },
  {
    label: 'AI CIL analysis organization scope regression test',
    file: '__tests__/ai-analysis.persistence.test.ts',
    patterns: [
      'rejects request-scoped analysis when orgId does not match the caller organization',
      "orgId: 'org_other'",
      "orgId: 'org_1'",
      'expect(loadEvidenceRecordsMock).not.toHaveBeenCalled()',
      'expect(from).not.toHaveBeenCalled()',
    ],
  },
];

const failures = [];

for (const check of checks) {
  const source = readFileSync(check.file, 'utf8');
  for (const pattern of check.patterns) {
    if (!source.includes(pattern)) {
      failures.push(check.label + ': ' + check.file + ' missing ' + JSON.stringify(pattern));
    }
  }
}

if (failures.length > 0) {
  console.error('1.0 readiness QA failed:');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}

console.log('1.0 readiness QA passed.');
