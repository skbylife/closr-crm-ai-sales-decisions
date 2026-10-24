import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CIL_PROMPT_CHAR_BUDGETS } from '@/lib/compiled-intelligence/prompt-context';
import type { CILAccountContext } from '@/lib/compiled-intelligence/context';

type UserContext = {
  userId: string;
  orgId: string;
  orgRole: 'owner' | 'admin' | 'manager' | 'member';
  jobLevel: number;
  teamId: string | null;
  teamMemberIds: string[];
};

const mockRequireAuth = vi.fn<() => Promise<UserContext>>();
const mockRequireAdmin = vi.fn();
const mockRequireAccountAccess = vi.fn();
const mockRequireContactAccess = vi.fn();
const mockRequireOpportunityAccess = vi.fn();
const mockGuardResponse = vi.fn((err: unknown) => {
  // ApiError-like handling: extract status from error
  if (err && typeof err === 'object' && 'status' in (err as object)) {
    const e = err as { status: number; message: string };
    return new Response(JSON.stringify({ error: e.message }), { status: e.status });
  }
  if (err instanceof Error) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ error: '服务器错误' }), { status: 500 });
});
const mockDecodeMessages = vi.fn();
const mockGenerateStrategy = vi.fn();
const mockTriggerProfileUpdate = vi.fn();
const mockFetchDecodeHistory = vi.fn();
const mockFormatContextMemory = vi.fn();
const mockDetectCulture = vi.fn();
const mockBuildCulturalContextInjection = vi.fn();
const mockEmitEvent = vi.fn();
const mockCallGeminiWithImage = vi.fn();
const mockIsAIRateLimited = vi.fn();
const mockLogError = vi.fn();
const mockSafeCatch = vi.fn(() => (err: unknown) => err);
const mockLoadCILAccountContext = vi.fn();

vi.mock('@/lib/api-guard', () => ({
  requireAuth: mockRequireAuth,
  requireAdmin: mockRequireAdmin,
  requireAccountAccess: mockRequireAccountAccess,
  requireContactAccess: mockRequireContactAccess,
  requireOpportunityAccess: mockRequireOpportunityAccess,
  guardResponse: mockGuardResponse,
}));

vi.mock('@/lib/babel-engine/decode', async () => {
  const actual = await vi.importActual<typeof import('@/lib/babel-engine/decode')>('@/lib/babel-engine/decode');
  return {
    ...actual,
    decodeMessages: mockDecodeMessages,
  };
});

vi.mock('@/lib/babel-engine/strategy', async () => {
  const actual = await vi.importActual<typeof import('@/lib/babel-engine/strategy')>('@/lib/babel-engine/strategy');
  return {
    ...actual,
    generateStrategy: mockGenerateStrategy,
  };
});

vi.mock('@/lib/babel-engine/profile-updater', () => ({
  triggerProfileUpdate: mockTriggerProfileUpdate,
}));

vi.mock('@/lib/babel-engine/context-memory', () => ({
  fetchDecodeHistory: mockFetchDecodeHistory,
  formatContextMemory: mockFormatContextMemory,
}));

vi.mock('@/lib/babel-engine/cultural', () => ({
  detectCulture: mockDetectCulture,
}));

vi.mock('@/lib/babel-engine/prompts/cultural', () => ({
  buildCulturalContextInjection: mockBuildCulturalContextInjection,
}));

vi.mock('@/lib/ai-event-hub', () => ({
  emitEvent: mockEmitEvent,
}));

vi.mock('@/lib/babel-engine/gemini', () => ({
  callGeminiWithImage: mockCallGeminiWithImage,
}));

vi.mock('@/lib/rate-limit', () => ({
  isAIRateLimited: mockIsAIRateLimited,
  applyAIRateLimit: vi.fn(() => {
    if (mockIsAIRateLimited()) {
      const err = new Error('AI 请求过于频繁，请稍后重试') as Error & { status: number };
      err.status = 429;
      throw err;
    }
  }),
}));

vi.mock('@/lib/error-monitor', () => ({
  logError: mockLogError,
  safeCatch: mockSafeCatch,
}));

