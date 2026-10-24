import { describe, expect, it } from 'vitest';
import type { PortfolioJudgmentSignal } from '@/lib/judgment/portfolio-view';
import type { JudgmentInterventionItem } from './intervention';
import type { InterventionOutcomeItem } from './intervention-learning';
import { buildJudgmentPatternLibrary, matchSignalToPatterns } from './pattern-library';

function intervention(overrides: Partial<JudgmentInterventionItem> = {}): JudgmentInterventionItem {
  return {
    id: 'int_1',
    sourceRecordId: 'sr_int_1',
    orgId: 'org_1',
    accountId: 'acc_1',
    opportunityId: 'opp_1',
    type: 'manager_intervention',
    action: 'verify_evidence',
    status: 'completed',
    role: 'manager',
    reason: '证据不足，先补一手采购 owner 证据。',
    recommendedAction: '补一手采购 owner 证据。',
    evidenceRefs: [{ sourceKind: 'source_record', sourceId: 'sr_reason_1', sourceTable: 'source_records', sourceRowId: 'sr_reason_1' }],
    createdAt: '2026-05-01T12:00:00.000Z',
    ...overrides,
  };
}

function outcome(overrides: Partial<InterventionOutcomeItem> = {}): InterventionOutcomeItem {
  return {
    id: 'out_1',
    orgId: 'org_1',
    accountId: 'acc_1',
    opportunityId: 'opp_1',
    interventionId: 'int_1',
    sourceRecordId: 'sr_int_1',
    role: 'manager',
    reason: '证据不足，先补一手采购 owner 证据。',
    outcome: 'effective',
    impact: 'evidence_improved',
    confidence: 0.86,
    outcomeNote: 'AE 补回一手证据。',
    learningSummary: '先核验证据比直接升级更有效。',
    evidenceRefs: [{ sourceKind: 'source_record', sourceId: 'sr_outcome_1', sourceTable: 'source_records', sourceRowId: 'sr_outcome_1' }],
    createdAt: '2026-05-03T12:00:00.000Z',
    ...overrides,
  };
}

function signal(overrides: Partial<PortfolioJudgmentSignal> = {}): PortfolioJudgmentSignal {
  return {
    id: 'sig_1',
    kind: 'manager_verify',
    accountId: 'acc_signal',
    accountName: 'SignalCo',
    opportunityId: 'opp_signal',
    opportunityName: 'Expansion',
    reason: '证据不足，需要补一手采购 owner 证据再升级。',
    recommendedAction: 'Manager verify：先核验证据。',
    drilldownHref: '/accounts/acc_signal?tab=overview',
    evidenceHealth: 'thin',
    confidence: 0.45,
    tone: 'warning',
    rankScore: 42,
    tags: ['verify', 'evidence'],
    ...overrides,
  };
}

