import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildEngineJudgmentSnapshot } from '@/lib/engine/schema';
import fixtureInput from '../../../../../fixtures/engine/renewal-expansion/input.json';

describe('POST /api/engine/strategic-play', () => {
  it('generates moves from existing judgments and win gaps', async () => {
    // Build judgment + win gap from snapshot first, then pass to strategic-play
    const snapshot = buildEngineJudgmentSnapshot(fixtureInput as any);

    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/engine/strategic-play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({
        tenantId: snapshot.tenantId,
        accountId: snapshot.accountId,
        opportunityId: snapshot.opportunityId,
        judgments: snapshot.judgments,
        winGaps: snapshot.winGaps,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.schemaVersion).toBe('closr_judgment_engine_v1');
    expect(body.judgments).toHaveLength(1);
    expect(body.winGaps).toHaveLength(1);
    expect(body.moves).toHaveLength(1);

    const move = body.moves[0];
    expect(move.status).toBe('proposed');
    expect(move.approvalRequired).toBe(true);
    expect(move.intent).toBe('validate financial blocker');
    expect(move.targetPerson).toBe('CFO / 财务评审人');
    expect(typeof move.ask).toBe('string');
    expect(typeof move.successTest).toBe('string');
    expect(typeof move.failureTest).toBe('string');
    expect(move.winGapId).toBe(snapshot.winGaps[0].id);
  });

  it('returns 400 for missing judgments', async () => {
    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/engine/strategic-play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({
        tenantId: 'tenant_demo',
        accountId: 'a',
        judgments: [],
        winGaps: [],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/judgments/);
  });

  it('returns 400 for missing winGaps', async () => {
    const snapshot = buildEngineJudgmentSnapshot(fixtureInput as any);
    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/engine/strategic-play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({
        tenantId: snapshot.tenantId,
        accountId: snapshot.accountId,
        judgments: snapshot.judgments,
        winGaps: [],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/winGaps/);
  });

  it('generates contextually appropriate moves for different judgment dimensions', async () => {
    const { POST } = await import('./route');
    const request = new Request('http://localhost/api/engine/strategic-play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({
        tenantId: 'tenant_demo',
        accountId: 'a',
        judgments: [
          {
            id: 'judg_dimension_security',
            tenantId: 'tenant_demo',
            accountId: 'a',
            dimension: 'security',
            answer: '安全合规问题',
            status: 'proposed',
            confidence: 0.72,
            impact: 'high',
            supportEvidenceIds: [],
            counterEvidenceIds: [],
            missingEvidence: ['approved security/compliance packet'],
            rationale: 'test',
          },
        ],
        winGaps: [
          {
            id: 'gap_security',
            tenantId: 'tenant_demo',
            accountId: 'a',
            dimension: 'security_review',
            currentState: '未通过',
            desiredState: '通过',
            impact: 'blocks pilot',
            linkedJudgmentIds: ['judg_dimension_security'],
            evidenceGap: 'approved security/compliance packet',
            status: 'open',
          },
        ],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(body.moves[0].intent).toBe('clear security review blocker');
    expect(body.moves[0].targetPerson).toContain('安全合规负责人');
    expect(body.moves[0].ask).toContain('数据驻留');
    expect(body.moves[0].approvalRequired).toBe(true);
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
