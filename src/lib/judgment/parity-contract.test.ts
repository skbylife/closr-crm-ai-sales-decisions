import { describe, expect, it } from 'vitest';
import type { DecodeOutput, EvidenceSourceKind, Judgment, RfpJudgment, StrategicPlay } from '@/lib/babel-engine/types';
import {
  buildAccountJudgmentBrief,
  buildDecodeJudgmentBrief,
  buildRfpEvidenceHref,
  buildRfpJudgmentBrief,
  buildRfpJudgmentFeedbackTarget,
  buildStrategicPlayJudgmentBrief,
  type JudgmentBriefData,
  type RfpAnalysisBrief,
} from './brief';
import { adaptAccountJudgmentsToJudgmentBrief, adaptBriefDataToJudgmentBrief, type JudgmentBriefSubjectType, type SourceRecordRef } from './brief-contract';
import { buildDecodeJudgmentFeedbackTarget } from './decode-feedback-target';
import { buildEvidenceHref } from './evidence-trace-links';
import { applyStrategicPlayAttributionCalibration, buildExecutionSourceRef } from '../strategic-play-attribution-calibration';
import { generatedStrategicPlayEvidenceTraceResponse } from '../strategic-play-mapping';

const NOW = '2026-05-07T16:00:00.000Z';

function sampleDecode(): DecodeOutput {
  return {
    messages: [{
      speaker: 'them',
      original: '可以推进，但 CFO 要看 ROI。',
      decode: { meaning: '客户愿意推进，但 CFO 是下一关。', emotion: '谨慎积极', urgency: 8, confidence: 0.86 },
    }],
    threadAnalysis: {
      sentimentTrend: 'warming',
      riskLevel: 'medium',
      buyerState: 'evaluating',
      keySignal: '客户愿意推进，但 CFO 需要 ROI 证据。',
    },
    actionItems: [{ title: '48小时内发送 CFO 版 ROI 摘要', priority: 'high', dueInDays: 2, reasoning: '回应下一关口' }],
  };
}

function sampleRfpAnalysis(): RfpAnalysisBrief {
  return {
    id: 'analysis_1',
    rfpId: 'rfp_1',
    winProbability: 0.64,
    strengths: ['技术匹配'],
    weaknesses: ['商务条款承压'],
    recommendations: ['先准备 CFO 可读的一页 ROI。'],
    competitorAnalysis: null,
    createdAt: NOW,
    judgment: {
      decision: 'cautious_bid',
      confidence: 72,
      rationale: '需求匹配，但采购压价和竞对报价仍未透明。',
      uncertainty: '还缺竞对最终报价和 CFO 评分权重。',
      keyRisks: ['竞对报价未知'],
      tensions: [],
      contradictions: [],
      evidenceSignals: [{ label: '技术匹配', source: 'rfp', valence: 'positive', evidence: 'RFP要求与现有方案匹配' }],
    } satisfies RfpJudgment,
  };
}

