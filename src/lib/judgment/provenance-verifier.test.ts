import { describe, expect, it } from 'vitest';
import { verifyJudgmentProvenance, type ProvenanceSourceRecordRow } from './provenance-verifier';

const account = { id: 'acc_1', key: 'demo', name: 'Demo Account' };

function sourceRecord(overrides: Partial<ProvenanceSourceRecordRow> = {}): ProvenanceSourceRecordRow {
  const sourceKind = overrides.metadata?.sourceKind ?? 'decode';
  const sourceId = overrides.source_row_id ?? 'decode_1';
  return {
    id: 'sr_1',
    account_id: 'acc_1',
    org_id: 'org_1',
    source_kind: 'email_decode',
    source_table: 'email_decodes',
    source_row_id: 'decode_1',
    metadata: {
      sourceKind,
      judgmentMemory: {
        sourceKind,
        sourceId,
        accountId: 'acc_1',
        currentJudgment: 'CFO 愿意推进，但要先看 ROI 证据。',
        risk: '法务与采购可能继续压价。',
        nextAction: '发送 CFO 版 ROI 摘要。',
        evidenceRefs: [{ sourceId, sourceKind: 'email_decode', sourceTable: 'email_decodes', sourceRowId: sourceId }],
      },
      evidenceRefs: [{ sourceId, sourceKind: 'email_decode', sourceTable: 'email_decodes', sourceRowId: sourceId }],
    },
    ...overrides,
  };
}

const baseRows = {
  emailDecodes: [{ id: 'decode_1', account_id: 'acc_1', org_id: 'org_1' }],
  strategicPlays: [{ id: 'play_1', account_id: 'acc_1', org_id: 'org_1' }],
  rfps: [{ id: 'rfp_1', account_id: 'acc_1', org_id: 'org_1' }],
  rfpAnalyses: [{ id: 'analysis_1', rfp_id: 'rfp_1', org_id: 'org_1' }],
};

function verify(sourceRecords: ProvenanceSourceRecordRow[], rows = baseRows) {
  return verifyJudgmentProvenance({
    orgId: 'org_1',
    accounts: [account],
    sourceRecords,
    ...rows,
  });
}

