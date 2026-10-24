import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateStrategicPlay } from './strategic-play-engine';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { retrieveGroundedKnowledge } from '@/lib/knowledge-grounding';
import type { RelationshipGraph } from '@/lib/babel-engine/types';

vi.mock('@/lib/babel-engine/ai-fallback', () => ({
  callAIWithFallback: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => null),
}));

vi.mock('@/lib/babel-engine/context-memory', () => ({
  fetchDecodeHistory: vi.fn(async () => []),
  formatContextMemory: vi.fn(() => ''),
}));

vi.mock('@/lib/babel-engine/vector-store', () => ({
  searchSimilarCases: vi.fn(async () => []),
}));

vi.mock('@/lib/knowledge-grounding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/knowledge-grounding')>();
  return {
    ...actual,
    retrieveGroundedKnowledge: vi.fn(),
  };
});

const graph: RelationshipGraph = {
  ourTeam: [],
  theirTeam: [{ contactId: 'c_1', name: 'Alice', role: 'decision_maker', side: 'their_team', relationshipStrength: 50 }],
  edges: [],
};

describe('generateStrategicPlay knowledge grounding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callAIWithFallback).mockResolvedValue({
      situationJudgment: 'Alice 是决策入口，但需要先验证预算链。',
      strategicObjective: '推动 Alice 承诺引荐预算负责人',
      stakeholderPath: ['Alice → CFO'],
      evidenceBasis: ['Alice 是 decision_maker'],
      riskCounterEvidence: ['预算负责人未知'],
      actionPlan: [{ index: 1, title: '触达', description: '联系 Alice', who: 'AE', target: 'Alice', action: '发邮件', timing: '本周', purpose: '约会', rationale: '互惠原则', expectedOutcome: 'Alice 同意 30 分钟会面', risk: '无回应', fallback: '电话' }],
      steps: [{ index: 1, title: '触达', description: '联系 Alice', who: 'AE', target: 'Alice', action: '发邮件', timing: '本周', purpose: '约会', rationale: '互惠原则', expectedOutcome: 'Alice 同意 30 分钟会面', risk: '无回应', fallback: '电话' }],
      alternativePaths: [],
      successCriteria: 'Alice 引荐预算负责人',
      confidence: 70,
    });
  });

  it('includes grounded context in prompt and returns traces/gaps', async () => {
    vi.mocked(retrieveGroundedKnowledge).mockResolvedValue({
      query: 'expand account Acme',
      items: [],
      contextBlock: '## Grounded Knowledge Context\n### 产品/方案知识\n- [product_solution] 企业方案',
      knowledgeTraces: [{ id: 'kb_1', title: '企业方案', category: 'product_solution', relevanceReason: '匹配目标', contentSnippet: '方案摘要' }],
      knowledgeGaps: [],
    });

    const result = await generateStrategicPlay({
      accountId: 'acc_1',
      accountName: 'Acme',
      orgId: 'org_1',
      goalType: 'expand_deal',
      goalDescription: '推动续约扩容',
      opportunityId: 'opp_1',
      opportunityName: 'FY26 Expansion',
      additionalContext: '客户关注 ROI',
      graph,
    });

    expect(retrieveGroundedKnowledge).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'acc_1',
      orgId: 'org_1',
      accountName: 'Acme',
      goalDescription: '推动续约扩容',
      opportunityName: 'FY26 Expansion',
      additionalContext: '客户关注 ROI',
    }));
    expect(vi.mocked(callAIWithFallback).mock.calls[0][0].userPrompt).toContain('Grounded Knowledge Context');
    expect(result.knowledgeTraces).toHaveLength(1);
    expect(result.knowledgeGaps).toEqual([]);
    expect(result.steps[0].status).toBe('planned');
    expect(result.situationJudgment).toContain('Alice');
    expect(result.actionPlan[0].expectedOutcome).toBe('Alice 同意 30 分钟会面');
  });

  it('passes model and tier overrides through to AI fallback', async () => {
    vi.mocked(retrieveGroundedKnowledge).mockResolvedValue({
      query: 'shadow model route',
      items: [],
      contextBlock: '',
      knowledgeTraces: [],
      knowledgeGaps: [],
    });

    await generateStrategicPlay({
      accountId: 'acc_1',
      accountName: 'Acme',
      orgId: 'org_1',
      goalType: 'expand_deal',
      goalDescription: '推动续约扩容',
      graph,
      modelOverride: 'deepseek-v4-pro',
      tierOverride: 'pro',
    });

    expect(vi.mocked(callAIWithFallback).mock.calls[0][0]).toMatchObject({
      tier: 'pro',
      model: 'deepseek-v4-pro',
    });
  });

  it('adds deterministic v1 fallbacks when model omits schema fields', async () => {
    vi.mocked(callAIWithFallback).mockResolvedValueOnce({
      steps: [{ index: 1, title: '摸清预算链', description: '询问 Alice 谁控制预算', who: 'AE', target: 'Alice', action: '电话', timing: '本周', purpose: '确认预算人', risk: '信息不足', fallback: '问 Champion' }],
      alternativePaths: [],
      confidence: 55,
    });
    vi.mocked(retrieveGroundedKnowledge).mockResolvedValue({
      query: 'budget chain',
      items: [],
      contextBlock: '',
      knowledgeTraces: [],
      knowledgeGaps: ['缺少采购流程证据'],
    });

    const result = await generateStrategicPlay({
      accountId: 'acc_1',
      accountName: 'Acme',
      orgId: 'org_1',
      goalType: 'custom',
      goalDescription: '确认预算链',
      successCriteria: '拿到预算负责人姓名',
      graph,
    });

    expect(result.situationJudgment).toContain('确认预算链');
    expect(result.strategicObjective).toBe('确认预算链');
    expect(result.stakeholderPath).toContain('Alice/decision_maker');
    expect(result.riskCounterEvidence).toEqual(['缺少采购流程证据']);
    expect(result.successCriteria).toBe('拿到预算负责人姓名');
    expect(result.steps[0].expectedOutcome).toContain('确认预算人');
    expect(result.actionPlan).toEqual(result.steps);
  });

  it('falls back safely when knowledge is missing and exposes gaps', async () => {
    vi.mocked(retrieveGroundedKnowledge).mockResolvedValue({
      query: 'new logo',
      items: [],
      contextBlock: '## Grounded Knowledge Context\n### 知识缺口\n- 缺少可用产品/方案知识；建议先补充产品材料。',
      knowledgeTraces: [],
      knowledgeGaps: ['缺少可用产品/方案知识；建议先补充产品材料。'],
    });

    const result = await generateStrategicPlay({
      accountId: 'acc_1',
      accountName: 'Acme',
      orgId: 'org_1',
      goalType: 'custom',
      goalDescription: '建立冠军',
      graph,
    });

    expect(vi.mocked(callAIWithFallback).mock.calls[0][0].userPrompt).toContain('不要假装已有产品/方案材料');
    expect(result.knowledgeTraces).toEqual([]);
    expect(result.knowledgeGaps).toEqual(['缺少可用产品/方案知识；建议先补充产品材料。']);
  });
});
