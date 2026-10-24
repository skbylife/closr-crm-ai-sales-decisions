import { describe, expect, it } from 'vitest';
import { buildJudgmentReviewLoopModel } from './judgment-review-loop';

describe('judgment review loop model', () => {
  it('pushes low-confidence or high-priority uncertainty toward asking the customer', () => {
    const model = buildJudgmentReviewLoopModel({
      accountId: 'acc_1',
      accountName: '华东某平台',
      currentSituation: '客户可能愿意推进三年框架，但预算路径没有确认。',
      confidence: 0.48,
      evidenceCount: 2,
      topEvidenceLabel: '最近会议纪要',
      primaryQuestion: {
        id: 'q1',
        question: '预算审批人到底是谁？',
        whyItMatters: '预算路径决定下一步应该找业务负责人还是财务负责人。',
        priority: 'high',
      },
      askTarget: '李总 · 数字化转型部副总裁',
    });

    expect(model.primaryAction).toBe('ask_customer');
    expect(model.state).toBe('ready');
    expect(model.confidenceBucket).toBe('low');
    expect(model.keyJudgment).toBe('客户可能愿意推进三年框架，但预算路径没有确认。');
    expect(model.confirmationPrompt).toBe('预算审批人到底是谁？');
    expect(model.reasonToCheck).toBe('预算路径决定下一步应该找业务负责人还是财务负责人。');
    expect(model.uncertaintyLabel).toBe('待确认：预算审批人到底是谁？');
    expect(model.askTarget).toBe('李总 · 数字化转型部副总裁');
    expect(model.telemetry).toMatchObject({
      eventName: 'judgment_review_shown',
      state: 'ready',
      confidenceBucket: 'low',
      hasOpenQuestion: true,
      sourceCount: 2,
    });
  });

  it('allows direct confirmation when confidence is high and there is no open question', () => {
    const model = buildJudgmentReviewLoopModel({
      accountId: 'acc_2',
      accountName: '北美零售客户',
      currentSituation: '客户已确认试点价值，下一步是推进采购流程。',
      confidence: 0.82,
      evidenceCount: 6,
    });

    expect(model.primaryAction).toBe('confirm_judgment');
    expect(model.state).toBe('ready');
    expect(model.confidenceBucket).toBe('high');
    expect(model.title).toBe('请确认这条关键判断');
    expect(model.confirmationPrompt).toBe('这条判断是否符合当前客户真实情况？');
    expect(model.uncertaintyLabel).toBe('最大缺口：等待下一次客户信号更新');
    expect(model.feedbackTarget).toEqual({
      targetType: 'judgment',
      targetId: 'account-overview-review:acc_2',
      previousSummary: '客户已确认试点价值，下一步是推进采购流程。',
    });
  });

  it('separates refreshing from a final no-evidence judgment', () => {
    const model = buildJudgmentReviewLoopModel({
      accountId: 'acc_3',
      accountName: '欧洲工业客户',
      currentSituation: '欧洲工业客户 还缺少足够客户信号，先补一条真实沟通或会议记录。',
      evidenceCount: 0,
      refreshing: true,
    });

    expect(model.state).toBe('refreshing');
    expect(model.title).toBe('正在刷新账户判断');
    expect(model.body).not.toContain('我判断');
    expect(model.body).toContain('先不把“缺证据”当成结论');
    expect(model.keyJudgment).toBe('正在刷新账户判断，先等最新客户信号回来。');
    expect(model.confidenceLabel).toBe('把握度：刷新中');
    expect(model.evidenceLabel).toBe('主要依据：正在拉取最新证据');
    expect(model.uncertaintyLabel).toBe('最大缺口：等待最新账户信号刷新');
  });

  it('uses an empty state only when refresh has completed without evidence', () => {
    const model = buildJudgmentReviewLoopModel({
      accountId: 'acc_4',
      accountName: '拉美渠道客户',
      currentSituation: '',
      evidenceCount: 0,
    });

    expect(model.state).toBe('empty');
    expect(model.title).toBe('先补证据，再做判断');
    expect(model.body).toContain('还没有足够证据形成可靠判断');
    expect(model.keyJudgment).toBe('当前证据不足，还不能形成可靠判断。');
    expect(model.uncertaintyLabel).toBe('最大缺口：缺少可验证的一手客户信号');
  });

  it('does not promote generic English seed fallback text into the review card', () => {
    const model = buildJudgmentReviewLoopModel({
      accountId: 'acc_5',
      accountName: 'Northstar Cloud Services',
      currentSituation: 'Review customer evidence',
      confidence: 1,
      evidenceCount: 8,
      topEvidenceLabel: 'Review customer evidence',
      primaryQuestion: {
        id: 'q_generic',
        question: 'Review customer evidence',
        whyItMatters: 'Review customer evidence',
        priority: 'medium',
      },
      locale: 'en',
    });

    expect(model.state).toBe('ready');
    expect(model.keyJudgment).toBe('Northstar Cloud Services still needs more customer evidence');
    expect(model.confirmationPrompt).toBe('Which customer fact should be verified next?');
    expect(model.reasonToCheck).toBe('Which customer fact should be verified next?');
    expect(model.evidenceLabel).toBe('Evidence: 8 account evidence items');
    expect(JSON.stringify(model)).not.toMatch(/Review customer evidence/);
  });
});
