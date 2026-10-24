import { describe, expect, it } from 'vitest';
import type { StrategicPlay } from '@/lib/babel-engine/types';
import {
  buildStrategicPlayTraceRefs,
  expectedOutcomeAttributionFor,
  fieldAttributionFor,
  formatStrategicPlayFieldValue,
  getStrategicPlayFieldAttributions,
  normalizeStrategicPlayConfidence,
  sourceTableLabel,
  summarizeFieldEvidenceAttributions,
} from './strategic-play-evidence-ui';

function samplePlay(overrides: Partial<StrategicPlay> = {}): StrategicPlay {
  return {
    id: 'play_1',
    orgId: 'org_1',
    userId: 'user_1',
    accountId: 'acc_1',
    goalType: 'reach_key_person',
    goalDescription: '进入 CFO 视野',
    steps: [
      {
        index: 0,
        title: '验证预算 owner',
        description: '确认 CFO 是否拥有最终预算权',
        action: '约一次预算确认电话',
        who: 'AE',
        target: 'Champion',
        purpose: '验证权力结构',
        timing: '本周',
        status: 'planned',
        risk: 'Champion 可能代答 CFO 意向',
        fallback: '转向采购负责人补证据',
        expectedOutcome: '拿到 CFO 预算参与度信号',
      },
    ],
    alternativePaths: [],
    confidence: 68,
    status: 'active',
    momentum: 'active',
    situationJudgment: 'Champion 支持，但 CFO 权力仍未确认',
    strategicObjective: '补齐 CFO 证据后推进商务会',
    stakeholderPath: ['Champion', 'CFO'],
    evidenceBasis: ['Champion 明确表达兴趣', '已有技术试用反馈'],
    riskCounterEvidence: ['缺少 CFO 预算信号'],
    fieldEvidenceAttributions: [
      {
        field: 'situationJudgment',
        classification: 'mixed',
        evidenceRefs: [{ sourceId: 'intel_1', sourceType: 'intel_item', sourceKind: 'intel_item', title: 'Champion call' }],
        gaps: ['CFO 未直接确认'],
        rationale: '事实信号与权力缺口并存',
      },
      {
        field: 'steps[0].expectedOutcome',
        classification: 'inference',
        evidenceRefs: [{ sourceId: 'intel_1', sourceType: 'intel_item', sourceKind: 'intel_item', title: 'Champion call' }],
        gaps: [],
      },
    ],
    successCriteria: 'CFO 同意进入商务会',
    knowledgeTraces: [{ id: 'k_1', title: 'MEDDICC budget guide', category: 'sales', relevanceReason: '预算验证', contentSnippet: 'Confirm economic buyer.' }],
    knowledgeGaps: ['缺少 CFO 原话'],
    provenance: {
      evidenceIds: ['intel_1'],
      sourceIds: ['intel_1'],
      sourceTypes: ['intel_item'],
      confidence: 0.62,
      contradictions: [],
      tensions: ['Champion 乐观但预算权未知'],
      rationale: '由字段证据归因与知识线索合并生成',
      traces: [{ sourceId: 'intel_1', sourceType: 'intel_item', sourceKind: 'intel_item', title: 'Champion call' }],
      generatedAt: '2026-05-06T00:00:00.000Z',
    },
    assumptions: [],
    learnings: [],
    daysSinceProgress: 0,
    createdAt: '2026-05-06T00:00:00.000Z',
    updatedAt: '2026-05-06T00:00:00.000Z',
    ...overrides,
  };
}

describe('strategic-play-evidence-ui', () => {
  it('selects stable field and step expected outcome attributions', () => {
    const play = samplePlay();

    expect(fieldAttributionFor(play.fieldEvidenceAttributions, 'situationJudgment')?.classification).toBe('mixed');
    expect(expectedOutcomeAttributionFor(play.fieldEvidenceAttributions, play.steps[0], 0)?.classification).toBe('inference');
  });

  it('formats strategic play field values without pretending missing content is evidence', () => {
    const play = samplePlay({ riskCounterEvidence: [] });

    expect(formatStrategicPlayFieldValue(play, 'evidenceBasis')).toBe('Champion 明确表达兴趣；已有技术试用反馈');
    expect(formatStrategicPlayFieldValue(play, 'riskCounterEvidence')).toBe('暂无结构化内容');
    expect(formatStrategicPlayFieldValue(play, 'stakeholderPath')).toBe('Champion；CFO');
  });

  it('formats strategic play field values in English mode without Chinese count suffixes', () => {
    const play = samplePlay({
      evidenceBasis: ['Security review passed', 'POC budget is approved', 'Rachel requested private-cloud validation'],
      riskCounterEvidence: [],
    });

    expect(formatStrategicPlayFieldValue(play, 'evidenceBasis', 'en')).toBe('Security review passed; POC budget is approved and 1 more');
    expect(formatStrategicPlayFieldValue(play, 'riskCounterEvidence', 'en')).toBe('No structured content yet');
  });

  it('builds deduped trace refs from attributions, provenance, and knowledge traces', () => {
    const refs = buildStrategicPlayTraceRefs(samplePlay());

    expect(refs.map((ref) => ref.sourceId)).toEqual(['intel_1', 'k_1']);
  });

  it('localizes source table fallback labels', () => {
    expect(sourceTableLabel('discovery_notes')).toBe('发现记录');
    expect(sourceTableLabel('email_decodes')).toBe('邮件解读');
    expect(sourceTableLabel('account_evidence')).toBe('账户证据');
    expect(sourceTableLabel('discovery_notes', 'en')).toBe('Discovery Note');
    expect(sourceTableLabel('email_decodes', 'en')).toBe('Email Decode');
    expect(sourceTableLabel('account_evidence', 'en')).toBe('Account Evidence');
  });

  it('summarizes attribution coverage and normalizes confidence', () => {
    const attributions = getStrategicPlayFieldAttributions(samplePlay());
    const summary = summarizeFieldEvidenceAttributions(attributions);

    expect(summary).toMatchObject({ total: 2, inference: 1, mixed: 1, evidenceRefs: 2, gaps: 1 });
    expect(normalizeStrategicPlayConfidence(68)).toBe(0.68);
    expect(normalizeStrategicPlayConfidence(0.62)).toBe(0.62);
  });
});
