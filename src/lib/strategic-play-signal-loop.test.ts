import { describe, expect, it } from 'vitest';

import type { PlayAssumption } from '@/lib/babel-engine/types';
import { buildSignalLoopAssumption, hasSignalLoopAssumption } from '@/lib/strategic-play-signal-loop';

describe('strategic play signal loop helpers', () => {
  it('builds a pending assumption that preserves the source signal and next move', () => {
    const assumption = buildSignalLoopAssumption({
      id: 'assumption_1',
      now: '2026-05-12T10:00:00.000Z',
      sourceKind: 'decode',
      sourceId: 'decode_1',
      signalStatement: '采购说预算要重新审批',
      affectedJudgment: '关键假设「本周可确认预算」',
      evidence: '预算窗口不确定',
      question: '预算重审是否会改变本周推进节奏？',
      nextMove: '先确认审批人和新时间线',
    });

    expect(assumption).toMatchObject({
      id: 'assumption_1',
      status: 'pending',
      text: '待验证：预算重审是否会改变本周推进节奏？',
      createdAt: '2026-05-12T10:00:00.000Z',
      updatedAt: '2026-05-12T10:00:00.000Z',
    });
    expect(assumption.evidence).toContain('Decode 解读「采购说预算要重新审批」');
    expect(assumption.impact).toContain('来源 decode:decode_1');
    expect(assumption.impact).toContain('先确认审批人和新时间线');
  });

  it('detects duplicate signal questions by normalized text or source reference', () => {
    const assumptions: PlayAssumption[] = [
      {
        id: 'existing_text',
        text: '待验证：预算重审是否会改变本周推进节奏？',
        status: 'pending',
        createdAt: '2026-05-12T10:00:00.000Z',
      },
      {
        id: 'existing_source',
        text: '待验证：采购审批是否真的卡住？',
        status: 'pending',
        evidence: 'RFP 判断「评分表强调合规」；证据：法务门槛上升',
        impact: '来源 rfp_analysis:rfp_ai_1 已提示可能影响「当前打法」。下一步：补合规证据',
        createdAt: '2026-05-12T10:01:00.000Z',
      },
    ];

    expect(hasSignalLoopAssumption({
      assumptions,
      sourceKind: 'decode',
      sourceId: 'different_decode',
      question: '预算重审是否会改变本周推进节奏？',
    })).toBe(true);

    expect(hasSignalLoopAssumption({
      assumptions,
      sourceKind: 'rfp_analysis',
      sourceId: 'rfp_ai_1',
      question: '另一条待验证问题',
    })).toBe(true);

    expect(hasSignalLoopAssumption({
      assumptions,
      sourceKind: 'decode',
      sourceId: 'decode_new',
      question: '冠军是否仍愿意推进内部评审？',
    })).toBe(false);
  });
});
