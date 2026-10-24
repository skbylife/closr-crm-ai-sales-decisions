import { describe, expect, it } from 'vitest';
import type { AccountMemoryConflict, AccountMemorySummary, AccountTimelineItem } from '@/lib/babel-engine/types';
import type { AccountMomentumSnapshot } from './momentum';
import type { StakeholderInterpretation } from './stakeholder';
import { buildAccountOpenQuestions, type OpenQuestionMemoryInput } from './open-questions';

const NOW = '2026-04-30T22:00:00.000Z';

function summary(overrides: Partial<AccountMemorySummary> = {}): AccountMemorySummary {
  return {
    accountId: 'acct_1',
    narrativeSummary: 'Ada 支持推进，但 CFO ROI 和预算口径仍待验证。',
    momentum: { status: 'steady', label: '平稳', reasoning: '有支持信号，但预算未闭环。' },
    people: [
      {
        contactId: 'c_ada',
        name: 'Ada Chen',
        title: 'Director of Operations',
        role: 'champion',
        influenceLabel: '内部推动者',
        stance: 'supportive',
        summary: '支持推进 Demo，但需要 CFO 认可 ROI。',
        sourceIds: ['src_ada'],
      },
      {
        contactId: 'c_dana',
        name: 'Dana Smith',
        title: 'CFO',
        role: 'economic_buyer',
        influenceLabel: '预算控制者',
        stance: 'unclear',
        summary: '预算态度未知。',
        sourceIds: ['src_dana'],
      },
    ],
    tensions: ['Ada Chen 支持推进，但 Dana Smith（CFO）是否认可 ROI 仍未验证。'],
    timelineHighlights: [timeline()],
    lastComputedAt: NOW,
    confidence: 0.62,
    sourceCoverage: { kinds: ['email_decode'], totalRecords: 1, freshRecords: 1, newestRecordAt: NOW, oldestRecordAt: NOW },
    ...overrides,
  };
}

function timeline(overrides: Partial<AccountTimelineItem> = {}): AccountTimelineItem {
  return {
    id: 'tl_1',
    accountId: 'acct_1',
    sourceId: 'decode_1',
    sourceKind: 'email_decode',
    title: 'Ada 回复：愿意推进 Demo',
    summary: 'Ada 支持推进 Demo，但提到 CFO 需要看 ROI。',
    occurredAt: NOW,
    signal: 'positive',
    ...overrides,
  };
}

function stakeholder(overrides: Partial<StakeholderInterpretation> = {}): StakeholderInterpretation {
  return {
    contactId: 'c_ada',
    name: 'Ada Chen',
    title: 'Director of Operations',
    role: 'champion',
    stance: 'supportive',
    relationshipDistance: 'warm',
    confidence: 0.7,
    provisional: false,
    whyThisRole: '人物记忆显示支持推进。',
    nextAction: '请 Ada 补全内部决策地图。',
    evidenceRefs: [{ sourceId: 'decode_1', sourceKind: 'email_decode', title: 'Ada 邮件' }],
    updatedAt: NOW,
    ...overrides,
  };
}

function memory(overrides: Partial<OpenQuestionMemoryInput> = {}): OpenQuestionMemoryInput {
  return {
    sourceKind: 'decode',
    sourceId: 'decode_1',
    title: 'Decode · Ada Chen',
    currentJudgment: 'Ada Chen 支持推进并愿意牵头 Demo。',
    risk: 'CFO 是否认可 ROI 仍未验证。',
    nextAction: '请 Ada 确认 CFO 对 ROI 的口径。',
    uncertainty: '预算控制者态度未知。',
    confidence: 0.64,
    provisional: true,
    evidenceRefs: [{ sourceId: 'decode_1', sourceKind: 'email_decode', title: 'Ada 邮件' }],
    updatedAt: NOW,
    ...overrides,
  };
}

