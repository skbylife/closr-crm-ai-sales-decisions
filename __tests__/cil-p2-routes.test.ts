import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CILComprehensiveLintResult } from '@/lib/compiled-intelligence/lint';
import type { CILClaimExplainability, CILAccountHealthReport } from '@/lib/compiled-intelligence/explain';

// ─── Mocks ───────────────────────────────────────────────────────────

type UserContext = {
  userId: string;
  orgId: string;
  orgRole: 'owner' | 'admin' | 'manager' | 'member';
  jobLevel: number;
  teamId: string | null;
  teamMemberIds: string[];
};

const mockRequireAuth = vi.fn<() => Promise<UserContext>>();
const mockRequireRole = vi.fn();
const mockRequireAdmin = vi.fn();
const mockGuardResponse = vi.fn((err: unknown) => {
  if (err instanceof Response) return err;
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
});

const mockRunComprehensiveLint = vi.fn();
const mockRunCILClaimLintPass = vi.fn();
const mockGetClaimExplainability = vi.fn();
const mockGetAccountHealthReport = vi.fn();

vi.mock('@/lib/api-guard', () => ({
  requireAuth: mockRequireAuth,
  requireRole: mockRequireRole,
  requireAdmin: mockRequireAdmin,
  guardResponse: mockGuardResponse,
}));

vi.mock('@/lib/compiled-intelligence/lint', () => ({
  runComprehensiveLint: mockRunComprehensiveLint,
}));

vi.mock('@/lib/compiled-intelligence/ingest', () => ({
  runCILClaimLintPass: mockRunCILClaimLintPass,
}));

vi.mock('@/lib/compiled-intelligence/explain', () => ({
  getClaimExplainability: mockGetClaimExplainability,
  getAccountHealthReport: mockGetAccountHealthReport,
}));

const adminCtx: UserContext = {
  userId: 'user-1',
  orgId: 'org-1',
  orgRole: 'admin',
  jobLevel: 4,
  teamId: null,
  teamMemberIds: ['user-1'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(adminCtx);
  mockRequireRole.mockReturnValue(undefined);
  mockRequireAdmin.mockReturnValue(undefined);
});

// ─── /api/cil-lint ──────────────────────────────────────────────────

describe('/api/cil-lint', () => {
  const makeLintResult = (overrides?: Partial<CILComprehensiveLintResult>): CILComprehensiveLintResult => ({
    success: true,
    accountId: 'acc-1',
    scannedClaims: 5,
    scannedEvidence: 10,
    scannedPages: 3,
    findings: [
      {
        checkType: 'stale',
        severity: 'warning',
        targetType: 'claim',
        targetId: 'c1',
        title: 'Claim 已 15 天未复核',
        description: '测试',
      },
    ],
    healthScore: 92,
    refreshTargets: [],
    summary: '发现 1 项问题',
    ...overrides,
  });

  it('returns comprehensive lint result by default', async () => {
    mockRunComprehensiveLint.mockResolvedValue(makeLintResult());

    const { POST } = await import('@/app/api/cil-lint/route');
    const response = await POST(
      new Request('http://localhost/api/cil-lint', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: 'acc-1' }),
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.healthScore).toBe(92);
    expect(data.findings).toHaveLength(1);
    expect(data.findings[0].checkType).toBe('stale');
    expect(mockRunComprehensiveLint).toHaveBeenCalledWith({
      orgId: 'org-1',
      accountId: 'acc-1',
      nowIso: undefined,
    });
    expect(mockRunCILClaimLintPass).not.toHaveBeenCalled();
  });

  it('returns legacy lint when mode=legacy', async () => {
    mockRunCILClaimLintPass.mockResolvedValue({ staleClaims: [] });

    const { POST } = await import('@/app/api/cil-lint/route');
    const response = await POST(
      new Request('http://localhost/api/cil-lint', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: 'acc-1', mode: 'legacy' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockRunCILClaimLintPass).toHaveBeenCalledWith({
      orgId: 'org-1',
      accountId: 'acc-1',
      nowIso: undefined,
    });
    expect(mockRunComprehensiveLint).not.toHaveBeenCalled();
  });

  it('returns 400 when accountId is missing', async () => {
    const { POST } = await import('@/app/api/cil-lint/route');
    const response = await POST(
      new Request('http://localhost/api/cil-lint', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('accountId');
    expect(mockRunComprehensiveLint).not.toHaveBeenCalled();
  });

  it('passes nowIso to comprehensive lint when provided', async () => {
    mockRunComprehensiveLint.mockResolvedValue(makeLintResult());

    const { POST } = await import('@/app/api/cil-lint/route');
    await POST(
      new Request('http://localhost/api/cil-lint', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: 'acc-1', nowIso: '2026-04-05T00:00:00Z' }),
      }),
    );

    expect(mockRunComprehensiveLint).toHaveBeenCalledWith({
      orgId: 'org-1',
      accountId: 'acc-1',
      nowIso: '2026-04-05T00:00:00Z',
    });
  });

  it('returns guardResponse on auth failure', async () => {
    const authErr = new Error('not authed');
    mockRequireAuth.mockRejectedValue(authErr);

    const { POST } = await import('@/app/api/cil-lint/route');
    const response = await POST(
      new Request('http://localhost/api/cil-lint', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: 'acc-1' }),
      }),
    );

    expect(response.status).toBe(401);
    expect(mockGuardResponse).toHaveBeenCalledWith(authErr);
  });

  it('returns comprehensive result with all finding types', async () => {
    mockRunComprehensiveLint.mockResolvedValue(
      makeLintResult({
        findings: [
          { checkType: 'stale', severity: 'critical', targetType: 'claim', targetId: 'c1', title: 't', description: 'd' },
          { checkType: 'contradiction', severity: 'warning', targetType: 'claim', targetId: 'c2', title: 't', description: 'd' },
          { checkType: 'unsupported', severity: 'review', targetType: 'claim', targetId: 'c3', title: 't', description: 'd' },
          { checkType: 'orphan_evidence', severity: 'info', targetType: 'evidence', targetId: 'e1', title: 't', description: 'd' },
          { checkType: 'critical_gap', severity: 'review', targetType: 'page', title: 't', description: 'd' },
        ],
        healthScore: 65,
        refreshTargets: [
          { targetType: 'claim', targetId: 'c1', statement: 's', reason: 'r', priority: 'high', staleDays: 30 },
        ],
      }),
    );

    const { POST } = await import('@/app/api/cil-lint/route');
    const response = await POST(
      new Request('http://localhost/api/cil-lint', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: 'acc-1' }),
      }),
    );

    const data = await response.json();
    expect(data.findings).toHaveLength(5);
    expect(data.healthScore).toBe(65);
    expect(data.refreshTargets).toHaveLength(1);
    expect(data.refreshTargets[0].priority).toBe('high');

    const checkTypes = new Set(data.findings.map((f: { checkType: string }) => f.checkType));
    expect(checkTypes).toEqual(new Set(['stale', 'contradiction', 'unsupported', 'orphan_evidence', 'critical_gap']));
  });
});

