import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserContext } from './permissions-server';
import { permissionCache, PERMISSION_TTL } from './cache';
import { getOrgIdForUser } from './get-org-id';
import { getSupabaseAdmin } from './supabase/admin';
import { isNativeDatabase } from './database-backend';

vi.mock('./supabase/admin', () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock('./get-org-id', () => ({ getOrgIdForUser: vi.fn() }));
vi.mock('./database-backend', () => ({ isNativeDatabase: vi.fn() }));

type Member = { user_id: string; org_id: string; role: string; team_id: string | null; job_level: number; role_level?: number };
let members: Member[];
let membershipReads: number;
let teamReads: number;
function adminForCurrentMemberships() {
  return {
    from(table: string) {
      if (table !== 'org_memberships') throw new Error('Unexpected table');
      const filters: [string, unknown][] = [];
      const resolveRows = () => members.filter(row => filters.every(([key, value]) => row[key as keyof Member] === value));
      const query = {
        select(fields: string) { if (fields === 'user_id') teamReads++; else membershipReads++; return query; },
        eq(key: string, value: unknown) { filters.push([key, value]); return query; },
        single() { return Promise.resolve({ data: resolveRows()[0] ?? null, error: null }); },
        then(resolve: (value: { data: Member[]; error: null }) => unknown) { return Promise.resolve(resolve({ data: resolveRows(), error: null })); },
      };
      return query;
    },
  };
}

describe('native permission contexts reflect current membership immediately', () => {
  beforeEach(() => {
    vi.clearAllMocks(); permissionCache.clear(); membershipReads = 0; teamReads = 0;
    members = [
      { user_id: 'manager', org_id: 'org-a', role: 'member', team_id: 'team-old', job_level: 1 },
      { user_id: 'old-peer', org_id: 'org-a', role: 'member', team_id: 'team-old', job_level: 0 },
      { user_id: 'new-peer', org_id: 'org-a', role: 'member', team_id: 'team-new', job_level: 0 },
      { user_id: 'foreign-peer', org_id: 'org-b', role: 'member', team_id: 'team-new', job_level: 0 },
    ];
    vi.mocked(isNativeDatabase).mockReturnValue(true);
    vi.mocked(getOrgIdForUser).mockImplementation(async userId => members.find(row => row.user_id === userId)?.org_id ?? null);
    vi.mocked(getSupabaseAdmin).mockReturnValue(adminForCurrentMemberships() as unknown as ReturnType<typeof getSupabaseAdmin>);
  });
  afterEach(() => permissionCache.clear());

  it('ignores an unexpired privileged cache entry and re-reads the new team on consecutive calls', async () => {
    permissionCache.set('user_ctx:manager', { userId: 'manager', orgId: 'org-a', orgRole: 'owner', roleLevel: 'admin', jobLevel: 2, teamId: 'team-old', teamMemberIds: ['manager', 'stale-peer'] }, PERMISSION_TTL);
    const first = await getUserContext('manager');
    expect(first).toMatchObject({ orgRole: 'member', jobLevel: 1, teamId: 'team-old' });
    expect(first?.teamMemberIds).toEqual(['manager', 'old-peer']);

    members[0] = { ...members[0], team_id: 'team-new' };
    const second = await getUserContext('manager');
    expect(second?.teamMemberIds).toEqual(['manager', 'new-peer']);
    expect(second?.teamMemberIds).not.toContain('old-peer');
    expect(second?.teamMemberIds).not.toContain('foreign-peer');
    expect(getOrgIdForUser).toHaveBeenCalledTimes(2);
    expect(membershipReads).toBe(2); expect(teamReads).toBe(2);
    // No clock advancement or explicit cache invalidation occurred between accesses.
    expect(permissionCache.has('user_ctx:manager')).toBe(true);
  });

  it('returns null immediately after membership removal, even with an unexpired prior context', async () => {
    const first = await getUserContext('manager');
    permissionCache.set('user_ctx:manager', first, PERMISSION_TTL);
    members = members.filter(row => row.user_id !== 'manager');
    expect(await getUserContext('manager')).toBeNull();
    expect(getOrgIdForUser).toHaveBeenCalledTimes(2);
  });

  it('removes elevated role and team scope immediately after demotion', async () => {
    members[0] = { ...members[0], role: 'admin' };
    expect(await getUserContext('manager')).toMatchObject({ roleLevel: 'admin', jobLevel: 1 });
    members[0] = { ...members[0], role: 'member', job_level: 0 };
    const current = await getUserContext('manager');
    expect(current).toMatchObject({ orgRole: 'member', roleLevel: 'member', jobLevel: 0, teamMemberIds: ['manager'] });
    expect(membershipReads).toBe(2); expect(teamReads).toBe(1);
  });
});
