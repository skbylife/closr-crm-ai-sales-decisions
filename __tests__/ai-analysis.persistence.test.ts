import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminMock = vi.fn();
const requireAccountAccessMock = vi.fn();
const loadEvidenceRecordsMock = vi.fn();

vi.mock('@/lib/api-guard', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
  requireAdmin: requireAdminMock,
  requireAccountAccess: requireAccountAccessMock,
}));

vi.mock('@/lib/evidence-memory/server', () => ({
  loadEvidenceRecords: loadEvidenceRecordsMock,
  loadEvidenceRecordsScoped: loadEvidenceRecordsMock,
  loadEvidenceRecordsUnsafeInternal: loadEvidenceRecordsMock,
}));

type QueryResult = { data: unknown; error: unknown };

type ResolvedQuery = PromiseLike<QueryResult> & {
  select: (...args: unknown[]) => ResolvedQuery;
  eq: (...args: unknown[]) => ResolvedQuery;
  order: (...args: unknown[]) => ResolvedQuery;
  limit: (...args: unknown[]) => ResolvedQuery;
  maybeSingle: ReturnType<typeof vi.fn>;
};

function makeResolvedQuery(result: QueryResult, maybeSingleResult = result): ResolvedQuery {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue(maybeSingleResult),
    then: Promise.resolve(result).then.bind(Promise.resolve(result)) as PromiseLike<QueryResult>['then'],
  };
  return query;
}

describe('AI analysis persistence fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_BASE_URL = 'http://ai.test';
    requireAccountAccessMock.mockResolvedValue(undefined);
  });

  it('loads analysis from ai_insights when account_knowledge_pages is unavailable', async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: '42P01', message: 'relation "account_knowledge_pages" does not exist' } })
      .mockResolvedValueOnce({ data: { data: { narrative: 'cached narrative', analyzedAt: '2026-04-20T00:00:00.000Z' } }, error: null });

    const selectBuilder = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
    };

    requireAdminMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(selectBuilder),
      }),
    });

    const { loadAIAnalysis } = await import('@/lib/evidence-memory/ai-analysis');
    const result = await loadAIAnalysis('acc_1', 'org_1');

    expect(result?.narrative).toBe('cached narrative');
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });

  it('saves analysis into ai_insights fallback when primary store is missing', async () => {
    loadEvidenceRecordsMock.mockResolvedValue([
      {
        sourceKind: 'intel_item',
        occurredAt: '2026-04-19T00:00:00.000Z',
        title: '预算推进',
        summary: '客户确认本季度会做供应商 shortlist。',
        contactName: '李总',
        contactTitle: 'VP',
      },
    ]);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                narrative: '客户已经进入 shortlist 阶段，预算与项目节奏同步推进，但采购和最终审批尚未完全闭环，需要继续用业务价值和时间窗口推动决策。',
                momentum: { status: 'rising', label: '势头上升', reason: '预算与项目节奏同步推进' },
                risks: [{ title: '采购未闭环', severity: 'medium', reason: '采购尚未完成最终确认' }],
                nextActions: [{ title: '确认采购下一步', urgency: 'soon', reason: '锁定 shortlist 后的审批节奏' }],
                stakeholderSummary: '业务团队正在推进 shortlist，采购尚未完全入场，需要继续确认审批链路。',
                openQuestions: [],
              }),
            },
          },
        ],
      }),
    }) as typeof fetch;

    const primaryUpsert = vi.fn().mockResolvedValue({ error: { code: '42P01', message: 'relation "account_knowledge_pages" does not exist' } });
    const fallbackUpsert = vi.fn().mockResolvedValue({ error: null });
    const deleteEq = vi.fn().mockReturnThis();
    const deleteBuilder = { eq: deleteEq };

    requireAdminMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'account_claims' || table === 'account_evidence') {
          return makeResolvedQuery({ data: [], error: null });
        }
        if (table === 'account_knowledge_pages') {
          return {
            ...makeResolvedQuery(
              { data: [], error: null },
              { data: null, error: { code: '42P01', message: 'relation "account_knowledge_pages" does not exist' } },
            ),
            upsert: primaryUpsert,
            delete: vi.fn().mockReturnValue(deleteBuilder),
          };
        }
        if (table === 'ai_insights') {
          return {
            ...makeResolvedQuery({ data: [], error: null }, { data: null, error: null }),
            upsert: fallbackUpsert,
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const { runAccountAIAnalysis } = await import('@/lib/evidence-memory/ai-analysis');
    const result = await runAccountAIAnalysis({
      accountId: 'acc_1',
      accountName: 'Test Account',
      orgId: 'org_1',
    });

    expect(result?.narrative).toContain('shortlist');
    expect(primaryUpsert).toHaveBeenCalledTimes(1);
    expect(fallbackUpsert).toHaveBeenCalledTimes(1);
    expect(fallbackUpsert.mock.calls[0]?.[0]).toMatchObject({
      org_id: 'org_1',
      entity_type: 'account',
      entity_id: 'acc_1',
      insight_type: 'ai_analysis',
    });
  });

  it('rejects request-scoped analysis when orgId does not match the caller organization', async () => {
    const from = vi.fn();
    requireAdminMock.mockReturnValue({ from });

    const { runAccountAIAnalysis } = await import('@/lib/evidence-memory/ai-analysis');

    await expect(runAccountAIAnalysis({
      accountId: 'acc_1',
      accountName: 'Test Account',
      orgId: 'org_other',
      ctx: {
        userId: 'user_1',
        orgId: 'org_1',
        orgRole: 'admin',
        roleLevel: 'admin',
        jobLevel: 2,
        teamId: null,
        teamMemberIds: [],
      },
    })).rejects.toMatchObject({ status: 403 });

    expect(requireAccountAccessMock).not.toHaveBeenCalled();
    expect(loadEvidenceRecordsMock).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});
