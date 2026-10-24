import { describe, expect, it } from 'vitest';
import { buildAccountTimelineInterpretationItems } from '@/lib/judgment/account-timeline-interpretation';
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
    summary: '',
    occurredAt: '2026-04-28T10:00:00.000Z',
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
    confidence: 42,
    uncertainty: '缺少竞对最终报价。',
    provisional: true,
    evidenceRefs: [{ sourceId: 'decode_1', sourceKind: 'email_decode', title: 'CFO 预算邮件' }],
    updatedAt: '2026-04-29T12:00:00.000Z',
  },
];

const conflicts: AccountMemoryConflict[] = [
  {
    id: 'conflict-budget-acc_1',
    accountId: 'acc_1',
    summary: '预算和采购信号出现矛盾。',
    status: 'open',
    sourceIds: ['decode_1', 'activity_1'],
    detectedAt: '2026-04-29T13:00:00.000Z',
    kind: 'budget_contradiction',
    severity: 'high',
  },
];

describe('buildAccountTimelineInterpretationItems', () => {
  it('sorts unified interpretation items by latest occurrence', () => {
    const items = buildAccountTimelineInterpretationItems({ timelineItems, judgmentMemories, conflicts, limit: 5 });

    expect(items.map((item) => item.id)).toEqual([
      'conflict:conflict-budget-acc_1',
      'judgment:rfp_analysis:analysis_1',
      'timeline:activity_log:activity_1:1',
      'timeline:email_decode:decode_1:0',
    ]);
  });

  it('normalizes source labels and source evidence refs', () => {
    const items = buildAccountTimelineInterpretationItems({ timelineItems, judgmentMemories, conflicts, limit: 5 });
    const judgment = items.find((item) => item.id === 'judgment:rfp_analysis:analysis_1');
    const conflict = items.find((item) => item.id === 'conflict:conflict-budget-acc_1');

    expect(judgment).toMatchObject({ sourceLabel: 'RFP 判断', sourceKind: 'rfp_analysis', confidence: 0.42 });
    expect(judgment?.evidenceRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'source_record_1', sourceKind: 'source_record', sourceRowId: 'analysis_1' }),
      expect.objectContaining({ sourceId: 'decode_1', sourceKind: 'email_decode' }),
    ]));
    expect(conflict?.evidenceRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'decode_1', sourceKind: 'email_decode' }),
      expect.objectContaining({ sourceId: 'activity_1', sourceKind: 'activity_log' }),
    ]));
  });

  it('uses summary fallbacks for sparse timeline events', () => {
    const items = buildAccountTimelineInterpretationItems({ timelineItems, judgmentMemories: [], conflicts: [], limit: 5 });
    const riskEvent = items.find((item) => item.id === 'timeline:activity_log:activity_1:1');

    expect(riskEvent?.interpretationSummary).toBe('采购压价记录 已进入账户记录，需要结合当前判断复核。');
    expect(riskEvent?.riskImpact).toBe(riskEvent?.interpretationSummary);
  });

  it('respects the display limit', () => {
    const items = buildAccountTimelineInterpretationItems({ timelineItems, judgmentMemories, conflicts, limit: 2 });

    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('conflict:conflict-budget-acc_1');
  });

  it('marks conflict and uncertainty signals without mutating source inputs', () => {
    const items = buildAccountTimelineInterpretationItems({ timelineItems, judgmentMemories, conflicts, limit: 5 });

    expect(items.find((item) => item.id === 'conflict:conflict-budget-acc_1')).toMatchObject({ hasConflictSignal: true });
    expect(items.find((item) => item.id === 'timeline:activity_log:activity_1:1')).toMatchObject({ hasConflictSignal: true });
    expect(items.find((item) => item.id === 'judgment:rfp_analysis:analysis_1')).toMatchObject({ hasUncertaintySignal: true });
    expect(judgmentMemories[0].confidence).toBe(42);
  });

  it('handles empty inputs safely', () => {
    expect(buildAccountTimelineInterpretationItems({ timelineItems: [], judgmentMemories: [], conflicts: [], limit: 5 })).toEqual([]);
  });
});
