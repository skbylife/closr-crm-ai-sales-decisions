import { describe, expect, it } from 'vitest';
import type { DecodeOutput, Judgment, RfpJudgment, StrategicPlay } from '@/lib/babel-engine/types';
import {
  buildAccountEvidenceHref,
  buildAccountJudgmentBrief,
  buildDecodeJudgmentBrief,
  buildJudgmentEvolution,
  buildRfpEvidenceHref,
  buildRfpJudgmentBrief,
  buildRfpJudgmentFeedbackTarget,
  buildStrategicPlayJudgmentBrief,
  normalizeRfpWinPercent,
  type RfpAnalysisBrief,
} from './brief';

function sampleDecode(): DecodeOutput {
  return {
    messages: [
      {
        speaker: 'them',
        original: '可以推进，但 CFO 要看 ROI。',
        decode: { meaning: '客户愿意推进，但 CFO 是下一关。', emotion: '谨慎积极', urgency: 8, confidence: 0.86 },
      },
      {
        speaker: 'me',
        original: '我会补 ROI 摘要。',
        decode: { meaning: '我方承诺补证据。', emotion: '承诺明确', urgency: 6, confidence: 0.78 },
      },
    ],
    threadAnalysis: {
      sentimentTrend: 'warming',
      riskLevel: 'medium',
      buyerState: 'evaluating',
      keySignal: '客户愿意推进，但 CFO 需要 ROI 证据。',
    },
    actionItems: [{ title: '48小时内发送 CFO 版 ROI 摘要', priority: 'high', dueInDays: 2, reasoning: '回应下一关口' }],
  };
}

function samplePlay(overrides: Partial<StrategicPlay> = {}): StrategicPlay {
  return {
    id: 'play_1',
    orgId: 'org_1',
    accountId: 'acc_1',
    opportunityId: 'opp_1',
    goalType: 'reach_key_person',
    goalDescription: '验证 CFO 是否愿意用 ROI 作为下一轮推进标准。',
    steps: [{
      index: 1,
      title: '发出 CFO 版 ROI 摘要',
      description: '用一页纸确认 CFO 的决策口径。',
      who: '销售负责人',
      target: 'CFO',
      action: '发送 ROI 摘要并约 15 分钟反馈电话',
      timing: '48小时内',
      purpose: '验证预算与评价标准',
      risk: 'CFO 不回复或转给采购压价',
      fallback: '请业务 sponsor 转发并补充内部场景',
      status: 'pending',
      assumptionBeingTested: 'CFO 愿意用 ROI 做判断。',
    }],
    alternativePaths: [],
    confidence: 0.62,
    status: 'active',
    momentum: 'stalled',
    assumptions: [
      { id: 'asm_1', text: 'CFO 愿意用 ROI 而不是最低价做判断。', status: 'pending', createdAt: '2026-04-29T20:00:00.000Z' },
    ],
    learnings: [],
    daysSinceProgress: 16,
    createdAt: '2026-04-29T20:00:00.000Z',
    updatedAt: '2026-04-30T20:00:00.000Z',
    ...overrides,
  };
}

function sampleJudgment(overrides: Partial<Judgment> = {}): Judgment {
  return {
    id: 'judgment_1',
    accountId: 'acc_1',
    kind: 'momentum',
    title: '推进动能',
    summary: '客户仍在推进 CFO 评审。',
    rationale: 'CFO 已要求 ROI 材料。',
    value: 'medium',
    confidence: 0.74,
    status: 'active',
    evidenceRefs: [{ sourceId: 'decode_1', sourceKind: 'email_decode', title: 'CFO 邮件' }],
    updatedAt: '2026-04-30T20:00:00.000Z',
    ...overrides,
  };
}

