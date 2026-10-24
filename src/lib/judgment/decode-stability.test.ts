import { describe, expect, it } from 'vitest';
import type { DecodeOutput } from '@/lib/babel-engine/types';
import {
  buildDecodeContextSnapshot,
  buildDecodeStabilityCorrectionCta,
  buildDecodeStabilityMetadata,
  buildDecodeStabilitySnapshotView,
  buildDecodeStabilityTimeline,
  buildStableDecodeJudgment,
  diffStableDecodeJudgment,
  normalizeDecodeStabilityMetadata,
  stableHash,
} from './decode-stability';

function sampleDecode(overrides: Partial<DecodeOutput> = {}): DecodeOutput {
  return {
    messages: [
      {
        speaker: 'them',
        original: '李总说他们再看看我们提交的方案，近期给回复。',
        decode: {
          meaning: '委婉拖延，还未承诺',
          emotion: '谨慎',
          urgency: 4,
          confidence: 0.72,
        },
      },
    ],
    threadAnalysis: {
      sentimentTrend: 'cooling',
      riskLevel: 'medium',
      buyerState: 'stalling',
      keySignal: '对方没有明确时间表，存在拖延风险',
    },
    actionItems: [
      {
        title: '两天后补充确认决策时间表',
        priority: 'medium',
        dueInDays: 2,
        reasoning: '需要把“近期”变成明确日期。',
      },
    ],
    ...overrides,
  };
}

const inputText = '李总说他们再看看我们提交的方案，近期给回复。';

