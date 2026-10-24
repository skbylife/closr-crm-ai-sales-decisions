import { describe, expect, it } from 'vitest';
import { buildInterventionSourceRecord, normalizeInterventionSourceRow, parseJudgmentIntervention } from './intervention';

describe('judgment intervention source records', () => {
  it('roundtrips manager intervention through source_records metadata.intervention', () => {
    const parsed = parseJudgmentIntervention({
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      signalId: 'verify:opp_1',
      type: 'manager_intervention',
      action: 'verify_evidence',
      status: 'completed',
      role: 'manager',
      reason: '证据不足，不能直接升级。',
      recommendedAction: '先核实采购 owner 和预算口径。',
      outcomeNote: '已让 AE 明天补一手客户证据。',
      evidenceRefs: [{ sourceKind: 'source_record', sourceId: 'opp_1', sourceTable: 'opportunities', sourceRowId: 'opp_1' }],
    }, {
      id: 'int_1',
      accountId: 'acc_1',
      orgId: 'org_1',
      createdBy: 'user_1',
      createdAt: '2026-05-04T20:00:00.000Z',
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const row = buildInterventionSourceRecord({ orgId: 'org_1', intervention: parsed.intervention });
    expect(row).toMatchObject({
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'manager_intervention',
      source_table: 'opportunities',
      source_row_id: 'opp_1',
      title: '经理介入 · 核验证据',
    });
    expect(row.metadata.intervention).toMatchObject({ id: 'int_1', action: 'verify_evidence', status: 'completed' });

    const normalized = normalizeInterventionSourceRow({ id: 'sr_1', created_at: row.occurred_at, ...row });
    expect(normalized).toMatchObject({
      id: 'int_1',
      orgId: 'org_1',
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      signalId: 'verify:opp_1',
      type: 'manager_intervention',
      action: 'verify_evidence',
      outcomeNote: '已让 AE 明天补一手客户证据。',
      createdBy: 'user_1',
    });
    expect(normalized?.evidenceRefs).toHaveLength(1);
  });

  it('rejects forged account ids and invalid actions', () => {
    expect(parseJudgmentIntervention({
      accountId: 'other_acc',
      type: 'manager_intervention',
      action: 'verify_evidence',
      reason: 'reason',
      recommendedAction: 'action',
    }, { id: 'int_1', accountId: 'acc_1' })).toMatchObject({ ok: false });

    expect(parseJudgmentIntervention({
      accountId: 'acc_1',
      type: 'manager_intervention',
      action: 'bad_action',
      reason: 'reason',
      recommendedAction: 'action',
    }, { id: 'int_1', accountId: 'acc_1' })).toMatchObject({ ok: false, error: 'intervention action 无效' });
  });
});