vi.mock('@/lib/compiled-intelligence/context', () => ({
  loadCILAccountContext: mockLoadCILAccountContext,
  loadCILAccountContextScoped: mockLoadCILAccountContext,
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
      if (table === 'contacts') {
        return makeResolvedQuery(
          { data: [], error: null },
          {
            data: {
              id: 'contact-1',
              name: 'Alice',
              account_id: 'account-1',
              contact_profile: { decisionStyle: { type: 'driver' } },
            },
            error: null,
          },
        );
      }

      if (table === 'intel_items') {
        return {
          ...makeResolvedQuery({
            data: [
              {
                title: '预算批准',
                summary: '客户预算已经批复',
                type: 'email_decode',
                date: '2026-04-01',
                urgency: 'high',
              },
            ],
            error: null,
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }

      if (table === 'strategic_plays') {
        return makeResolvedQuery({ data: [], error: null });
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function makeCILContext(overrides?: Partial<CILAccountContext>): CILAccountContext {
  return {
    accountId: 'account-1',
    orgId: 'org-1',
    claims: [],
    openQuestions: [],
    evidence: [],
    knowledgePages: [],
    ...overrides,
  };
}

function makeDecodedEmail() {
  return {
    messages: [
      {
        speaker: 'them' as const,
        original: 'Can we align next week?',
        decode: {
          meaning: '需要内部同步',
          emotion: '谨慎',
          urgency: 6,
          confidence: 0.83,
        },
      },
    ],
    threadAnalysis: {
      sentimentTrend: 'stable' as const,
      riskLevel: 'medium' as const,
      buyerState: 'evaluating' as const,
      keySignal: '还在推进中',
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({
    userId: 'user-1',
    orgId: 'org-1',
    orgRole: 'admin',
    jobLevel: 4,
    teamId: null,
    teamMemberIds: ['user-1'],
  });
  mockRequireAdmin.mockReturnValue(makeAdmin());
  mockRequireAccountAccess.mockResolvedValue(undefined);
  mockRequireContactAccess.mockResolvedValue({ id: 'contact-1', account_id: 'account-1', user_id: 'user-1' });
  mockRequireOpportunityAccess.mockResolvedValue({ id: 'opp-1', account_id: 'account-1', user_id: 'user-1', assigned_to: 'user-1' });
  mockIsAIRateLimited.mockReturnValue(false);
  mockDetectCulture.mockReturnValue('american_business');
  mockBuildCulturalContextInjection.mockReturnValue('文化上下文');
  mockFetchDecodeHistory.mockResolvedValue([]);
  mockFormatContextMemory.mockReturnValue('');
  mockLoadCILAccountContext.mockResolvedValue(null);
  mockDecodeMessages.mockResolvedValue({
    messages: [],
    threadAnalysis: {
      sentimentTrend: 'stable',
      riskLevel: 'low',
      buyerState: 'evaluating',
      keySignal: 'ok',
    },
  });
  mockGenerateStrategy.mockResolvedValue({
    strategies: [],
    recommended: 0,
    reasoning: 'ok',
  });
  mockTriggerProfileUpdate.mockResolvedValue(undefined);
  mockEmitEvent.mockResolvedValue(undefined);
  mockCallGeminiWithImage.mockResolvedValue({ extractedText: '' });
});

describe('decode route — CIL integration', () => {
  it('有 CIL 时会通过真实 route 注入 decodeMessages', async () => {
    mockLoadCILAccountContext.mockResolvedValue(
      makeCILContext({
        knowledgePages: [
          {
            id: 'page-1',
            orgId: 'org-1',
            accountId: 'account-1',
            pageType: 'overview',
            title: 'Overview',
            contentMd: '客户正在推进采购审批。',
            contentJson: {},
            version: 1,
            updatedBy: 'system',
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          },
        ],
        claims: [
          {
            id: 'claim-1',
            orgId: 'org-1',
            accountId: 'account-1',
            claimType: 'general',
            statement: '预算已经锁定',
            status: 'active',
            confidence: 0.91,
            supportingEvidenceIds: [],
            counterEvidenceIds: [],
            affectedObjectIds: [],
            lastRevalidatedAt: '2026-01-01',
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          },
        ],
      }),
    );

    const { POST } = await import('@/app/api/decode/route');
    const response = await POST(
      new Request('http://localhost/api/decode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          emailText: 'Subject: Hello\n\nNeed proposal update.',
          matchedContactId: 'contact-1',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockDecodeMessages).toHaveBeenCalledTimes(1);
    const options = mockDecodeMessages.mock.calls[0][3];
    expect(options.cilContext).toContain('=== 编译智能层（CIL）上下文 ===');
    expect(options.cilContext).toContain('预算已经锁定');
    expect(options.cilContext).toContain('采购审批');
  });

  it('无 CIL 时 fallback 正常，不注入 cilContext', async () => {
    mockLoadCILAccountContext.mockResolvedValue(null);

    const { POST } = await import('@/app/api/decode/route');
    const response = await POST(
      new Request('http://localhost/api/decode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          emailText: 'Need proposal update.',
          matchedContactId: 'contact-1',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockDecodeMessages).toHaveBeenCalledTimes(1);
    expect(mockDecodeMessages.mock.calls[0][3]).toEqual(expect.objectContaining({ cilContext: undefined }));
  });

  it('长 CIL 时 route 仍会注入被预算截断后的上下文', async () => {
    mockLoadCILAccountContext.mockResolvedValue(
      makeCILContext({
        knowledgePages: [
          {
            id: 'page-1',
            orgId: 'org-1',
            accountId: 'account-1',
            pageType: 'overview',
            title: 'Overview',
            contentMd: '超长概览'.repeat(5000),
            contentJson: {},
            version: 1,
            updatedBy: 'system',
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          },
        ],
      }),
    );

    const { POST } = await import('@/app/api/decode/route');
    await POST(
      new Request('http://localhost/api/decode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          emailText: 'Need proposal update.',
          matchedContactId: 'contact-1',
        }),
      }),
    );

    const options = mockDecodeMessages.mock.calls[0][3];
    expect(options.cilContext.length).toBeLessThanOrEqual(CIL_PROMPT_CHAR_BUDGETS.decode + 200);
    expect(options.cilContext).toContain('…（已截断）');
  });

  it('CIL 加载失败时仍回退旧逻辑', async () => {
    mockLoadCILAccountContext.mockRejectedValue(new Error('supabase down'));

    const { POST } = await import('@/app/api/decode/route');
    const response = await POST(
      new Request('http://localhost/api/decode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          emailText: 'Need proposal update.',
          matchedContactId: 'contact-1',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockDecodeMessages).toHaveBeenCalledTimes(1);
    expect(mockDecodeMessages.mock.calls[0][3]).toEqual(expect.objectContaining({ cilContext: undefined }));
  });
});

describe('strategy route — CIL integration', () => {
  it('有 CIL 时会通过真实 route 注入 generateStrategy', async () => {
    mockLoadCILAccountContext.mockResolvedValue(
      makeCILContext({
        knowledgePages: [
          {
            id: 'page-1',
            orgId: 'org-1',
            accountId: 'account-1',
            pageType: 'risks',
            title: 'Risks',
            contentMd: '法务审查周期偏长。',
            contentJson: {},
            version: 1,
            updatedBy: 'system',
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          },
        ],
        claims: [
          {
            id: 'claim-1',
            orgId: 'org-1',
            accountId: 'account-1',
            claimType: 'general',
            statement: 'Champion 仍在推进',
            status: 'active',
            confidence: 0.88,
            supportingEvidenceIds: [],
            counterEvidenceIds: [],
            affectedObjectIds: [],
            lastRevalidatedAt: '2026-01-01',
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          },
        ],
      }),
    );

    const { POST } = await import('@/app/api/strategy/route');
    const response = await POST(
      new Request('http://localhost/api/strategy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decodedEmail: makeDecodedEmail(),
          accountId: 'account-1',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockGenerateStrategy).toHaveBeenCalledTimes(1);
    const input = mockGenerateStrategy.mock.calls[0][0];
    expect(input.cilContext).toContain('=== 编译智能层（CIL）上下文 ===');
    expect(input.cilContext).toContain('Champion 仍在推进');
    expect(input.cilContext).toContain('法务审查周期偏长');
  });

  it('无 CIL 时 fallback 正常，不注入 cilContext', async () => {
    mockLoadCILAccountContext.mockResolvedValue(null);

    const { POST } = await import('@/app/api/strategy/route');
    const response = await POST(
      new Request('http://localhost/api/strategy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decodedEmail: makeDecodedEmail(),
          accountId: 'account-1',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockGenerateStrategy).toHaveBeenCalledTimes(1);
    expect(mockGenerateStrategy.mock.calls[0][0].cilContext).toBeUndefined();
  });

  it('长 CIL 时 route 仍会注入被预算截断后的上下文', async () => {
    const longMd = '超长战略情报'.repeat(6000);
    mockLoadCILAccountContext.mockResolvedValue(
      makeCILContext({
        knowledgePages: [
          {
            id: 'page-1',
            orgId: 'org-1',
            accountId: 'account-1',
            pageType: 'overview',
            title: 'Overview',
            contentMd: longMd,
            contentJson: {},
            version: 1,
            updatedBy: 'system',
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          },
          {
            id: 'page-2',
            orgId: 'org-1',
            accountId: 'account-1',
            pageType: 'risks',
            title: 'Risks',
            contentMd: longMd,
            contentJson: {},
            version: 1,
            updatedBy: 'system',
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          },
        ],
      }),
    );

    const { POST } = await import('@/app/api/strategy/route');
    await POST(
      new Request('http://localhost/api/strategy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decodedEmail: makeDecodedEmail(),
          accountId: 'account-1',
        }),
      }),
    );

    const input = mockGenerateStrategy.mock.calls[0][0];
    expect(input.cilContext.length).toBeLessThanOrEqual(CIL_PROMPT_CHAR_BUDGETS.strategy + 200);
    expect(input.cilContext).toContain('…（已截断）');
  });

  it('CIL 加载失败时仍回退旧逻辑', async () => {
    mockLoadCILAccountContext.mockRejectedValue(new Error('supabase down'));

    const { POST } = await import('@/app/api/strategy/route');
    const response = await POST(
      new Request('http://localhost/api/strategy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decodedEmail: makeDecodedEmail(),
          accountId: 'account-1',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockGenerateStrategy).toHaveBeenCalledTimes(1);
    expect(mockGenerateStrategy.mock.calls[0][0].cilContext).toBeUndefined();
  });
});

// ─── Guard path tests ──────────────────────────────────────────────

describe('decode route — CIL guard paths', () => {
  it('orgId=demo 时不加载 CIL', async () => {
    mockRequireAuth.mockResolvedValue({
      userId: 'user-1',
      orgId: 'demo',
      orgRole: 'admin',
      jobLevel: 4,
      teamId: null,
      teamMemberIds: ['user-1'],
    });

    const { POST } = await import('@/app/api/decode/route');
    const response = await POST(
      new Request('http://localhost/api/decode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          emailText: 'Subject: Hello\n\nNeed update.',
          matchedContactId: 'contact-1',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockLoadCILAccountContext).not.toHaveBeenCalled();
    expect(mockDecodeMessages.mock.calls[0][3]).toEqual(expect.objectContaining({ cilContext: undefined }));
  });

  it('缺少 matchedContactId 时不加载 CIL（无 contactForIntel）', async () => {
    const { POST } = await import('@/app/api/decode/route');
    const response = await POST(
      new Request('http://localhost/api/decode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          emailText: 'Subject: Hello\n\nNeed update.',
          // 故意不传 matchedContactId
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockLoadCILAccountContext).not.toHaveBeenCalled();
    expect(mockDecodeMessages.mock.calls[0][3]).toEqual(expect.objectContaining({ cilContext: undefined }));
  });

  it('multipart/form-data + 图片 OCR 时会先把 OCR 文本并入 emailText，再交给 decodeMessages', async () => {
    mockLoadCILAccountContext.mockResolvedValue(
      makeCILContext({
        claims: [
          {
            id: 'claim-ocr',
            orgId: 'org-1',
            accountId: 'account-1',
            claimType: 'general',
            statement: 'OCR 场景下的 claim',
            status: 'active',
            confidence: 0.85,
            supportingEvidenceIds: [],
            counterEvidenceIds: [],
            affectedObjectIds: [],
            lastRevalidatedAt: '2026-01-01',
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          },
        ],
      }),
    );
    mockCallGeminiWithImage.mockResolvedValue({ extractedText: '图片中的文字内容' });

    const formData = new FormData();
    formData.append('emailText', 'Subject: OCR test\n\nSome text.');
    formData.append('matchedContactId', 'contact-1');

    // 模拟一个图片文件
    const imageBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    formData.append('image0', new File([imageBlob], 'screenshot.png', { type: 'image/png' }));

    const { POST } = await import('@/app/api/decode/route');
    const response = await POST(
      new Request('http://localhost/api/decode', {
        method: 'POST',
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    expect(mockCallGeminiWithImage).toHaveBeenCalledTimes(1);
    expect(mockLoadCILAccountContext).toHaveBeenCalledTimes(1);

    const decodeInput = mockDecodeMessages.mock.calls[0][0];
    expect(decodeInput.messages).toHaveLength(1);
    expect(decodeInput.messages[0].speaker).toBe('them');
    expect(decodeInput.messages[0].text).toContain('Subject: OCR test');
    expect(decodeInput.messages[0].text).toContain('Some text.');
    expect(decodeInput.messages[0].text).toContain('【图片内容（OCR）】');
    expect(decodeInput.messages[0].text).toContain('图片中的文字内容');

    const options = mockDecodeMessages.mock.calls[0][3];
    expect(options.cilContext).toContain('OCR 场景下的 claim');
  });

  it('multipart/form-data 纯文本（无图片）+ CIL 正常工作', async () => {
    mockLoadCILAccountContext.mockResolvedValue(
      makeCILContext({
        claims: [
          {
            id: 'claim-form',
            orgId: 'org-1',
            accountId: 'account-1',
            claimType: 'general',
            statement: '表单提交的 claim',
            status: 'active',
            confidence: 0.9,
            supportingEvidenceIds: [],
            counterEvidenceIds: [],
            affectedObjectIds: [],
            lastRevalidatedAt: '2026-01-01',
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          },
        ],
      }),
    );

    const formData = new FormData();
    formData.append('emailText', 'Need proposal update.');
    formData.append('matchedContactId', 'contact-1');

    const { POST } = await import('@/app/api/decode/route');
    const response = await POST(
      new Request('http://localhost/api/decode', {
        method: 'POST',
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    expect(mockCallGeminiWithImage).not.toHaveBeenCalled();
    expect(mockLoadCILAccountContext).toHaveBeenCalledTimes(1);

    const options = mockDecodeMessages.mock.calls[0][3];
    expect(options.cilContext).toContain('表单提交的 claim');
  });

  it('邮件为空时返回 400，不调用 CIL', async () => {
    const { POST } = await import('@/app/api/decode/route');
    const response = await POST(
      new Request('http://localhost/api/decode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emailText: '   ', matchedContactId: 'contact-1' }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockLoadCILAccountContext).not.toHaveBeenCalled();
    expect(mockDecodeMessages).not.toHaveBeenCalled();
  });

  it('邮件超长时返回 400，不调用 CIL', async () => {
    const { POST } = await import('@/app/api/decode/route');
    const response = await POST(
      new Request('http://localhost/api/decode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emailText: 'x'.repeat(50_001), matchedContactId: 'contact-1' }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockLoadCILAccountContext).not.toHaveBeenCalled();
    expect(mockDecodeMessages).not.toHaveBeenCalled();
  });

  it('rate limited 时返回 429，不调用 CIL', async () => {
    mockIsAIRateLimited.mockReturnValue(true);

    const { POST } = await import('@/app/api/decode/route');
    const response = await POST(
      new Request('http://localhost/api/decode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emailText: 'Hello', matchedContactId: 'contact-1' }),
      }),
    );

    expect(response.status).toBe(429);
    expect(mockLoadCILAccountContext).not.toHaveBeenCalled();
  });
});

describe('strategy route — CIL guard paths', () => {
  it('orgId=demo 时不加载 CIL', async () => {
    mockRequireAuth.mockResolvedValue({
      userId: 'user-1',
      orgId: 'demo',
      orgRole: 'admin',
      jobLevel: 4,
      teamId: null,
      teamMemberIds: ['user-1'],
    });

    const { POST } = await import('@/app/api/strategy/route');
    const response = await POST(
      new Request('http://localhost/api/strategy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decodedEmail: makeDecodedEmail(),
          accountId: 'account-1',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockLoadCILAccountContext).not.toHaveBeenCalled();
    expect(mockGenerateStrategy.mock.calls[0][0].cilContext).toBeUndefined();
  });

  it('缺少 accountId 时不加载 CIL', async () => {
    const { POST } = await import('@/app/api/strategy/route');
    const response = await POST(
      new Request('http://localhost/api/strategy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decodedEmail: makeDecodedEmail(),
          // 故意不传 accountId
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockLoadCILAccountContext).not.toHaveBeenCalled();
    expect(mockGenerateStrategy.mock.calls[0][0].cilContext).toBeUndefined();
  });

  it('带 intelItems + tasks + contactDiscType 时 CIL 共存正确', async () => {
    mockLoadCILAccountContext.mockResolvedValue(
      makeCILContext({
        claims: [
          {
            id: 'claim-coexist',
            orgId: 'org-1',
            accountId: 'account-1',
            claimType: 'general',
            statement: '竞品报价更低',
            status: 'active',
            confidence: 0.75,
            supportingEvidenceIds: [],
            counterEvidenceIds: [],
            affectedObjectIds: [],
            lastRevalidatedAt: '2026-01-01',
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          },
        ],
        knowledgePages: [
          {
            id: 'page-risk',
            orgId: 'org-1',
            accountId: 'account-1',
            pageType: 'risks',
            title: 'Risks',
            contentMd: '预算紧缩风险。',
            contentJson: {},
            version: 1,
            updatedBy: 'system',
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          },
        ],
      }),
    );

    const { POST } = await import('@/app/api/strategy/route');
    const response = await POST(
      new Request('http://localhost/api/strategy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decodedEmail: makeDecodedEmail(),
          accountId: 'account-1',
          contactDiscType: 'D',
          tasks: [
            { id: 'task-1', title: '发送报价', status: 'pending', dueDate: '2026-04-10' },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockGenerateStrategy).toHaveBeenCalledTimes(1);

    const input = mockGenerateStrategy.mock.calls[0][0];
    // CIL 上下文存在
    expect(input.cilContext).toContain('竞品报价更低');
    expect(input.cilContext).toContain('预算紧缩风险');
    // 传统字段也正确传入
    expect(input.contactDiscType).toBe('D');
    expect(input.tasks).toEqual([
      { id: 'task-1', title: '发送报价', status: 'pending', dueDate: '2026-04-10' },
    ]);
    // intelItems 来自 admin mock
    expect(input.intelItems).toBeDefined();
    expect(input.intelItems.length).toBeGreaterThan(0);
    expect(input.intelItems[0].title).toBe('预算批准');
  });

  it('缺少 decodedEmail 时返回 400，不调用 CIL', async () => {
    const { POST } = await import('@/app/api/strategy/route');
    const response = await POST(
      new Request('http://localhost/api/strategy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: 'account-1',
          // 故意不传 decodedEmail
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockLoadCILAccountContext).not.toHaveBeenCalled();
    expect(mockGenerateStrategy).not.toHaveBeenCalled();
  });

  it('decodedEmail 缺少 threadAnalysis 时返回 400', async () => {
    const { POST } = await import('@/app/api/strategy/route');
    const response = await POST(
      new Request('http://localhost/api/strategy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decodedEmail: { messages: [] },
          accountId: 'account-1',
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockLoadCILAccountContext).not.toHaveBeenCalled();
  });

  it('rate limited 时返回 429，不调用 CIL', async () => {
    mockIsAIRateLimited.mockReturnValue(true);

    const { POST } = await import('@/app/api/strategy/route');
    const response = await POST(
      new Request('http://localhost/api/strategy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decodedEmail: makeDecodedEmail(),
          accountId: 'account-1',
        }),
      }),
    );

    expect(response.status).toBe(429);
    expect(mockLoadCILAccountContext).not.toHaveBeenCalled();
  });
});
