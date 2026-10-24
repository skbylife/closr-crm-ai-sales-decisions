import { describe, it, expect } from 'vitest';
import {
  lintStaleClaims,
  lintContradictions,
  lintUnsupportedClaims,
  lintOrphanEvidence,
  lintCriticalGaps,
  buildRefreshTargets,
  computeHealthScore,
  type CILLintFinding,
} from '@/lib/compiled-intelligence/lint';
import {
  buildClaimExplainability,
  computeEvidenceCoverage,
  computeKnowledgeFreshness,
  buildAccountHealthReport,
} from '@/lib/compiled-intelligence/explain';
import type {
  AccountClaim,
  AccountEvidence,
  AccountKnowledgePage,
  AccountOpenQuestion,
} from '@/lib/babel-engine/types';
import type { CILAccountContext } from '@/lib/compiled-intelligence/context';

// ─── Test fixtures ──────────────────────────────────────────────────

const NOW = '2026-04-05T12:00:00Z';
const DAYS_AGO = (n: number) =>
  new Date(new Date(NOW).getTime() - n * 86400000).toISOString();

function makeClaim(overrides: Partial<AccountClaim> & { id: string }): AccountClaim {
  return {
    orgId: 'org1',
    accountId: 'acc1',
    claimType: 'general',
    statement: '测试 claim',
    status: 'active',
    confidence: 0.7,
    supportingEvidenceIds: ['ev1'],
    counterEvidenceIds: [],
    affectedObjectIds: [],
    lastRevalidatedAt: DAYS_AGO(1),
    createdAt: DAYS_AGO(30),
    updatedAt: DAYS_AGO(1),
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<AccountEvidence> & { id: string }): AccountEvidence {
  return {
    orgId: 'org1',
    accountId: 'acc1',
    sourceId: 'src1',
    sourceType: 'call_transcript',
    evidenceType: 'general',
    relevanceScore: 0.8,
    linkedClaimIds: [],
    linkedPageTypes: [],
    metadata: {},
    createdAt: DAYS_AGO(5),
    ...overrides,
  };
}

function makePage(overrides: Partial<AccountKnowledgePage> & { id: string }): AccountKnowledgePage {
  return {
    orgId: 'org1',
    accountId: 'acc1',
    pageType: 'overview',
    title: '账户总览',
    contentJson: {},
    version: 1,
    updatedBy: 'ai',
    createdAt: DAYS_AGO(30),
    updatedAt: DAYS_AGO(1),
    ...overrides,
  };
}

function makeQuestion(overrides: Partial<AccountOpenQuestion> & { id: string }): AccountOpenQuestion {
  return {
    orgId: 'org1',
    accountId: 'acc1',
    question: '谁拥有预算审批权？',
    priority: 'medium',
    status: 'open',
    relatedObjects: [],
    blockingOutputs: [],
    createdAt: DAYS_AGO(10),
    updatedAt: DAYS_AGO(10),
    ...overrides,
  };
}

// ─── lintStaleClaims ────────────────────────────────────────────────

describe('lintStaleClaims', () => {
  it('does not flag fresh claims', () => {
    const claims = [makeClaim({ id: 'c1', lastRevalidatedAt: DAYS_AGO(5) })];
    expect(lintStaleClaims(claims, NOW)).toHaveLength(0);
  });

  it('flags claims older than CLAIM_STALE_DAYS as review/warning', () => {
    const claims = [
      makeClaim({ id: 'c1', lastRevalidatedAt: DAYS_AGO(15), confidence: 0.8 }),
    ];
    const findings = lintStaleClaims(claims, NOW);
    expect(findings).toHaveLength(1);
    expect(findings[0].checkType).toBe('stale');
    expect(findings[0].severity).toBe('warning'); // high confidence = warning
  });

  it('flags claims older than 2x CLAIM_STALE_DAYS as critical', () => {
    const claims = [
      makeClaim({ id: 'c1', lastRevalidatedAt: DAYS_AGO(30), confidence: 0.5 }),
    ];
    const findings = lintStaleClaims(claims, NOW);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
  });

  it('skips archived/invalidated claims', () => {
    const claims = [
      makeClaim({ id: 'c1', status: 'archived', lastRevalidatedAt: DAYS_AGO(30) }),
    ];
    expect(lintStaleClaims(claims, NOW)).toHaveLength(0);
  });

  it('sorts by severity (critical first)', () => {
    const claims = [
      makeClaim({ id: 'c1', lastRevalidatedAt: DAYS_AGO(15), confidence: 0.5 }),
      makeClaim({ id: 'c2', lastRevalidatedAt: DAYS_AGO(30), confidence: 0.5 }),
    ];
    const findings = lintStaleClaims(claims, NOW);
    expect(findings[0].severity).toBe('critical');
    expect(findings[1].severity).toBe('review');
  });
});

// ─── lintContradictions ─────────────────────────────────────────────

describe('lintContradictions', () => {
  it('returns empty for non-conflicting claims', () => {
    const claims = [
      makeClaim({ id: 'c1', claimType: 'stakeholder_assessment', statement: 'VP Sales 是 champion，推动力强' }),
      makeClaim({ id: 'c2', claimType: 'stakeholder_assessment', statement: 'CTO 是技术评估者，态度积极' }),
    ];
    expect(lintContradictions(claims)).toHaveLength(0);
  });

  it('detects contradiction when same-type claims conflict', () => {
    const claims = [
      makeClaim({
        id: 'c1',
        claimType: 'stakeholder_assessment',
        statement: 'VP Sales 是 champion 推动者，态度积极支持项目',
        confidence: 0.8,
      }),
      makeClaim({
        id: 'c2',
        claimType: 'stakeholder_assessment',
        statement: 'VP Sales 不是 champion 推动者，态度存疑需复核',
        confidence: 0.6,
      }),
    ];
    const findings = lintContradictions(claims);
    expect(findings).toHaveLength(1);
    expect(findings[0].checkType).toBe('contradiction');
    expect(findings[0].relatedIds).toContain('c2');
  });

  it('does not compare claims of different types', () => {
    const claims = [
      makeClaim({
        id: 'c1',
        claimType: 'risk_hypothesis',
        statement: '采购流程不会阻塞推进',
      }),
      makeClaim({
        id: 'c2',
        claimType: 'budget_signal',
        statement: '采购流程阻塞推进存在风险',
      }),
    ];
    // Different types — should not detect contradiction
    expect(lintContradictions(claims)).toHaveLength(0);
  });

  it('skips archived claims', () => {
    const claims = [
      makeClaim({
        id: 'c1',
        claimType: 'general',
        statement: '项目推进顺利',
        status: 'archived',
      }),
      makeClaim({
        id: 'c2',
        claimType: 'general',
        statement: '项目推进不顺利存在阻塞',
      }),
    ];
    expect(lintContradictions(claims)).toHaveLength(0);
  });
});

// ─── lintUnsupportedClaims ──────────────────────────────────────────

describe('lintUnsupportedClaims', () => {
  it('does not flag claims with supporting evidence', () => {
    const claims = [
      makeClaim({ id: 'c1', supportingEvidenceIds: ['ev1'] }),
    ];
    expect(lintUnsupportedClaims(claims)).toHaveLength(0);
  });

  it('flags active claims with no supporting evidence', () => {
    const claims = [
      makeClaim({ id: 'c1', supportingEvidenceIds: [], confidence: 0.8 }),
    ];
    const findings = lintUnsupportedClaims(claims);
    expect(findings).toHaveLength(1);
    expect(findings[0].checkType).toBe('unsupported');
    expect(findings[0].severity).toBe('warning'); // high confidence = warning
  });

  it('flags low-confidence unsupported as review', () => {
    const claims = [
      makeClaim({ id: 'c1', supportingEvidenceIds: [], confidence: 0.4 }),
    ];
    const findings = lintUnsupportedClaims(claims);
    expect(findings[0].severity).toBe('review');
  });

  it('skips non-active claims', () => {
    const claims = [
      makeClaim({ id: 'c1', status: 'stale', supportingEvidenceIds: [] }),
    ];
    expect(lintUnsupportedClaims(claims)).toHaveLength(0);
  });
});

// ─── lintOrphanEvidence ─────────────────────────────────────────────

describe('lintOrphanEvidence', () => {
  it('does not flag evidence linked by claims', () => {
    const evidence = [makeEvidence({ id: 'ev1', linkedClaimIds: [] })];
    const claims = [makeClaim({ id: 'c1', supportingEvidenceIds: ['ev1'] })];
    expect(lintOrphanEvidence(evidence, claims)).toHaveLength(0);
  });

  it('does not flag evidence with linkedClaimIds set', () => {
    const evidence = [makeEvidence({ id: 'ev1', linkedClaimIds: ['c1'] })];
    const claims: AccountClaim[] = [];
    expect(lintOrphanEvidence(evidence, claims)).toHaveLength(0);
  });

  it('flags high-relevance unlinked evidence', () => {
    const evidence = [
      makeEvidence({ id: 'ev1', relevanceScore: 0.8, linkedClaimIds: [], summary: '关键采购信号' }),
    ];
    const claims: AccountClaim[] = [];
    const findings = lintOrphanEvidence(evidence, claims);
    expect(findings).toHaveLength(1);
    expect(findings[0].checkType).toBe('orphan_evidence');
  });

  it('skips low-relevance unlinked evidence', () => {
    const evidence = [
      makeEvidence({ id: 'ev1', relevanceScore: 0.3, linkedClaimIds: [] }),
    ];
    expect(lintOrphanEvidence(evidence, [])).toHaveLength(0);
  });
});

// ─── lintCriticalGaps ───────────────────────────────────────────────

describe('lintCriticalGaps', () => {
  it('flags missing expected page types', () => {
    const pages = [makePage({ id: 'p1', pageType: 'overview' })];
    const findings = lintCriticalGaps(pages, [], []);
    const gapFindings = findings.filter(
      (f) => f.checkType === 'critical_gap' && f.targetType === 'page',
    );
    // Should flag: stakeholders, risks, timeline, open_questions
    expect(gapFindings.length).toBe(4);
    const titles = gapFindings.map((f) => f.title);
    expect(titles).toContain('缺少知识页面：stakeholders');
    expect(titles).toContain('缺少知识页面：risks');
  });

  it('does not flag when all expected pages exist', () => {
    const pages = [
      makePage({ id: 'p1', pageType: 'overview' }),
      makePage({ id: 'p2', pageType: 'stakeholders' }),
      makePage({ id: 'p3', pageType: 'risks' }),
      makePage({ id: 'p4', pageType: 'timeline' }),
      makePage({ id: 'p5', pageType: 'open_questions' }),
    ];
    const findings = lintCriticalGaps(pages, [], []);
    const pageGaps = findings.filter((f) => f.targetType === 'page');
    expect(pageGaps).toHaveLength(0);
  });

  it('flags high-priority open questions blocking outputs', () => {
    const questions = [
      makeQuestion({
        id: 'q1',
        priority: 'high',
        blockingOutputs: ['forecast', 'close_plan'],
      }),
    ];
    const findings = lintCriticalGaps([], [], questions);
    const qFindings = findings.filter((f) => f.targetId === 'q1');
    expect(qFindings).toHaveLength(1);
    expect(qFindings[0].severity).toBe('warning');
    expect(qFindings[0].description).toContain('forecast');
  });

  it('does not flag low-priority open questions', () => {
    const questions = [
      makeQuestion({ id: 'q1', priority: 'low', blockingOutputs: ['forecast'] }),
    ];
    const findings = lintCriticalGaps([], [], questions);
    const qFindings = findings.filter((f) => f.targetId === 'q1');
    expect(qFindings).toHaveLength(0);
  });

  it('flags when all claims are non-active', () => {
    const claims = [
      makeClaim({ id: 'c1', status: 'stale' }),
      makeClaim({ id: 'c2', status: 'archived' }),
    ];
    const findings = lintCriticalGaps([], claims, []);
    const noActiveFindings = findings.filter(
      (f) => f.title === '所有 claims 均非 active 状态',
    );
    expect(noActiveFindings).toHaveLength(1);
  });
});

// ─── buildRefreshTargets ────────────────────────────────────────────

describe('buildRefreshTargets', () => {
  it('returns empty for fresh claims and pages', () => {
    const claims = [makeClaim({ id: 'c1', lastRevalidatedAt: DAYS_AGO(5) })];
    const pages = [makePage({ id: 'p1', updatedAt: DAYS_AGO(5) })];
    expect(buildRefreshTargets(claims, pages, NOW)).toHaveLength(0);
  });

  it('includes stale claims as refresh targets', () => {
    const claims = [
      makeClaim({ id: 'c1', lastRevalidatedAt: DAYS_AGO(20), statement: 'VP 是 champion' }),
    ];
    const targets = buildRefreshTargets(claims, [], NOW);
    expect(targets).toHaveLength(1);
    expect(targets[0].targetType).toBe('claim');
    expect(targets[0].staleDays).toBe(20);
  });

  it('includes stale pages (30+ days) as refresh targets', () => {
    const pages = [makePage({ id: 'p1', updatedAt: DAYS_AGO(35) })];
    const targets = buildRefreshTargets([], pages, NOW);
    expect(targets).toHaveLength(1);
    expect(targets[0].targetType).toBe('page');
    expect(targets[0].staleDays).toBe(35);
  });

  it('sorts by priority (high first)', () => {
    const claims = [
      makeClaim({ id: 'c1', lastRevalidatedAt: DAYS_AGO(15), confidence: 0.5 }),
      makeClaim({ id: 'c2', lastRevalidatedAt: DAYS_AGO(30), confidence: 0.8, claimType: 'risk_hypothesis' }),
    ];
    const targets = buildRefreshTargets(claims, [], NOW);
    expect(targets[0].priority).toBe('high');
  });
});

// ─── computeHealthScore ─────────────────────────────────────────────

describe('computeHealthScore', () => {
  it('returns 100 for no findings', () => {
    expect(computeHealthScore([])).toBe(100);
  });

  it('deducts by severity', () => {
    const findings: CILLintFinding[] = [
      { checkType: 'stale', severity: 'critical', targetType: 'claim', title: '', description: '' },
      { checkType: 'unsupported', severity: 'warning', targetType: 'claim', title: '', description: '' },
    ];
    // 100 - 15 (critical) - 8 (warning) = 77
    expect(computeHealthScore(findings)).toBe(77);
  });

  it('floors at 0', () => {
    const findings: CILLintFinding[] = Array(10).fill({
      checkType: 'stale',
      severity: 'critical',
      targetType: 'claim',
      title: '',
      description: '',
    });
    expect(computeHealthScore(findings)).toBe(0);
  });
});

// ─── buildClaimExplainability ───────────────────────────────────────

describe('buildClaimExplainability', () => {
  it('links supporting and counter evidence', () => {
    const claim = makeClaim({
      id: 'c1',
      supportingEvidenceIds: ['ev1', 'ev2'],
      counterEvidenceIds: ['ev3'],
      affectedObjectIds: ['overview'],
    });
    const evidence = [
      makeEvidence({ id: 'ev1', summary: '积极信号' }),
      makeEvidence({ id: 'ev2', summary: '另一积极信号' }),
      makeEvidence({ id: 'ev3', summary: '反对信号' }),
      makeEvidence({ id: 'ev4', summary: '无关' }),
    ];
    const pages = [makePage({ id: 'p1', pageType: 'overview' })];

    const result = buildClaimExplainability(claim, evidence, pages, NOW);
    expect(result.supportingEvidence).toHaveLength(2);
    expect(result.counterEvidence).toHaveLength(1);
    expect(result.affectedPages).toHaveLength(1);
    expect(result.isStale).toBe(false);
  });

  it('detects staleness for old claims', () => {
    const claim = makeClaim({
      id: 'c1',
      lastRevalidatedAt: DAYS_AGO(20),
    });
    const result = buildClaimExplainability(claim, [], [], NOW);
    expect(result.isStale).toBe(true);
    expect(result.staleDays).toBe(20);
    expect(result.refreshSuggestion).toContain('复核');
  });

  it('suggests refresh for unsupported claims', () => {
    const claim = makeClaim({
      id: 'c1',
      supportingEvidenceIds: [],
      lastRevalidatedAt: DAYS_AGO(1),
    });
    const result = buildClaimExplainability(claim, [], [], NOW);
    expect(result.refreshSuggestion).toContain('缺少支持性 evidence');
  });

  it('suggests refresh when counter >= supporting', () => {
    const claim = makeClaim({
      id: 'c1',
      supportingEvidenceIds: ['ev1'],
      counterEvidenceIds: ['ev2', 'ev3'],
      lastRevalidatedAt: DAYS_AGO(1),
    });
    const evidence = [
      makeEvidence({ id: 'ev1' }),
      makeEvidence({ id: 'ev2' }),
      makeEvidence({ id: 'ev3' }),
    ];
    const result = buildClaimExplainability(claim, evidence, [], NOW);
    expect(result.refreshSuggestion).toContain('反对 evidence');
  });
});

// ─── computeEvidenceCoverage ────────────────────────────────────────

describe('computeEvidenceCoverage', () => {
  it('counts linked and orphaned evidence', () => {
    const evidence = [
      makeEvidence({ id: 'ev1', linkedClaimIds: ['c1'] }),
      makeEvidence({ id: 'ev2' }),
      makeEvidence({ id: 'ev3' }),
    ];
    const claims = [
      makeClaim({ id: 'c1', supportingEvidenceIds: ['ev3'] }),
    ];
    const result = computeEvidenceCoverage(evidence, claims);
    expect(result.total).toBe(3);
    expect(result.linked).toBe(2); // ev1 (has linkedClaimIds), ev3 (referenced by claim)
    expect(result.orphaned).toBe(1); // ev2
  });

  it('ignores archived claims for reference counting', () => {
    const evidence = [makeEvidence({ id: 'ev1' })];
    const claims = [
      makeClaim({ id: 'c1', status: 'archived', supportingEvidenceIds: ['ev1'] }),
    ];
    const result = computeEvidenceCoverage(evidence, claims);
    expect(result.orphaned).toBe(1);
  });
});

// ─── computeKnowledgeFreshness ──────────────────────────────────────

describe('computeKnowledgeFreshness', () => {
  it('separates fresh and stale pages', () => {
    const pages = [
      makePage({ id: 'p1', updatedAt: DAYS_AGO(5) }),
      makePage({ id: 'p2', updatedAt: DAYS_AGO(35) }),
    ];
    const result = computeKnowledgeFreshness(pages, NOW);
    expect(result.freshPages).toBe(1);
    expect(result.stalePages).toBe(1);
  });

  it('reports missing page types', () => {
    const pages = [makePage({ id: 'p1', pageType: 'overview' })];
    const result = computeKnowledgeFreshness(pages, NOW);
    expect(result.missingPageTypes).toContain('stakeholders');
    expect(result.missingPageTypes).toContain('risks');
    expect(result.missingPageTypes).not.toContain('overview');
  });
});

// ─── buildAccountHealthReport ───────────────────────────────────────

describe('buildAccountHealthReport', () => {
  it('produces a complete report with all sections', () => {
    const ctx: CILAccountContext = {
      accountId: 'acc1',
      orgId: 'org1',
      claims: [
        makeClaim({ id: 'c1', status: 'active', supportingEvidenceIds: ['ev1'] }),
        makeClaim({ id: 'c2', status: 'stale', supportingEvidenceIds: [] }),
      ],
      evidence: [
        makeEvidence({ id: 'ev1', linkedClaimIds: ['c1'] }),
        makeEvidence({ id: 'ev2', relevanceScore: 0.9 }),
      ],
      knowledgePages: [
        makePage({ id: 'p1', pageType: 'overview' }),
      ],
      openQuestions: [
        makeQuestion({ id: 'q1', priority: 'high', blockingOutputs: ['forecast'] }),
      ],
    };

    const report = buildAccountHealthReport(ctx, NOW);

    expect(report.accountId).toBe('acc1');
    expect(report.healthScore).toBeLessThanOrEqual(100);
    expect(report.healthScore).toBeGreaterThan(0);
    expect(report.claimDistribution.active).toBe(1);
    expect(report.claimDistribution.stale).toBe(1);
    expect(report.claimDistribution.total).toBe(2);
    expect(report.evidenceCoverage.total).toBe(2);
    expect(report.evidenceCoverage.linked).toBe(1);
    expect(report.knowledgeFreshness.missingPageTypes.length).toBeGreaterThan(0);
    expect(report.lintFindings.length).toBeGreaterThan(0);
    expect(report.summary).toContain('健康分');
  });

  it('returns perfect health for ideal account', () => {
    const ctx: CILAccountContext = {
      accountId: 'acc1',
      orgId: 'org1',
      claims: [
        makeClaim({ id: 'c1', status: 'active', supportingEvidenceIds: ['ev1'], lastRevalidatedAt: DAYS_AGO(1) }),
      ],
      evidence: [
        makeEvidence({ id: 'ev1', linkedClaimIds: ['c1'] }),
      ],
      knowledgePages: [
        makePage({ id: 'p1', pageType: 'overview', updatedAt: DAYS_AGO(1) }),
        makePage({ id: 'p2', pageType: 'stakeholders', updatedAt: DAYS_AGO(1) }),
        makePage({ id: 'p3', pageType: 'risks', updatedAt: DAYS_AGO(1) }),
        makePage({ id: 'p4', pageType: 'timeline', updatedAt: DAYS_AGO(1) }),
        makePage({ id: 'p5', pageType: 'open_questions', updatedAt: DAYS_AGO(1) }),
      ],
      openQuestions: [],
    };

    const report = buildAccountHealthReport(ctx, NOW);
    expect(report.healthScore).toBe(100);
    expect(report.lintFindings).toHaveLength(0);
    expect(report.refreshTargets).toHaveLength(0);
  });
});

// ─── Integration: lint route mode=comprehensive ─────────────────────

describe('cil-lint route: comprehensive mode types', () => {
  it('CILComprehensiveLintResult type contract matches expected shape', () => {
    // This test verifies that lint.ts exports produce the expected result shape
    // by running the pure functions that runComprehensiveLint orchestrates
    const claims = [
      makeClaim({ id: 'c1', lastRevalidatedAt: DAYS_AGO(30), supportingEvidenceIds: [] }),
    ];
    const evidence = [makeEvidence({ id: 'ev1', relevanceScore: 0.9 })];
    const pages: AccountKnowledgePage[] = [];
    const questions: AccountOpenQuestion[] = [];

    const staleFindings = lintStaleClaims(claims, NOW);
    const contradictionFindings = lintContradictions(claims);
    const unsupportedFindings = lintUnsupportedClaims(claims);
    const orphanFindings = lintOrphanEvidence(evidence, claims);
    const gapFindings = lintCriticalGaps(pages, claims, questions);

    const allFindings = [
      ...staleFindings,
      ...contradictionFindings,
      ...unsupportedFindings,
      ...orphanFindings,
      ...gapFindings,
    ];

    const healthScore = computeHealthScore(allFindings);
    const refreshTargets = buildRefreshTargets(claims, pages, NOW);

    // Verify shape
    expect(typeof healthScore).toBe('number');
    expect(healthScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(allFindings)).toBe(true);
    expect(Array.isArray(refreshTargets)).toBe(true);

    // Verify we got findings from multiple check types
    const checkTypes = new Set(allFindings.map((f) => f.checkType));
    expect(checkTypes.has('stale')).toBe(true);
    expect(checkTypes.has('unsupported')).toBe(true);
    expect(checkTypes.has('orphan_evidence')).toBe(true);
    expect(checkTypes.has('critical_gap')).toBe(true);

    // Verify refresh targets include the stale claim
    expect(refreshTargets.some((t) => t.targetId === 'c1')).toBe(true);
  });
});
