import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { requireAdmin, requireAuth } from '@/lib/api-guard';
import { assertPallasContextAccess } from '@/lib/pallas/server';

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
  assertPallasContextAccess: vi.fn(async () => undefined),
}));

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/pallas/strategic-play-action-board/proposal-draft', {
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
    steps: [
      {
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
      },
      {
        index: 1,
        title: '完成内部复盘',
        description: '已闭环',
        who: '客户负责人',
        target: '团队',
        action: '复盘',
        timing: '今天',
        purpose: '同步信息',
        status: 'done',
        risk: '',
        fallback: '',
      },
    ],
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

describe('/api/pallas/strategic-play-action-board/proposal-draft', () => {
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
  });

  it('returns a guarded draft proposal for unfinished strategic play steps only', async () => {
    const response = await POST(request({ playId: 'play_1', pallas: 'strategic-play-action-board' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(assertPallasContextAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), {
      entityType: 'strategic_play',
      entityId: 'play_1',
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      strategicPlayId: 'play_1',
    });
    expect(payload.proposal).toMatchObject({
      orgId: 'org_1',
      userId: 'user_1',
      status: 'draft',
      riskLevel: 'low',
      conversationId: 'pallas-strategic-play-action-board:play_1',
    });
    expect(payload.proposal.actions).toHaveLength(1);
    expect(payload.proposal.actions[0]).toMatchObject({
      toolName: 'create_task',
      displayName: '创建任务：准备技术评审材料',
      requiresConfirmation: true,
    });
    expect(adminFrom).toHaveBeenCalledTimes(1);
    expect(adminFrom).toHaveBeenCalledWith('strategic_plays');
  });

  it('rejects calls that do not explicitly enable the Pallas preview gate', async () => {
    const response = await POST(request({ playId: 'play_1', pallas: '0' }));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toContain('Pallas 预览未开启');
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(assertPallasContextAccess).not.toHaveBeenCalled();
  });

  it('does not create an executable proposal when every step is complete', async () => {
    mockAdminPlay(makePlayRow({
      steps: [
        {
          index: 0,
          title: '完成内部复盘',
          description: '已闭环',
          who: '客户负责人',
          target: '团队',
          action: '复盘',
          timing: '今天',
          purpose: '同步信息',
          status: 'done',
          risk: '',
          fallback: '',
        },
      ],
    }));

    const response = await POST(request({ playId: 'play_1', pallas: 'strategic-play-action-board' }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('没有可生成任务草稿');
  });
});
