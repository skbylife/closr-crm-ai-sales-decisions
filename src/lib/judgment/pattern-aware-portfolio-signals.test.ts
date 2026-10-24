import { describe, expect, it } from 'vitest';
import type { JudgmentPattern } from '@/lib/judgment/pattern-library';
import type { PortfolioAccountInput, PortfolioJudgmentSignal, PortfolioJudgmentView, PortfolioOpportunityInput } from '@/lib/judgment/portfolio-view';
import { buildPatternAwarePortfolioSignals } from './pattern-aware-portfolio-signals';

function account(overrides: Partial<PortfolioAccountInput> = {}): PortfolioAccountInput {
  return {
    id: 'acc_1',
    name: 'Acme Corp',
    dealValue: 180_000,
    dealHealth: 'at_risk',
    lastActivity: '2026-05-01T12:00:00.000Z',
    ...overrides,
  };
}

function opportunity(overrides: Partial<PortfolioOpportunityInput> = {}): PortfolioOpportunityInput {
  return {
    id: 'opp_1',
    accountId: 'acc_1',
    name: 'Enterprise Expansion',
    value: 180_000,
    stage: 'negotiation',
    probability: 75,
    updatedAt: '2026-05-02T12:00:00.000Z',
    meddicc: {
      overallScore: 42,
      metrics: { status: 'partial', evidence: '' },
      economicBuyer: { status: 'unknown', accessLevel: null },
      decisionCriteria: [],
      decisionProcess: [],
      identifiedPain: [],
      champion: { strength: 2, notes: 'champion weak' },
    },
    mutualActionPlan: { confidence: 0.4, milestones: [{ status: 'at_risk', title: 'Legal review' }] },
    ...overrides,
  };
}

function pattern(overrides: Partial<JudgmentPattern> = {}): JudgmentPattern {
  return {
    id: 'judgment-pattern:risk-reversal',
    label: '风险反转 · 经理介入 · 核验证据',
    summary: '历史样本显示，先核验证据并重建 sponsor 路径后风险降低。',
    patternType: 'risk_reversal',
    confidence: 0.76,
    sampleSize: 3,
    evidenceRefs: [{ sourceKind: 'source_record', sourceId: 'sr_pattern_1', sourceTable: 'source_records', sourceRowId: 'sr_pattern_1' }],
    accounts: [{ accountId: 'old_acc_1', sampleCount: 2 }],
    interventionIds: ['int_1'],
    recommendedUse: '遇到同类风险时，先核验证据和 sponsor，再决定是否升级。',
    caveat: '基于 3 条介入结果 / 2 个账户；仍需上下文验证。',
    updatedAt: '2026-05-04T12:00:00.000Z',
    ...overrides,
  };
}

function signal(overrides: Partial<PortfolioJudgmentSignal> = {}): PortfolioJudgmentSignal {
  return {
    id: 'stuck:opp_1',
    kind: 'stuck_deal',
    accountId: 'acc_1',
    accountName: 'Acme Corp',
    opportunityId: 'opp_1',
    opportunityName: 'Enterprise Expansion',
    opportunityValue: 180_000,
    reason: 'MAP 有阻塞且 MEDDICC 偏低。',
    recommendedAction: 'Manager 先核验证据，再决定是否升级。',
    drilldownHref: '/accounts/acc_1?tab=overview',
    evidenceHealth: 'thin',
    confidence: 0.48,
    tone: 'warning',
    rankScore: 80,
    tags: ['stuck-deal', 'thin'],
    ...overrides,
  };
}

function view(signals: PortfolioJudgmentSignal[]): PortfolioJudgmentView {
  return {
    schemaVersion: 1,
    generatedFrom: 'portfolio_judgment_core',
    summary: {
      openAccounts: 1,
      openOpportunities: 1,
      stuckDeals: 1,
      executiveCandidates: 0,
      verifyBeforeEscalate: 1,
      evidenceThin: 1,
      ownershipGaps: 0,
      forecastContradictions: 0,
      falseActivityCount: 0,
    },
    managementQueue: [],
    manager: {
      stuckDeals: signals.filter((item) => item.kind === 'stuck_deal'),
      coachingCandidates: signals.filter((item) => item.kind === 'coaching_candidate'),
      verifyBeforeEscalate: signals.filter((item) => item.kind === 'manager_verify'),
      forecastContradictions: signals.filter((item) => item.kind === 'forecast_contradiction'),
      falseActivity: signals.filter((item) => item.kind === 'false_activity'),
      evidenceHealth: signals.filter((item) => item.kind === 'evidence_health'),
    },
    executive: {
      stuckDeals: [],
      coachingCandidates: [],
      verifyBeforeEscalate: signals.filter((item) => item.kind === 'manager_verify'),
      forecastContradictions: signals.filter((item) => item.kind === 'forecast_contradiction'),
      falseActivity: signals.filter((item) => item.kind === 'false_activity'),
      evidenceHealth: signals.filter((item) => item.kind === 'evidence_health'),
      resourceAllocationCandidates: signals.filter((item) => item.kind === 'executive_intervention'),
      executiveInterventionCandidates: signals.filter((item) => item.kind === 'executive_intervention'),
      nonInterventionCandidates: signals.filter((item) => item.kind === 'manager_verify'),
    },
  };
}

