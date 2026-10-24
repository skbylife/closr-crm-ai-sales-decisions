import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { transferNativeAccount } from './account-transfer';
import type { UserContext } from '@/lib/permissions';
const url = process.env.CLOSR_HANDOFF_TEST_URL;
const suite = url ? describe : describe.skip;
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
const org = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', foreign = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ctx: UserContext = { userId: a, orgId: org, orgRole: 'owner', roleLevel: 'admin', jobLevel: 0, teamId: null, teamMemberIds: [a] };
const unowned = { owner_id: null, user_id: null, name: 'Example account' };
suite('atomic account handoff on disposable PostgreSQL', () => {
  let db: Pool;
  beforeAll(async () => {
    if (new URL(url!).pathname !== '/closr_handoff_test') throw new Error('Refusing a non-test database');
    process.env.DATABASE_URL = url; process.env.PG_SSL = 'false';
    db = new Pool({ connectionString: url, ssl: false });
    const { rows } = await db.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'");
    if (rows[0].n !== 0) throw new Error('Requires a fresh empty test database');
    for (const file of (await readdir('database/native')).filter(f => f.endsWith('.sql')).sort()) await db.query(await readFile(`database/native/${file}`, 'utf8'));
    await db.query("INSERT INTO auth.users(id,email,encrypted_password) VALUES($1,'a@example.invalid','EXAMPLE_NOT_A_PASSWORD_HASH'),($2,'b@example.invalid','EXAMPLE_NOT_A_PASSWORD_HASH')", [a,b]);
    await db.query("INSERT INTO organizations(id,name) VALUES($1,'Example A'),($2,'Example B')", [org,foreign]);
    await db.query("INSERT INTO org_memberships(user_id,org_id,role) VALUES($1,$3,'owner'),($2,$3,'member')", [a,b,org]);
  });
  afterAll(async () => { await db?.end(); });
  async function seed(id: string, tenant = org) {
    await db.query('INSERT INTO accounts(id,org_id,name) VALUES($1,$2,$3)', [id,tenant,'Example account']);
    await db.query('INSERT INTO contacts(id,org_id,account_id,name) VALUES($1,$2,$3,$4)', [`${id}-contact`,tenant,id,'Example contact']);
  }
  it('commits self-claim, related ownership and history/audit together, and reclaims to two null columns', async () => {
    await seed('claim'); await transferNativeAccount(ctx, { accountId: 'claim', toUserId: a }, unowned);
    expect((await db.query("SELECT owner_id,user_id FROM accounts WHERE id='claim'")).rows[0]).toEqual({ owner_id:a,user_id:a });
    expect((await db.query("SELECT user_id FROM contacts WHERE id='claim-contact'")).rows[0].user_id).toBe(a);
    expect((await db.query("SELECT context_snapshot FROM ownership_transfers WHERE record_id='claim'")).rows[0].context_snapshot.contacts).toHaveLength(1);
    await transferNativeAccount(ctx, { accountId: 'claim', toUserId: null }, { ...unowned, owner_id:a,user_id:a });
    expect((await db.query("SELECT owner_id,user_id FROM accounts WHERE id='claim'")).rows[0]).toEqual({ owner_id:null,user_id:null });
    expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE record_id='claim'")).rows[0].n).toBe(2);
  });
  it('rolls back account, related records and history when the last audit write fails', async () => {
    await seed('rollback');
    await db.query("CREATE FUNCTION public.test_fail_handoff_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.record_id='rollback' THEN RAISE EXCEPTION 'Injected final audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_fail_handoff BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION public.test_fail_handoff_audit()");
    await expect(transferNativeAccount(ctx, { accountId: 'rollback', toUserId:a }, unowned)).rejects.toThrow('Injected final audit failure');
    expect((await db.query("SELECT owner_id,user_id FROM accounts WHERE id='rollback'")).rows[0]).toEqual({ owner_id:null,user_id:null });
    expect((await db.query("SELECT user_id FROM contacts WHERE id='rollback-contact'")).rows[0].user_id).toBeNull();
    expect((await db.query("SELECT count(*)::int AS n FROM ownership_transfers WHERE record_id='rollback'")).rows[0].n).toBe(0);
    await db.query('DROP TRIGGER test_fail_handoff ON audit_log; DROP FUNCTION public.test_fail_handoff_audit()');
  });
  it('allows exactly one concurrent claimant and rejects the stale snapshot', async () => {
    await seed('race');
    const results = await Promise.allSettled([transferNativeAccount(ctx, { accountId:'race',toUserId:a }, unowned), transferNativeAccount({ ...ctx,userId:b,orgRole:'member',roleLevel:'member',teamMemberIds:[b] }, { accountId:'race',toUserId:b }, unowned)]);
    expect(results.filter(r => r.status==='fulfilled')).toHaveLength(1);
    const failed=results.find(r=>r.status==='rejected') as PromiseRejectedResult; expect(failed.reason.status).toBe(409);
    expect((await db.query("SELECT count(*)::int AS n FROM ownership_transfers WHERE record_id='race'")).rows[0].n).toBe(1);
  });
  it('rejects foreign tenant accounts and rechecks a revoked target membership', async () => {
    await seed('foreign-account',foreign);
    await expect(transferNativeAccount(ctx,{accountId:'foreign-account',toUserId:a},unowned)).rejects.toMatchObject({status:404});
    await seed('revoked'); await db.query('DELETE FROM org_memberships WHERE user_id=$1 AND org_id=$2',[b,org]);
    await expect(transferNativeAccount(ctx,{accountId:'revoked',toUserId:b},unowned)).rejects.toMatchObject({status:400});
    expect((await db.query("SELECT owner_id FROM accounts WHERE id='revoked'")).rows[0].owner_id).toBeNull();
  });
  it('rechecks actor role after the earlier route guard', async () => {
    await seed('actor-revoked'); await transferNativeAccount(ctx,{accountId:'actor-revoked',toUserId:a},unowned);
    await db.query("UPDATE org_memberships SET role='member' WHERE user_id=$1 AND org_id=$2",[a,org]);
    await expect(transferNativeAccount(ctx,{accountId:'actor-revoked',toUserId:null},{...unowned,owner_id:a,user_id:a})).rejects.toMatchObject({status:403});
  });
});