describe('buildAccountOpenQuestions', () => {
  it('turns a tension into a concrete question', () => {
    const result = buildAccountOpenQuestions({
      summary: summary(),
      timelineItems: [timeline()],
      stakeholderInterpretations: [stakeholder()],
      limit: 5,
    });

    expect(result[0].question).toContain('Ada Chen');
    expect(result[0].question).toContain('CFO');
    expect(result[0].question).toContain('ROI');
    expect(result[0].nextVerificationAction).toContain('向Ada Chen只确认一件事');
    expect(result[0].nextVerificationAction).toContain('拿到答复后，再更新联系人角色、风险或动量判断');
    expect(result[0].nextVerificationAction).not.toContain('验证消息');
    expect(result[0].question).not.toMatch(/^需要进一步确认|需要确认|持续校准/);
  });

  it('turns an open conflict into a high priority verification question', () => {
    const conflict: AccountMemoryConflict = {
      id: 'conflict_1',
      accountId: 'acct_1',
      summary: 'Ada Chen 说预算可推进，但 Dana Smith（CFO）表示本季度预算冻结。',
      status: 'open',
      sourceIds: ['src_1', 'src_2'],
      detectedAt: NOW,
      kind: 'budget_contradiction',
      severity: 'high',
      involvedContactIds: ['c_dana'],
    };

    const result = buildAccountOpenQuestions({
      summary: summary(),
      conflicts: [conflict],
      stakeholderInterpretations: [stakeholder({ contactId: 'c_dana', name: 'Dana Smith', title: 'CFO', role: 'decision_maker', stance: 'unknown' })],
    });

    expect(result[0]).toMatchObject({ priority: 'high', blockedJudgment: 'stakeholder' });
    expect(result[0].question).toContain('Dana Smith');
    expect(result[0].question).toContain('预算冻结');
    expect(result[0].evidenceRefs.map((ref) => ref.sourceId)).toContain('src_1');
  });

  it('turns mixed stakeholder stance into a direct question for that stakeholder', () => {
    const result = buildAccountOpenQuestions({
      summary: summary({ tensions: [] }),
      stakeholderInterpretations: [stakeholder({
        contactId: 'c_mina',
        name: 'Mina Zhao',
        title: 'Procurement Lead',
        role: 'blocker',
        stance: 'mixed',
        uncertainty: 'Mina 同时推进采购流程又压低价格。',
      })],
    });

    expect(result[0].blockedJudgment).toBe('stakeholder');
    expect(result[0].priority).toBe('high');
    expect(result[0].whoToAsk?.name).toBe('Mina Zhao');
    expect(result[0].question).toContain('支持推进');
    expect(result[0].question).toContain('阻碍关键承诺');
  });

  it('turns risk momentum into a concrete blocker question', () => {
    const momentum: AccountMomentumSnapshot = {
      status: 'risk_rising',
      confidence: 0.66,
      currentJudgment: '账户风险正在上升。',
      whyChanged: '采购压价和预算冻结同时出现。',
      biggestTension: 'Dana Smith（CFO）是否批准 ROI 预算仍未知。',
      nextAction: '先确认 CFO 是否认可 ROI，再推进报价。',
      evidenceRefs: [{ sourceId: 'decode_2', sourceKind: 'email_decode', title: 'CFO 预算邮件' }],
      provisional: true,
      updatedAt: NOW,
    };

    const result = buildAccountOpenQuestions({
      summary: summary({ tensions: [] }),
      stakeholderInterpretations: [stakeholder({ contactId: 'c_dana', name: 'Dana Smith', title: 'CFO', role: 'decision_maker' })],
      accountMomentum: momentum,
    });

    expect(result[0].blockedJudgment).toBe('risk');
    expect(result[0].question).toContain('Dana Smith');
    expect(result[0].question).toContain('ROI');
    expect(result[0].nextVerificationAction).toContain('CFO');
  });

  it('survives empty and dirty data with a specific provisional fallback', () => {
    const result = buildAccountOpenQuestions({
      summary: null,
      conflicts: [{ id: '', accountId: 'acct_1', summary: '', status: 'resolved', sourceIds: [], detectedAt: 'bad-date' }],
      judgmentMemories: [{ sourceId: 123, confidence: Number.NaN, evidenceRefs: [{ sourceId: '', sourceKind: 'bad' }] }],
      stakeholderInterpretations: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ blockedJudgment: 'unknown', provisional: true });
    expect(result[0].question).toContain('预算控制者');
    expect(result[0].question).toContain('最终拍板人');
  });

  it('deduplicates evidence refs', () => {
    const result = buildAccountOpenQuestions({
      summary: summary(),
      judgmentMemories: [memory({ evidenceRefs: [
        { sourceId: 'decode_1', sourceKind: 'email_decode', title: 'Ada 邮件' },
        { sourceId: 'decode_1', sourceKind: 'email_decode', title: '重复 Ada 邮件' },
      ] })],
      stakeholderInterpretations: [stakeholder()],
    });

    const refs = result.flatMap((item) => item.evidenceRefs).filter((ref) => ref.sourceId === 'decode_1');
    expect(refs.length).toBeGreaterThan(0);
    expect(new Set(refs.map((ref) => `${ref.sourceKind}:${ref.sourceId}`)).size).toBe(1);
  });

  it('selects whoToAsk from involved conflict contact or budget role', () => {
    const result = buildAccountOpenQuestions({
      summary: summary(),
      conflicts: [{
        id: 'conflict_budget',
        accountId: 'acct_1',
        summary: 'ROI 已被 Ada 接受，但 CFO Dana Smith 的预算审批口径未知。',
        status: 'open',
        sourceIds: ['src_budget'],
        detectedAt: NOW,
        severity: 'medium',
        involvedContactIds: ['c_dana'],
      }],
      stakeholderInterpretations: [
        stakeholder(),
        stakeholder({ contactId: 'c_dana', name: 'Dana Smith', title: 'CFO', role: 'decision_maker', stance: 'unknown' }),
      ],
    });

    expect(result[0].whoToAsk).toMatchObject({ contactId: 'c_dana', name: 'Dana Smith', title: 'CFO' });
    expect(result[0].question).toContain('Dana Smith');
  });
});
