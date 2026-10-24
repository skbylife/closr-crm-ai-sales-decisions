import { describe, expect, it } from 'vitest';
import {
  buildInterventionOutcomeSourceRecord,
  buildJudgmentLearningSummary,
  normalizeInterventionOutcomeSourceRow,
  parseInterventionOutcome,
} from './intervention-learning';

describe('intervention outcome learning source records', () => {
  it('roundtrips intervention outcome through source_records metadata.interventionOutcome', () => {
    const parsed = parseInterventionOutcome({
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      interventionId: 'int_1',
      sourceRecordId: 'sr_intervention_1',
      role: 'manager',
      reason: '证据不足，先核验。',
      outcome: 'effective',
      impact: 'evidence_improved',
      confidence: 0.8,
      outcomeNote: 'AE 补回一手采购 owner 证据，风险判断更清楚。',
      learningSummary: '先核验证据比直接升级更有效。',
      evidenceRefs: [{ sourceKind: 'source_record', sourceId: 'sr_intervention_1', sourceTable: 'source_records', sourceRowId: 'sr_intervention_1' }],
    }, {
      id: 'out_1',
      accountId: 'acc_1',
      orgId: 'org_1',
      createdBy: 'user_1',
      createdAt: '2026-05-05T01:00:00.000Z',
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const row = buildInterventionOutcomeSourceRecord({ orgId: 'org_1', interventionOutcome: parsed.interventionOutcome });
    expect(row).toMatchObject({
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'intervention_outcome',
      source_table: 'source_records',
      source_row_id: 'out_1',
      title: '介入结果 · 有效',
    });
    expect(row.metadata.interventionOutcome).toMatchObject({ interventionId: 'int_1', sourceRecordId: 'sr_intervention_1', impact: 'evidence_improved' });

    const normalized = normalizeInterventionOutcomeSourceRow({ id: 'sr_out_1', created_at: row.occurred_at, ...row });
    expect(normalized).toMatchObject({
      id: 'out_1',
      orgId: 'org_1',
      accountId: 'acc_1',
      interventionId: 'int_1',
      sourceRecordId: 'sr_intervention_1',
      outcome: 'effective',
      impact: 'evidence_improved',
      confidence: 0.8,
      learningSummary: '先核验证据比直接升级更有效。',
      createdBy: 'user_1',
    });
  });

  it('builds judgment learning summary without treating outcomes as automatic truth', () => {
    const parsedEffective = parseInterventionOutcome({
      accountId: 'acc_1',
      interventionId: 'int_1',
      sourceRecordId: 'sr_intervention_1',
      outcome: 'delayed_effective',
      impact: 'deal_progressed',
      confidence: 0.7,
      outcomeNote: 'Sponsor call 两周后推动了下一步。',
    }, { id: 'out_1', accountId: 'acc_1', createdAt: '2026-05-05T02:00:00.000Z' });
    const parsedGap = parseInterventionOutcome({
      accountId: 'acc_1',
      interventionId: 'int_2',
      sourceRecordId: 'sr_intervention_2',
      outcome: 'inconclusive',
      impact: 'no_change',
      confidence: 0.4,
      outcomeNote: '客户没有后续反馈，还不能判断。',
    }, { id: 'out_2', accountId: 'acc_1', createdAt: '2026-05-05T01:00:00.000Z' });

    expect(parsedEffective.ok).toBe(true);
    expect(parsedGap.ok).toBe(true);
    if (!parsedEffective.ok || !parsedGap.ok) return;

    const summary = buildJudgmentLearningSummary({ interventionOutcomes: [parsedGap.interventionOutcome, parsedEffective.interventionOutcome] });

    expect(summary.effectivePatterns).toHaveLength(1);
    expect(summary.evidenceGaps).toHaveLength(1);
    expect(summary.recentLearnings.map((item) => item.id)).toEqual(['out_1', 'out_2']);
    expect(summary.calibrationNote).toContain('账户级校准证据');
  });
});
