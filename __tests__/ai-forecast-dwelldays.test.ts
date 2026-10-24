import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireAuth = vi.fn();
const mockRequireAdmin = vi.fn();
const mockRequireOpportunityAccess = vi.fn();
const mockGuardResponse = vi.fn((err: unknown) => {
  throw err;
});
const mockCallAIWithFallback = vi.fn();
const mockGetModelConfig = vi.fn(() => ({ tier: 'flash' }));
const mockIsAIRateLimited = vi.fn(() => false);
const mockLogError = vi.fn();
const mockLoadCILAccountContext = vi.fn();
const mockBuildCILForForecast = vi.fn(() => '');

vi.mock('@/lib/api-guard', () => ({
  requireAuth: mockRequireAuth,
  requireAdmin: mockRequireAdmin,
  requireOpportunityAccess: mockRequireOpportunityAccess,
  guardResponse: mockGuardResponse,
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

vi.mock('@/lib/compiled-intelligence/context', () => ({
  loadCILAccountContext: mockLoadCILAccountContext,
  loadCILAccountContextScoped: mockLoadCILAccountContext,
}));

vi.mock('@/lib/compiled-intelligence/prompt-context', () => ({
  buildCILForForecast: mockBuildCILForForecast,
}));

vi.mock('@/lib/knowledge-engine', () => ({
  injectKnowledgeContextScoped: vi.fn().mockResolvedValue(''),
  depositKnowledge: vi.fn(),
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

function makeAdmin() {
  return {
    from(table: string) {
      if (table === 'ai_forecasts') {
        return {
          ...makeResolvedQuery({ data: null, error: null }, { data: null, error: null }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }

      if (table === 'opportunities') {
        return makeResolvedQuery(
          { data: [], error: null },
          {
            data: {
              id: 'opp-1',
              name: '华为云项目',
              stage: 'negotiation',
              value: 1000000,
              probability: 70,
              account_id: 'acc-1',
              meddicc: {
                overallScore: 80,
                competition: [],
                champion: { strength: 3, lastEngagement: '2026-04-05', notes: '' },
                economicBuyer: { status: 'identified' },
                metrics: { status: 'confirmed', notes: 'ROI 已确认' },
                identifiedPain: [],
              },
              created_at: '2026-03-01T00:00:00.000Z',
              updated_at: '2026-04-08T13:55:00.000Z',
            },
            error: null,
          },
        );
      }

      if (table === 'activity_logs') {
        return makeResolvedQuery(
          { data: [], error: null },
          { data: { created_at: '2026-04-03T00:00:00.000Z' }, error: null },
        );
      }

      if (table === 'strategic_plays') {
        return makeResolvedQuery({ data: [], error: null });
      }

      if (table === 'accounts') {
        return makeResolvedQuery(
          { data: [], error: null },
          { data: { contacts: [] }, error: null },
        );
      }

      if (table === 'email_decodes') {
        return makeResolvedQuery({ data: [], error: null });
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-08T14:00:00.000Z'));

  mockRequireAuth.mockResolvedValue({ userId: 'user-1', orgId: 'org-1' });
  mockRequireAdmin.mockReturnValue(makeAdmin());
  mockLoadCILAccountContext.mockResolvedValue(null);
  mockCallAIWithFallback.mockResolvedValue({
    aiProbability: 66,
    factors: [],
    risks: [],
    recommendation: '保持推进节奏',
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ai-forecast dwellDays', () => {
  it('uses latest deal_stage_changed timestamp instead of opportunities.updated_at', async () => {
    const { POST } = await import('@/app/api/ai-forecast/route');
    const response = await POST(
      new Request('http://localhost/api/ai-forecast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ opportunityId: 'opp-1' }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.dwellDays).toBe(5);

    const userPrompt = mockCallAIWithFallback.mock.calls[0][0].userPrompt as string;
    expect(userPrompt).toContain('当前阶段停留天数: 5 天');
  });
});
