import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileService } from './server';

// Explicitly opt in using a disposable database named closr_storage_test.
// This suite never uses DATABASE_URL or an application's configured database.
const testUrl = process.env.CLOSR_STORAGE_TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;
suite('native files with real PostgreSQL and a temporary filesystem', () => {
  const pool = new Pool({ connectionString: testUrl, ssl: false });
  let root: string;
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  const colleague = '33333333-3333-4333-8333-333333333333';
  const orgA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const orgB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const path = `${a}/task_1/fictional.txt`;

  beforeAll(async () => {
    const { rows } = await pool.query('SELECT current_database() AS name');
    if (rows[0].name !== 'closr_storage_test') throw new Error('Refusing to use any database except closr_storage_test');
    root = await mkdtemp(join(tmpdir(), 'closr-pg-storage-test-'));
    await pool.query(`CREATE ROLE closr_app NOLOGIN;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.organizations(id uuid PRIMARY KEY);
      CREATE TABLE public.org_memberships(user_id uuid, org_id uuid, role text, job_level integer, team_id uuid);
      CREATE TABLE public.audit_log(org_id uuid,user_id uuid,action text,object_type text,record_id text,changes jsonb);
      CREATE TABLE public.tasks(id text PRIMARY KEY, org_id uuid, user_id uuid, assigned_to text);
      INSERT INTO auth.users VALUES ('${a}'), ('${b}'), ('${colleague}');
      INSERT INTO public.organizations VALUES ('${orgA}'), ('${orgB}');
      INSERT INTO public.org_memberships VALUES
        ('${a}','${orgA}','member',0,NULL), ('${b}','${orgB}','owner',2,NULL), ('${colleague}','${orgA}','member',0,NULL);
      INSERT INTO public.tasks VALUES ('task_1','${orgA}','${a}',NULL);`);
    const migration = await readFile('database/native/040-files.sql', 'utf8');
    await pool.query(migration);
    await pool.query(migration); // Initialization is repeatable.
  });
  afterAll(async () => { await pool.end(); if (root) await rm(root, { recursive: true, force: true }); });

  it('persists metadata/bytes, denies cross-tenant and same-org unrelated access, and deletes cleanly', async () => {
    const db = async <T>(sql: string, params?: unknown[]) => (await pool.query(sql, params)).rows as T[];
    const transaction = async <T>(fn: (q: typeof db) => Promise<T>) => {
      const client = await pool.connect(); try { await client.query('BEGIN');
        const result = await fn(async <R>(sql: string, params?: unknown[]) => (await client.query(sql, params)).rows as R[]);
        await client.query('COMMIT'); return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    };
    const service = createFileService({ root, query: db, transaction });
    await service.upload('task-attachments', path, a, { type: 'text/plain', bytes: new TextEncoder().encode('Fictional local record') });
    expect((await pool.query('SELECT count(*)::int AS n FROM native_file_objects')).rows[0].n).toBe(1);
    // A fresh instance sees the same persisted volume and database.
    const restarted = createFileService({ root, query: db, transaction });
    expect((await restarted.download('task-attachments', path, a)).bytes.toString()).toBe('Fictional local record');
    await expect(restarted.download('task-attachments', path, b)).rejects.toMatchObject({ status: 404 });
    await expect(restarted.download('task-attachments', path, colleague)).rejects.toMatchObject({ status: 404 });
    await expect(restarted.remove('task-attachments', [path], b)).rejects.toMatchObject({ status: 404 });
    await expect(restarted.upload('task-attachments', path, a, { type: 'text/plain', bytes: new Uint8Array([1]) })).rejects.toMatchObject({ status: 409 });
    expect(await readdir(root)).toHaveLength(1);
    const client = await pool.connect();
    try {
      await client.query('SET ROLE closr_app');
      await expect(client.query('SELECT * FROM public.native_file_objects')).rejects.toMatchObject({ code: '42501' });
    } finally { await client.query('RESET ROLE'); client.release(); }
    await pool.query("CREATE FUNCTION fail_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='attachment_delete_completed' THEN RAISE EXCEPTION 'Injected completion failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_completion BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION fail_completion()");
    await expect(restarted.remove('task-attachments', [path], a)).rejects.toThrow('Injected completion failure');
    expect((await pool.query('SELECT deleted_at IS NOT NULL AS hidden FROM native_file_objects')).rows).toEqual([{ hidden: true }]);
    expect(await readdir(root)).toEqual([]);
    await expect(restarted.download('task-attachments', path, a)).rejects.toMatchObject({ status: 404 });
    await pool.query('DROP TRIGGER fail_completion ON audit_log; DROP FUNCTION fail_completion()');
    await restarted.remove('task-attachments', [path], a);
    expect(await readdir(root)).toEqual([]);
    expect((await pool.query('SELECT action,org_id,user_id FROM audit_log ORDER BY action')).rows).toEqual([
      { action: 'attachment_delete_completed', org_id: orgA, user_id: a },
      { action: 'attachment_delete_started', org_id: orgA, user_id: a },
      { action: 'attachment_delete_started', org_id: orgA, user_id: a },
    ]);
    expect((await pool.query('SELECT count(*)::int AS n FROM native_file_objects')).rows[0].n).toBe(0);
  });
});
