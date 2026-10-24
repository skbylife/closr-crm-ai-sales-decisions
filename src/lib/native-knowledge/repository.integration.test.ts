import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { searchNativeKnowledge, searchNativeCases, saveNativeKnowledge } from './repository';
// Operator importer is intentionally usable by the test without CLI or model network calls.
import { importCorpus } from '../../../scripts/native-knowledge-import.mjs';

const testUrl = process.env.NATIVE_KNOWLEDGE_TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;
const orgA = '11111111-1111-4111-8111-111111111111';
const orgB = '22222222-2222-4222-8222-222222222222';
const userA = '33333333-3333-4333-8333-333333333333';
const userB = '44444444-4444-4444-8444-444444444444';
let client: pg.Client;
let corpus: { entries: { id: string; title: string; content: string }[] };
const vector = (axis: number) => Array.from({ length: 1536 }, (_, i) => Number(i === axis));

suite('native pgvector and readable corpus on a fresh database', () => {
  beforeAll(async () => {
    const parsed = new URL(testUrl!);
    if (!parsed.pathname.endsWith('/closr_knowledge_test')) throw new Error('Integration tests require dedicated closr_knowledge_test database');
    process.env.DATABASE_URL = testUrl;
    process.env.PG_SSL = 'false';
    client = new pg.Client({ connectionString: testUrl, ssl: false });
    await client.connect();
    for (const file of (await readdir('database/native')).filter(x => x.endsWith('.sql')).sort()) {
      await client.query(await readFile(`database/native/${file}`, 'utf8'));
    }
    await client.query('TRUNCATE public.knowledge_base, public.strategy_cases CASCADE');
    corpus = JSON.parse(await readFile('data/knowledge/general-knowledge.json', 'utf8'));
    await client.query("INSERT INTO auth.users(id,email,encrypted_password) VALUES ($1,'user-a@example.invalid','TEST_ONLY_NOT_A_PASSWORD_HASH'),($2,'user-b@example.invalid','TEST_ONLY_NOT_A_PASSWORD_HASH') ON CONFLICT(id) DO NOTHING", [userA,userB]);
    await client.query("INSERT INTO public.organizations(id,name) VALUES ($1,'Example A'),($2,'Example B') ON CONFLICT(id) DO NOTHING", [orgA,orgB]);
    await client.query("INSERT INTO public.org_memberships(user_id,org_id,role) VALUES ($1,$2,'owner'),($3,$4,'owner') ON CONFLICT(user_id,org_id) DO NOTHING", [userA,orgA,userB,orgB]);
    await client.query("INSERT INTO public.accounts(id,org_id,user_id,owner_id,name) VALUES ('other-account',$1,$2,$2,'Example other account'),('account-test',$1,$2,$2,'Example test account') ON CONFLICT(id) DO NOTHING", [orgA,userA]);
  }, 30000);
  afterAll(async () => { await client?.end(); });

  it('imports 58 readable notes and 8 generic cases atomically and idempotently without a provider', async () => {
    expect(await importCorpus(client, corpus)).toMatchObject({ knowledge: 58, strategyCases: 8, embedded: false });
    await importCorpus(client, corpus);
    expect(Number((await client.query('SELECT count(*) FROM knowledge_base WHERE is_general_knowledge')).rows[0].count)).toBe(58);
    expect(Number((await client.query('SELECT count(*) FROM strategy_cases WHERE is_general_knowledge')).rows[0].count)).toBe(8);
    expect(Number((await client.query('SELECT count(*) FROM knowledge_base WHERE embedding IS NOT NULL')).rows[0].count)).toBe(0);
    const result = await searchNativeKnowledge({ orgId: orgA, text: 'BATNA' });
    expect(result.some(row => row.content.includes('BATNA'))).toBe(true);
    expect((await searchNativeCases({ text: 'Champion' })).length).toBeGreaterThan(0);
  });
  it('stores deterministic test-only vectors and ranks only the matching model', async () => {
    const target = corpus.entries[0];
    await importCorpus(client, corpus, { model: 'test-only-basis-v1', embed: async (text: string) => vector(text.startsWith(target.title+'\n') ? 0 : 1) });
    const result = await searchNativeKnowledge({ orgId: orgA, text: 'no-keyword-match-xyz', limit: 1, embedding: { values: vector(0), model: 'test-only-basis-v1' } });
    expect(result[0].id).toBe(target.id);
    expect(await searchNativeKnowledge({ orgId: orgA, text: 'no-keyword-match-xyz', embedding: { values: vector(0), model: 'different-model' } })).toEqual([]);
    await expect(importCorpus(client, corpus, { model: 'broken-test-model', embed: async () => [1,2] })).rejects.toThrow('1536');
    expect(Number((await client.query("SELECT count(*) FROM knowledge_base WHERE embedding_model='test-only-basis-v1'")).rows[0].count)).toBe(58);
  });
  it('does not return another organization or another account private knowledge', async () => {
    await client.query("INSERT INTO knowledge_base(id,org_id,account_id,title,content) VALUES ('private-a',$1,NULL,'tenant-needle','Example A only'),('private-b',$2,NULL,'tenant-needle','Example B only'),('account-other',$1,'other-account','tenant-needle','Other account') ON CONFLICT(id) DO NOTHING", [orgA,orgB]);
    const rows = await searchNativeKnowledge({ orgId: orgA, text: 'tenant-needle' });
    expect(rows.map(row => row.id)).toEqual(['private-a']);
    await saveNativeKnowledge({ orgId: orgA, accountId: 'account-test', title: 'saved', content: 'private', category: 'example', sourceType: 'example', sourceId: 'stable' });
    await saveNativeKnowledge({ orgId: orgA, accountId: 'account-test', title: 'saved-again', content: 'private', category: 'example', sourceType: 'example', sourceId: 'stable' });
    expect(Number((await client.query("SELECT count(*) FROM knowledge_base WHERE org_id=$1 AND source_type='example' AND source_id='stable'", [orgA])).rows[0].count)).toBe(1);
  });
  it('enforces read-only global corpus and cross-tenant isolation through the restricted DB role', async () => {
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE closr_app');
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [userA]);
      expect(Number((await client.query('SELECT count(*) FROM knowledge_base WHERE is_general_knowledge')).rows[0].count)).toBe(58);
      expect((await client.query("SELECT id FROM knowledge_base WHERE id='private-b'")).rows).toEqual([]);
      expect((await client.query("UPDATE knowledge_base SET title='not allowed' WHERE is_general_knowledge RETURNING id")).rowCount).toBe(0);
      expect((await client.query('DELETE FROM strategy_cases WHERE is_general_knowledge RETURNING id').catch(() => ({ rowCount: 0 }))).rowCount).toBe(0);
    } finally { await client.query('ROLLBACK'); }
  });
});