describe('buildJudgmentPatternLibrary', () => {
  it('extracts effective intervention patterns and caps single-sample confidence with caveat', () => {
    const patterns = buildJudgmentPatternLibrary({
      interventions: [intervention()],
      interventionOutcomes: [outcome()],
    });

    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toMatchObject({
      patternType: 'effective_intervention',
      sampleSize: 1,
      interventionIds: ['int_1'],
    });
    expect(patterns[0].confidence).toBeLessThanOrEqual(0.59);
    expect(patterns[0].caveat).toContain('仅单一账户样本');
    expect(patterns[0].summary).toContain('可复盘');
    expect(patterns[0].evidenceRefs.map((ref) => ref.sourceId)).toContain('sr_int_1');
  });

  it('groups repeat outcomes by action and sorts multi-sample patterns ahead of single samples', () => {
    const patterns = buildJudgmentPatternLibrary({
      interventions: [
        intervention({ id: 'int_1', action: 'verify_evidence', sourceRecordId: 'sr_int_1' }),
        intervention({ id: 'int_2', accountId: 'acc_2', action: 'verify_evidence', sourceRecordId: 'sr_int_2' }),
        intervention({ id: 'int_3', accountId: 'acc_3', action: 'coach_ae', sourceRecordId: 'sr_int_3' }),
      ],
      interventionOutcomes: [
        outcome({ id: 'out_1', accountId: 'acc_1', interventionId: 'int_1', sourceRecordId: 'sr_int_1', confidence: 0.7, createdAt: '2026-05-03T12:00:00.000Z' }),
        outcome({ id: 'out_2', accountId: 'acc_2', interventionId: 'int_2', sourceRecordId: 'sr_int_2', confidence: 0.8, createdAt: '2026-05-04T12:00:00.000Z' }),
        outcome({ id: 'out_3', accountId: 'acc_3', interventionId: 'int_3', sourceRecordId: 'sr_int_3', confidence: 0.95, createdAt: '2026-05-05T12:00:00.000Z' }),
      ],
    });

    expect(patterns[0]).toMatchObject({ sampleSize: 2, patternType: 'effective_intervention' });
    expect(patterns[0].accounts.map((account) => account.accountId).sort()).toEqual(['acc_1', 'acc_2']);
    expect(patterns[0].caveat).toContain('组织级 judgment memory');
  });

  it('classifies ineffective, worsened and inconclusive outcomes conservatively', () => {
    const patterns = buildJudgmentPatternLibrary({
      interventions: [intervention({ id: 'int_bad' }), intervention({ id: 'int_gap', action: 'request_review' })],
      interventionOutcomes: [
        outcome({ id: 'out_bad', interventionId: 'int_bad', outcome: 'effective', impact: 'worsened', confidence: 0.6, createdAt: '2026-05-04T12:00:00.000Z' }),
        outcome({ id: 'out_gap', interventionId: 'int_gap', outcome: 'inconclusive', impact: 'no_change', confidence: 0.4, createdAt: '2026-05-05T12:00:00.000Z' }),
      ],
    });

    expect(patterns.map((pattern) => pattern.patternType)).toContain('ineffective_intervention');
    expect(patterns.map((pattern) => pattern.patternType)).toContain('evidence_gap');
    expect(patterns.find((pattern) => pattern.patternType === 'evidence_gap')?.recommendedUse).toContain('补一手证据');
  });

  it('promotes stakeholder shifts and risk reversals into explicit pattern types', () => {
    const patterns = buildJudgmentPatternLibrary({
      interventions: [intervention({ id: 'int_stakeholder', action: 'assign_sponsor' }), intervention({ id: 'int_risk', action: 'intervene' })],
      interventionOutcomes: [
        outcome({ id: 'out_shift', interventionId: 'int_stakeholder', impact: 'stakeholder_shifted', confidence: 0.72 }),
        outcome({ id: 'out_risk', interventionId: 'int_risk', impact: 'risk_reduced', confidence: 0.77 }),
      ],
    });

    expect(patterns.map((pattern) => pattern.patternType)).toEqual(expect.arrayContaining(['stakeholder_shift', 'risk_reversal']));
  });
});

describe('matchSignalToPatterns', () => {
  it('matches portfolio signals to reusable judgment patterns without changing scoring', () => {
    const patterns = buildJudgmentPatternLibrary({
      interventions: [intervention()],
      interventionOutcomes: [outcome()],
    });

    const matches = matchSignalToPatterns(signal(), patterns);

    expect(matches).toHaveLength(1);
    expect(matches[0].score).toBeGreaterThanOrEqual(0.2);
    expect(matches[0].rationale).toContain('历史样本');
  });

  it('prefers evidence gap patterns for manager verify / missing evidence signals', () => {
    const patterns = buildJudgmentPatternLibrary({
      interventions: [intervention({ id: 'int_gap', action: 'request_review' })],
      interventionOutcomes: [outcome({ id: 'out_gap', interventionId: 'int_gap', outcome: 'inconclusive', impact: 'no_change', confidence: 0.4 })],
    });

    const matches = matchSignalToPatterns(signal({ evidenceHealth: 'missing' }), patterns);

    expect(matches[0].pattern.patternType).toBe('evidence_gap');
  });
});
