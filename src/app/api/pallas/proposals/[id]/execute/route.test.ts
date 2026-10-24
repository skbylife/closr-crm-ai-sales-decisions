import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { requireAuth } from '@/lib/api-guard';
import { executePallasConfirmedCreateTaskProposal } from '@/lib/pallas/server';

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
  executePallasConfirmedCreateTaskProposal: vi.fn(),
}));

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/pallas/proposals/proposal_1/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/pallas/proposals/[id]/execute', () => {
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
    vi.mocked(executePallasConfirmedCreateTaskProposal).mockResolvedValue({
      proposal: {
        id: 'proposal_1',
        orgId: 'org_1',
        userId: 'user_1',
        artifactId: null,
        conversationId: 'conv_1',
        context: { entityType: 'account', entityId: 'acc_1', accountId: 'acc_1' },
        status: 'succeeded',
        riskLevel: 'low',
        actions: [],
        sourceRefs: [],
        createdAt: '2026-05-17T05:00:00.000Z',
      },
      toolRun: {
        id: 'run_1',
        proposalId: 'proposal_1',
        toolName: 'create_task',
        status: 'succeeded',
        input: {},
        result: { taskId: 'task_1' },
      },
      task: {
        id: 'task_1',
        title: '准备技术评审材料',
        status: 'todo',
        priority: 'medium',
        dueDate: null,
        accountId: 'acc_1',
        opportunityId: null,
        contactId: null,
      },
      reused: false,
    });
  });

  it('requires the explicit preview gate before execution', async () => {
    const response = await POST(
      request({ pallas: '0' }),
      { params: Promise.resolve({ id: 'proposal_1' }) },
    );

    expect(response.status).toBe(404);
    expect(executePallasConfirmedCreateTaskProposal).not.toHaveBeenCalled();
  });

  it('executes only the Pallas local create_task boundary without calling execute-tools', async () => {
    const response = await POST(
      request({ pallas: 'strategic-play-action-board' }),
      { params: Promise.resolve({ id: 'proposal_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(executePallasConfirmedCreateTaskProposal).toHaveBeenCalledWith({
      ctx: expect.objectContaining({ orgId: 'org_1', userId: 'user_1' }),
      proposalId: 'proposal_1',
    });
    expect(payload).toMatchObject({
      proposal: { status: 'succeeded' },
      task: { id: 'task_1', title: '准备技术评审材料' },
      toolRun: { status: 'succeeded', toolName: 'create_task' },
      reused: false,
    });
    expect(payload.message).toContain('未调用外部工具');
  });
});
