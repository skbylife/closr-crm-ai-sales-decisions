import { describe, expect, it } from 'vitest';
import { buildDecodeJudgmentFeedbackTarget } from './decode-feedback-target';

describe('decode judgment feedback target', () => {
  it('builds an always-correctable feedback target for saved decodes', () => {
    const target = buildDecodeJudgmentFeedbackTarget({
      saved: true,
      savedAccountId: 'acc_1',
      savedDecodeId: 'decode_1',
      savedAccountName: 'Acme',
      previousSummary: '客户预算正在升温。',
    });

    expect(target).toMatchObject({
      accountId: 'acc_1',
      targetType: 'decode',
      targetId: 'decode_1',
      previousSummary: '客户预算正在升温。',
      buttonLabel: '反馈/修正这个判断',
    });
    expect(target?.helperText).toContain('账户记忆档案');
    expect(target?.evidenceRefs).toEqual([
      {
        sourceId: 'decode_1',
        sourceKind: 'email_decode',
        title: 'Decode · Acme',
        sourceTable: 'email_decodes',
        sourceRowId: 'decode_1',
      },
    ]);
  });

  it('does not expose feedback before the decode is saved to an account', () => {
    expect(buildDecodeJudgmentFeedbackTarget({ saved: true, savedAccountId: 'acc_1' })).toBeUndefined();
    expect(buildDecodeJudgmentFeedbackTarget({ saved: true, savedDecodeId: 'decode_1' })).toBeUndefined();
  });


  it('does not expose feedback for an unsaved decode even when stale saved ids exist', () => {
    expect(buildDecodeJudgmentFeedbackTarget({
      saved: false,
      savedAccountId: 'acc_stale',
      savedDecodeId: 'decode_stale',
      previousSummary: '新解读还没有保存。',
    })).toBeUndefined();
  });

  it('merges low-stability correction copy into the same feedback target', () => {
    const target = buildDecodeJudgmentFeedbackTarget({
      saved: true,
      savedAccountId: 'acc_1',
      savedDecodeId: 'decode_1',
      previousSummary: '普通判断摘要',
      stabilityCorrection: {
        visible: true,
        buttonLabel: '修正低稳定判断',
        helperText: '同一上下文下判断发生变化，请记录正确判断。',
        previousSummary: '低稳定判断摘要',
      },
    });

    expect(target?.buttonLabel).toBe('修正低稳定判断');
    expect(target?.previousSummary).toBe('低稳定判断摘要');
    expect(target?.helperText).toContain('同一上下文下判断发生变化');
    expect(target?.helperText).toContain('人工反馈/修订记录');
    expect(target?.evidenceRefs.map((ref) => ref.sourceKind)).toEqual(['email_decode']);
  });
});
