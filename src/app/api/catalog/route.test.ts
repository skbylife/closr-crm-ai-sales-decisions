import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST, PATCH, DELETE } from './route';
import { GET as poolGet } from '../pool/route';
import { POST as transfer, GET as transferHistory } from '../accounts/transfer/route';
import { ApiError, requireAuth } from '@/lib/api-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { createQueryClient } from '@/lib/native-db/query';
import type { QuerySpec } from '@/lib/native-db/types';
import type { UserContext } from '@/lib/permissions';
vi.mock('@/lib/api-guard', async original => ({ ...await original<typeof import('@/lib/api-guard')>(), requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
// The companion PostgreSQL integration suite covers the native transaction path.
vi.mock('@/lib/database-backend', () => ({ isNativeDatabase: () => false }));
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>; let writes: QuerySpec[]; let failWrites: boolean; let race: boolean; let failTable: string | null;
const ctx: UserContext = { userId: 'self', orgId: 'org-a', orgRole: 'member', roleLevel: 'member', jobLevel: 0, teamId: null, teamMemberIds: ['self'] };
const request = (body: unknown) => new Request('http://localhost/api/catalog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const product = { kind: 'product', name: 'Example product', unit_price: 0, currency: 'USD' };
beforeEach(() => {
  vi.clearAllMocks(); writes = []; failWrites = false; race = false; failTable = null;
  tables = { accounts: [{ id: 'mine', org_id: 'org-a', owner_id: 'self', user_id: 'self', name: 'Example account' }, { id: 'foreign', org_id: 'org-b', owner_id: 'self', name: 'Foreign account' }, { id: 'restricted', org_id: 'org-a', owner_id: 'other', name: 'Restricted account' }], opportunities: [{ id: 'opp', org_id: 'org-a', account_id: 'mine', user_id: 'self' }], products: [], quotes: [], org_memberships: [{ user_id: 'self', org_id: 'org-a' }] };
  const client = createQueryClient(async spec => {
    if (spec.action !== 'select') { writes.push(spec); if (failWrites || spec.table === failTable) return { data: null, error: { code: 'XX000', message: 'Simulated storage failure' }, count: null, status: 500, statusText: 'Error' }; }
    if (race && spec.table === 'accounts' && spec.action === 'update') { tables.accounts.find(a => a.id === 'pool')!.owner_id = 'winner'; }
    const source = tables[spec.table] ?? (tables[spec.table] = []);
    let rows = source.filter(row => spec.filters.every(f => f.operator === 'in' ? (f.value as unknown[]).includes(row[f.column!]) : f.operator === 'neq' ? row[f.column!] !== f.value : row[f.column!] === f.value));
    if (spec.action === 'insert') { rows = (Array.isArray(spec.values) ? spec.values : [spec.values!]).map(v => ({ id: crypto.randomUUID(), ...v })); source.push(...rows); }
    if (spec.action === 'update') rows.forEach(row => Object.assign(row, spec.values));
    if (spec.action === 'delete') tables[spec.table] = source.filter(row => !rows.includes(row));
    return { data: spec.cardinality ? (rows[0] ? { ...rows[0] } : null) : rows.map(r => ({ ...r })), error: null, count: rows.length, status: 200, statusText: 'OK' };
  });
  vi.mocked(requireAuth).mockResolvedValue(ctx);
  vi.mocked(getSupabaseAdmin).mockReturnValue(client as unknown as ReturnType<typeof getSupabaseAdmin>);
  vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
});
describe('real catalog persistence and guarded pool routes', () => {
  it('rejects unauthenticated reads and writes before accessing the database', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new ApiError(401, 'Authentication required'));
    expect((await GET()).status).toBe(401); expect((await POST(request(product))).status).toBe(401); expect((await poolGet()).status).toBe(401); expect(writes).toHaveLength(0);
  });
  it('persists product create/edit/delete, including zero price and server-selected org', async () => {
    const created = await POST(request({ ...product, org_id: 'forged-org' })); expect(created.status).toBe(200);
    const id = (await created.json()).record.id; expect(tables.products[0].org_id).toBe('org-a');
    expect((await PATCH(request({ ...product, id, name: 'Updated product' }))).status).toBe(200);
    expect((await (await GET()).json()).products[0].name).toBe('Updated product');
    expect((await DELETE(request({ kind: 'product', id }))).status).toBe(200); expect(tables.products).toHaveLength(0);
  });
  it('does not mutate another organization product or accept invalid prices', async () => {
    tables.products.push({ id: 'foreign-product', org_id: 'org-b' });
    expect((await DELETE(request({ kind: 'product', id: 'foreign-product' }))).status).toBe(404);
    expect((await POST(request({ ...product, unit_price: -1 }))).status).toBe(400); expect(writes).toHaveLength(0);
  });
  it('checks real account scope and account/opportunity relationship before creating a quote', async () => {
    const quote = { kind: 'quote', account_id: 'mine', opportunity_id: 'opp', valid_days: 30 };
    expect((await POST(request({ ...quote, account_id: 'foreign' }))).status).toBe(404);
    expect((await POST(request({ ...quote, account_id: 'restricted' }))).status).toBe(403);
    tables.opportunities.push({ id: 'mismatch', org_id: 'org-a', account_id: null, user_id: 'self' });
    expect((await POST(request({ ...quote, opportunity_id: 'mismatch' }))).status).toBe(400);
    expect(writes).toHaveLength(0);
    expect((await POST(request(quote))).status).toBe(200); expect(tables.quotes[0]).toMatchObject({ org_id: 'org-a', created_by: 'self', account_id: 'mine', total: 0, status: 'draft' });
  });
  it('filters inaccessible quotes and blocks status edits to them', async () => {
    tables.quotes.push({ id: 'q', org_id: 'org-a', account_id: 'restricted' });
    expect((await (await GET()).json()).quotes).toEqual([]);
    expect((await PATCH(request({ kind: 'quote', id: 'q', status: 'accepted' }))).status).toBe(403); expect(writes).toHaveLength(0);
  });
  it('reports database write failures instead of success', async () => { failWrites = true; expect((await POST(request(product))).status).toBe(500); expect(tables.products).toHaveLength(0); });
  it('pool excludes foreign tenants and legacy-owned accounts', async () => {
    tables.accounts.push({ id: 'pool', org_id: 'org-a', owner_id: null, user_id: null }, { id: 'legacy', org_id: 'org-a', owner_id: null, user_id: 'other' }, { id: 'other-pool', org_id: 'org-b', owner_id: null, user_id: null });
    const response = await poolGet(); expect(response.status).toBe(200); expect((await response.json()).accounts.map((a: Row) => a.id)).toEqual(['pool']);
  });
  it('losing a concurrent claim returns 409 without transferring children or writing success audit', async () => {
    tables.accounts.push({ id: 'pool', org_id: 'org-a', owner_id: null, user_id: null }); race = true;
    const response = await transfer(request({ accountId: 'pool', toUserId: 'self' }));
    expect(response.status).toBe(409); expect(tables.accounts.find(a => a.id === 'pool')?.owner_id).toBe('winner'); expect(writes).toHaveLength(1);
  });
  it('persists a successful self-claim and removes it from the pool on reload', async () => {
    tables.accounts.push({ id: 'pool', name: 'Example unassigned', org_id: 'org-a', owner_id: null, user_id: null });
    expect((await transfer(request({ accountId: 'pool', toUserId: 'self' }))).status).toBe(200);
    expect(tables.accounts.find(a => a.id === 'pool')).toMatchObject({ owner_id: 'self', user_id: 'self' });
    expect((await (await poolGet()).json()).accounts).toEqual([]);
  });
  it('does not report a successful claim when dependent handoff persistence fails', async () => {
    tables.accounts.push({ id: 'pool', name: 'Example unassigned', org_id: 'org-a', owner_id: null, user_id: null }); failTable = 'contacts';
    const response = await transfer(request({ accountId: 'pool', toUserId: 'self' }));
    expect(response.status).toBe(500); expect((await response.json()).error).toContain('handoff failed');
    expect(tables.audit_log ?? []).toHaveLength(0);
  });
  it('never exempts a legacy demo identity from history ownership checks', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ ...ctx, userId: 'demo', teamMemberIds: ['demo'] });
    expect((await transferHistory(new Request('http://localhost/api/accounts/transfer?accountId=restricted'))).status).toBe(403);
  });

});
