import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { requireAuth } from '@/lib/api-guard';
import { createPallasActionProposal } from '@/lib/pallas/server';

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
  createPallasActionProposal: vi.fn(),
}));

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/pallas/proposals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/pallas/proposals', () => {
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
  });

  it('requires the explicit preview gate before creating a persisted proposal', async () => {
    const response = await POST(request({
      conversationId: 'conv_1',
      context: { entityType: 'account', entityId: 'acc_1' },
      actions: [{ toolName: 'create_task' }],
    }));

    expect(response.status).toBe(404);
    expect(createPallasActionProposal).not.toHaveBeenCalled();
  });
});
