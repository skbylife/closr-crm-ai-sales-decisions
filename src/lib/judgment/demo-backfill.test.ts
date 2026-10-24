import { describe, expect, it } from 'vitest';
import type { DecodeOutput } from '@/lib/babel-engine/types';
import { buildDecodeContextSnapshot, buildDecodeStabilityMetadata, buildStableDecodeJudgment, diffStableDecodeJudgment } from './decode-stability';
import { buildDecodeStabilityBackfillCandidate } from './demo-backfill';

function decodeOutput(): DecodeOutput {
  return {
    messages: [{
      speaker: 'them',
      original: '客户说需要再和采购确认，月底前回复。',
      decode: { meaning: '采购路径仍未确认', emotion: '谨慎', urgency: 5, confidence: 0.68 },
    }],
    threadAnalysis: {
      sentimentTrend: 'cooling',
      riskLevel: 'medium',
      buyerState: 'stalling',
      keySignal: '采购确认可能造成推进延迟',
    },
    actionItems: [{ title: '确认采购负责人和时间表', priority: 'medium', dueInDays: 2, reasoning: '需要把月底前回复落到责任人与日期。' }],
  };
}

describe('demo judgment memory backfill decode stability dry-run shaping', () => {
  it('shapes which historical source records can receive decode stability metadata', () => {
    const decode = decodeOutput();
    const contextSnapshot = buildDecodeContextSnapshot({ emailText: '客户说需要再和采购确认，月底前回复。', accountId: 'acc_1' });
    const stableJudgment = buildStableDecodeJudgment(decode);
    const metadata = buildDecodeStabilityMetadata({
      contextSnapshot,
      stableJudgment,
      judgmentDiff: diffStableDecodeJudgment({ current: stableJudgment, currentContext: contextSnapshot, previous: null }),
    });

    expect(metadata).not.toBeNull();
    const candidate = buildDecodeStabilityBackfillCandidate({
      sourceRecord: {
        id: 'sr_1',
        account_id: 'acc_1',
        source_row_id: 'dec_1',
        title: 'Decode 判断',
        occurred_at: '2026-05-01T10:00:00.000Z',
        metadata: { judgmentMemory: { sourceKind: 'decode' } },
      },
      decode: {
        id: 'dec_1',
        account_id: 'acc_1',
        date: '2026-05-01T10:00:00.000Z',
        decode,
      },
      metadata: metadata!,
    });

    expect(candidate).toMatchObject({
      sourceRecordId: 'sr_1',
      decodeId: 'dec_1',
      accountId: 'acc_1',
      inputSummary: '客户说需要再和采购确认，月底前回复。',
      status: 'no_previous',
      confidence: 0.68,
      hasSnapshot: true,
    });
  });

  it('rejects mismatched source record and decode rows', () => {
    const decode = decodeOutput();
    const contextSnapshot = buildDecodeContextSnapshot({ emailText: '客户说需要再和采购确认，月底前回复。', accountId: 'acc_1' });
    const stableJudgment = buildStableDecodeJudgment(decode);
    const metadata = buildDecodeStabilityMetadata({
      contextSnapshot,
      stableJudgment,
      judgmentDiff: diffStableDecodeJudgment({ current: stableJudgment, currentContext: contextSnapshot, previous: null }),
    });

    const candidate = buildDecodeStabilityBackfillCandidate({
      sourceRecord: { id: 'sr_1', account_id: 'acc_1', source_row_id: 'dec_other' },
      decode: { id: 'dec_1', account_id: 'acc_1', decode },
      metadata: metadata!,
    });

    expect(candidate).toBeNull();
  });
});