describe('buildPatternAwarePortfolioSignals', () => {
  it('matches historical recovery patterns to current stuck/risky deals', () => {
    const result = buildPatternAwarePortfolioSignals({
      accounts: [account()],
      opportunities: [opportunity()],
      patterns: [pattern()],
      portfolioJudgment: view([signal()]),
    });

    expect(result.summary.status).toBe('ready');
    expect(result.signals[0]).toMatchObject({
      signalType: 'successful_recovery_pattern',
      accountId: 'acc_1',
      patternId: 'judgment-pattern:risk-reversal',
      severity: 'focus',
    });
    expect(result.signals[0].whySimilar).toContain('历史模式');
    expect(result.signals[0].evidenceRefs.map((ref) => ref.sourceId)).toEqual(expect.arrayContaining(['sr_pattern_1', 'opp_1']));
  });

  it('matches evidence gap patterns only as caveated calibration signals', () => {
    const result = buildPatternAwarePortfolioSignals({
      accounts: [account()],
      opportunities: [opportunity({ meddicc: { overallScore: 18, metrics: { status: 'unknown', evidence: '' }, economicBuyer: { status: 'unknown' } } })],
      patterns: [pattern({
        id: 'judgment-pattern:evidence-gap',
        label: '证据缺口 · 请求复盘',
        summary: '历史样本显示证据不足时直接升级无结论。',
        patternType: 'evidence_gap',
        confidence: 0.5,
        sampleSize: 2,
        recommendedUse: '先补一手采购 owner 证据，再决定是否升级。',
        caveat: '证据缺口模式不代表介入无效。',
      })],
      portfolioJudgment: view([signal({ kind: 'manager_verify', id: 'verify:opp_1', evidenceHealth: 'missing' })]),
    });

    expect(result.signals[0]).toMatchObject({ signalType: 'evidence_gap_pattern', severity: 'warning' });
    expect(result.signals[0].recommendedAction).toContain('先补证据');
    expect(result.signals[0].caveat).toContain('不是自动结论');
  });

  it('matches ineffective history to overconfidence warnings', () => {
    const result = buildPatternAwarePortfolioSignals({
      accounts: [account({ dealHealth: 'healthy' })],
      opportunities: [opportunity({ probability: 85, meddicc: { overallScore: 38, economicBuyer: { status: 'unknown' } } })],
      patterns: [pattern({
        id: 'judgment-pattern:ineffective',
        label: '无效/噪音介入 · 高层介入',
        summary: '历史中，forecast 概率偏高但证据不足时，高层介入没有改善结果。',
        patternType: 'ineffective_intervention',
        confidence: 0.7,
        sampleSize: 2,
      })],
      portfolioJudgment: view([signal({ kind: 'forecast_contradiction', id: 'forecast:opp_1' })]),
    });

    expect(result.signals[0]).toMatchObject({ signalType: 'overconfidence_warning', severity: 'critical' });
    expect(result.signals[0].recommendedAction).toContain('降级校准预测');
  });

  it('matches effective intervention history to intervention opportunities', () => {
    const result = buildPatternAwarePortfolioSignals({
      accounts: [account()],
      opportunities: [opportunity()],
      patterns: [pattern({
        id: 'judgment-pattern:effective',
        label: '有效模式 · 经理介入 · 核验证据',
        summary: '经理先核验证据后 deal review 更聚焦。',
        patternType: 'effective_intervention',
        confidence: 0.72,
        sampleSize: 2,
      })],
      portfolioJudgment: view([signal({ kind: 'manager_verify', id: 'verify:opp_1' })]),
    });

    expect(result.signals[0]).toMatchObject({ signalType: 'intervention_opportunity' });
    expect(result.signals[0].whySimilar).toContain('当前组合信号');
  });

  it('downgrades single-sample patterns with an explicit caveat', () => {
    const result = buildPatternAwarePortfolioSignals({
      accounts: [account()],
      opportunities: [opportunity()],
      patterns: [pattern({ sampleSize: 1, confidence: 0.59, caveat: '仅单一账户样本；不是组织级规则。' })],
      portfolioJudgment: view([signal()]),
    });

    expect(result.signals[0].confidence).toBeLessThanOrEqual(0.52);
    expect(result.signals[0].caveat).toContain('仅单一历史样本');
  });

  it('returns gap metadata instead of fake signals when patterns are insufficient', () => {
    const result = buildPatternAwarePortfolioSignals({
      accounts: [account()],
      opportunities: [opportunity()],
      patterns: [],
      portfolioJudgment: view([signal()]),
    });

    expect(result.signals).toEqual([]);
    expect(result.summary).toMatchObject({ status: 'insufficient_patterns', eligiblePatterns: 0, emittedSignals: 0 });
    expect(result.summary.gapReason).toContain('暂无历史判断模式');
  });
});
