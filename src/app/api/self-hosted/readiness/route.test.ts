import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { query } from '@/lib/postgres';
import { stat } from 'node:fs/promises';
import { GET } from './route';
import { ApiError, requireAdmin, requireAuth, requireRole } from '@/lib/api-guard';

vi.mock('node:fs/promises', () => ({
  access: vi.fn(async () => undefined),
  stat: vi.fn(async () => ({ isDirectory: () => true, isFile: () => true, size: 32, mode: 0o600 })),
}));
vi.mock('@/lib/postgres', async () => ({
  ...await vi.importActual<typeof import('@/lib/postgres')>('@/lib/postgres'),
  query: vi.fn(async () => [{ vector: true, accounts: true }]),
}));
afterEach(() => vi.unstubAllEnvs());

vi.mock('@/lib/api-guard', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-guard')>('@/lib/api-guard');
  return {
    ApiError: actual.ApiError,
    requireAuth: vi.fn(),
    requireRole: vi.fn(),
    requireAdmin: vi.fn(),
    guardResponse: actual.guardResponse,
  };
});

function makeAdmin(
  overrides: Record<string, { error: { message: string } | null; count?: number | null }> = {},
) {
  return {
    from(table: string) {
      const override = overrides[table];
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        limit() {
          return query;
        },
        then(resolve: (value: { data: Array<{ id: string }>; error: { message: string } | null; count?: number | null }) => void) {
          return Promise.resolve({
            data: override?.error ? [] : [{ id: `${table}_1` }],
            error: override?.error ?? null,
            count: override?.count ?? (table === 'org_memberships' ? 3 : null),
          }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as ReturnType<typeof requireAdmin>;
}

describe('GET /api/self-hosted/readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CLOSR_DATABASE_BACKEND', 'supabase');
    vi.stubEnv('NEXT_PUBLIC_CLOSR_DATABASE_BACKEND', '');
    delete process.env.CLOSR_LICENSE_MAX_SEATS;
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'admin',
      roleLevel: 'admin',
      jobLevel: 2,
      teamId: null,
      teamMemberIds: [],
    });
    vi.mocked(requireRole).mockImplementation(() => undefined);
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin());
  });

  it('requires admin role before exposing deployment readiness details', async () => {
    vi.mocked(requireRole).mockImplementation(() => {
      throw new ApiError(403, '权限不足，需要 admin 或更高角色');
    });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: '权限不足，需要 admin 或更高角色' });
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it('returns env, db, privacy, and license readiness for admins', async () => {
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.orgId).toBe('org_1');
    expect(payload.deployment).toMatchObject({ mode: 'self-hosted' });
    expect(payload.license).toMatchObject({ mode: expect.any(String), plan: expect.any(String), seatsUsed: 3 });
    expect(payload.summary).toMatchObject({ fail: expect.any(Number), manual: expect.any(Number) });
    expect(payload.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'ops:runtime-diagnostics', status: 'pass' }),
      expect.objectContaining({ id: 'db:accounts', status: 'pass' }),
      expect.objectContaining({ id: 'privacy:evidence-scope', status: 'pass' }),
      expect.objectContaining({ id: 'license:seat-limit', status: 'manual' }),
    ]));
  });

  it('fails seat entitlement when offline license seat limit is exceeded', async () => {
    process.env.CLOSR_LICENSE_MAX_SEATS = '2';
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin({
      org_memberships: { error: null, count: 3 },
    }));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.license).toMatchObject({ seats: 2, seatsUsed: 3 });
    expect(payload.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'license:seat-limit', status: 'fail', detail: '3/2 seats used' }),
    ]));
    expect(payload.summary.overall).toBe('fail');
  });

  it('marks source record evidence scope failed when the table check fails', async () => {
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin({
      source_records: { error: { message: 'relation source_records does not exist' } },
    }));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'db:source_records', status: 'fail' }),
      expect.objectContaining({ id: 'privacy:evidence-scope', status: 'fail' }),
    ]));
    expect(payload.summary.overall).toBe('fail');
  });
  it('reports native configuration and filesystem probes without claiming security acceptance', async () => {
    vi.stubEnv('CLOSR_DATABASE_BACKEND', 'postgres');
    vi.stubEnv('NEXT_PUBLIC_CLOSR_DATABASE_BACKEND', 'postgres');
    vi.stubEnv('DATABASE_URL', 'postgresql://EXAMPLE_USER:EXAMPLE_PASSWORD@db.example.invalid/closr');
    const response = await GET();
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.deployment.backend).toBe('postgres');
    expect(payload.checks.some((check: { id: string }) => check.id.startsWith('env:supabase'))).toBe(false);
    expect(payload.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'env:database-url', status: 'pass' }),
      expect.objectContaining({ id: 'db:pgvector', status: 'pass' }),
      expect.objectContaining({ id: 'storage:attachments', status: 'pass' }),
      expect.objectContaining({ id: 'privacy:evidence-scope', status: 'manual' }),
      expect.objectContaining({ id: 'privacy:ai-log-redaction', status: 'manual' }),
    ]));
    expect(payload.summary.overall).not.toBe('pass');
    expect(JSON.stringify(payload)).not.toContain('EXAMPLE_PASSWORD');
    expect(query).toHaveBeenCalled();
    expect(stat).toHaveBeenCalled();
  });

  it('does not turn native database probe errors into an apparently ready state', async () => {
    vi.stubEnv('CLOSR_DATABASE_BACKEND', 'postgres');
    vi.mocked(query).mockRejectedValueOnce(new Error('EXAMPLE_CONNECTION_DETAIL_NOT_FOR_OUTPUT'));
    const payload = await (await GET()).json();
    expect(payload.checks).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'db:native-capabilities', status: 'fail' })]));
    expect(JSON.stringify(payload)).not.toContain('EXAMPLE_CONNECTION_DETAIL_NOT_FOR_OUTPUT');
  });

});
