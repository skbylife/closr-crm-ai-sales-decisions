import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { persistEngineJudgmentSnapshot } from '@/lib/engine/persistence';

vi.mock('@/lib/engine/persistence', () => ({
  persistEngineJudgmentSnapshot: vi.fn(async () => ({
    snapshotId: 'snap_test',
    counts: {
      sources: 1,
      evidenceRefs: 1,
      judgments: 1,
      winGaps: 1,
      moves: 1,
      auditEvents: 1,
    },
  })),
}));

function postRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/engine/judgment/snapshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  tenantId: 'tenant_demo',
  accountId: 'acct_customer_a',
  opportunityId: 'opp_aiops_renewal',
  sources: [
    {
      id: 'src_renewal_001',
      tenantId: 'tenant_demo',
      sourceType: 'email',
      accountId: 'acct_customer_a',
      opportunityId: 'opp_aiops_renewal',
      occurredAt: '2026-06-18T12:00:00.000Z',
      content: '今年集团有 5% 年降目标，TCS 报价更低。CFO 需要看到 AIOps 一年回本证明。',
    },
  ],
};

describe('/api/engine/judgment/snapshot', () => {
  it('returns a proposal-only judgment snapshot from source records without persisting by default', async () => {
    vi.clearAllMocks();
    const res = await POST(postRequest(validBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schemaVersion).toBe('closr_judgment_engine_v1');
    expect(body.judgmentSummary.primaryRisk).toBe('finance/procurement blocker');
    expect(body.writebackPolicy.mode).toBe('proposal_only');
    expect(body.crmFieldUpdates).toEqual([]);
    expect(body.persistence).toEqual({ persisted: false });
    expect(persistEngineJudgmentSnapshot).not.toHaveBeenCalled();
  });

  it('persists only when persist=true is explicitly requested', async () => {
    vi.clearAllMocks();
    const res = await POST(postRequest({ ...validBody, persist: true, actorId: 'service_test' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persistence).toEqual({
      persisted: true,
      snapshotId: 'snap_test',
      counts: {
        sources: 1,
        evidenceRefs: 1,
        judgments: 1,
        winGaps: 1,
        moves: 1,
        auditEvents: 1,
      },
    });
    expect(persistEngineJudgmentSnapshot).toHaveBeenCalledOnce();
    expect(persistEngineJudgmentSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      schemaVersion: 'closr_judgment_engine_v1',
      tenantId: 'tenant_demo',
      accountId: 'acct_customer_a',
    }), { actorId: 'authenticated_user', actorType: 'user' });
  });

  it('returns 400 for invalid source records instead of inventing a judgment', async () => {
    const res = await POST(postRequest({
      tenantId: 'tenant_demo',
      accountId: 'acct_customer_a',
      sources: [
        {
          id: 'src_invalid',
          tenantId: 'tenant_demo',
          sourceType: 'email',
          occurredAt: 'not-a-date',
          content: '',
        },
      ],
    }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid engine source record');
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
