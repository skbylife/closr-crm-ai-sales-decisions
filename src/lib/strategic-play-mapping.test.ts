import { describe, expect, it } from 'vitest';
import {
  generatedStrategicPlayEvidenceTraceResponse,
  mapStrategicPlayRowToApiPlay,
  normalizeSteps,
  strategicPlayEvidenceTraceResponse,
} from './strategic-play-mapping';

const baseRow = {
  id: 'play_1',
  account_id: 'acc_1',
  opportunity_id: null,
  target_contact_id: null,
  goal_type: 'expand_deal',
  goal_description: '推动 Q2 扩容',
  alternative_paths: [],
  confidence: 61,
  status: 'active',
  assumptions: [],
  learnings: [],
  created_at: '2026-05-06T14:00:00.000Z',
  updated_at: '2026-05-06T14:00:00.000Z',
  user_id: 'user_1',
};

const persistedProvenance = {
  evidenceIds: ['ev_1'],
  sourceIds: ['sr_1'],
  sourceTypes: ['source_record'],
  confidence: 0.82,
  contradictions: [],
  tensions: ['采购流程仍需确认'],
  rationale: '基于已保存证据',
  traces: [
    {
      evidenceId: 'ev_1',
      sourceId: 'sr_1',
      sourceType: 'source_record',
      sourceTable: 'source_records',
      sourceRowId: 'sr_1',
      title: '预算邮件',
      excerpt: '客户提到 Q2 预算',
    },
  ],
  fieldEvidenceAttributions: [
    {
      field: 'situationJudgment',
      classification: 'fact',
      evidenceRefs: [{ sourceId: 'sr_1', sourceType: 'source_record', sourceTable: 'source_records', title: '预算邮件' }],
      gaps: [],
      rationale: '邮件直接支持预算窗口判断',
    },
    {
      field: 'steps[0].expectedOutcome',
      classification: 'inference',
      evidenceRefs: [{ sourceId: 'sr_1', sourceType: 'source_record', title: '预算邮件' }],
      gaps: ['未确认 CFO 是否参与'],
      rationale: '基于预算邮件推断下一步产出',
    },
  ],
  generatedAt: '2026-05-06T14:10:00.000Z',
};

