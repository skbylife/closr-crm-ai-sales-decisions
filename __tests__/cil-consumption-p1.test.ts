import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CILAccountContext } from '@/lib/compiled-intelligence/context';

const mockRequireAuth = vi.fn();
const mockRequireAdmin = vi.fn();
const mockRequireAccountAccess = vi.fn();
const mockRequireOpportunityAccess = vi.fn();
const mockGuardResponse = vi.fn((err: unknown) => {
  throw err;
});
const mockLoadCILAccountContext = vi.fn();
const mockCallAIWithFallback = vi.fn();
const mockGetModelConfig = vi.fn(() => ({ tier: 'flash' }));
const mockIsAIRateLimited = vi.fn(() => false);
const mockLogError = vi.fn();

vi.mock('@/lib/api-guard', () => ({
  requireAuth: mockRequireAuth,
  requireAdmin: mockRequireAdmin,
  requireAccountAccess: mockRequireAccountAccess,
  requireOpportunityAccess: mockRequireOpportunityAccess,
  guardResponse: mockGuardResponse,
}));

vi.mock('@/lib/compiled-intelligence/context', () => ({
  loadCILAccountContext: mockLoadCILAccountContext,
  loadCILAccountContextScoped: mockLoadCILAccountContext,
}));

vi.mock('@/lib/babel-engine/ai-fallback', () => ({
  callAIWithFallback: mockCallAIWithFallback,
}));

vi.mock('@/lib/babel-engine/model-router', () => ({
  getModelConfig: mockGetModelConfig,
}));

vi.mock('@/lib/rate-limit', () => ({
  isAIRateLimited: mockIsAIRateLimited,
  applyAIRateLimit: vi.fn(),
}));

vi.mock('@/lib/error-monitor', () => ({
  logError: mockLogError,
}));

vi.mock('@/lib/knowledge-engine', () => ({
  injectKnowledgeContextScoped: vi.fn().mockResolvedValue(''),
  depositKnowledge: vi.fn(),
}));

vi.mock('@/lib/ai-event-hub', () => ({
  upsertInsight: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/evidence-memory/server', () => ({
  getAccountMemoryPayload: vi.fn().mockResolvedValue({
    records: [],
    conflicts: [],
    summary: {
      confidence: 0,
      sourceCoverage: { totalRecords: 0 },
    },
  }),
}));

type QueryResult = { data: unknown; error: unknown };

type ResolvedQuery = PromiseLike<QueryResult> & {
  select: (...args: unknown[]) => ResolvedQuery;
  eq: (...args: unknown[]) => ResolvedQuery;
  in: (...args: unknown[]) => ResolvedQuery;
  order: (...args: unknown[]) => ResolvedQuery;
  limit: (...args: unknown[]) => ResolvedQuery;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};

function makeResolvedQuery(result: QueryResult, singleResult = result): ResolvedQuery {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    single: vi.fn().mockResolvedValue(singleResult),
    maybeSingle: vi.fn().mockResolvedValue(singleResult),
    then: Promise.resolve(result).then.bind(Promise.resolve(result)) as PromiseLike<QueryResult>['then'],
  };
  return query;
}

