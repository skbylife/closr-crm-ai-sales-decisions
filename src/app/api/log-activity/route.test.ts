import { beforeEach, expect, it, vi } from 'vitest';
const guards = vi.hoisted(() => ({ auth: vi.fn(), insert: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock('@/lib/api-guard', () => ({
  requireAuth: guards.auth,
  requireAdmin: () => ({ from: () => ({ insert: guards.insert }) }),
  guardResponse: (error: { status?: number }) => Response.json({ error: 'Denied' }, { status: error.status ?? 500 }),
}));
import { POST } from './route';
beforeEach(() => vi.clearAllMocks());
it.each(['organization-one', 'demo'])('persists authoritative tenant %s without a special identity exception', async orgId => {
  guards.auth.mockResolvedValue({ userId: 'authenticated-user', orgId });
  const response = await POST(new Request('http://localhost/api/log-activity', { method: 'POST', body: JSON.stringify({ userId: 'forged-user', orgId: 'forged-org', actionType: 'demo', summary: 'Product presentation meeting' }) }));
  expect(response.status).toBe(200);
  expect(guards.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'authenticated-user', org_id: orgId, action_type: 'demo' }));
});
it('rejects anonymous activity writes', async () => {
  guards.auth.mockRejectedValue({ status: 401 });
  const response = await POST(new Request('http://localhost/api/log-activity', { method: 'POST', body: '{}' }));
  expect(response.status).toBe(401);
  expect(guards.insert).not.toHaveBeenCalled();
});
