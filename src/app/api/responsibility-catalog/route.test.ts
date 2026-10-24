import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { requireAdmin, requireAuth } from '@/lib/api-guard';

vi.mock('@/lib/api-guard', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
  guardResponse: (err: unknown) => Response.json({ error: err instanceof Error ? err.message : 'error' }, { status: 500 }),
}));

function makeAdmin() {
  return {
    from() {
      const query = {
        select() { return query; },
        or() { return query; },
        order() { return query; },
        then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => void) {
          resolve({
            data: [
              { id: 'r_system', org_id: null, key: 'account_lead', label: '总负责', description: null, category: 'leadership', is_system: true, created_by: null, created_at: null },
              { id: 'r_custom', org_id: 'org_1', key: 'custom', label: '自定义', description: null, category: 'custom', is_system: false, created_by: 'user_1', created_at: null },
            ],
            error: null,
          });
        },
      };
      return query;
    },
  };
}

describe('/api/responsibility-catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_1', orgId: 'org_1', orgRole: 'member', roleLevel: 'member', jobLevel: 0, teamId: null, teamMemberIds: ['user_1'],
    });
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin() as unknown as ReturnType<typeof requireAdmin>);
  });

  it('returns system plus current org custom responsibilities', async () => {
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.responsibilities).toEqual([
      expect.objectContaining({ id: 'r_system', isSystem: true }),
      expect.objectContaining({ id: 'r_custom', orgId: 'org_1', isSystem: false }),
    ]);
  });
});