describe('verifyJudgmentProvenance', () => {
  it('passes when every required judgment source has persisted provenance', () => {
    const result = verify([
      sourceRecord(),
      sourceRecord({
        id: 'sr_play_1',
        source_kind: 'strategic_play',
        source_table: 'strategic_plays',
        source_row_id: 'play_1',
        metadata: {
          sourceKind: 'strategic_play',
          judgmentMemory: {
            sourceKind: 'strategic_play',
            sourceId: 'play_1',
            accountId: 'acc_1',
            currentJudgment: '先通过 CFO ROI 口径验证推进路径。',
            risk: '关键假设仍未被客户确认。',
            nextAction: '执行第一步谋局动作。',
            evidenceRefs: [{ sourceId: 'play_1', sourceKind: 'strategic_play', sourceTable: 'strategic_plays', sourceRowId: 'play_1' }],
          },
          evidenceRefs: [{ sourceId: 'play_1', sourceKind: 'strategic_play', sourceTable: 'strategic_plays', sourceRowId: 'play_1' }],
        },
      }),
      sourceRecord({
        id: 'sr_rfp_1',
        source_kind: 'source_record',
        source_table: 'rfp_ai_analyses',
        source_row_id: 'analysis_1',
        metadata: {
          sourceKind: 'rfp_analysis',
          judgmentMemory: {
            sourceKind: 'rfp_analysis',
            sourceId: 'analysis_1',
            accountId: 'acc_1',
            currentJudgment: '建议谨慎投标。',
            risk: '评分规则与竞对报价不透明。',
            nextAction: '补齐采购标准和竞对位置。',
            evidenceRefs: [{ sourceId: 'analysis_1', sourceKind: 'source_record', sourceTable: 'rfp_ai_analyses', sourceRowId: 'analysis_1' }],
          },
          evidenceRefs: [{ sourceId: 'analysis_1', sourceKind: 'source_record', sourceTable: 'rfp_ai_analyses', sourceRowId: 'analysis_1' }],
        },
      }),
    ]);

    expect(result.status).toBe('pass');
    expect(result.accounts[0].persistedKinds).toEqual(expect.arrayContaining(['decode', 'strategic_play', 'rfp_analysis']));
    expect(result.totals).toMatchObject({ failed: 0, persisted: 3, derived: 0, invalid: 0 });
  });

  it('fails missing source_records and marks runtime-only rows as derived, not ready', () => {
    const result = verify([]);

    expect(result.status).toBe('fail');
    expect(result.accounts[0]).toMatchObject({ status: 'fail', traceStatus: 'derived' });
    expect(result.accounts[0].traces.map((trace) => trace.traceStatus)).toEqual(['derived', 'derived', 'derived']);
    expect(result.accounts[0].issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['source_records_missing', 'judgment_source_missing']));
  });

  it('fails persisted provenance when judgment evidenceRefs are missing', () => {
    const result = verify([
      sourceRecord({
        metadata: {
          sourceKind: 'decode',
          judgmentMemory: {
            sourceKind: 'decode',
            sourceId: 'decode_1',
            accountId: 'acc_1',
            currentJudgment: 'CFO 愿意推进。',
            risk: '仍需确认 ROI 口径。',
            nextAction: '发送 ROI 摘要。',
            evidenceRefs: [],
          },
        },
      }),
    ], {
      ...baseRows,
      strategicPlays: [],
      rfps: [],
      rfpAnalyses: [],
    });

    expect(result.status).toBe('fail');
    expect(result.accounts[0].traces[0]).toMatchObject({ sourceKind: 'decode', traceStatus: 'invalid' });
    expect(result.accounts[0].issues.map((issue) => issue.code)).toContain('evidence_refs_missing');
  });

  it('fails cross org/account source pointers instead of trusting source_row_id alone', () => {
    const result = verify([
      sourceRecord(),
    ], {
      ...baseRows,
      emailDecodes: [
        { id: 'decode_expected', account_id: 'acc_1', org_id: 'org_1' },
        { id: 'decode_1', account_id: 'acc_2', org_id: 'org_2' },
      ],
      strategicPlays: [],
      rfps: [],
      rfpAnalyses: [],
    });

    expect(result.status).toBe('fail');
    expect(result.accounts[0].traces[0]).toMatchObject({ sourceKind: 'decode', traceStatus: 'invalid' });
    expect(result.accounts[0].issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'source_row_org_mismatch',
      'source_row_account_mismatch',
    ]));
  });

  it('fails partial source_id coverage even when the same account/sourceKind has one valid persisted row', () => {
    const result = verify([
      sourceRecord(),
    ], {
      ...baseRows,
      emailDecodes: [
        { id: 'decode_1', account_id: 'acc_1', org_id: 'org_1' },
        { id: 'decode_2', account_id: 'acc_1', org_id: 'org_1' },
      ],
      strategicPlays: [],
      rfps: [],
      rfpAnalyses: [],
    });

    expect(result.status).toBe('fail');
    expect(result.accounts[0].traces).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceKind: 'decode', sourceRowId: 'decode_1', traceStatus: 'persisted' }),
      expect.objectContaining({ sourceKind: 'decode', sourceRowId: 'decode_2', traceStatus: 'derived' }),
    ]));
    expect(result.accounts[0].issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'judgment_source_missing', expectedSourceRowId: 'decode_2' }),
    ]));
  });

  it('fails when judgmentMemory/evidenceRefs point to a different source or account than the source_record', () => {
    const result = verify([
      sourceRecord({
        metadata: {
          sourceKind: 'decode',
          judgmentMemory: {
            sourceKind: 'decode',
            sourceId: 'decode_2',
            accountId: 'acc_2',
            currentJudgment: 'CFO 愿意推进。',
            risk: '仍需确认 ROI 口径。',
            nextAction: '发送 ROI 摘要。',
            evidenceRefs: [{ sourceId: 'decode_2', sourceKind: 'email_decode', sourceTable: 'email_decodes', sourceRowId: 'decode_2' }],
          },
          evidenceRefs: [{ sourceId: 'decode_2', sourceKind: 'email_decode', sourceTable: 'email_decodes', sourceRowId: 'decode_2' }],
        },
      }),
    ], {
      ...baseRows,
      emailDecodes: [
        { id: 'decode_1', account_id: 'acc_1', org_id: 'org_1' },
        { id: 'decode_2', account_id: 'acc_2', org_id: 'org_1' },
      ],
      strategicPlays: [],
      rfps: [],
      rfpAnalyses: [],
    });

    expect(result.status).toBe('fail');
    expect(result.accounts[0].traces[0]).toMatchObject({ sourceKind: 'decode', traceStatus: 'invalid' });
    expect(result.accounts[0].issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'judgment_memory_pointer_mismatch',
      'evidence_ref_pointer_mismatch',
    ]));
  });

});
