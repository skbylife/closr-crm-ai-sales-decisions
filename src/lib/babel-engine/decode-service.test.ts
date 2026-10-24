import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runDecodePipeline, type PersistEmailDecodeRecordInput } from './decode-service';
import type { DecodeOutput } from './types';

const dependencies = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  from: vi.fn(),
  emitEvent: vi.fn().mockResolvedValue('synthetic-event'),
}));
vi.mock('@/lib/api-guard', () => ({ requireAdmin: dependencies.requireAdmin }));
vi.mock('@/lib/ai-event-hub', () => ({ emitEvent: dependencies.emitEvent }));
beforeEach(() => {
  vi.clearAllMocks();
  dependencies.requireAdmin.mockReturnValue({ from: dependencies.from });
});


function sampleDecode(): DecodeOutput {
  return {
    messages: [
      {
        speaker: 'them',
        original: 'Can you send pricing by Friday?',
        decode: { meaning: '明确推进报价', emotion: '急迫', urgency: 8, confidence: 0.88 },
      },
    ],
    threadAnalysis: {
      sentimentTrend: 'warming',
      riskLevel: 'medium',
      buyerState: 'evaluating',
      keySignal: '客户要求周五前报价',
    },
    actionItems: [
      { title: '周五前发送报价', priority: 'high', dueInDays: 2, reasoning: '客户给出明确时间窗口' },
    ],
  };
}

describe('decode-service', () => {
  it('runs authenticated manual decode without saving the decode record while retaining normal event handling', async () => {
    const decodeMessagesFn = vi.fn().mockResolvedValue(sampleDecode());
    const persistDecodeRecord = vi.fn();

    const result = await runDecodePipeline(
      { emailText: 'Can you send pricing by Friday?', actor: { userId: 'user_1', orgId: 'org_1' }, persist: false },
      { decodeMessagesFn, persistDecodeRecord },
    );

    expect(result.duplicate).toBe(false);
    expect(result.decode?.threadAnalysis.keySignal).toBe('客户要求周五前报价');
    expect(decodeMessagesFn).toHaveBeenCalledOnce();
    expect(persistDecodeRecord).not.toHaveBeenCalled();
    expect(dependencies.requireAdmin).toHaveBeenCalledOnce();
    // No account/contact/opportunity means there is no matching-history query.
    expect(dependencies.from).not.toHaveBeenCalled();
    expect(dependencies.emitEvent).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org_1', userId: 'user_1', eventType: 'decode.completed',
    }));
  });

  it('skips AI decode when a forwarded email fingerprint already exists', async () => {
    const existing = sampleDecode();
    const decodeMessagesFn = vi.fn().mockResolvedValue(sampleDecode());

    const result = await runDecodePipeline(
      { emailText: 'duplicate body', persist: true, persistId: 'fwd_existing', actor: { userId: null, orgId: null } },
      {
        decodeMessagesFn,
        findExistingDecodeById: vi.fn().mockResolvedValue(existing),
      },
    );

    expect(result.duplicate).toBe(true);
    expect(result.decode).toBe(existing);
    expect(decodeMessagesFn).not.toHaveBeenCalled();
  });

  it('persists unmatched forwarded emails without forcing an org/account', async () => {
    const persisted: PersistEmailDecodeRecordInput[] = [];

    const result = await runDecodePipeline(
      {
        emailText: 'Unmatched forwarded body',
        persist: true,
        persistId: 'fwd_unmatched',
        actor: { userId: null, orgId: null },
        sourceFingerprint: 'abc123',
        originalSenderEmail: 'example-71d12e9485@example.invalid',
      },
      {
        decodeMessagesFn: vi.fn().mockResolvedValue(sampleDecode()),
        findExistingDecodeById: vi.fn().mockResolvedValue(null),
        persistDecodeRecord: vi.fn(async (record) => {
          persisted.push(record);
        }),
      },
    );

    expect(result.duplicate).toBe(false);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toEqual(expect.objectContaining({
      id: 'fwd_unmatched',
      orgId: null,
      accountId: undefined,
      matchedContactId: undefined,
      sourceFingerprint: 'abc123',
    }));
  });
});
