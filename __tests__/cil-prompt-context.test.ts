import { describe, it, expect } from 'vitest';
import {
  buildCILPromptBlocks,
  buildCILForDecode,
  buildCILForStrategy,
  CIL_PROMPT_CHAR_BUDGETS,
} from '@/lib/compiled-intelligence/prompt-context';
import { buildDecodePrompt } from '@/lib/babel-engine/decode';
import { buildStrategyPrompt } from '@/lib/babel-engine/strategy';
import type { CILAccountContext } from '@/lib/compiled-intelligence/context';
import type {
  AccountKnowledgePage,
  AccountClaim,
  AccountEvidence,
  AccountOpenQuestion,
} from '@/lib/babel-engine/types';

// ─── Helpers ────────────────────────────────────────────────────────

function makePage(overrides: Partial<AccountKnowledgePage> & { pageType: AccountKnowledgePage['pageType'] }): AccountKnowledgePage {
  return {
    id: 'page-1',
    orgId: 'org-1',
    accountId: 'acc-1',
    title: 'Test Page',
    contentJson: {},
    version: 1,
    updatedBy: 'system',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

function makeClaim(overrides?: Partial<AccountClaim>): AccountClaim {
  return {
    id: 'claim-1',
    orgId: 'org-1',
    accountId: 'acc-1',
    claimType: 'general',
    statement: '客户预算已批准',
    status: 'active',
    confidence: 0.85,
    supportingEvidenceIds: [],
    counterEvidenceIds: [],
    affectedObjectIds: [],
    lastRevalidatedAt: '2026-01-01',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

function makeEvidence(overrides?: Partial<AccountEvidence>): AccountEvidence {
  return {
    id: 'ev-1',
    orgId: 'org-1',
    accountId: 'acc-1',
    sourceId: 'src-1',
    sourceType: 'email',
    evidenceType: 'commitment',
    summary: '客户在邮件中确认了预算',
    occurredAt: '2026-03-15T00:00:00Z',
    relevanceScore: 0.9,
    linkedClaimIds: [],
    linkedPageTypes: [],
    metadata: {},
    createdAt: '2026-01-01',
    ...overrides,
  };
}

function makeQuestion(overrides?: Partial<AccountOpenQuestion>): AccountOpenQuestion {
  return {
    id: 'q-1',
    orgId: 'org-1',
    accountId: 'acc-1',
    question: '决策委员会何时召开？',
    priority: 'high',
    status: 'open',
    relatedObjects: [],
    blockingOutputs: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

function makeCtx(overrides?: Partial<CILAccountContext>): CILAccountContext {
  return {
    accountId: 'acc-1',
    orgId: 'org-1',
    claims: [],
    openQuestions: [],
    evidence: [],
    knowledgePages: [],
    ...overrides,
  };
}

// ─── null / undefined ctx ───────────────────────────────────────────

describe('buildCILPromptBlocks — null/undefined ctx', () => {
  it('returns empty blocks for null ctx', () => {
    const result = buildCILPromptBlocks(null);
    expect(result.combined).toBe('');
    expect(result.overview).toBe('');
    expect(result.claims).toBe('');
  });

  it('returns empty blocks for undefined ctx', () => {
    const result = buildCILPromptBlocks(undefined);
    expect(result.combined).toBe('');
  });
});

// ─── Empty arrays fallback ──────────────────────────────────────────

describe('buildCILPromptBlocks — empty arrays', () => {
  it('returns empty combined when all arrays are empty and no pages', () => {
    const result = buildCILPromptBlocks(makeCtx());
    expect(result.combined).toBe('');
    expect(result.claims).toBe('');
    expect(result.openQuestions).toBe('');
    expect(result.recentEvidence).toBe('');
  });

  it('returns empty claims when all claims are stale', () => {
    const ctx = makeCtx({
      claims: [makeClaim({ status: 'stale' }), makeClaim({ id: 'c2', status: 'archived' })],
    });
    const result = buildCILPromptBlocks(ctx);
    expect(result.claims).toBe('');
  });

  it('returns empty openQuestions when all questions are answered', () => {
    const ctx = makeCtx({
      openQuestions: [makeQuestion({ status: 'answered' }), makeQuestion({ id: 'q2', status: 'dismissed' })],
    });
    const result = buildCILPromptBlocks(ctx);
    expect(result.openQuestions).toBe('');
  });
});

// ─── Pages missing ──────────────────────────────────────────────────

describe('buildCILPromptBlocks — page missing', () => {
  it('overview missing → overview block is empty, combined still works with other data', () => {
    const ctx = makeCtx({ claims: [makeClaim()] });
    const result = buildCILPromptBlocks(ctx);
    expect(result.overview).toBe('');
    expect(result.claims).toContain('客户预算已批准');
    expect(result.combined).toContain('Claims');
  });

  it('page with empty contentJson and no contentMd → empty', () => {
    const ctx = makeCtx({
      knowledgePages: [makePage({ pageType: 'overview', contentJson: {}, contentMd: undefined })],
    });
    const result = buildCILPromptBlocks(ctx);
    expect(result.overview).toBe('');
  });

  it('page with contentMd takes priority over contentJson', () => {
    const ctx = makeCtx({
      knowledgePages: [makePage({ pageType: 'overview', contentMd: '# 概览内容', contentJson: { foo: 'bar' } })],
    });
    const result = buildCILPromptBlocks(ctx);
    expect(result.overview).toContain('概览内容');
    expect(result.overview).not.toContain('foo');
  });

  it('page with only contentJson falls back to JSON dump', () => {
    const ctx = makeCtx({
      knowledgePages: [makePage({ pageType: 'overview', contentJson: { summary: '测试' } })],
    });
    const result = buildCILPromptBlocks(ctx);
    expect(result.overview).toContain('测试');
  });
});

// ─── Decode format ──────────────────────────────────────────────────

describe('buildCILForDecode', () => {
  it('returns empty string for null ctx', () => {
    expect(buildCILForDecode(null)).toBe('');
  });

  it('includes overview + claims + openQuestions + recentEvidence', () => {
    const ctx = makeCtx({
      knowledgePages: [makePage({ pageType: 'overview', contentMd: '公司概况' })],
      claims: [makeClaim()],
      openQuestions: [makeQuestion()],
      evidence: [makeEvidence()],
    });
    const result = buildCILForDecode(ctx);
    expect(result).toContain('账户概览');
    expect(result).toContain('当前判断');
    expect(result).toContain('待解答问题');
    expect(result).toContain('近期证据');
    // Should NOT include strategy-only sections
    expect(result).not.toContain('风险分析');
    expect(result).not.toContain('干系人地图');
    expect(result).not.toContain('客户战略举措');
  });

  it('does not exceed max char limit', () => {
    // Generate a large overview page
    const longMd = '这是一段很长的内容。'.repeat(500);
    const ctx = makeCtx({
      knowledgePages: [makePage({ pageType: 'overview', contentMd: longMd })],
      claims: Array.from({ length: 20 }, (_, i) => makeClaim({ id: `c${i}`, statement: `判断 ${i} — ${'详细内容'.repeat(20)}` })),
      evidence: Array.from({ length: 20 }, (_, i) => makeEvidence({ id: `e${i}`, summary: `证据 ${i} — ${'详细描述'.repeat(20)}` })),
    });
    const result = buildCILForDecode(ctx);
    expect(result.length).toBeLessThanOrEqual(CIL_PROMPT_CHAR_BUDGETS.decode + 200); // 留少量余量给截断标记
  });
});

// ─── Strategy format ────────────────────────────────────────────────

describe('buildCILForStrategy', () => {
  it('returns empty string for null ctx', () => {
    expect(buildCILForStrategy(null)).toBe('');
  });

  it('includes all sections including risks / stakeholders / initiatives', () => {
    const ctx = makeCtx({
      knowledgePages: [
        makePage({ pageType: 'overview', contentMd: '公司概况' }),
        makePage({ id: 'p2', pageType: 'risks', contentMd: '高风险项目' }),
        makePage({ id: 'p3', pageType: 'stakeholders', contentMd: 'VP 张三' }),
        makePage({ id: 'p4', pageType: 'initiatives', contentMd: '数字化转型' }),
      ],
      claims: [makeClaim()],
    });
    const result = buildCILForStrategy(ctx);
    expect(result).toContain('风险分析');
    expect(result).toContain('干系人地图');
    expect(result).toContain('客户战略举措');
    expect(result).toContain('当前判断');
  });

  it('does not exceed strategy max char limit', () => {
    const longMd = '这是一段很长的内容。'.repeat(500);
    const ctx = makeCtx({
      knowledgePages: [
        makePage({ pageType: 'overview', contentMd: longMd }),
        makePage({ id: 'p2', pageType: 'risks', contentMd: longMd }),
        makePage({ id: 'p3', pageType: 'stakeholders', contentMd: longMd }),
        makePage({ id: 'p4', pageType: 'initiatives', contentMd: longMd }),
      ],
    });
    const result = buildCILForStrategy(ctx);
    expect(result.length).toBeLessThanOrEqual(CIL_PROMPT_CHAR_BUDGETS.strategy + 200);
  });
});

// ─── Section selection ──────────────────────────────────────────────

describe('buildCILPromptBlocks — section selection', () => {
  it('only includes requested sections', () => {
    const ctx = makeCtx({
      knowledgePages: [makePage({ pageType: 'overview', contentMd: '概览' })],
      claims: [makeClaim()],
      evidence: [makeEvidence()],
    });
    const result = buildCILPromptBlocks(ctx, { sections: ['claims'] });
    expect(result.claims).toContain('客户预算已批准');
    expect(result.overview).toBe('');
    expect(result.recentEvidence).toBe('');
  });
});

// ─── Claims top-10 cap ──────────────────────────────────────────────

describe('buildCILPromptBlocks — claims cap', () => {
  it('caps active claims at 10', () => {
    const claims = Array.from({ length: 15 }, (_, i) =>
      makeClaim({ id: `c${i}`, statement: `判断条目 ${i}` }),
    );
    const ctx = makeCtx({ claims });
    const result = buildCILPromptBlocks(ctx);
    // Count bullet lines
    const lines = result.claims.split('\n').filter((l) => l.startsWith('- '));
    expect(lines.length).toBe(10);
  });
});

// ─── Evidence truncation per item ───────────────────────────────────

describe('buildCILPromptBlocks — evidence text truncation', () => {
  it('truncates individual evidence summary to 120 chars', () => {
    const longSummary = '这是超长的证据摘要内容'.repeat(20); // ~220 chars
    const ctx = makeCtx({ evidence: [makeEvidence({ summary: longSummary })] });
    const result = buildCILPromptBlocks(ctx);
    // Each evidence line text is sliced to 120 chars
    const evidenceLine = result.recentEvidence.split('\n').find((l) => l.startsWith('- '));
    expect(evidenceLine).toBeDefined();
    // The full line includes prefix like "- [commitment] (2026-03-15) " + text
    // The text portion itself should be ≤ 120 chars
    expect(evidenceLine!.length).toBeLessThan(200);
  });
});

// ─── Decode / Strategy prompt integration ───────────────────────────

describe('CIL prompt integration — decode', () => {
  it('injects CIL without losing the main decode prompt structure', () => {
    const cilContext = buildCILForDecode(
      makeCtx({
        knowledgePages: [makePage({ pageType: 'overview', contentMd: '客户组织正在推进采购审批。' })],
        claims: [makeClaim({ statement: '预算已经锁定' })],
        openQuestions: [makeQuestion({ question: '最终签字人是谁？' })],
        evidence: [makeEvidence({ summary: '邮件里提到本周会给法务版本反馈。' })],
      }),
    );

    const prompt = buildDecodePrompt(
      {
        messages: [
          { speaker: 'them', text: 'Can you send the proposal today?' },
          { speaker: 'me', text: 'Yes, I will send it before 5pm.' },
        ],
        mode: 'strategic',
        domain: 'b2b_sales',
      },
      '历史上下文：对方上周已看过演示。',
      '文化上下文：偏直接沟通。',
      cilContext,
    );

    expect(prompt.system).toContain('=== 编译智能层（CIL）上下文 ===');
    expect(prompt.system).toContain('预算已经锁定');
    expect(prompt.system).toContain('## Output Schema');
    expect(prompt.system).toContain('## 输出语言');
    expect(prompt.user).toContain('Decode the following email thread');
    expect(prompt.user).toContain('[CLIENT]: Can you send the proposal today?');
    expect(prompt.user).toContain('[YOU]: Yes, I will send it before 5pm.');
  });

  it('truncates oversized decode CIL injection so the prompt does not grow without bound', () => {
    const cilContext = buildCILForDecode(
      makeCtx({
        knowledgePages: [makePage({ pageType: 'overview', contentMd: '超长概览'.repeat(4000) })],
        claims: Array.from({ length: 20 }, (_, i) => makeClaim({ id: `dc${i}`, statement: `判断 ${i} ${'细节'.repeat(100)}` })),
      }),
    );

    const prompt = buildDecodePrompt(
      {
        messages: [{ speaker: 'them', text: 'Following up on pricing.' }],
        mode: 'strategic',
        domain: 'b2b_sales',
      },
      undefined,
      undefined,
      cilContext,
    );

    expect(cilContext.length).toBeLessThanOrEqual(CIL_PROMPT_CHAR_BUDGETS.decode + 200);
    expect(cilContext).toContain('…（已截断）');
    expect(prompt.system).toContain('=== 编译智能层（CIL）上下文 ===');
    expect(prompt.system).toContain('## Output Schema');
  });
});

describe('CIL prompt integration — strategy', () => {
  const decodedEmail = {
    messages: [
      {
        speaker: 'them' as const,
        original: 'We need internal alignment before next step.',
        decode: {
          meaning: '还在内部协调',
          emotion: '谨慎',
          urgency: 6,
          confidence: 0.82,
        },
      },
    ],
    threadAnalysis: {
      sentimentTrend: 'stable' as const,
      riskLevel: 'medium' as const,
      buyerState: 'evaluating' as const,
      keySignal: '对方未拒绝，但仍需内推',
    },
  };

  it('injects CIL without losing the main strategy prompt structure', () => {
    const cilContext = buildCILForStrategy(
      makeCtx({
        knowledgePages: [
          makePage({ pageType: 'overview', contentMd: '客户今年重点是控制采购风险。' }),
          makePage({ id: 'risk-1', pageType: 'risks', contentMd: '法务审查周期偏长。' }),
          makePage({ id: 'stake-1', pageType: 'stakeholders', contentMd: 'CFO 对 ROI 最敏感。' }),
          makePage({ id: 'init-1', pageType: 'initiatives', contentMd: '正在推动销售自动化。' }),
        ],
        claims: [makeClaim({ statement: 'Champion 愿意继续推动' })],
      }),
    );

    const prompt = buildStrategyPrompt({
      decodedMessage: decodedEmail,
      cilContext,
    });

    expect(prompt.user).toContain('=== 编译智能层（CIL）上下文 ===');
    expect(prompt.user).toContain('Champion 愿意继续推动');
    expect(prompt.user).toContain('法务审查周期偏长');
    expect(prompt.system).toContain('Generate exactly 3 strategies');
    expect(prompt.system).toContain('## Language Rule');
    expect(prompt.user).toContain('Based on the following decoded email thread');
    expect(prompt.user).toContain('Thread Analysis:');
  });

  it('truncates oversized strategy CIL injection so the prompt remains bounded', () => {
    const longMd = '超长战略情报'.repeat(5000);
    const cilContext = buildCILForStrategy(
      makeCtx({
        knowledgePages: [
          makePage({ pageType: 'overview', contentMd: longMd }),
          makePage({ id: 'risk-2', pageType: 'risks', contentMd: longMd }),
          makePage({ id: 'stake-2', pageType: 'stakeholders', contentMd: longMd }),
          makePage({ id: 'init-2', pageType: 'initiatives', contentMd: longMd }),
        ],
      }),
    );

    const prompt = buildStrategyPrompt({
      decodedMessage: decodedEmail,
      cilContext,
    });

    expect(cilContext.length).toBeLessThanOrEqual(CIL_PROMPT_CHAR_BUDGETS.strategy + 200);
    expect(cilContext).toContain('…（已截断）');
    expect(prompt.user).toContain('=== 编译智能层（CIL）上下文 ===');
    expect(prompt.system).toContain('Generate exactly 3 strategies');
  });
});