describe('strategic-play-mapping', () => {
  it('keeps old play v1 fallback and GET response shape stable', () => {
    const play = mapStrategicPlayRowToApiPlay({
      ...baseRow,
      steps: [
        {
          title: '验证预算人',
          description: '请 Champion 引荐 CFO',
          expected_outcome: 'Champion 给出 CFO 引荐或明确拒绝原因',
          successSignal: '不应覆盖 expected_outcome',
        },
      ],
    });

    expect(play).toMatchObject({
      id: 'play_1',
      accountId: 'acc_1',
      opportunityId: null,
      targetContactId: null,
      goalType: 'expand_deal',
      goalDescription: '推动 Q2 扩容',
      situationJudgment: '围绕「推动 Q2 扩容」的局势判断尚未结构化；需在执行中补齐关键人、证据和反证。',
      strategicObjective: '推动 Q2 扩容',
      stakeholderPath: ['待识别关键人路径'],
      evidenceBasis: ['历史谋局记录/用户目标/关系图谱'],
      riskCounterEvidence: ['旧数据未记录反证；执行中需持续验证。'],
      steps: [{ index: 1, expectedOutcome: 'Champion 给出 CFO 引荐或明确拒绝原因' }],
      actionPlan: [{ index: 1, expectedOutcome: 'Champion 给出 CFO 引荐或明确拒绝原因' }],
      confidence: 61,
      momentum: 'active',
      successCriteria: null,
      deadline: null,
      assumptions: [],
      learnings: [],
      review: null,
      lastStepAt: null,
      daysSinceProgress: 0,
      knowledgeTraces: [],
      knowledgeGaps: [],
      provenance: null,
      createdAt: '2026-05-06T14:00:00.000Z',
      userId: 'user_1',
      updatedAt: '2026-05-06T14:00:00.000Z',
    });
    expect(play.steps).toBe(play.actionPlan);
    expect(play.fieldEvidenceAttributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'situationJudgment', classification: 'gap' }),
      expect.objectContaining({ field: 'steps[0].expectedOutcome', classification: 'gap' }),
    ]));
    expect(play.evidenceTrace.fieldEvidenceAttributions).toEqual(play.fieldEvidenceAttributions);
    expect(play.v2.routePlan).toMatchObject({
      schemaVersion: 'strategic_play_route_plan_v1',
      playId: 'play_1',
      accountId: 'acc_1',
      goal: {
        description: '推动 Q2 扩容',
        confidence: 0.61,
      },
      routeThesis: '推动 Q2 扩容',
      moves: [
        expect.objectContaining({
          title: '验证预算人',
          expectedJudgmentDelta: 'Champion 给出 CFO 引荐或明确拒绝原因',
          successTest: 'Champion 给出 CFO 引荐或明确拒绝原因',
        }),
      ],
    });
  });

  it('keeps persisted provenance and fieldEvidenceAttributions unchanged in response', () => {
    const trace = strategicPlayEvidenceTraceResponse({
      ...baseRow,
      situation_judgment: '预算窗口打开',
      strategic_objective: '锁定 CFO 承诺',
      stakeholder_path: ['Champion → CFO'],
      evidence_basis: ['预算邮件'],
      risk_counter_evidence: ['采购流程未知'],
      steps: [{ index: 1, title: '约 CFO', expectedOutcome: 'CFO 确认预算' }],
      success_criteria: 'CFO 确认下一步',
      knowledge_traces: [],
      knowledge_gaps: [],
      evidence_provenance: persistedProvenance,
    });

    expect(trace.provenance).toEqual(persistedProvenance);
    expect(trace.fieldEvidenceAttributions).toEqual(persistedProvenance.fieldEvidenceAttributions);
    expect(trace.fieldEvidenceRefs.situationJudgment).toEqual(persistedProvenance.fieldEvidenceAttributions[0].evidenceRefs);
    expect(trace.fieldEvidenceRefs.actionPlan).toEqual(persistedProvenance.fieldEvidenceAttributions[1].evidenceRefs);
  });

  it('keeps generated trace fallback when generated attributions are missing', () => {
    const trace = generatedStrategicPlayEvidenceTraceResponse({
      situationJudgment: '预算窗口打开，但采购链路不透明。',
      strategicObjective: '锁定 CFO 预算承诺',
      stakeholderPath: ['Champion → CFO'],
      evidenceBasis: ['Champion 回复积极'],
      riskCounterEvidence: ['采购标准未知'],
      actionPlan: [{ index: 1, title: '验证预算人', description: '请 Champion 引荐 CFO', who: 'AE', target: 'Champion', action: '发邮件', timing: '本周', purpose: '确认预算链', rationale: 'MEDDIC Economic Buyer', expectedOutcome: 'Champion 给出 CFO 引荐', risk: 'Champion 回避', fallback: '找技术负责人侧证', status: 'planned' }],
      successCriteria: 'CFO 确认预算和下一步会议',
      knowledgeTraces: [{ id: 'kb_1', title: 'Acme 扩容案例', category: 'case_study', source: 'knowledge_base', sourceType: 'knowledge_items', relevanceReason: '相似扩容路径', contentSnippet: '先确认 CFO 预算再推进扩容' }],
      knowledgeGaps: ['缺少采购评分标准证据'],
      provenance: null,
    });

    expect(trace.knowledgeTraces).toHaveLength(1);
    expect(trace.knowledgeGaps).toEqual(['缺少采购评分标准证据']);
    expect(trace.provenance).toEqual(expect.objectContaining({
      evidenceIds: [],
      sourceIds: [],
      sourceTypes: [],
      confidence: 0,
      rationale: '字段级证据归因；未能生成全局 evidence provenance，保守记录为 gap/mixed。',
      fieldEvidenceAttributions: trace.fieldEvidenceAttributions,
    }));
    expect(trace.fieldEvidenceAttributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'evidenceBasis', classification: 'mixed', gaps: ['缺少采购评分标准证据'] }),
      expect.objectContaining({ field: 'steps[0].expectedOutcome', classification: 'mixed', evidenceRefs: [expect.objectContaining({ sourceId: 'kb_1', sourceTable: 'knowledge_items' })] }),
    ]));
    expect(trace.fieldEvidenceRefs.situationJudgment[0]).toMatchObject({ sourceId: 'kb_1', sourceTable: 'knowledge_items' });
  });

  it('keeps expected_outcome -> expectedOutcome fallback before successSignal', () => {
    expect(normalizeSteps([
      { title: '旧字段步骤', expected_outcome: '使用 snake_case 预期结果', successSignal: '不应优先使用 successSignal' },
      { title: '旧 signal 步骤', successSignal: '兼容 successSignal' },
    ])).toMatchObject([
      { index: 1, expectedOutcome: '使用 snake_case 预期结果' },
      { index: 2, expectedOutcome: '兼容 successSignal' },
    ]);
  });
});
