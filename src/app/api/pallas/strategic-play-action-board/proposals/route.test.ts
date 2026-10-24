import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { requireAdmin, requireAuth } from '@/lib/api-guard';
import { assertPallasContextAccess, createPallasActionProposal, findReusablePallasActionProposal } from '@/lib/pallas/server';

let adminFrom: ReturnType<typeof vi.fn>;

vi.mock('@/lib/api-guard', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-guard')>('@/lib/api-guard');
  return {
    ApiError: actual.ApiError,
    requireAdmin: vi.fn(),
    requireAuth: vi.fn(),
    guardResponse: (err: unknown) => {
      const status = err instanceof actual.ApiError ? err.status : 500;
      const message = err instanceof Error ? err.message : 'error';
      return Response.json({ error: message }, { status });
    },
  };
});

vi.mock('@/lib/pallas/server', () => ({
  PallasActionProposalReuseConflictError: class PallasActionProposalReuseConflictError extends Error {},
  assertPallasContextAccess: vi.fn(async () => undefined),
  buildPallasActionProposalReuseKey: vi.fn(() => 'reuse_key_1'),
  createPallasActionProposal: vi.fn(),
  findReusablePallasActionProposal: vi.fn(),
}));

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/pallas/strategic-play-action-board/proposals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePlayRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'play_1',
    org_id: 'org_1',
    account_id: 'acc_1',
    opportunity_id: 'opp_1',
    target_contact_id: null,
    goal_type: 'access_decision_maker',
    goal_description: '获得 CTO 何总的技术评审会参与',
    steps: [{
      index: 0,
      title: '准备技术评审材料',
      description: '把 AIOps ROI 与现有运维成本放在同一页',
      who: '客户负责人',
      target: 'CTO 何总',
      action: '整理单页材料',
      timing: '本周',
      purpose: '降低技术评审阻力',
      status: 'planned',
      risk: '财务只看年降',
      fallback: '先让周总预审',
    }],
    alternative_paths: [],
    confidence: 75,
    status: 'active',
    momentum: 'active',
    assumptions: [],
    learnings: [],
    review: null,
    last_step_at: null,
    days_since_progress: 0,
    created_at: '2026-05-17T05:00:00.000Z',
    updated_at: '2026-05-17T05:00:00.000Z',
    user_id: 'user_1',
    ...overrides,
  };
}

function mockAdminPlay(row: Record<string, unknown> | null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  adminFrom = vi.fn((table: string) => {
    if (table !== 'strategic_plays') {
      throw new Error(`unexpected persistence/table access: ${table}`);
    }
    return query;
  });
  vi.mocked(requireAdmin).mockReturnValue({ from: adminFrom } as never);
}