function makeCILContext(): CILAccountContext {
  return {
    accountId: 'acc_eastchina_platform_001',
    orgId: 'org-1',
    claims: [
      {
        id: 'claim-1',
        orgId: 'org-1',
        accountId: 'acc_eastchina_platform_001',
        claimType: 'risk_hypothesis',
        statement: '采购和法务仍是推进主阻力',
        status: 'active',
        confidence: 0.86,
        supportingEvidenceIds: [],
        counterEvidenceIds: [],
        affectedObjectIds: [],
        lastRevalidatedAt: '2026-04-05T00:00:00.000Z',
        createdAt: '2026-04-05T00:00:00.000Z',
        updatedAt: '2026-04-05T00:00:00.000Z',
      },
    ],
    openQuestions: [
      {
        id: 'q-1',
        orgId: 'org-1',
        accountId: 'acc_eastchina_platform_001',
        question: '最终预算签字人是否已经明确？',
        priority: 'high',
        status: 'open',
        relatedObjects: [],
        blockingOutputs: ['forecast'],
        createdAt: '2026-04-05T00:00:00.000Z',
        updatedAt: '2026-04-05T00:00:00.000Z',
      },
    ],
    evidence: [
      {
        id: 'ev-1',
        orgId: 'org-1',
        accountId: 'acc_eastchina_platform_001',
        sourceId: 'src-1',
        sourceType: 'email',
        evidenceType: 'procurement_signal',
        summary: '法务补件仍未结束，影响签约节奏。',
        occurredAt: '2026-04-03T00:00:00.000Z',
        relevanceScore: 0.9,
        linkedClaimIds: [],
        linkedPageTypes: ['risks'],
        metadata: {},
        createdAt: '2026-04-05T00:00:00.000Z',
      },
    ],
    knowledgePages: [
      {
        id: 'page-overview',
        orgId: 'org-1',
        accountId: 'acc_eastchina_platform_001',
        pageType: 'overview',
        title: 'Overview',
        contentJson: {},
        contentMd: '华东某头部互联网平台主线商机处于 negotiation，预算与采购路径仍需进一步确认。',
        version: 1,
        updatedBy: 'system',
        createdAt: '2026-04-05T00:00:00.000Z',
        updatedAt: '2026-04-05T00:00:00.000Z',
      },
      {
        id: 'page-risk',
        orgId: 'org-1',
        accountId: 'acc_eastchina_platform_001',
        pageType: 'risks',
        title: 'Risks',
        contentJson: {},
        contentMd: '主要风险：采购流程提前介入、法务补件拖慢签约。',
        version: 1,
        updatedBy: 'system',
        createdAt: '2026-04-05T00:00:00.000Z',
        updatedAt: '2026-04-05T00:00:00.000Z',
      },
      {
        id: 'page-timeline',
        orgId: 'org-1',
        accountId: 'acc_eastchina_platform_001',
        pageType: 'timeline',
        title: 'Timeline',
        contentJson: {},
        contentMd: '- 3/24 李总补件邮件\n- 3/25 一页纸提交\n- 4/03 陈涛评审阻力',
        version: 1,
        updatedBy: 'system',
        createdAt: '2026-04-05T00:00:00.000Z',
        updatedAt: '2026-04-05T00:00:00.000Z',
      },
    ],
  };
}

