import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { requireAdmin, requireAuth, requireOpportunityAccess } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';

const queries: QueryStub[] = [];

vi.mock('@/lib/api-guard', () => {
  class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  }

  return {
    ApiError,
    requireAuth: vi.fn(),
    requireAdmin: vi.fn(),
    requireAccountAccess: vi.fn(),
    requireOpportunityAccess: vi.fn(),
    guardResponse: (err: unknown) => {
      const status = err instanceof ApiError ? err.status : 500;
      const message = err instanceof Error ? err.message : 'error';
      return Response.json({ error: message }, { status });
    },
  };
});

vi.mock('@/lib/babel-engine/ai-fallback', () => ({
  callAIWithFallback: vi.fn(),
}));

vi.mock('@/lib/babel-engine/model-router', () => ({
  getModelConfig: vi.fn(() => ({ tier: 'pro' })),
}));

vi.mock('@/lib/rate-limit', () => ({
  isAIRateLimited: vi.fn(() => false),
  applyAIRateLimit: vi.fn(),
}));

vi.mock('@/lib/error-monitor', () => ({
  logError: vi.fn(),
}));

vi.mock('@/lib/ai-cache', () => ({
  withDailyCache: vi.fn(async ({ compute }) => compute()),
}));

class QueryStub {
  calls: Array<{ method: string; args: unknown[] }> = [];

  constructor(readonly table: string) {}

  select(...args: unknown[]) { this.calls.push({ method: 'select', args }); return this; }
  eq(...args: unknown[]) { this.calls.push({ method: 'eq', args }); return this; }
  in(...args: unknown[]) { this.calls.push({ method: 'in', args }); return this; }
  or(...args: unknown[]) { this.calls.push({ method: 'or', args }); return this; }
  limit(...args: unknown[]) { this.calls.push({ method: 'limit', args }); return this; }
  single() {
    this.calls.push({ method: 'single', args: [] });
    if (this.table === 'opportunities') {
      return Promise.resolve({
        data: {
          id: 'opp_current',
          org_id: 'org_1',
          name: 'Current Deal',
          stage: 'proposal',
          value: 50_000,
          account_id: 'acc_current',
          meddicc: { overallScore: 70, champion: { strength: 4, notes: 'strong' } },
          notes: 'current notes',
        },
        error: null,
      });
    }
    if (this.table === 'accounts') {
      return Promise.resolve({ data: { id: 'acc_current', name: 'Current Account', industry: 'SaaS', contacts: [] }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }

  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve({ data: this.data(), error: null }).then(onfulfilled, onrejected);
  }

  private data(): unknown[] {
    if (this.table === 'accounts') return [{ id: 'acc_owned', name: 'Owned Account', industry: 'Fintech', contacts: [] }];
    if (this.table === 'opportunities') {
      const hasClosedWon = this.calls.some((call) => call.method === 'eq' && call.args[0] === 'stage' && call.args[1] === 'closed_won');
      const isVisibilityLookup = this.calls.some((call) => call.method === 'select' && call.args[0] === 'id, account_id')
        && !hasClosedWon;
      if (isVisibilityLookup) return [{ id: 'opp_won', account_id: 'acc_owned' }, { id: 'opp_current', account_id: 'acc_current' }];
      if (hasClosedWon) {
        return [{
          id: 'opp_won',
          name: 'Won Deal',
          stage: 'closed_won',
          value: 100_000,
          probability: 100,
          account_id: 'acc_owned',
          meddicc: { overallScore: 90, champion: { strength: 5, notes: 'champion' } },
          won_date: '2026-05-01',
          notes: 'won notes',
          created_at: '2026-04-01',
        }];
      }
    }
    return [];
  }
}

function makeAdmin() {
  return {
    from(table: string) {
      const query = new QueryStub(table);
      queries.push(query);
      return query;
    },
  };
}

function request(body: unknown) {
  return new Request('http://localhost/api/pattern-recognition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/pattern-recognition role scoping', () => {
  beforeEach(() => {
    queries.length = 0;
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'ae_1',
      orgId: 'org_1',
      orgRole: 'member',
      roleLevel: 'member',
      jobLevel: 0,
      teamId: null,
      teamMemberIds: ['ae_1'],
    });
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin() as unknown as ReturnType<typeof requireAdmin>);
    vi.mocked(requireOpportunityAccess).mockResolvedValue({ id: 'opp_current', account_id: 'acc_current', user_id: 'ae_1', assigned_to: 'ae_1' });
    vi.mocked(callAIWithFallback).mockResolvedValue({ patterns: [{ patternName: '模式', description: '描述', successRate: '1/1', applicableDeals: [], keyActions: [] }], recommendations: '建议' });
  });

  it('validates current opportunity access and fetches currentOpp with org_id', async () => {
    const response = await POST(request({ opportunityId: 'opp_current', forceRefresh: true }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.patterns).toHaveLength(1);
    expect(requireOpportunityAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1', userId: 'ae_1' }), 'opp_current');

    const currentOppQuery = queries.find((query) =>
      query.table === 'opportunities'
      && query.calls.some((call) => call.method === 'single')
      && query.calls.some((call) => call.method === 'eq' && call.args[0] === 'id' && call.args[1] === 'opp_current')
    );
    expect(currentOppQuery?.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org_1'] });
    expect(currentOppQuery?.calls).toContainEqual({ method: 'select', args: ['id, org_id, name, stage, value, account_id, meddicc, notes'] });
  });
});