describe('/api/pallas/strategic-play-action-board/proposals', () => {
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
    mockAdminPlay(makePlayRow());
    vi.mocked(findReusablePallasActionProposal).mockResolvedValue(null);
    vi.mocked(createPallasActionProposal).mockResolvedValue({
      id: 'proposal_1',
      orgId: 'org_1',
      userId: 'user_1',
      artifactId: null,
      conversationId: 'pallas-strategic-play-action-board:play_1',
      context: {
        entityType: 'strategic_play',
        entityId: 'play_1',
        accountId: 'acc_1',
        opportunityId: 'opp_1',
        strategicPlayId: 'play_1',
      },
      status: 'awaiting_confirmation',
      riskLevel: 'low',
      actions: [],
      sourceRefs: [],
      createdAt: '2026-05-17T05:00:00.000Z',
      expiresAt: '2026-05-18T05:00:00.000Z',
    });
  });

  it('does not access admin DB when the explicit Pallas preview gate is missing', async () => {
    const response = await POST(request({ playId: 'play_1', pallas: '0' }));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toContain('Pallas 预览未开启');
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(assertPallasContextAccess).not.toHaveBeenCalled();
    expect(findReusablePallasActionProposal).not.toHaveBeenCalled();
    expect(createPallasActionProposal).not.toHaveBeenCalled();
  });

  it('creates an awaiting_confirmation proposal from server-loaded strategic play steps', async () => {
    const response = await POST(request({ playId: 'play_1', pallas: 'strategic-play-action-board' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(adminFrom).toHaveBeenCalledWith('strategic_plays');
    expect(assertPallasContextAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1', userId: 'user_1' }), {
      entityType: 'strategic_play',
      entityId: 'play_1',
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      strategicPlayId: 'play_1',
    });
    expect(findReusablePallasActionProposal).toHaveBeenCalledWith(expect.objectContaining({
      ctx: expect.objectContaining({ orgId: 'org_1', userId: 'user_1' }),
      conversationId: 'pallas-strategic-play-action-board:play_1',
      reuseKey: 'reuse_key_1',
      context: {
        entityType: 'strategic_play',
        entityId: 'play_1',
        accountId: 'acc_1',
        opportunityId: 'opp_1',
        strategicPlayId: 'play_1',
      },
      actions: [expect.objectContaining({ toolName: 'create_task', requiresConfirmation: true })],
    }));
    expect(createPallasActionProposal).toHaveBeenCalledWith(expect.objectContaining({
      ctx: expect.objectContaining({ orgId: 'org_1', userId: 'user_1' }),
      conversationId: 'pallas-strategic-play-action-board:play_1',
      reuseKey: 'reuse_key_1',
      context: {
        entityType: 'strategic_play',
        entityId: 'play_1',
        accountId: 'acc_1',
        opportunityId: 'opp_1',
        strategicPlayId: 'play_1',
      },
      actions: [expect.objectContaining({ toolName: 'create_task', requiresConfirmation: true })],
      artifactId: null,
    }));
    expect(payload.proposal).toMatchObject({ status: 'awaiting_confirmation' });
    expect(payload.reused).toBe(false);
    expect(payload.message).toContain('已生成待确认草稿');
  });

  it('reuses an unexpired awaiting_confirmation proposal instead of inserting another one', async () => {
    vi.mocked(findReusablePallasActionProposal).mockResolvedValue({
      id: 'proposal_reused',
      orgId: 'org_1',
      userId: 'user_1',
      artifactId: null,
      conversationId: 'pallas-strategic-play-action-board:play_1',
      context: {
        entityType: 'strategic_play',
        entityId: 'play_1',
        accountId: 'acc_1',
        opportunityId: 'opp_1',
        strategicPlayId: 'play_1',
      },
      status: 'awaiting_confirmation',
      riskLevel: 'low',
      actions: [],
      sourceRefs: [],
      createdAt: '2026-05-17T05:00:00.000Z',
      expiresAt: '2026-05-18T05:00:00.000Z',
    });

    const response = await POST(request({ playId: 'play_1', pallas: 'strategic-play-action-board' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(createPallasActionProposal).not.toHaveBeenCalled();
    expect(payload.proposal).toMatchObject({ id: 'proposal_reused', status: 'awaiting_confirmation' });
    expect(payload.reused).toBe(true);
    expect(payload.message).toContain('已复用待确认草稿');
  });

  it('reuses the concurrently inserted proposal when the DB reuse key unique index wins the race', async () => {
    const { PallasActionProposalReuseConflictError } = await import('@/lib/pallas/server');
    vi.mocked(findReusablePallasActionProposal)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'proposal_raced',
        orgId: 'org_1',
        userId: 'user_1',
        artifactId: null,
        conversationId: 'pallas-strategic-play-action-board:play_1',
        reuseKey: 'reuse_key_1',
        context: {
          entityType: 'strategic_play',
          entityId: 'play_1',
          accountId: 'acc_1',
          opportunityId: 'opp_1',
          strategicPlayId: 'play_1',
        },
        status: 'awaiting_confirmation',
        riskLevel: 'low',
        actions: [],
        sourceRefs: [],
        createdAt: '2026-05-17T05:00:00.000Z',
        expiresAt: '2026-05-18T05:00:00.000Z',
      });
    vi.mocked(createPallasActionProposal).mockRejectedValue(
      new PallasActionProposalReuseConflictError()
    );

    const response = await POST(request({ playId: 'play_1', pallas: 'strategic-play-action-board' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(findReusablePallasActionProposal).toHaveBeenCalledTimes(2);
    expect(payload.proposal).toMatchObject({ id: 'proposal_raced', status: 'awaiting_confirmation' });
    expect(payload.reused).toBe(true);
    expect(payload.message).toContain('已复用待确认草稿');
  });

  it('stops before proposal lookup or creation when context access is denied', async () => {
    const { ApiError } = await import('@/lib/api-guard');
    vi.mocked(assertPallasContextAccess).mockRejectedValueOnce(new ApiError(403, '只能操作自己的数据'));

    const response = await POST(request({ playId: 'play_1', pallas: 'strategic-play-action-board' }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain('只能操作自己的数据');
    expect(findReusablePallasActionProposal).not.toHaveBeenCalled();
    expect(createPallasActionProposal).not.toHaveBeenCalled();
  });
});