describe('decode stability layer', () => {
  it('normalizes decode output into stable comparable judgment fields', () => {
    const judgment = buildStableDecodeJudgment(sampleDecode());

    expect(judgment).toMatchObject({
      schema_version: 'stable_decode_judgment_v1',
      intent: 'delay_or_stall',
      momentum_or_temperature: 'cooling',
      risk: 'medium',
      confidence: 0.72,
      recommended_next_action: '两天后补充确认决策时间表',
    });
    expect(judgment.evidence.map((item) => item.id)).toContain('input_message_1');
    expect(judgment.evidence.map((item) => item.id)).toContain('analysis_key_signal');
  });

  it('builds stable context fingerprints and changes when context changes', () => {
    const first = buildDecodeContextSnapshot({
      emailText: inputText,
      accountId: 'acc_1',
      contactId: 'contact_1',
      dealStage: 'Proposal',
      signalSource: 'email',
      analysisGoal: 'risk',
      cilContext: 'evidence: proposal sent last week',
      createdAt: '2026-05-04T00:00:00.000Z',
    });
    const repeated = buildDecodeContextSnapshot({
      emailText: `  ${inputText}\n`,
      accountId: 'acc_1',
      contactId: 'contact_1',
      dealStage: 'Proposal',
      signalSource: 'email',
      analysisGoal: 'risk',
      cilContext: 'evidence: proposal sent last week',
      createdAt: '2026-05-04T00:01:00.000Z',
    });
    const changed = buildDecodeContextSnapshot({
      emailText: inputText,
      accountId: 'acc_1',
      contactId: 'contact_1',
      dealStage: 'Negotiation',
      signalSource: 'email',
      analysisGoal: 'risk',
      cilContext: 'evidence: procurement asked for legal review',
      createdAt: '2026-05-04T00:02:00.000Z',
    });
    const changedInput = buildDecodeContextSnapshot({
      emailText: '李总明确说预算已经批了，本周可以推进合同。',
      accountId: 'acc_1',
      contactId: 'contact_1',
      dealStage: 'Proposal',
      signalSource: 'email',
      analysisGoal: 'risk',
      cilContext: 'evidence: proposal sent last week',
      createdAt: '2026-05-04T00:03:00.000Z',
    });

    expect(repeated.input_fingerprint).toBe(first.input_fingerprint);
    expect(repeated.context_fingerprint).toBe(first.context_fingerprint);
    expect(repeated.fingerprint).toBe(first.fingerprint);
    expect(changed.input_fingerprint).toBe(first.input_fingerprint);
    expect(changed.context_fingerprint).not.toBe(first.context_fingerprint);
    expect(changedInput.input_fingerprint).not.toBe(first.input_fingerprint);
    expect(changedInput.context_fingerprint).toBe(first.context_fingerprint);
    expect(changedInput.fingerprint).not.toBe(first.fingerprint);
  });

  it('uses stable non-reversible short SHA-256 fingerprints', () => {
    const first = stableHash({ b: '客户要求保密报价', a: ['risk', 2] });
    const repeated = stableHash({ a: ['risk', 2], b: '客户要求保密报价' });
    const different = stableHash({ b: '客户要求保密报价已更新', a: ['risk', 2] });

    expect(first).toBe(repeated);
    expect(first).toMatch(/^fp_[a-f0-9]{32}$/);
    expect(first).not.toContain('客户');
    expect(different).not.toBe(first);
  });

  it('shapes stability metadata for source record persistence and JSON roundtrip', () => {
    const contextSnapshot = buildDecodeContextSnapshot({
      emailText: inputText,
      accountId: 'acc_1',
      accountName: 'Acme',
      contactId: 'contact_1',
      contactName: '李总',
      dealStage: 'Proposal',
      cilContext: '上周已提交方案。',
      knowledgeContext: '采购通常需要法务复核。',
      createdAt: '2026-05-04T00:00:00.000Z',
    });
    const stableJudgment = buildStableDecodeJudgment(sampleDecode());
    const judgmentDiff = diffStableDecodeJudgment({
      current: stableJudgment,
      currentContext: contextSnapshot,
      previous: null,
    });

    const metadata = buildDecodeStabilityMetadata({ contextSnapshot, stableJudgment, judgmentDiff });
    const roundtripped = normalizeDecodeStabilityMetadata(JSON.parse(JSON.stringify(metadata)));

    expect(roundtripped?.summary.snapshotAvailable).toBe(true);
    expect(roundtripped?.summary.inputFingerprint).toBe(contextSnapshot.input_fingerprint);
    expect(roundtripped?.stableJudgment?.recommended_next_action).toBe('两天后补充确认决策时间表');
    expect(roundtripped?.judgmentDiff?.status).toBe('no_previous');
  });

  it('builds a concise UI snapshot view with context, evidence, versions, and change reasons', () => {
    const previousContext = buildDecodeContextSnapshot({ emailText: inputText, accountId: 'acc_1', dealStage: 'Proposal' });
    const currentContext = buildDecodeContextSnapshot({
      emailText: inputText,
      accountId: 'acc_1',
      accountName: 'Acme',
      contactId: 'contact_1',
      contactName: '李总',
      dealStage: 'Negotiation',
      cilContext: '采购要求进入法务复核。',
    });
    const previousJudgment = buildStableDecodeJudgment(sampleDecode());
    const currentJudgment = buildStableDecodeJudgment(sampleDecode({
      threadAnalysis: {
        sentimentTrend: 'warming',
        riskLevel: 'low',
        buyerState: 'ready_to_buy',
        keySignal: '对方已经进入成交准备',
      },
    }));
    const judgmentDiff = diffStableDecodeJudgment({
      current: currentJudgment,
      currentContext,
      previous: {
        id: 'decode_prev',
        decode: sampleDecode({ stableJudgment: previousJudgment, contextSnapshot: previousContext }),
        stableJudgment: previousJudgment,
        contextSnapshot: previousContext,
      },
    });

    const view = buildDecodeStabilitySnapshotView({
      contextSnapshot: currentContext,
      stableJudgment: currentJudgment,
      judgmentDiff,
    });

    expect(view.available).toBe(true);
    expect(view.statusLabel).toBe('依据已变化');
    expect(view.snapshotRows.map((row) => row.label)).toEqual(['输入指纹', '上下文版本', '快照版本']);
    expect(view.contextSummaries.some((row) => row.label === '联系人' && row.value === '李总')).toBe(true);
    expect(view.evidenceSummaries.length).toBeGreaterThan(0);
    expect(view.systemRows.map((row) => row.label)).toEqual(expect.arrayContaining(['提示版本', '判断结构', '模型层级']));
    expect(view.changeReasons.join('\n')).toContain('本次使用的客户、联系人、商机或知识库依据与上次不同。');
    expect(view.changeReasons.join('\n')).toContain('真实意图');
  });

  it('returns same_judgment for identical judgment and same context', () => {
    const context = buildDecodeContextSnapshot({ emailText: inputText, accountId: 'acc_1' });
    const judgment = buildStableDecodeJudgment(sampleDecode());

    const diff = diffStableDecodeJudgment({
      current: judgment,
      currentContext: context,
      previous: {
        id: 'decode_prev',
        decode: sampleDecode({ stableJudgment: judgment, contextSnapshot: context }),
        stableJudgment: judgment,
        contextSnapshot: context,
      },
    });

    expect(diff.status).toBe('same_judgment');
    expect(diff.judgment_changed).toBe(false);
    expect(diff.unstable).toBe(false);
  });

  it('marks same-context judgment changes as unstable', () => {
    const context = buildDecodeContextSnapshot({ emailText: inputText, accountId: 'acc_1' });
    const previousJudgment = buildStableDecodeJudgment(sampleDecode());
    const currentJudgment = buildStableDecodeJudgment(sampleDecode({
      threadAnalysis: {
        sentimentTrend: 'stable',
        riskLevel: 'high',
        buyerState: 'evaluating',
        keySignal: '对方还在评估，但风险升高',
      },
    }));

    const diff = diffStableDecodeJudgment({
      current: currentJudgment,
      currentContext: context,
      previous: {
        id: 'decode_prev',
        decode: sampleDecode({ stableJudgment: previousJudgment, contextSnapshot: context }),
        stableJudgment: previousJudgment,
        contextSnapshot: context,
      },
    });

    expect(diff.status).toBe('unstable_same_context');
    expect(diff.unstable).toBe(true);
    expect(diff.changed_fields.map((field) => field.field)).toEqual(expect.arrayContaining(['intent', 'risk']));
  });

  it('attributes changed judgment to changed context when fingerprint differs', () => {
    const previousContext = buildDecodeContextSnapshot({ emailText: inputText, accountId: 'acc_1', dealStage: 'Proposal' });
    const currentContext = buildDecodeContextSnapshot({ emailText: inputText, accountId: 'acc_1', dealStage: 'Negotiation' });
    const previousJudgment = buildStableDecodeJudgment(sampleDecode());
    const currentJudgment = buildStableDecodeJudgment(sampleDecode({
      threadAnalysis: {
        sentimentTrend: 'warming',
        riskLevel: 'low',
        buyerState: 'ready_to_buy',
        keySignal: '对方已经进入成交准备',
      },
    }));

    const diff = diffStableDecodeJudgment({
      current: currentJudgment,
      currentContext,
      previous: {
        id: 'decode_prev',
        decode: sampleDecode({ stableJudgment: previousJudgment, contextSnapshot: previousContext }),
        stableJudgment: previousJudgment,
        contextSnapshot: previousContext,
      },
    });

    expect(diff.status).toBe('changed_context');
    expect(diff.context_changed).toBe(true);
    expect(diff.unstable).toBe(false);
  });
});