function makeAdmin() {
  return {
    from(table: string) {
      if (table === 'opportunities') {
        return makeResolvedQuery(
          { data: [], error: null },
          {
            data: {
              id: 'opp_platform_cloud_001',
              name: '平台基础设施智能运维升级',
              stage: 'negotiation',
              value: 2800000,
              probability: 72,
              account_id: 'acc_eastchina_platform_001',
              meddicc: {
                overallScore: 78,
                competition: [{ name: 'TCS', threatLevel: 'high' }],
                champion: { strength: 4, lastEngagement: '2026-04-02', notes: '持续推动' },
                economicBuyer: { status: 'identified' },
                metrics: { status: 'confirmed', notes: 'ROI 已确认' },
                identifiedPain: [{ pain: '运维效率低', quantified: true }],
              },
              updated_at: '2026-04-03T00:00:00.000Z',
              created_at: '2026-03-01T00:00:00.000Z',
            },
            error: null,
          },
        );
      }

      if (table === 'strategic_plays') {
        return makeResolvedQuery({
          data: [
            {
              id: 'play-1',
              goal_description: '推进法务和采购过会',
              status: 'active',
              momentum: 'progressing',
              confidence: 82,
              steps: [{ status: 'completed' }, { status: 'pending' }],
              assumptions: [{ status: 'verified', text: 'Champion 持续推进' }],
            },
          ],
          error: null,
        });
      }

      if (table === 'accounts') {
        return makeResolvedQuery(
          { data: [], error: null },
          {
            data: {
              contacts: [
                {
                  name: '李总',
                  role: 'procurement',
                  attitudeTrend: [
                    { date: '2026-03-20', score: 52, label: '谨慎' },
                    { date: '2026-04-03', score: 44, label: '降温' },
                  ],
                },
              ],
            },
            error: null,
          },
        );
      }

      if (table === 'email_decodes') {
        return makeResolvedQuery({
          data: [
            {
              date: '2026-04-03',
              decode: {
                threadAnalysis: {
                  keySignal: '需补充法务材料',
                  buyerState: 'evaluating',
                  sentimentTrend: 'cooling',
                  riskLevel: 'medium',
                },
              },
            },
          ],
          error: null,
        });
      }

      if (table === 'activity_logs') {
        return makeResolvedQuery(
          { data: [], error: null },
          { data: { created_at: '2026-04-03T00:00:00.000Z' }, error: null },
        );
      }

      if (table === 'ai_forecasts') {
        return {
          ...makeResolvedQuery({ data: null, error: null }, { data: null, error: null }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }

      if (table === 'ai_insights') {
        return makeResolvedQuery({ data: null, error: null }, { data: null, error: null });
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ userId: 'user-1', orgId: 'org-1' });
  mockRequireAdmin.mockReturnValue(makeAdmin());
  mockLoadCILAccountContext.mockResolvedValue(makeCILContext());
  mockCallAIWithFallback.mockResolvedValue({
    aiProbability: 68,
    factors: [{ name: '采购推进', impact: 'negative', detail: '采购路径仍未最终打通' }],
    risks: [{ label: '法务拖延', severity: 'high', detail: '合同审查仍需补件' }],
    recommendation: '优先锁定预算签字人与法务补件清单。',
  });
});

describe('P1 CIL consumption expansion', () => {
  it('account-strategy 注入 timeline 扩展后的 CIL 上下文且保留 fallback', async () => {
    const { POST } = await import('@/app/api/account-strategy/route');
    const response = await POST(
      new Request('http://localhost/api/account-strategy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: 'acc_eastchina_platform_001',
          account: {
            name: '华东某头部互联网平台',
            industry: 'ICT',
            dealStage: 'negotiation',
            dealValue: '2800000',
            dealHealth: 'at_risk',
          },
          contacts: [],
          intelItems: [],
          decodes: [],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockCallAIWithFallback).toHaveBeenCalledTimes(1);
    const prompt = mockCallAIWithFallback.mock.calls[0][0].userPrompt as string;
    expect(prompt).toContain('=== 编译智能层（CIL）上下文 ===');
    expect(prompt).toContain('采购和法务仍是推进主阻力');
    expect(prompt).toContain('账户时间线（CIL）');
    expect(prompt).toContain('3/24 李总补件邮件');
  });

  it('ai-forecast 在 account_id 可用时读取 CIL 作为额外判断输入', async () => {
    const { POST } = await import('@/app/api/ai-forecast/route');
    const response = await POST(
      new Request('http://localhost/api/ai-forecast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ opportunityId: 'opp_platform_cloud_001' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockLoadCILAccountContext).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-1',
      accountId: 'acc_eastchina_platform_001',
      limitEvidence: 8,
      limitClaims: 10,
    }));

    const prompt = mockCallAIWithFallback.mock.calls[0][0].userPrompt as string;
    expect(prompt).toContain('=== 编译智能层（CIL）上下文 ===');
    expect(prompt).toContain('最终预算签字人是否已经明确');
    expect(prompt).toContain('主要风险：采购流程提前介入');
  });

  it('ai-forecast 在 CIL 加载失败时保留旧路径，不阻断预测', async () => {
    mockLoadCILAccountContext.mockRejectedValueOnce(new Error('supabase down'));

    const { POST } = await import('@/app/api/ai-forecast/route');
    const response = await POST(
      new Request('http://localhost/api/ai-forecast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ opportunityId: 'opp_platform_cloud_001' }),
      }),
    );

    expect(response.status).toBe(200);
    const prompt = mockCallAIWithFallback.mock.calls[0][0].userPrompt as string;
    expect(prompt).not.toContain('=== 编译智能层（CIL）上下文 ===');
  });
});
