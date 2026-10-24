import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { requireAuth } from '@/lib/api-guard';
import { getPallasActionProposal } from '@/lib/pallas/server';
import type { PallasActionProposal } from '@/lib/pallas/types';

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
  getPallasActionProposal: vi.fn(),
}));

const proposal: PallasActionProposal = {
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
  expiresAt: '2099-05-18T05:00:00.000Z',
};

describe('/api/pallas/proposals/[id]', () => {
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
    vi.mocked(getPallasActionProposal).mockResolvedValue(proposal);
  });

  it('requires the explicit Pallas preview gate before reading persisted detail', async () => {
    const response = await GET(
      new Request('http://localhost/api/pallas/proposals/proposal_1'),
      { params: Promise.resolve({ id: 'proposal_1' }) },
    );

    expect(response.status).toBe(404);
    expect(getPallasActionProposal).not.toHaveBeenCalled();
  });

  it('returns the persisted proposal with the confirmation detail contract', async () => {
    const response = await GET(
      new Request('http://localhost/api/pallas/proposals/proposal_1?pallas=strategic-play-action-board'),
      { params: Promise.resolve({ id: 'proposal_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getPallasActionProposal).toHaveBeenCalledWith({
      ctx: expect.objectContaining({ orgId: 'org_1' }),
      proposalId: 'proposal_1',
    });
    expect(payload.proposal).toMatchObject({ id: 'proposal_1', status: 'awaiting_confirmation' });
    expect(payload.confirmation).toMatchObject({
      mode: 'persisted',
      proposalId: 'proposal_1',
      status: 'awaiting_confirmation',
      expiresAt: '2099-05-18T05:00:00.000Z',
    });
    expect(payload.confirmation.controls.find((control: { name: string }) => control.name === 'execute').enabled).toBe(false);
  });

  it('shows the local task execution control for confirmed proposals', async () => {
    vi.mocked(getPallasActionProposal).mockResolvedValue({
      ...proposal,
      status: 'confirmed',
    });

    const response = await GET(
      new Request('http://localhost/api/pallas/proposals/proposal_1?pallas=strategic-play-action-board'),
      { params: Promise.resolve({ id: 'proposal_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.confirmation.controls.find((control: { name: string }) => control.name === 'execute')).toMatchObject({
      enabled: true,
      label: '创建 Closr 任务',
    });
  });
});
