import { beforeEach, describe, expect, it, vi } from 'vitest';
const guards = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/api-guard', () => ({
  requireAuth: guards.auth, requireAdmin: guards.admin,
  guardResponse: (error: { status?: number; message?: string }) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
}));
vi.mock('@/lib/compliance-audit', () => ({ recordComplianceAudit: guards.audit }));
import { POST } from './route';
describe('auth audit response semantics', () => {
  beforeEach(() => vi.resetAllMocks());
  it('returns an authentication status instead of a server error after session revocation', async () => {
    guards.auth.mockRejectedValue(Object.assign(new Error('Sign in first'), { status: 401 }));
    const response = await POST(new Request('http://localhost/api/auth/audit-event', { method: 'POST', body: JSON.stringify({ event: 'password_reset_completed' }) }));
    expect(response.status).toBe(401); expect(guards.audit).not.toHaveBeenCalled();
  });
  it('records allowed events for the authenticated context', async () => {
    guards.auth.mockResolvedValue({ userId: 'fictional-user', orgId: 'fictional-org' }); guards.admin.mockReturnValue({});
    const response = await POST(new Request('http://localhost/api/auth/audit-event', { method: 'POST', body: JSON.stringify({ event: 'login_success' }) }));
    expect(response.status).toBe(200); expect(guards.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'login_success', ctx: { userId: 'fictional-user', orgId: 'fictional-org' } }));
  });
});
