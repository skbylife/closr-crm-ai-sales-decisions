import { describe, expect, it } from 'vitest';
import type { DecodeOutput } from './types';
import { buildComposeSocialIntentSummary, buildDecodeSocialIntentSummary } from './social-intent';

function decode(overrides: Partial<DecodeOutput> = {}): DecodeOutput {
  return {
    messages: [{
      speaker: 'them',
      original: 'We need the final proposal by Friday or we may need to pause the process.',
      decode: { meaning: '对方在压截止时间并保留暂停选项。', emotion: '紧张', urgency: 8, confidence: 0.82 },
    }],
    threadAnalysis: {
      sentimentTrend: 'cooling',
      riskLevel: 'high',
      buyerState: 'stalling',
      keySignal: '对方将 deadline 和暂停流程绑定，说明内部风险升高。',
    },
    stableJudgment: {
      schema_version: 'stable_decode_judgment_v1',
      intent: 'delay_or_stall',
      momentum_or_temperature: 'cooling',
      risk: 'high',
      confidence: 0.72,
      evidence: [{ id: 'e1', source: 'input', summary: 'pause the process' }],
      uncertainty: [],
      recommended_next_action: '先确认暂停原因，再给最小下一步。',
    },
    ...overrides,
  };
}

describe('social intent summaries', () => {
  it('turns decode output into user-facing intent, tone risk, distance, pressure and subtext', () => {
    const summary = buildDecodeSocialIntentSummary({ decode: decode(), relationship: 'first formal conversation' });

    expect(summary.intent).toContain('拖慢节奏');
    expect(summary.toneRisk.level).toBe('high');
    expect(summary.relationshipDistance.level).toBe('high');
    expect(summary.pressure.level).toBe('high');
    expect(summary.subtext).toContain('deadline');
    expect(summary.suggestedAdjustment).toContain('低压力');
    expect(`${summary.intent} ${summary.subtext} ${summary.suggestedAdjustment}`).not.toMatch(/social-intent|stableJudgment|schema/i);
  });

  it('analyzes compose drafts locally without another model call', () => {
    const summary = buildComposeSocialIntentSummary({
      body: '王总您好，想确认我们是否可以本周内定下试点时间。如果现在不方便，也可以告诉我更合适的窗口。',
      emailGoal: '约定试点会议',
      emailType: 'follow_up',
      contactTitle: 'VP Procurement',
      sendingAdvice: '语气保持礼貌，给对方选择权。',
    });

    expect(summary.intent).toContain('约定试点会议');
    expect(summary.relationshipDistance.label).toContain('关系距离');
    expect(summary.pressure.level).toBe('medium');
    expect(summary.suggestedAdjustment).toContain('退路');
  });
});
