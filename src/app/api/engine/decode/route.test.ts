import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('POST /api/engine/decode', () => {
  it('returns decoded signals for valid input', async () => {
    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/engine/decode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({
        tenantId: 'tenant_demo',
        accountId: 'acct_customer_a',
        opportunityId: 'opp_aiops_renewal',
        sources: [
          {
            id: 'src_001',
            tenantId: 'tenant_demo',
            sourceType: 'email',
            accountId: 'acct_customer_a',
            opportunityId: 'opp_aiops_renewal',
            occurredAt: '2026-06-20T12:00:00.000Z',
            content: '今年集团有 5% 年降目标，TCS 报价更低。CFO 需要看到 AIOps 一年回本证明。',
          },
        ],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.schemaVersion).toBe('closr_judgment_engine_v1');
    expect(body.sources).toHaveLength(1);
    expect(body.evidenceRefs.length).toBeGreaterThanOrEqual(1);
    expect(body.signalProfile).toBeDefined();
    expect(body.signalProfile.primaryRisk).toBe('finance/procurement blocker');
    expect(body.signalProfile.signalStrength).toBe('strong');
    expect(body.signalProfile.patterns).toContain('finance');
    expect(body.signalProfile.patterns).toContain('procurement');
    expect(body.signalProfile.patterns).toContain('competitor');
    // Decode only returns sources + evidence + signal — no judgment, no win gap, no move
    expect(body.judgments).toBeUndefined();
    expect(body.winGaps).toBeUndefined();
    expect(body.moves).toBeUndefined();
  });

  it('returns 400 for invalid input', async () => {
    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/engine/decode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({ tenantId: 'tenant_demo' }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('accountId is required');
  });

  it('returns weak signal for sources without strong patterns', async () => {
    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/engine/decode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({
        tenantId: 'tenant_demo',
        accountId: 'acct_generic',
        sources: [
          {
            id: 'src_weak',
            tenantId: 'tenant_demo',
            sourceType: 'email',
            accountId: 'acct_generic',
            occurredAt: '2026-06-20T12:00:00.000Z',
            content: '客户说下周再聊。',
          },
        ],
      }),
    });

    const response = await POST(request);
    const body = await response.json();
    expect(body.signalProfile.signalStrength).toBe('weak');
    expect(body.signalProfile.primaryRisk).toBe('unverified deal risk');
    expect(body.signalProfile.patterns).toHaveLength(0);
  });
});

vi.mock('@/lib/api-guard', async () => ({
  ...await vi.importActual<typeof import('@/lib/api-guard')>('@/lib/api-guard'),
  requireAuth: vi.fn(async () => ({ userId: 'authenticated_user', orgId: 'tenant_demo', orgRole: 'admin', roleLevel: 'admin', jobLevel: 2, teamId: null, teamMemberIds: [] })),
  requireAccountAccess: vi.fn(async () => undefined),
  requireOpportunityAccess: vi.fn(async () => ({ id: 'opp_aiops_renewal', account_id: 'acct_customer_a', user_id: 'authenticated_user', assigned_to: null })),
  requireContactAccess: vi.fn(async () => ({ id: 'contact_procurement', account_id: 'acct_customer_a', user_id: 'authenticated_user' })),
}));
beforeEach(() => { vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost'); vi.stubEnv('ENGINE_AI_ENABLED', '0'); });
afterEach(() => vi.unstubAllEnvs());