// ─── /api/cil-explain ───────────────────────────────────────────────

describe('/api/cil-explain', () => {
  it('returns claim explainability when claimId is provided', async () => {
    const mockExplain: CILClaimExplainability = {
      claim: {
        id: 'c1',
        orgId: 'org-1',
        accountId: 'acc-1',
        claimType: 'general',
        statement: '测试 claim',
        status: 'active',
        confidence: 0.8,
        supportingEvidenceIds: ['ev1'],
        counterEvidenceIds: [],
        affectedObjectIds: [],
        lastRevalidatedAt: '2026-04-01',
        createdAt: '2026-01-01',
        updatedAt: '2026-04-01',
      },
      supportingEvidence: [],
      counterEvidence: [],
      affectedPages: [],
      isStale: false,
      staleDays: 4,
      refreshSuggestion: null,
    };
    mockGetClaimExplainability.mockResolvedValue(mockExplain);

    const { POST } = await import('@/app/api/cil-explain/route');
    const response = await POST(
      new Request('http://localhost/api/cil-explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: 'acc-1', claimId: 'c1' }),
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.type).toBe('claim');
    expect(data.data.claim.id).toBe('c1');
    expect(data.data.isStale).toBe(false);
  });

  it('returns account health report when only accountId is provided', async () => {
    const mockReport: CILAccountHealthReport = {
      accountId: 'acc-1',
      healthScore: 85,
      claimDistribution: { active: 3, stale: 1, archived: 0, total: 4 },
      evidenceCoverage: { total: 10, linked: 8, orphaned: 2 },
      knowledgeFreshness: { freshPages: 3, stalePages: 1, missingPageTypes: ['timeline'] },
      lintFindings: [],
      refreshTargets: [],
      summary: '健康分 85/100',
    };
    mockGetAccountHealthReport.mockResolvedValue(mockReport);

    const { POST } = await import('@/app/api/cil-explain/route');
    const response = await POST(
      new Request('http://localhost/api/cil-explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: 'acc-1' }),
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.type).toBe('account');
    expect(data.data.healthScore).toBe(85);
    expect(data.data.claimDistribution.active).toBe(3);
    expect(data.data.evidenceCoverage.orphaned).toBe(2);
    expect(data.data.knowledgeFreshness.missingPageTypes).toContain('timeline');
  });

  it('returns 400 when accountId is missing', async () => {
    const { POST } = await import('@/app/api/cil-explain/route');
    const response = await POST(
      new Request('http://localhost/api/cil-explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('accountId');
  });

  it('returns 404 when claim is not found', async () => {
    mockGetClaimExplainability.mockResolvedValue(null);

    const { POST } = await import('@/app/api/cil-explain/route');
    const response = await POST(
      new Request('http://localhost/api/cil-explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: 'acc-1', claimId: 'nonexistent' }),
      }),
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('Claim');
  });

  it('returns 500 when account health report fails', async () => {
    mockGetAccountHealthReport.mockResolvedValue(null);

    const { POST } = await import('@/app/api/cil-explain/route');
    const response = await POST(
      new Request('http://localhost/api/cil-explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: 'acc-1' }),
      }),
    );

    expect(response.status).toBe(500);
  });

  it('returns guardResponse on auth failure', async () => {
    const authErr = new Error('forbidden');
    mockRequireAuth.mockRejectedValue(authErr);

    const { POST } = await import('@/app/api/cil-explain/route');
    const response = await POST(
      new Request('http://localhost/api/cil-explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: 'acc-1' }),
      }),
    );

    expect(response.status).toBe(401);
    expect(mockGuardResponse).toHaveBeenCalledWith(authErr);
  });

  it('passes nowIso to claim explainability', async () => {
    mockGetClaimExplainability.mockResolvedValue({
      claim: { id: 'c1' },
      supportingEvidence: [],
      counterEvidence: [],
      affectedPages: [],
      isStale: false,
      staleDays: null,
      refreshSuggestion: null,
    });

    const { POST } = await import('@/app/api/cil-explain/route');
    await POST(
      new Request('http://localhost/api/cil-explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: 'acc-1', claimId: 'c1', nowIso: '2026-04-05T00:00:00Z' }),
      }),
    );

    expect(mockGetClaimExplainability).toHaveBeenCalledWith({
      orgId: 'org-1',
      accountId: 'acc-1',
      claimId: 'c1',
      nowIso: '2026-04-05T00:00:00Z',
    });
  });
});
