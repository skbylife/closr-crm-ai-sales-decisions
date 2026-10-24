import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { closeNativeQueryPool, executeNativeQuery } from './executor';
import { createQueryClient } from './query';
const url = process.env.NATIVE_QUERY_TEST_URL;
const run = url ? describe : describe.skip;
const userA = '00000000-0000-4000-8000-000000000001';
const userB = '00000000-0000-4000-8000-000000000002';
let admin: Pool;
run('native executor on disposable PostgreSQL', () => {
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.pathname !== '/closr_query') throw new Error('Integration test requires disposable closr_query database');
    process.env.DATABASE_URL = url;
    process.env.PG_SSL = 'false';
    await closeNativeQueryPool();
    admin = new Pool({ connectionString: url, ssl: false });
    const { rows } = await admin.query("SELECT count(*) AS n FROM pg_tables WHERE schemaname='public'");
    if (Number(rows[0].n) !== 0) throw new Error('Integration test requires an empty database; refusing to alter existing tables');
    await admin.query(`
      CREATE TABLE public.organizations(id uuid PRIMARY KEY, name text NOT NULL);
      CREATE TABLE public.org_memberships(id text PRIMARY KEY, user_id uuid NOT NULL, org_id uuid REFERENCES organizations(id), role text);
      CREATE TABLE public.accounts(id text PRIMARY KEY, org_id uuid NOT NULL, name text, status text, notes jsonb, tags text[], created_at timestamptz DEFAULT now());
      ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY account_scope ON public.accounts FOR ALL TO closr_app
        USING (org_id::text = current_setting('request.jwt.claim.sub', true))
        WITH CHECK (org_id::text = current_setting('request.jwt.claim.sub', true));
      GRANT USAGE ON SCHEMA public TO closr_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON accounts TO closr_app;
      GRANT SELECT ON organizations, org_memberships TO closr_app;
    `);
    await admin.query('INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)', [userA, 'Example Alpha', userB, 'Example Beta']);
    await admin.query('INSERT INTO org_memberships(id,user_id,org_id,role) VALUES($1,$2,$2,$3)', ['membership-a', userA, 'owner']);
  });
  afterAll(async () => { await closeNativeQueryPool(); await admin?.end(); });
  const as = (userId: string) => createQueryClient(spec => executeNativeQuery(spec, { userId }));
  const service = () => createQueryClient(spec => executeNativeQuery(spec, { admin: true }));
  it('inserts typed JSON/native arrays, counts with pagination, and updates without SQL interpolation', async () => {
    const inserted = await as(userA).from('accounts').insert([{ id: 'a1', org_id: userA, name: 'Example A', notes: ['one', { nested: true }], tags: ['alpha'] }, { id: 'a2', org_id: userA, name: "Example ' quoted" }]).select('*');
    expect(inserted.error).toBeNull();
    expect(inserted.data).toHaveLength(2);
    const rows = inserted.data as Record<string, unknown>[];
    expect(rows[0].notes).toEqual(['one', { nested: true }]);
    expect(rows[0].tags).toEqual(['alpha']);
    const page = await as(userA).from('accounts').select('id', { count: 'exact' }).order('id').range(1, 1);
    expect(page.error).toBeNull(); expect(page.count).toBe(2); expect(page.data).toEqual([{ id: 'a2' }]);
    const updated = await as(userA).from('accounts').update({ status: 'qualified' }).eq('id', 'a1').select('id,status').single();
    expect(updated.error).toBeNull(); expect(updated.data).toEqual({ id: 'a1', status: 'qualified' });
  });
  it('isolates two users, rejects cross-scope writes, and resets role/identity before admin use', async () => {
    expect((await as(userB).from('accounts').insert({ id: 'b1', org_id: userB, name: 'Example B' })).error).toBeNull();
    const foreignRead = await as(userA).from('accounts').select('id').eq('id', 'b1');
    expect(foreignRead.data).toEqual([]);
    const foreignWrite = await as(userA).from('accounts').insert({ id: 'bad', org_id: userB, name: 'Rejected' });
    expect(foreignWrite.error?.code).toBe('42501');
    const foreignUpdate = await as(userA).from('accounts').update({ name: 'Rejected' }).eq('id', 'b1').select('id');
    expect(foreignUpdate.data).toEqual([]);
    const all = await service().from('accounts').select('id').order('id');
    expect(all.data).toHaveLength(3);
    const b = await as(userB).from('accounts').select('id');
    expect(b.data).toEqual([{ id: 'b1' }]);
  });
  it('supports upsert and related-table projection and rolls back cardinality failures', async () => {
    const upsert = await as(userA).from('accounts').upsert({ id: 'a1', org_id: userA, name: 'Example updated' }, { onConflict: 'id' }).select('name').single();
    expect(upsert.error).toBeNull(); expect(upsert.data).toEqual({ name: 'Example updated' });
    const relation = await service().from('org_memberships').select('role,organizations(name)').eq('id', 'membership-a').single();
    expect(relation.error).toBeNull(); expect(relation.data).toEqual({ role: 'owner', organizations: { name: 'Example Alpha' } });
    const failed = await as(userA).from('accounts').update({ status: 'rollback-me' }).select('id').single();
    expect(failed.error?.code).toBe('PGRST116');
    const after = await as(userA).from('accounts').select('status').eq('id', 'a1').single();
    expect(after.data).toEqual({ status: 'qualified' });
    const none = await as(userA).from('accounts').select('id').eq('id', 'missing').maybeSingle();
    expect(none.data).toBeNull(); expect(none.error).toBeNull();
  });
  it('executes nested boolean filters and deletes only visible rows', async () => {
    const filtered = await as(userA).from('accounts').select('id').or('id.eq.a1,and(name.ilike.%quoted%,status.is.null)').order('id');
    expect(filtered.error).toBeNull(); expect(filtered.data).toEqual([{ id: 'a1' }, { id: 'a2' }]);
    const removed = await as(userA).from('accounts').delete().in('id', ['a2', 'b1']).select('id');
    expect(removed.data).toEqual([{ id: 'a2' }]);
    expect((await as(userB).from('accounts').select('id')).data).toEqual([{ id: 'b1' }]);
  });
});
