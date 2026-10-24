import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH } from './route';
import { requireAuth } from '@/lib/api-guard';
import { updatePallasProposalLifecycleStatus } from '@/lib/pallas/server';

vi.mock('@/lib/api-guard', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-guard')>('@/lib/api-guard');
  return {
    ApiError: actual.ApiError,
    requireAuth: vi.fn(),
    guardResponse: (err: unknown) => {
      const status = err instanceof actual.ApiError ? err.status : 500;
      const message = err instanceof Error ? err.message : 'error';
      return Response.json({ error: message }, { status });
    },
  };
});

vi.mock('@/lib/pallas/server', () => ({
  updatePallasProposalLifecycleStatus: vi.fn(),
}));

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/pallas/proposals/proposal_1/status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/pallas/proposals/[id]/status', () => {
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
    vi.mocked(updatePallasProposalLifecycleStatus).mockResolvedValue({
      id: 'proposal_1',
      orgId: 'org_1',
      userId: 'user_1',
      artifactId: null,
      conversationId: 'conv_1',
      context: { entityType: 'account', entityId: 'acc_1', accountId: 'acc_1' },
      status: 'rejected',
      riskLevel: 'low',
      actions: [],
      sourceRefs: [],
      createdAt: '2026-05-17T05:00:00.000Z',
      resultSummary: '用户拒绝此 Pallas 提案。未创建任务，未调用工具。',
    });
  });

  it('rejects non-lifecycle statuses before updating persisted proposals', async () => {
    const response = await PATCH(
      request({ pallas: 'strategic-play-action-board', status: 'executing', reason: null }),
      { params: Promise.resolve({ id: 'proposal_1' }) },
    );

    expect(response.status).toBe(400);
    expect(updatePallasProposalLifecycleStatus).not.toHaveBeenCalled();
  });

  it('confirms proposals with audit-safe copy but does not execute anything', async () => {
    vi.mocked(updatePallasProposalLifecycleStatus).mockResolvedValueOnce({
      id: 'proposal_1',
      orgId: 'org_1',
      userId: 'user_1',
      artifactId: null,
      conversationId: 'conv_1',
      context: { entityType: 'account', entityId: 'acc_1', accountId: 'acc_1' },
      status: 'confirmed',
      riskLevel: 'low',
      actions: [],
      sourceRefs: [],
      createdAt: '2026-05-17T05:00:00.000Z',
      confirmedAt: '2026-05-17T05:10:00.000Z',
      confirmedBy: 'user_1',
      resultSummary: '用户确认此 Pallas 提案，仅记录确认意图。未创建任务，未调用工具，未执行外部动作。',
    });

    const response = await PATCH(
      request({ pallas: 'strategic-play-action-board', status: 'confirmed', reason: '准备后续人工执行' }),
      { params: Promise.resolve({ id: 'proposal_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(updatePallasProposalLifecycleStatus).toHaveBeenCalledWith({
      ctx: expect.objectContaining({ orgId: 'org_1' }),
      proposalId: 'proposal_1',
      status: 'confirmed',
      resultSummary: expect.stringContaining('未创建任务，未调用工具，未执行外部动作'),
    });
    expect(payload.proposal.status).toBe('confirmed');
  });

  it('rejects proposals with audit-safe copy that says no task or tool execution happened', async () => {
    const response = await PATCH(
      request({ pallas: 'strategic-play-action-board', status: 'rejected', reason: '字段不准确' }),
      { params: Promise.resolve({ id: 'proposal_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(updatePallasProposalLifecycleStatus).toHaveBeenCalledWith({
      ctx: expect.objectContaining({ orgId: 'org_1' }),
      proposalId: 'proposal_1',
      status: 'rejected',
      resultSummary: expect.stringContaining('未创建任务，未调用工具'),
    });
    expect(payload.proposal.status).toBe('rejected');
  });

  it('expires proposals through the same lifecycle endpoint', async () => {
    vi.mocked(updatePallasProposalLifecycleStatus).mockResolvedValueOnce({
      id: 'proposal_1',
      orgId: 'org_1',
      userId: 'user_1',
      artifactId: null,
      conversationId: 'conv_1',
      context: { entityType: 'account', entityId: 'acc_1', accountId: 'acc_1' },
      status: 'expired',
      riskLevel: 'low',
      actions: [],
      sourceRefs: [],
      createdAt: '2026-05-17T05:00:00.000Z',
      resultSummary: '此 Pallas 提案已标记过期。未创建任务，未调用工具。',
    });

    const response = await PATCH(
      request({ pallas: 'strategic-play-action-board', status: 'expired', reason: null }),
      { params: Promise.resolve({ id: 'proposal_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(updatePallasProposalLifecycleStatus).toHaveBeenCalledWith(expect.objectContaining({
      status: 'expired',
      resultSummary: '此 Pallas 提案已标记过期。未创建任务，未调用工具。',
    }));
    expect(payload.proposal.status).toBe('expired');
  });
});
