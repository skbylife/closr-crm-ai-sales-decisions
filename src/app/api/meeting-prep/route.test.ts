import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { requireAccountAccess, requireAdmin, requireAuth } from '@/lib/api-guard';
import { retrieveGroundedKnowledge } from '@/lib/knowledge-grounding';

vi.mock('@/lib/api-guard', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
  requireAccountAccess: vi.fn(),
  guardResponse: (err: unknown) => Response.json({ error: err instanceof Error ? err.message : 'error' }, { status: 500 }),
}));

vi.mock('@/lib/babel-engine/ai-fallback', () => ({
  callAIWithFallback: vi.fn(),
}));

vi.mock('@/lib/babel-engine/model-router', () => ({
  getModelConfig: vi.fn(() => ({ tier: 'flash' })),
}));

vi.mock('@/lib/rate-limit', () => ({
  isAIRateLimited: vi.fn(() => false),
  applyAIRateLimit: vi.fn(),
}));

vi.mock('@/lib/error-monitor', () => ({
  logError: vi.fn(),
}));

vi.mock('@/lib/knowledge-grounding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/knowledge-grounding')>();
  return {
    ...actual,
    retrieveGroundedKnowledge: vi.fn(),
  };
});

function request(body: unknown) {
  return new Request('http://localhost/api/meeting-prep', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeAdmin() {
  return {
    from(table: string) {
      const query = {
        select() { return query; },
        eq() { return query; },
        in() { return query; },
        limit() { return Promise.resolve({ data: [{ name: 'Alice', title: 'VP', role: 'decision_maker' }], error: null }); },
        single() {
          if (table === 'accounts') {
            return Promise.resolve({ data: { name: 'Acme', industry: 'SaaS', deal_stage: 'demo', deal_value: 100000, deal_health: 'green' }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return query;
    },
  };
}

const aiResult = {
  meetingSummary: { title: 'Demo', date: '2026-05-05', type: 'demo', ourTeam: 'AE' },
  winProbability: 60,
  winProbabilityReasoning: '有明确需求',
  contactAnalysis: [],
  agendaPrep: [],
  suggestedScripts: { opening: '', keyTransitions: [], closing: '' },
  questionsToAsk: [],
  topicsToAvoid: [],
  actionItems: [],
  suggestedMaterials: ['AI 编造材料'],
  recentDynamics: '',
  talkingPoints: [],
  attendeeProfiles: [],
  negotiationStrategy: { overallApproach: '', concessionPlan: [], leveragePoints: [], redLines: [] },
  riskAlerts: [],
};

describe('/api/meeting-prep knowledge grounding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'member',
      roleLevel: 'member',
      jobLevel: 0,
      teamId: null,
      teamMemberIds: [],
    });
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin() as unknown as ReturnType<typeof requireAdmin>);
    vi.mocked(requireAccountAccess).mockResolvedValue(undefined);
    vi.mocked(callAIWithFallback).mockResolvedValue(aiResult);
  });

  it('injects server-side grounded knowledge when accountId is present and supports {accountId,input}', async () => {
    vi.mocked(retrieveGroundedKnowledge).mockResolvedValue({
      query: 'Acme demo',
      items: [],
      contextBlock: '## Grounded Knowledge Context\n### 产品/方案知识\n- [product_solution] Acme方案',
      knowledgeTraces: [{ id: 'kb_1', title: 'Acme方案', category: 'product_solution', relevanceReason: '产品匹配', contentSnippet: '方案摘要' }],
      knowledgeGaps: [],
    });

    const response = await POST(request({
      accountId: 'acc_1',
      input: { meetingType: 'demo', meetingObjective: '推进方案演示', attendeeContactIds: ['c_1'] },
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(requireAccountAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), 'acc_1');
    expect(retrieveGroundedKnowledge).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc_1', accountName: 'Acme', meetingObjective: '推进方案演示' }));
    expect(vi.mocked(callAIWithFallback).mock.calls[0][0].userPrompt).toContain('Grounded Knowledge Context');
    expect(payload.knowledgeTraces).toHaveLength(1);
    expect(payload.suggestedMaterials).toEqual(['Acme方案（product_solution）']);
  });

  it('keeps legacy knowledgeBase compatibility without server retrieval', async () => {
    const response = await POST(request({
      meetingType: 'demo',
      account: { name: 'LegacyCo' },
      contacts: [],
      recentIntel: [],
      recentDecodes: [],
      knowledgeBase: '[旧材料] 旧方案摘要',
    }));

    expect(response.status).toBe(200);
    expect(retrieveGroundedKnowledge).not.toHaveBeenCalled();
    expect(vi.mocked(callAIWithFallback).mock.calls[0][0].userPrompt).toContain('Legacy Knowledge Base');
  });

  it('returns knowledge gaps and bases suggestedMaterials on gaps when product knowledge is missing', async () => {
    vi.mocked(retrieveGroundedKnowledge).mockResolvedValue({
      query: 'Acme discovery',
      items: [],
      contextBlock: '## Grounded Knowledge Context\n### 知识缺口\n- 缺少可用产品/方案知识；建议先补充产品材料。',
      knowledgeTraces: [],
      knowledgeGaps: ['缺少可用产品/方案知识；建议先补充产品材料。'],
    });

    const response = await POST(request({
      accountId: 'acc_1',
      input: { meetingType: 'discovery', meetingObjective: '发现需求' },
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.knowledgeGaps).toEqual(['缺少可用产品/方案知识；建议先补充产品材料。']);
    expect(payload.suggestedMaterials).toEqual(['缺少可用产品/方案知识；建议先补充产品材料。']);
  });
});
