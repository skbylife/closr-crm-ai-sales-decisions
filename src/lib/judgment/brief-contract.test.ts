import { describe, expect, it } from 'vitest';
import type { Judgment } from '@/lib/babel-engine/types';
import type { JudgmentMemoryInput } from './memory';
import {
  adaptAccountJudgmentsToJudgmentBrief,
  adaptJudgmentMemoryInputToJudgmentBrief,
  adaptJudgmentMemorySourceItemToJudgmentBrief,
  normalizeJudgmentBrief,
} from './brief-contract';

function sampleJudgment(overrides: Partial<Judgment> = {}): Judgment {
  return {
    id: 'judgment_1',
    accountId: 'acc_1',
    kind: 'momentum',
    title: '推进动能',
    summary: '客户愿意推进 CFO 评审。',
    rationale: 'CFO 主动要求 ROI 材料。',
    value: 'high',
    confidence: 0.74,
    status: 'active',
    evidenceRefs: [{ sourceId: 'decode_1', sourceKind: 'email_decode', title: 'CFO 邮件' }],
    updatedAt: '2026-04-30T20:00:00.000Z',
    ...overrides,
  };
}

describe('canonical judgment brief contract', () => {
  it('normalizes required fields, confidence to 0-100, provisional flag, and evidence refs', () => {
    const result = normalizeJudgmentBrief({
      subjectType: 'account',
      subjectId: 'acc_1',
      orgId: 'org_1',
      accountId: 'acc_1',
      currentJudgment: '  客户愿意推进。第二句不应进入摘要。 ',
      risk: 'CFO 仍需 ROI 证据。',
      nextAction: '48小时内发送 ROI 摘要。',
      confidence: 0.74,
      provisional: true,
      evidenceRefs: [{
        sourceKind: 'email_decode',
        sourceId: 'decode_1',
        accountId: 'acc_1',
        reason: 'CFO 邮件要求 ROI',
        strength: 'strong',
        createdAt: '2026-04-30T20:00:00.000Z',
      }],
      sourceRefs: [{
        sourceKind: 'source_record',
        sourceId: 'src_1',
        orgId: 'org_1',
        accountId: 'acc_1',
        traceStatus: 'persisted',
      }],
      createdAt: '2026-04-30T20:00:00.000Z',
      updatedAt: '2026-04-30T20:00:00.000Z',
    });

    expect(result.issues).toEqual([]);
    expect(result.brief).toMatchObject({
      subjectType: 'account',
      subjectId: 'acc_1',
      orgId: 'org_1',
      accountId: 'acc_1',
      currentJudgment: '客户愿意推进',
      risk: 'CFO 仍需 ROI 证据',
      nextAction: '48小时内发送 ROI 摘要',
      confidence: 74,
      provisional: true,
    });
    expect(result.brief?.evidenceRefs).toHaveLength(1);
    expect(result.brief?.sourceRefs).toHaveLength(1);
  });

  it('rejects missing canonical identity fields and filters cross-account/org refs', () => {
    const invalid = normalizeJudgmentBrief({
      subjectType: 'account',
      currentJudgment: '缺少 subjectId',
      risk: '缺少身份无法保存',
      nextAction: '补齐 subjectId',
    });
    expect(invalid.brief).toBeNull();
    expect(invalid.issues.map((issue) => issue.field)).toContain('subjectId');

    const scoped = normalizeJudgmentBrief({
      subjectType: 'account',
      subjectId: 'acc_1',
      orgId: 'org_1',
      accountId: 'acc_1',
      currentJudgment: '可保存判断',
      risk: '需要过滤错租户来源',
      nextAction: '只保留同 org/account 来源',
      evidenceRefs: [
        { sourceKind: 'email_decode', sourceId: 'decode_ok', accountId: 'acc_1', reason: '同账户证据' },
        { sourceKind: 'email_decode', sourceId: 'decode_bad', accountId: 'acc_2', reason: '跨账户证据' },
      ],
      sourceRefs: [
        { sourceKind: 'source_record', sourceId: 'src_ok', orgId: 'org_1', accountId: 'acc_1' },
        { sourceKind: 'source_record', sourceId: 'src_bad', orgId: 'org_2', accountId: 'acc_1' },
      ],
      createdAt: '2026-04-30T20:00:00.000Z',
    });

    expect(scoped.brief?.evidenceRefs.map((ref) => ref.sourceId)).toEqual(['decode_ok']);
    expect(scoped.brief?.sourceRefs.map((ref) => ref.sourceId)).toEqual(['src_ok']);
    expect(scoped.issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['evidenceRefs.accountId', 'sourceRefs.orgId']));
  });

  it('drops direct evidence refs that explicitly belong to another org', () => {
    const result = normalizeJudgmentBrief({
      subjectType: 'account',
      subjectId: 'acc_1',
      orgId: 'org_1',
      accountId: 'acc_1',
      currentJudgment: '可保存判断',
      risk: '需要过滤错租户证据',
      nextAction: '只保留同 org 证据',
      evidenceRefs: [
        { sourceKind: 'email_decode', sourceId: 'decode_ok', orgId: 'org_1', accountId: 'acc_1', reason: '同租户证据' },
        { sourceKind: 'email_decode', sourceId: 'decode_bad', orgId: 'org_2', accountId: 'acc_1', reason: '跨租户证据' },
      ],
      createdAt: '2026-04-30T20:00:00.000Z',
    });

    expect(result.brief?.evidenceRefs.map((ref) => ref.sourceId)).toEqual(['decode_ok']);
    expect(result.issues.map((issue) => issue.field)).toContain('evidenceRefs.orgId');
  });

  it('adapts account judgments without changing the existing UI builder contract', () => {
    const brief = adaptAccountJudgmentsToJudgmentBrief({
      orgId: 'org_1',
      accountId: 'acc_1',
      judgments: [
        sampleJudgment(),
        sampleJudgment({
          id: 'risk_1',
          kind: 'deal_risk',
          title: '交易风险',
          summary: 'CFO 需要看到 ROI 后才会继续推进。',
          value: 'high',
          confidence: 0.68,
          status: 'provisional',
          evidenceRefs: [{ sourceId: 'decode_2', sourceKind: 'email_decode', title: 'CFO ROI 要求' }],
        }),
      ],
    });

    expect(brief).toMatchObject({
      subjectType: 'account',
      subjectId: 'acc_1',
      orgId: 'org_1',
      accountId: 'acc_1',
      momentum: 'warming',
      currentJudgment: '客户愿意推进 CFO 评审',
      risk: 'CFO 需要看到 ROI 后才会继续推进',
      confidence: 71,
      provisional: true,
    });
    expect(brief?.evidenceRefs.map((ref) => ref.sourceId)).toEqual(['decode_1', 'decode_2']);
    expect(brief?.sourceRefs.every((ref) => ref.orgId === 'org_1' && ref.accountId === 'acc_1')).toBe(true);
  });

  it('drops cross-account judgments before building canonical account refs', () => {
    const brief = adaptAccountJudgmentsToJudgmentBrief({
      orgId: 'org_1',
      accountId: 'acc_1',
      judgments: [
        sampleJudgment({
          id: 'bad_acc_2',
          accountId: 'acc_2',
          summary: '跨账户判断绝不能进入 acc_1 brief。',
          evidenceRefs: [{ sourceId: 'decode_bad', sourceKind: 'email_decode', title: '跨账户邮件' }],
        }),
        sampleJudgment({
          evidenceRefs: [
            { sourceId: 'decode_ref_bad', sourceKind: 'email_decode', title: '跨账户 evidence', accountId: 'acc_2' } as unknown as Judgment['evidenceRefs'][number],
            { sourceId: 'decode_org_bad', sourceKind: 'email_decode', title: '跨租户 evidence', orgId: 'org_2' } as unknown as Judgment['evidenceRefs'][number],
            { sourceId: 'decode_1', sourceKind: 'email_decode', title: 'CFO 邮件', accountId: 'acc_1', orgId: 'org_1' } as unknown as Judgment['evidenceRefs'][number],
          ],
        }),
      ],
    });

    expect(brief).toMatchObject({
      subjectType: 'account',
      subjectId: 'acc_1',
      accountId: 'acc_1',
      currentJudgment: '客户愿意推进 CFO 评审',
    });
    expect(brief?.currentJudgment).not.toContain('跨账户');
    expect(brief?.evidenceRefs.map((ref) => ref.sourceId)).toEqual(['decode_1']);
    expect(brief?.sourceRefs.map((ref) => ref.sourceId)).toEqual(['decode_1']);

    expect(adaptAccountJudgmentsToJudgmentBrief({
      orgId: 'org_1',
      accountId: 'acc_1',
      judgments: [sampleJudgment({ accountId: 'acc_2' })],
    })).toBeNull();
  });

  it('adapts judgment memory input into a subject-specific canonical brief', () => {
    const memory: JudgmentMemoryInput = {
      sourceKind: 'rfp_analysis',
      sourceId: 'analysis_1',
      accountId: 'acc_1',
      title: 'RFP判断 · Enterprise rollout',
      currentJudgment: '建议谨慎投标：先补竞对价格证据。',
      risk: '竞对报价和 CFO 评分权重未知。',
      nextAction: '先确认评分权重。',
      confidence: 0.62,
      uncertainty: '仍需验证竞对报价。',
      evidenceRefs: [{ sourceId: 'analysis_1', sourceKind: 'source_record', title: 'RFP 分析', sourceTable: 'rfp_ai_analyses', sourceRowId: 'analysis_1' }],
      provisional: true,
      createdAt: '2026-04-30T20:00:00.000Z',
      rationale: '需求匹配但商业条款承压。',
    };

    const brief = adaptJudgmentMemoryInputToJudgmentBrief(memory, { orgId: 'org_1' });

    expect(brief).toMatchObject({
      subjectType: 'rfp',
      subjectId: 'analysis_1',
      orgId: 'org_1',
      accountId: 'acc_1',
      confidence: 62,
      provisional: true,
      openQuestions: ['仍需验证竞对报价。'],
    });
    expect(brief?.evidenceRefs[0]).toMatchObject({ sourceKind: 'source_record', accountId: 'acc_1' });
    expect(brief?.sourceRefs[0]).toMatchObject({ sourceKind: 'judgment_memory', orgId: 'org_1', accountId: 'acc_1' });
  });

  it('filters cross-org refs when adapting judgment memory inputs', () => {
    const memory: JudgmentMemoryInput = {
      sourceKind: 'rfp_analysis',
      sourceId: 'analysis_1',
      accountId: 'acc_1',
      title: 'RFP判断 · Enterprise rollout',
      currentJudgment: '建议谨慎投标：先补竞对价格证据。',
      risk: '竞对报价和 CFO 评分权重未知。',
      nextAction: '先确认评分权重。',
      confidence: 0.62,
      uncertainty: '仍需验证竞对报价。',
      evidenceRefs: [
        { sourceId: 'analysis_bad', sourceKind: 'source_record', title: '跨租户 RFP 分析', orgId: 'org_2' } as unknown as JudgmentMemoryInput['evidenceRefs'][number],
        { sourceId: 'analysis_ok', sourceKind: 'source_record', title: '同租户 RFP 分析', orgId: 'org_1' } as unknown as JudgmentMemoryInput['evidenceRefs'][number],
      ],
      provisional: true,
      createdAt: '2026-04-30T20:00:00.000Z',
      rationale: '需求匹配但商业条款承压。',
    };

    const brief = adaptJudgmentMemoryInputToJudgmentBrief(memory, { orgId: 'org_1' });

    expect(brief?.evidenceRefs.map((ref) => ref.sourceId)).toEqual(['analysis_ok']);
  });

  it('filters cross-org refs when adapting persisted memory source items', () => {
    const brief = adaptJudgmentMemorySourceItemToJudgmentBrief({
      id: 'decode:decode_1',
      sourceRecordId: 'src_1',
      sourceKind: 'decode',
      sourceId: 'decode_1',
      sourceTable: 'source_records',
      sourceRowId: 'src_1',
      title: 'Decode · CFO',
      currentJudgment: 'CFO 愿意看 ROI。',
      risk: '如果 ROI 不够清晰会转入采购压价。',
      nextAction: '发送 CFO 版 ROI 摘要。',
      confidence: 0.81,
      provisional: false,
      evidenceRefs: [
        { sourceKind: 'email_decode', sourceId: 'decode_bad', title: '跨租户邮件', orgId: 'org_2' } as unknown as JudgmentMemoryInput['evidenceRefs'][number],
        { sourceKind: 'email_decode', sourceId: 'decode_ok', title: '同租户邮件', orgId: 'org_1' } as unknown as JudgmentMemoryInput['evidenceRefs'][number],
      ],
      updatedAt: '2026-04-30T20:00:00.000Z',
      traceStatus: 'persisted',
    }, { orgId: 'org_1', accountId: 'acc_1' });

    expect(brief?.evidenceRefs.map((ref) => ref.sourceId)).toEqual(['decode_ok']);
  });

  it('adapts persisted memory source items with source/org/account refs', () => {
    const brief = adaptJudgmentMemorySourceItemToJudgmentBrief({
      id: 'decode:decode_1',
      sourceRecordId: 'src_1',
      sourceKind: 'decode',
      sourceId: 'decode_1',
      sourceTable: 'source_records',
      sourceRowId: 'src_1',
      title: 'Decode · CFO',
      currentJudgment: 'CFO 愿意看 ROI。',
      risk: '如果 ROI 不够清晰会转入采购压价。',
      nextAction: '发送 CFO 版 ROI 摘要。',
      confidence: 0.81,
      provisional: false,
      evidenceRefs: [{ sourceKind: 'email_decode', sourceId: 'decode_1', title: 'CFO 邮件' }],
      updatedAt: '2026-04-30T20:00:00.000Z',
      traceStatus: 'persisted',
    }, { orgId: 'org_1', accountId: 'acc_1' });

    expect(brief).toMatchObject({
      subjectType: 'decode',
      subjectId: 'decode_1',
      orgId: 'org_1',
      accountId: 'acc_1',
      confidence: 81,
      provisional: false,
    });
    expect(brief?.sourceRefs[0]).toMatchObject({
      sourceKind: 'judgment_memory',
      sourceRecordId: 'src_1',
      traceStatus: 'persisted',
      orgId: 'org_1',
      accountId: 'acc_1',
    });
  });
});
