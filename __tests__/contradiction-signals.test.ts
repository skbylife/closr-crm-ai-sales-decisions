import { describe, expect, it } from 'vitest';
import { buildAccountVerificationSignals } from '@/lib/judgment/contradiction-signals';
import type { AccountMemoryConflict, AccountTimelineItem } from '@/lib/babel-engine/types';
import type { JudgmentMemorySourceItem } from '@/lib/judgment/memory-sources';

const timelineItems: AccountTimelineItem[] = [
  {
    id: 'email_decode:decode_1:0',
    accountId: 'acc_1',
    sourceId: 'decode_1',
    sourceKind: 'email_decode',
    title: 'CFO 预算邮件',
    summary: 'CFO 表示预算可推进。',
    occurredAt: '2026-04-27T10:00:00.000Z',
    signal: 'positive',
  },
  {
    id: 'activity_log:activity_1:1',
    accountId: 'acc_1',
    sourceId: 'activity_1',
    sourceKind: 'activity_log',
    title: '采购压价记录',
    summary: '采购要求用竞品低价重新评估。',
    occurredAt: '2026-04-28T10:00:00.000Z',
    signal: 'risk',
  },
  {
    id: 'integration_email:email_2:2',
    accountId: 'acc_1',
    sourceId: 'email_2',
    sourceKind: 'integration_email',
    title: '法务审查延迟',
    summary: '法务需要额外两周审查合同。',
    occurredAt: '2026-04-29T10:00:00.000Z',
    signal: 'risk',
  },
];

const judgmentMemories: JudgmentMemorySourceItem[] = [
  {
    id: 'rfp_analysis:analysis_1',
    sourceRecordId: 'source_record_1',
    sourceKind: 'rfp_analysis',
    sourceId: 'analysis_1',
    sourceTable: 'rfp_ai_analyses',
    sourceRowId: 'analysis_1',
    title: 'RFP 判断',
    currentJudgment: '建议谨慎投标。',
    risk: '竞对报价未知。',
    nextAction: '补充 ROI 证明。',
    confidence: 0.42,
    uncertainty: '缺少竞对最终报价。',
    provisional: true,
    evidenceRefs: [{ sourceId: 'decode_1', sourceKind: 'email_decode', title: 'CFO 预算邮件' }],
    updatedAt: '2026-04-29T12:00:00.000Z',
  },
];

describe('buildAccountVerificationSignals', () => {
  it('prioritizes unresolved conflicts and hydrates their source refs', () => {
    const conflicts: AccountMemoryConflict[] = [
      {
        id: 'conflict-budget-acc_1',
        accountId: 'acc_1',
        summary: '预算 / 采购信号出现矛盾。',
        status: 'open',
        sourceIds: ['decode_1', 'activity_1'],
        detectedAt: '2026-04-29T13:00:00.000Z',
        kind: 'budget_contradiction',
        severity: 'high',
      },
    ];

    const signals = buildAccountVerificationSignals({ conflicts, judgmentMemories, timelineItems, limit: 5 });

    expect(signals[0]).toMatchObject({
      id: 'conflict:conflict-budget-acc_1',
      kind: 'conflict',
      typeLabel: '预算矛盾',
      severity: 'high',
      conflictId: 'conflict-budget-acc_1',
    });
    expect(signals[0].sourceRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'decode_1', sourceKind: 'email_decode', title: 'CFO 预算邮件' }),
      expect.objectContaining({ sourceId: 'activity_1', sourceKind: 'activity_log', title: '采购压价记录' }),
    ]));
    expect(signals[0].suggestedAction).toContain('预算状态');
  });

  it('adds risk signals and judgment uncertainty without duplicating conflict sources', () => {
    const conflicts: AccountMemoryConflict[] = [
      {
        id: 'conflict-budget-acc_1',
        accountId: 'acc_1',
        summary: '预算 / 采购信号出现矛盾。',
        status: 'open',
        sourceIds: ['activity_1'],
        detectedAt: '2026-04-29T13:00:00.000Z',
        kind: 'budget_contradiction',
        severity: 'high',
      },
    ];

    const signals = buildAccountVerificationSignals({ conflicts, judgmentMemories, timelineItems, limit: 5 });

    expect(signals.some((signal) => signal.id === 'risk:activity_log:activity_1:1')).toBe(false);
    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'risk:integration_email:email_2:2', kind: 'risk_signal', typeLabel: '风险信号' }),
      expect.objectContaining({ id: 'judgment:rfp_analysis:analysis_1', kind: 'judgment_uncertainty', typeLabel: '判断待验证' }),
    ]));
  });

  it('respects the display limit', () => {
    const signals = buildAccountVerificationSignals({
      conflicts: [],
      judgmentMemories,
      timelineItems,
      limit: 1,
    });

    expect(signals).toHaveLength(1);
    expect(signals[0].kind).toBe('risk_signal');
  });
});
