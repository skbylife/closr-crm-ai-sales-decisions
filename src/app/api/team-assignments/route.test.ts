import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { requireAuth } from '@/lib/api-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { UserContext } from '@/lib/permissions';

// Keep the real account/ownership guards and response mapping in this route regression.
vi.mock('@/lib/api-guard', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api-guard')>();
  return { ...actual, requireAuth: vi.fn() };
});
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: vi.fn() }));

type Row = Record<string, unknown>;
const ctx: UserContext = { userId: 'self', orgId: 'org-a', orgRole: 'member', roleLevel: 'member', jobLevel: 0, teamId: null, teamMemberIds: ['self'] };
let reads: string[];
function adminWithRows(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      reads.push(table);
      let rows = [...(tables[table] ?? [])];
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { rows = rows.filter(row => row[key] === value); return query; },
        in(key: string, values: unknown[]) { rows = rows.filter(row => values.includes(row[key])); return query; },
        single() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
        then(resolve: (value: { data: Row[]; error: null }) => unknown) { return Promise.resolve(resolve({ data: rows, error: null })); },
      };
      return query;
    },
  };
}
function install(tables: Record<string, Row[]>) {
  vi.mocked(getSupabaseAdmin).mockReturnValue(adminWithRows(tables) as unknown as ReturnType<typeof getSupabaseAdmin>);
}
const request = (accountId: string) => new Request('http://localhost/api/team-assignments?accountId=' + accountId);

describe('GET team assignments account authorization', () => {
  beforeEach(() => { vi.clearAllMocks(); reads = []; vi.mocked(requireAuth).mockResolvedValue(ctx); });

  it('rejects a same-organization account owned outside the requester scope before reading interactions', async () => {
    install({ accounts: [{ id: 'restricted', org_id: 'org-a', owner_id: 'another-user' }] });
    const response = await GET(request('restricted'));
    expect(response.status).toBe(403);
    expect(reads).toEqual(['accounts']);
  });

  it('rejects another organization account before reading contact or decode rows', async () => {
    install({ accounts: [{ id: 'foreign', org_id: 'org-b', owner_id: 'self' }] });
    const response = await GET(request('foreign'));
    expect(response.status).toBe(404);
    expect(reads).toEqual(['accounts']);
  });

  it('keeps account-authorized aggregation but excludes foreign contact, decode and member rows', async () => {
    install({
      accounts: [{ id: 'allowed', org_id: 'org-a', owner_id: 'self' }],
      contacts: [
        { id: 'contact-a', account_id: 'allowed', org_id: 'org-a' },
        // A mismatched org on an account-linked row must not broaden access.
        { id: 'contact-b', account_id: 'allowed', org_id: 'org-b' },
      ],
      email_decodes: [
        { user_id: 'colleague', org_id: 'org-a', matched_contact_id: 'contact-a' },
        { user_id: 'colleague', org_id: 'org-a', matched_contact_id: 'contact-a' },
        { user_id: 'self', org_id: 'org-a', matched_contact_id: 'contact-a' },
        { user_id: 'foreign-user', org_id: 'org-b', matched_contact_id: 'contact-a' },
        { user_id: 'colleague', org_id: 'org-a', matched_contact_id: 'contact-b' },
      ],
      org_memberships: [
        { user_id: 'colleague', org_id: 'org-a', display_name: 'Example colleague', job_title: 'AE', job_level: 0 },
        { user_id: 'colleague', org_id: 'org-b', display_name: 'Foreign membership' },
      ],
    });
    const response = await GET(request('allowed'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ assignments: [{ contactId: 'contact-a', userId: 'colleague', memberName: 'Example colleague', memberTitle: 'AE', jobLevel: 0, interactionCount: 2 }] });
  });
});
