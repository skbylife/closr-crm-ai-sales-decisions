import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { ApiError, requireAdmin, requireAuth, requireRole } from '@/lib/api-guard';

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

type Row = Record<string, unknown>;

function matches(row: Row, filters: Array<[string, unknown]>) {
  return filters.every(([key, value]) => row[key] === value);
}

function makeAdmin(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          filters.push([key, value]);
          return query;
        },
        gte() {
          return query;
        },
        lte() {
          return query;
        },
        or() {
          return query;
        },
        order() {
          return query;
        },
        range() {
          return query;
        },
        then(resolve: (value: { data: Row[]; error: null }) => void) {
          return Promise.resolve({
            data: (tables[table] ?? []).filter((row) => matches(row, filters)),
            error: null,
          }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as ReturnType<typeof requireAdmin>;
}

describe('GET /api/audit-log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'admin_1',
      orgId: 'org_1',
      orgRole: 'admin',
      roleLevel: 'admin',
      jobLevel: 2,
      teamId: null,
      teamMemberIds: [],
    });
    vi.mocked(requireRole).mockImplementation(() => undefined);
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin({
      activity_logs: [{
        id: 'activity_1',
        org_id: 'org_1',
        user_id: 'rep_1',
        user_display_name: 'Alice Chen',
        action_type: 'decode.created',
        entity_type: 'decode',
        entity_id: 'decode_1',
        entity_name: '客户邮件解读',
        account_name: '华东零售集团',
        summary: '新增邮件解读',
        metadata: { accountId: 'acc_1' },
        created_at: '2026-05-20T18:00:00.000Z',
      }, {
        id: 'activity_other_org',
        org_id: 'org_2',
        action_type: 'decode.created',
        created_at: '2026-05-20T19:00:00.000Z',
      }],
      audit_log: [{
        id: 'audit_1',
        org_id: 'org_1',
        user_id: 'manager_1',
        action: 'ownership.transfer',
        object_type: 'account',
        record_id: 'acc_1',
        record_name: '华东零售集团',
        changes: { from: 'rep_1', to: 'rep_2' },
        created_at: '2026-05-20T18:05:00.000Z',
      }, {
        id: 'audit_other_org',
        org_id: 'org_2',
        action: 'ownership.transfer',
        created_at: '2026-05-20T18:10:00.000Z',
      }],
    }));
  });

  it('requires admin role before exposing enterprise audit history', async () => {
    vi.mocked(requireRole).mockImplementation(() => {
      throw new ApiError(403, '权限不足，需要 admin 或更高角色');
    });

    const response = await GET(new Request('http://localhost/api/audit-log'));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: '权限不足，需要 admin 或更高角色' });
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it('merges activity and security audit rows inside the caller organization', async () => {
    const response = await GET(new Request('http://localhost/api/audit-log?limit=10'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.logs).toEqual([
      expect.objectContaining({
        id: 'audit_1',
        source: 'audit_log',
        action: 'ownership.transfer',
        recordName: '华东零售集团',
      }),
      expect.objectContaining({
        id: 'activity_1',
        source: 'activity_logs',
        action: 'decode.created',
        userName: 'Alice Chen',
      }),
    ]);
    expect(payload.logs.map((log: { id: string }) => log.id)).not.toContain('audit_other_org');
    expect(payload.logs.map((log: { id: string }) => log.id)).not.toContain('activity_other_org');
  });
});