describe('judgment brief builders', () => {
  it('builds decode current judgment, risk, next action, and evidence chips without becoming empty', () => {
    const brief = buildDecodeJudgmentBrief({
      decode: sampleDecode(),
      savedAccountId: 'acc_1',
      savedDecodeId: 'decode_1',
      clientName: '李总',
      signalSourceLabel: '邮件线程',
      analysisGoalLabel: '推进 CFO 评审',
      updatedAt: '2026-04-30T20:00:00.000Z',
    });

    expect(brief).toMatchObject({
      contextLabel: '沟通解读判断',
      currentJudgment: '客户愿意推进，但 CFO 需要 ROI 证据',
      biggestRisk: '中等风险：客户愿意推进，但 CFO 需要 ROI 证据',
      nextAction: '48小时内发送 CFO 版 ROI 摘要',
    });
    expect(brief?.evidenceChips?.length).toBeGreaterThan(0);
    expect(brief?.quality?.evidenceStrength).not.toBe('missing');
  });

  it('does not crash when decode has no usable data', () => {
    expect(buildDecodeJudgmentBrief({ decode: { messages: [] } as unknown as DecodeOutput })).toBeNull();
  });

  it('treats stalled or pending strategic assumptions as quality risk, not contradiction risk', () => {
    const brief = buildStrategicPlayJudgmentBrief(samplePlay());
    const flagsText = JSON.stringify(brief.quality?.flags ?? []);

    expect(brief.biggestRisk).toContain('停滞');
    expect(brief.quality?.qualityRisk).toBe('medium');
    expect(brief.statusLabel).toBe('停滞');
    expect(brief.evidenceChips?.some((chip) => chip.href === '/accounts/acc_1?tab=plays&playId=play_1')).toBe(true);
    expect(flagsText).toContain('推进停滞');
    expect(flagsText).toContain('假设未验证');
    expect(flagsText).not.toMatch(/invalidated|pending|Provisional|confidence|momentum=|next action|contradiction/);
  });

  it('localizes strategic play generated labels and fallback copy in English mode', () => {
    const brief = buildStrategicPlayJudgmentBrief(samplePlay({
      goalDescription: 'Validate whether the CFO will use ROI as the next evaluation standard.',
      steps: [{
        index: 1,
        title: 'Send the CFO ROI brief',
        description: 'Use a one-page summary to confirm the CFO evaluation criteria.',
        who: 'Account owner',
        target: 'CFO',
        action: 'Send the ROI brief and schedule a 15-minute feedback call',
        timing: 'Within 48 hours',
        purpose: 'Validate budget and evaluation criteria',
        risk: 'The CFO may route the topic to procurement for price pressure',
        fallback: 'Ask the business sponsor to forward it with internal context',
        status: 'pending',
        assumptionBeingTested: 'The CFO is willing to use ROI as the decision standard.',
      }],
      assumptions: [{ id: 'asm_1', text: 'The CFO will judge value by ROI rather than lowest price.', status: 'pending', createdAt: '2026-04-29T20:00:00.000Z' }],
    }), 'en');
    const serialized = JSON.stringify(brief);

    expect(brief.contextLabel).toBe('Play Judgment');
    expect(brief.statusLabel).toBe('Stalled');
    expect(brief.biggestRisk).toContain('stalled');
    expect(brief.biggestRisk).toContain('revalidate');
    expect(brief.quality?.provisionalLabel).toBe('Validate with customer feedback');
    expect(serialized).not.toMatch(/[一-鿿]/);
  });

  it('does not crash when a strategic play is missing optional historical fields', () => {
    const dirtyPlay = { id: 'play_dirty', accountId: 'acc_1', goalDescription: '' } as unknown as StrategicPlay;
    const brief = buildStrategicPlayJudgmentBrief(dirtyPlay);

    expect(brief.currentJudgment).toBe('已有谋局假设。');
    expect(brief.nextAction).toContain('执行下一步谋局动作');
    expect(brief.quality?.evidenceStrength).toBe('missing');
  });

  it('does not emit blank strategic play evidence chips', () => {
    const brief = buildStrategicPlayJudgmentBrief(samplePlay({
      steps: [{
        index: 1,
        title: '   ',
        description: '   ',
        action: '参加技术评审会并获得 CTO 认可',
        who: '销售负责人',
        target: 'CTO',
        timing: '本周',
        purpose: '获得技术认可',
        risk: '技术团队不认可',
        fallback: '改约架构负责人',
        status: 'pending',
      }],
      assumptions: [{ id: 'asm_blank', text: '   ', evidence: '客户接受先做省级试点', status: 'pending', createdAt: '2026-04-29T20:00:00.000Z' }],
      learnings: [{ stepIndex: 1, learning: '   ', newSignal: '省级试点后可复制到集团', timestamp: '2026-04-30T20:00:00.000Z' }],
    }));

    expect(brief.evidenceChips?.map((chip) => chip.label)).toEqual([
      '参加技术评审会并获得 CTO 认可',
      '客户接受先做省级试点',
      '省级试点后可复制到集团',
    ]);
    expect(brief.evidenceChips?.every((chip) => chip.label.trim().length > 0)).toBe(true);
  });

  it('normalizes RFP win probability and tolerates dirty values', () => {
    expect(normalizeRfpWinPercent(0.64)).toBe(64);
    expect(normalizeRfpWinPercent(64)).toBe(64);
    expect(normalizeRfpWinPercent(null)).toBeNull();
    expect(normalizeRfpWinPercent(Number.NaN)).toBeNull();
    expect(normalizeRfpWinPercent('64')).toBeNull();
  });

  it('builds RFP briefs from normalized fields and survives missing array fields', () => {
    const judgment = {
      decision: 'cautious_bid',
      confidence: 72,
      rationale: '需求匹配，但采购压价和竞对报价仍未透明。',
      uncertainty: '还缺竞对最终报价和 CFO 评分权重。',
      evidenceSignals: [{ label: '技术匹配', source: 'rfp', valence: 'positive', evidence: 'RFP要求与现有方案匹配' }],
    } as unknown as RfpJudgment;

    const brief = buildRfpJudgmentBrief({
      winProbability: 0.64,
      strengths: ['技术匹配'],
      weaknesses: ['商务条款承压'],
      recommendations: ['先准备 CFO 可读的一页 ROI。'],
      competitorAnalysis: null,
      judgment,
      createdAt: '2026-04-30T20:00:00.000Z',
    } satisfies RfpAnalysisBrief);

    expect(brief).toMatchObject({
      contextLabel: '投标判断',
      statusLabel: '谨慎投标',
      currentJudgment: '建议谨慎投标：可以推进，但必须先处理关键风险。',
      biggestRisk: '还缺竞对最终报价和 CFO 评分权重',
      nextAction: '先准备 CFO 可读的一页 ROI',
    });
    expect(brief?.evidenceChips?.[0]).toMatchObject({ label: '技术匹配', sourceLabel: '招投标文件', tone: 'positive' });
  });

  it('adds RFP feedback target wiring and clickable analysis evidence only when a stable RFP route exists', () => {
    const analysis = {
      id: 'analysis_1',
      rfpId: 'rfp_1',
      winProbability: 64,
      strengths: ['技术匹配'],
      weaknesses: [],
      recommendations: ['准备 ROI。'],
      competitorAnalysis: null,
      judgment: {
        decision: 'bid',
        confidence: 80,
        rationale: 'RFP 要求与方案匹配。',
        uncertainty: '',
        keyRisks: [],
        tensions: [],
        contradictions: [],
        evidenceSignals: [{ label: '技术匹配', source: 'rfp', valence: 'positive', evidence: 'RFP要求与现有方案匹配' }],
      } satisfies RfpJudgment,
      createdAt: '2026-04-30T20:00:00.000Z',
    } satisfies RfpAnalysisBrief;

    const href = buildRfpEvidenceHref({ opportunityId: 'opp 1', rfpId: analysis.rfpId, analysisId: analysis.id });
    const brief = buildRfpJudgmentBrief(analysis, { opportunityId: 'opp 1' });
    const feedbackTarget = buildRfpJudgmentFeedbackTarget({ analysis, accountId: 'acc_1', brief });

    expect(href).toBe('/pipeline/opp%201?tab=rfp&rfpId=rfp_1&analysisId=analysis_1');
    expect(brief?.evidenceChips?.[0]).toMatchObject({
      label: '技术匹配',
      href: `${href}&signalIndex=0`,
      sourceLabel: '招投标文件',
    });
    expect(feedbackTarget).toEqual({
      accountId: 'acc_1',
      targetType: 'rfp',
      targetId: 'analysis_1',
      previousSummary: brief?.currentJudgment,
    });

    const fallbackFeedbackTarget = buildRfpJudgmentFeedbackTarget({
      analysis: { ...analysis, id: undefined, rfpId: undefined },
      accountId: 'acc_1',
      fallbackRfpId: 'rfp_fallback',
      brief,
    });
    expect(fallbackFeedbackTarget).toEqual({
      accountId: 'acc_1',
      targetType: 'rfp',
      targetId: 'rfp_fallback',
      previousSummary: brief?.currentJudgment,
    });

    const nonClickableBrief = buildRfpJudgmentBrief(analysis);
    expect(nonClickableBrief?.evidenceChips?.[0].href).toBeUndefined();
  });

  it('marks RFP briefs with missing evidence quality instead of inventing source records', () => {
    const brief = buildRfpJudgmentBrief({
      id: 'analysis_no_evidence',
      rfpId: 'rfp_1',
      winProbability: null,
      strengths: [],
      weaknesses: ['采购标准未知。'],
      recommendations: [],
      competitorAnalysis: null,
      judgment: null,
      createdAt: '2026-04-30T20:00:00.000Z',
    } satisfies RfpAnalysisBrief);

    expect(brief?.quality?.evidenceStrength).toBe('thin');
    expect(brief?.quality?.flags?.some((flag) => flag.label === '缺少结构化证据')).toBe(true);
    expect(brief?.evidenceChips?.length ?? 0).toBe(0);
  });

  it('uses the shared account evidence href helper for chips and source-record fallback', () => {
    const brief = buildAccountJudgmentBrief([
      sampleJudgment({
        evidenceRefs: [
          { sourceId: 'meeting_1', sourceKind: 'meeting_prep', title: '会议准备' },
          { sourceId: 'src_1', sourceKind: 'source_record', title: '来源记录' },
          { sourceId: 'src_2', sourceKind: 'source_record', sourceRowId: 'knowledge_1', title: '知识库记录' },
        ],
      }),
    ], 'acc_1');

    expect(brief?.evidenceChips?.map((chip) => chip.href)).toEqual([
      '/accounts/acc_1?tab=activity&targetKind=meeting_prep&targetId=meeting_1',
      '/accounts/acc_1?tab=knowledge&targetKind=source_record&targetId=src_1',
      '/accounts/acc_1?tab=knowledge&targetKind=source_record&targetId=knowledge_1',
    ]);
    expect(buildAccountEvidenceHref({ sourceKind: 'source_record', sourceId: 'src_1' }, 'acc_1'))
      .toBe('/accounts/acc_1?tab=knowledge&targetKind=source_record&targetId=src_1');
  });

  it('uses first judgment evolution without fabricating previous state', () => {
    const judgment = sampleJudgment();
    const evolution = buildJudgmentEvolution(judgment);
    const accountBrief = buildAccountJudgmentBrief([judgment], 'acc_1');

    expect(evolution).toMatchObject({
      currentJudgment: '客户仍在推进 CFO 评审',
      changeType: 'new',
    });
    expect(evolution?.previousJudgment).toBeUndefined();
    expect(evolution?.summary).toContain('首次形成判断');
    expect(accountBrief?.evolution?.previousJudgment).toBeUndefined();
    expect(accountBrief?.evolution?.changeType).toBe('new');
  });

  it('emits change type when whyChanged explains an update', () => {
    const evolution = buildJudgmentEvolution(sampleJudgment({
      previousSummary: '客户推进停滞，CFO 未回应。',
      summary: 'CFO 已回复并要求 ROI 评审。',
      whyChanged: 'CFO 回复后风险降低，推进改善。',
      changeEvidenceRefs: [{ sourceId: 'decode_2', sourceKind: 'email_decode', title: 'CFO 回复' }],
    }));

    expect(evolution).toMatchObject({
      previousJudgment: '客户推进停滞，CFO 未回应',
      currentJudgment: 'CFO 已回复并要求 ROI 评审',
      changeType: 'improved',
      whyChanged: 'CFO 回复后风险降低，推进改善',
    });
    expect(evolution?.changedSignals).toEqual(['CFO 回复', 'CFO 邮件']);
    expect(evolution?.summary).toContain('判断向好');
  });
});