describe('decode stability timeline and correction CTA', () => {
  it('aggregates recent account-level decode stability records', () => {
    const context = buildDecodeContextSnapshot({ emailText: inputText, accountId: 'acc_1' });
    const previousJudgment = buildStableDecodeJudgment(sampleDecode());
    const currentJudgment = buildStableDecodeJudgment(sampleDecode({
      threadAnalysis: {
        sentimentTrend: 'stable',
        riskLevel: 'high',
        buyerState: 'evaluating',
        keySignal: '对方还在评估，但风险升高',
      },
    }));
    const unstableDiff = diffStableDecodeJudgment({
      current: currentJudgment,
      currentContext: context,
      previous: {
        id: 'decode_prev',
        decode: sampleDecode({ stableJudgment: previousJudgment, contextSnapshot: context }),
        stableJudgment: previousJudgment,
        contextSnapshot: context,
      },
    });
    const unstableMetadata = buildDecodeStabilityMetadata({ contextSnapshot: context, stableJudgment: currentJudgment, judgmentDiff: unstableDiff });

    const sameMetadata = buildDecodeStabilityMetadata({
      contextSnapshot: context,
      stableJudgment: previousJudgment,
      judgmentDiff: diffStableDecodeJudgment({
        current: previousJudgment,
        currentContext: context,
        previous: {
          id: 'decode_prev_2',
          decode: sampleDecode({ stableJudgment: previousJudgment, contextSnapshot: context }),
          stableJudgment: previousJudgment,
          contextSnapshot: context,
        },
      }),
    });

    const timeline = buildDecodeStabilityTimeline({
      items: [
        {
          id: 'decode:dec_old',
          sourceRecordId: 'sr_old',
          sourceKind: 'decode',
          sourceId: 'dec_old',
          title: '旧 Decode',
          currentJudgment: '旧判断',
          confidence: 0.72,
          updatedAt: '2026-05-01T10:00:00.000Z',
          decodeStability: sameMetadata ?? undefined,
        },
        {
          id: 'decode:dec_new',
          sourceRecordId: 'sr_new',
          sourceKind: 'decode',
          sourceId: 'dec_new',
          title: '新 Decode',
          currentJudgment: '风险升高',
          confidence: 0.72,
          updatedAt: '2026-05-02T10:00:00.000Z',
          decodeStability: unstableMetadata ?? undefined,
        },
        {
          id: 'strategic_play:play_1',
          sourceRecordId: 'sr_play',
          sourceKind: 'strategic_play',
          sourceId: 'play_1',
          title: '谋局',
          currentJudgment: '非 Decode 不进入稳定性时间线',
          confidence: 0.8,
          updatedAt: '2026-05-03T10:00:00.000Z',
        },
      ],
    });

    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toMatchObject({ sourceId: 'dec_new', status: 'unstable', hasSnapshot: true });
    expect(timeline[0].changedFieldLabels).toEqual(expect.arrayContaining(['真实意图', '风险等级']));
    expect(timeline[0].correctionCta.visible).toBe(true);
    expect(timeline[1]).toMatchObject({ sourceId: 'dec_old', status: 'same' });
  });

  it('shows correction CTA for unstable same-context or low-confidence decode', () => {
    const context = buildDecodeContextSnapshot({ emailText: inputText, accountId: 'acc_1' });
    const lowConfidenceJudgment = buildStableDecodeJudgment(sampleDecode({
      messages: [{
        speaker: 'them',
        original: inputText,
        decode: { meaning: '信号含糊', emotion: '不明', urgency: 3, confidence: 0.52 },
      }],
    }));
    const metadata = buildDecodeStabilityMetadata({
      contextSnapshot: context,
      stableJudgment: lowConfidenceJudgment,
      judgmentDiff: diffStableDecodeJudgment({ current: lowConfidenceJudgment, currentContext: context, previous: null }),
    });

    const cta = buildDecodeStabilityCorrectionCta({
      saved: true,
      targetId: 'dec_low',
      metadata,
      confidence: lowConfidenceJudgment.confidence,
      currentJudgment: '信号含糊',
    });

    expect(cta).toMatchObject({ visible: true, targetType: 'decode', targetId: 'dec_low', buttonLabel: '补充背景' });
    expect(cta.helperText).toContain('判断校准依据');
  });

  it('does not show correction CTA for an unsaved decode even when stale ids exist', () => {
    const context = buildDecodeContextSnapshot({ emailText: inputText, accountId: 'acc_stale' });
    const lowConfidenceJudgment = buildStableDecodeJudgment(sampleDecode({
      messages: [{
        speaker: 'them',
        original: inputText,
        decode: { meaning: '信号含糊', emotion: '不明', urgency: 3, confidence: 0.52 },
      }],
    }));
    const metadata = buildDecodeStabilityMetadata({
      contextSnapshot: context,
      stableJudgment: lowConfidenceJudgment,
      judgmentDiff: diffStableDecodeJudgment({ current: lowConfidenceJudgment, currentContext: context, previous: null }),
    });

    const cta = buildDecodeStabilityCorrectionCta({
      saved: false,
      targetId: 'decode_stale',
      metadata,
      confidence: lowConfidenceJudgment.confidence,
      currentJudgment: '新解读尚未保存，不应绑定旧 Decode',
    });

    expect(cta.visible).toBe(false);
  });
});