function samplePlay(): StrategicPlay {
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
    assumptions: [{ id: 'asm_1', text: 'CFO 愿意用 ROI 而不是最低价做判断。', status: 'pending', createdAt: NOW }],
    learnings: [{ stepIndex: 1, learning: 'Sponsor 愿意转发材料。', newSignal: '客户主动要求内部版本。', timestamp: NOW }],
    daysSinceProgress: 16,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function sampleAccountJudgments(): Judgment[] {
  return [{
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
    updatedAt: NOW,
  }];
}

function expectRenderableBrief(brief: JudgmentBriefData | null) {
  expect(brief).toBeTruthy();
  expect(brief?.currentJudgment).toBeTruthy();
  expect(brief?.biggestRisk).toBeTruthy();
  expect(brief?.nextAction).toBeTruthy();
  expect(brief?.quality?.evidenceStrength).toBeTruthy();
}

function expectQualityOrEvidenceGapHint(brief: JudgmentBriefData | null, label: string) {
  expect(brief, label).toBeTruthy();
  const quality = brief?.quality;
  expect(quality?.evidenceStrength, label).toBeTruthy();

  if (quality?.evidenceStrength === 'missing' || quality?.evidenceStrength === 'thin') {
    const hintText = [
      quality.provisionalLabel,
      ...(quality.flags ?? []).flatMap((flag) => [flag.label, flag.detail]),
    ].filter(Boolean).join(' ');
    expect(hintText, label).toMatch(/缺少|待|验证|补齐|补充|复核|证据|可信度/);
  }
}

describe('P0 judgment layer parity contract', () => {
  it('keeps Strategic Play, RFP, Decode, and Account on the same JudgmentBrief adapter contract', () => {
    const cases: Array<{
      label: string;
      subjectType: JudgmentBriefSubjectType;
      subjectId: string;
      accountId: string;
      brief: JudgmentBriefData | null;
      sourceRefs: SourceRecordRef[];
    }> = [
      {
        label: 'Strategic Play',
        subjectType: 'strategic_play',
        subjectId: 'play_1',
        accountId: 'acc_1',
        brief: buildStrategicPlayJudgmentBrief(samplePlay()),
        sourceRefs: [{ sourceKind: 'strategic_play', sourceId: 'play_1', orgId: 'org_1', accountId: 'acc_1', traceStatus: 'persisted' }],
      },
      {
        label: 'RFP',
        subjectType: 'rfp',
        subjectId: 'analysis_1',
        accountId: 'acc_1',
        brief: buildRfpJudgmentBrief(sampleRfpAnalysis()),
        sourceRefs: [{ sourceKind: 'rfp_analysis', sourceId: 'analysis_1', orgId: 'org_1', accountId: 'acc_1', sourceTable: 'rfp_ai_analyses', sourceRowId: 'analysis_1', traceStatus: 'persisted' }],
      },
      {
        label: 'Decode',
        subjectType: 'decode',
        subjectId: 'decode_1',
        accountId: 'acc_1',
        brief: buildDecodeJudgmentBrief({
          decode: sampleDecode(),
          savedAccountId: 'acc_1',
          savedDecodeId: 'decode_1',
          signalSourceLabel: '邮件线程',
          analysisGoalLabel: '推进 CFO 评审',
          updatedAt: NOW,
        }),
        sourceRefs: [{ sourceKind: 'email_decode', sourceId: 'decode_1', orgId: 'org_1', accountId: 'acc_1', sourceTable: 'email_decodes', sourceRowId: 'decode_1', traceStatus: 'persisted' }],
      },
      {
        label: 'Account',
        subjectType: 'account',
        subjectId: 'acc_1',
        accountId: 'acc_1',
        brief: buildAccountJudgmentBrief(sampleAccountJudgments(), 'acc_1'),
        sourceRefs: [{ sourceKind: 'account_judgment', sourceId: 'acc_1', orgId: 'org_1', accountId: 'acc_1', traceStatus: 'derived' }],
      },
    ];

    for (const parityCase of cases) {
      expectRenderableBrief(parityCase.brief);
      const canonical = adaptBriefDataToJudgmentBrief({
        subjectType: parityCase.subjectType,
        subjectId: parityCase.subjectId,
        accountId: parityCase.accountId,
        orgId: 'org_1',
        brief: parityCase.brief!,
        sourceRefs: parityCase.sourceRefs,
        createdAt: NOW,
        updatedAt: NOW,
      });

      expect(canonical, parityCase.label).toMatchObject({
        subjectType: parityCase.subjectType,
        subjectId: parityCase.subjectId,
        orgId: 'org_1',
        accountId: parityCase.accountId,
      });
      expect(canonical?.evidenceRefs.length, parityCase.label).toBeGreaterThan(0);
      expect(canonical?.sourceRefs.length, parityCase.label).toBeGreaterThan(0);
      expect(canonical?.sourceRefs.every((ref) => ref.orgId === 'org_1' && ref.accountId === parityCase.accountId), parityCase.label).toBe(true);
    }
  });


  it('keeps quality/evidence-strength visible or explains missing evidence across every JudgmentBrief surface', () => {
    const weakRfp = buildRfpJudgmentBrief({
      id: 'analysis_no_evidence',
      rfpId: 'rfp_1',
      winProbability: 25,
      strengths: [],
      weaknesses: ['采购标准未知。'],
      recommendations: [],
      competitorAnalysis: null,
      judgment: null,
      createdAt: NOW,
    } satisfies RfpAnalysisBrief);

    const weakDecode = buildDecodeJudgmentBrief({
      decode: {
        messages: [],
        threadAnalysis: {
          sentimentTrend: 'neutral',
          riskLevel: 'medium',
          buyerState: 'unknown',
          keySignal: '只有摘要信号，缺少可逐条追溯的沟通证据。',
        },
        actionItems: [],
      } as unknown as DecodeOutput,
      updatedAt: NOW,
    });

    const weakStrategicPlay = buildStrategicPlayJudgmentBrief({ id: 'play_dirty', accountId: 'acc_1', goalDescription: '' } as unknown as StrategicPlay);
    const weakAccount = buildAccountJudgmentBrief([{ ...sampleAccountJudgments()[0]!, evidenceRefs: [] }], 'acc_1');

    const cases: Array<[string, JudgmentBriefData | null]> = [
      ['RFP', buildRfpJudgmentBrief(sampleRfpAnalysis())],
      ['Decode', buildDecodeJudgmentBrief({ decode: sampleDecode(), savedAccountId: 'acc_1', savedDecodeId: 'decode_1', updatedAt: NOW })],
      ['Strategic Play', buildStrategicPlayJudgmentBrief(samplePlay())],
      ['Account', buildAccountJudgmentBrief(sampleAccountJudgments(), 'acc_1')],
      ['RFP weak evidence', weakRfp],
      ['Decode weak evidence', weakDecode],
      ['Strategic Play weak evidence', weakStrategicPlay],
      ['Account weak evidence', weakAccount],
    ];

    for (const [label, brief] of cases) {
      expectQualityOrEvidenceGapHint(brief, label);
    }

    expect(weakRfp?.quality?.evidenceStrength).toBe('thin');
    expect(weakDecode?.quality?.evidenceStrength).toBe('thin');
    expect(weakStrategicPlay.quality?.evidenceStrength).toBe('missing');
    expect(weakAccount?.quality?.evidenceStrength).toBe('missing');
  });

  it('keeps RFP feedback targets bound to the same clickable evidence route as the brief', () => {
    const analysis = sampleRfpAnalysis();
    const href = buildRfpEvidenceHref({ opportunityId: 'opp 1', rfpId: analysis.rfpId, analysisId: analysis.id, signalIndex: 0 });
    const brief = buildRfpJudgmentBrief(analysis, { opportunityId: 'opp 1' });
    const feedbackTarget = buildRfpJudgmentFeedbackTarget({ analysis, accountId: 'acc_1', brief });

    expect(href).toBe('/pipeline/opp%201?tab=rfp&rfpId=rfp_1&analysisId=analysis_1&signalIndex=0');
    expect(brief?.evidenceChips?.length).toBeGreaterThan(0);
    expect(brief?.evidenceChips?.[0]?.href).toBe(href);
    expect(brief?.evidenceChips?.every((chip, index) => chip.href === buildRfpEvidenceHref({ opportunityId: 'opp 1', rfpId: analysis.rfpId, analysisId: analysis.id, signalIndex: index }))).toBe(true);
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
    expect(nonClickableBrief?.evidenceChips?.some((chip) => chip.href)).toBe(false);
  });

  it('gates Decode feedback/evidence targets behind the saved flag so stale ids never leak', () => {
    const savedTarget = buildDecodeJudgmentFeedbackTarget({
      saved: true,
      savedAccountId: 'acc_1',
      savedDecodeId: 'decode_1',
      savedAccountName: 'Acme',
      previousSummary: '客户愿意推进，但 CFO 需要 ROI 证据。',
    });

    expect(savedTarget).toMatchObject({
      accountId: 'acc_1',
      targetType: 'decode',
      targetId: 'decode_1',
      previousSummary: '客户愿意推进，但 CFO 需要 ROI 证据。',
      evidenceRefs: [expect.objectContaining({ sourceKind: 'email_decode', sourceId: 'decode_1', sourceTable: 'email_decodes' })],
    });

    expect(buildDecodeJudgmentFeedbackTarget({
      saved: false,
      savedAccountId: 'acc_stale',
      savedDecodeId: 'decode_stale',
      previousSummary: '这条未保存 Decode 不应暴露旧 target。',
    })).toBeUndefined();
  });

  it('keeps Strategic Play field attributions and calibration history attached to evidence provenance', () => {
    const trace = generatedStrategicPlayEvidenceTraceResponse({
      situationJudgment: '预算窗口打开，但采购链路仍待确认。',
      strategicObjective: '锁定 CFO 预算承诺',
      actionPlan: [{
        index: 1,
        title: '约 CFO',
        description: '请 Champion 引荐 CFO 并确认预算窗口。',
        who: 'AE',
        target: 'Champion',
        action: '发邮件约 CFO',
        timing: '本周',
        purpose: '确认预算链',
        expectedOutcome: 'CFO 确认预算',
        risk: 'Champion 回避',
        fallback: '找技术负责人侧证',
        status: 'planned',
      }],
      knowledgeTraces: [{ id: 'kb_1', title: 'Acme 扩容案例', category: 'case_study', source: 'knowledge_base', sourceType: 'knowledge_items', relevanceReason: '相似扩容路径', contentSnippet: '先确认 CFO 预算再推进扩容' }],
      knowledgeGaps: ['缺少采购评分标准证据'],
    });

    expect(trace.provenance?.fieldEvidenceAttributions).toEqual(trace.fieldEvidenceAttributions);
    expect(trace.fieldEvidenceAttributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'situationJudgment', classification: 'mixed' }),
      expect.objectContaining({ field: 'steps[0].expectedOutcome', classification: 'mixed' }),
    ]));
    expect(trace.fieldEvidenceRefs.actionPlan).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'kb_1', sourceTable: 'knowledge_items' }),
    ]));

    const sourceRef = buildExecutionSourceRef({
      sourceId: 'play_1:0:done:2026-05-07T16:00:00.000Z',
      sourceType: 'play_execution_event',
      sourceKind: 'source_record',
      sourceTable: 'source_records',
      sourceRowId: 'play_1:0:done:2026-05-07T16:00:00.000Z',
      title: '谋局执行 · 已完成',
      excerpt: 'CFO 确认预算',
      occurredAt: NOW,
    });
    const calibrated = applyStrategicPlayAttributionCalibration({
      evidenceProvenance: trace.provenance,
      stepIndex: 0,
      executionStatus: 'done',
      outcomeAssessment: 'matched_expected',
      sourceRef,
      targetFields: ['steps[0].expectedOutcome'],
      note: '真实执行结果命中预期',
      occurredAt: NOW,
      createdBy: 'user_1',
    });

    expect(calibrated.provenance.fieldEvidenceAttributions).toEqual(calibrated.attributions);
    expect(calibrated.attributions.find((item) => item.field === 'steps[0].expectedOutcome')).toMatchObject({
      classification: 'fact',
      evidenceRefs: expect.arrayContaining([expect.objectContaining({ sourceType: 'play_execution_event' })]),
      calibrations: [expect.objectContaining({ calibratedClassification: 'verified', createdBy: 'user_1' })],
    });
  });

  it('filters cross-account account judgments before canonical parity refs are built', () => {
    const canonical = adaptAccountJudgmentsToJudgmentBrief({
      orgId: 'org_1',
      accountId: 'acc_1',
      judgments: [
        {
          ...sampleAccountJudgments()[0]!,
          id: 'bad_acc_2',
          accountId: 'acc_2',
          summary: '跨账户判断不应进入 acc_1。',
          evidenceRefs: [{ sourceId: 'decode_bad', sourceKind: 'email_decode', title: '跨账户邮件' }],
        },
        {
          ...sampleAccountJudgments()[0]!,
          evidenceRefs: [
            { sourceId: 'decode_ref_bad', sourceKind: 'email_decode', title: '跨账户 evidence', accountId: 'acc_2' } as unknown as Judgment['evidenceRefs'][number],
            ...sampleAccountJudgments()[0]!.evidenceRefs,
          ],
        },
      ],
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(canonical?.accountId).toBe('acc_1');
    expect(canonical?.currentJudgment).not.toContain('跨账户');
    expect(canonical?.evidenceRefs.map((ref) => ref.sourceId)).toEqual(['decode_1']);
    expect(canonical?.sourceRefs.map((ref) => ref.sourceId)).toEqual(['decode_1']);
  });

  it('keeps EvidenceTrace hrefs routable for every supported evidence source kind', () => {
    const cases: Array<[EvidenceSourceKind, string, string]> = [
      ['intel_item', 'intel_1', '/accounts/acc_1?tab=activity&targetKind=intel_item&targetId=intel_1'],
      ['email_decode', 'decode_1', '/accounts/acc_1?tab=activity&targetKind=email_decode&targetId=decode_1'],
      ['integration_email', 'mail_1', '/accounts/acc_1?tab=activity&targetKind=integration_email&targetId=mail_1'],
      ['meeting_prep', 'meeting_1', '/accounts/acc_1?tab=activity&targetKind=meeting_prep&targetId=meeting_1'],
      ['activity_log', 'activity_1', '/accounts/acc_1?tab=activity&targetKind=activity_log&targetId=activity_1'],
      ['strategic_play', 'play_1', '/accounts/acc_1?tab=plays&playId=play_1'],
    ];

    for (const [sourceKind, sourceId, href] of cases) {
      expect(buildEvidenceHref({ sourceKind, sourceId }, 'acc_1')).toBe(href);
    }
    expect(buildEvidenceHref({ sourceKind: 'source_record', sourceId: 'src_1', sourceRowId: 'row_1' }, 'acc_1'))
      .toBe('/accounts/acc_1?tab=knowledge&targetKind=source_record&targetId=row_1');
    expect(buildEvidenceHref({ sourceKind: 'source_record', sourceId: 'src_1' }, 'acc_1'))
      .toBe('/accounts/acc_1?tab=knowledge&targetKind=source_record&targetId=src_1');
  });
});
