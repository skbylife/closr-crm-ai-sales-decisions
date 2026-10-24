import { describe, expect, it, vi } from 'vitest';
import { createQueryClient } from './query';
import { compileNativeQuery, executeNativeQuery, splitQueryList } from './executor';
import type { QueryResult, QuerySpec } from './types';
const ok: QueryResult = { data: [], error: null, count: null, status: 200, statusText: 'OK' };
const select = (extra: Partial<QuerySpec> = {}): QuerySpec => ({ table: 'accounts', action: 'select', columns: '*', returning: true, filters: [], orders: [], ...extra });

describe('native builder transport contract', () => {
  it('sends one structured request and never repeats an awaited mutation', async () => {
    const execute = vi.fn(async (_spec: QuerySpec) => ok);
    const query = createQueryClient(execute).from('accounts').upsert({ id: 'a', name: 'Example' }, { onConflict: 'id' }).select('id,name').single();
    await query; await query;
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toMatchObject({ action: 'upsert', onConflict: 'id', cardinality: 'single', returning: true, columns: 'id,name' });
    expect(() => query.eq('id', 'another')).toThrow('after execution');
  });
  it('preserves filter groups, count and inclusive pagination', async () => {
    let received: QuerySpec | undefined;
    const client = createQueryClient(async spec => { received = spec; return ok; });
    await client.from('accounts').select('id', { count: 'exact' }).eq('org_id', 'org').or('owner_id.eq.user,and(owner_id.is.null,user_id.eq.user)').order('created_at', { ascending: false }).range(20, 29);
    expect(received).toMatchObject({ limit: 10, offset: 20, count: 'exact', orders: [{ column: 'created_at', ascending: false }] });
    expect(received!.filters).toHaveLength(2);
  });
  it('rejects unsupported related-table modifiers rather than dropping them', () => {
    const client = createQueryClient(async () => ok);
    expect(() => client.from('accounts').order('name', { referencedTable: 'contacts' })).toThrow('unsupported');
  });
});

describe('native SQL compilation and trust boundary', () => {
  it('parameterizes injection-looking values and refuses arbitrary schema/table identifiers', () => {
    const payload = "x'); DROP TABLE accounts; --";
    const compiled = compileNativeQuery(select({ filters: [{ column: 'name', operator: 'eq', value: payload }] }));
    expect(compiled.sql).not.toContain(payload);
    expect(compiled.params[0]).toBe(payload);
    for (const table of ['auth.users', 'pg_authid', 'accounts; DROP TABLE accounts', 'native_sessions']) expect(() => compileNativeQuery(select({ table }))).toThrow();
    expect(() => compileNativeQuery(select({ filters: [{ column: 'id) OR TRUE --', operator: 'eq', value: 'x' }] }))).toThrow();
    expect(() => compileNativeQuery(select({ columns: 'id,(SELECT password FROM auth.users)' }))).toThrow();
  });
  it('compiles nested OR/AND plus quoted IN values as parameters', () => {
    const compiled = compileNativeQuery(select({ filters: [{ expression: 'owner_id.in.("user-one","user,two"),and(owner_id.is.null,user_id.not.is.null)' }] }));
    expect(compiled.sql).toContain('t."owner_id" IN ($1, $2)');
    expect(compiled.sql).toContain('AND NOT (t."user_id" IS NULL)');
    expect(compiled.params.slice(0, 2)).toEqual(['user-one', 'user,two']);
    expect(splitQueryList('a.eq."x,y",and(b.eq.z,c.eq.q)')).toHaveLength(2);
  });
  it('rejects malformed/unsupported expressions and invalid paging bounds', () => {
    for (const expression of ['and(id.eq.x', 'id.eq.x)', 'id.unknown.x', 'id.eq.x,,id.eq.y', 'id.eq."unterminated']) expect(() => compileNativeQuery(select({ filters: [{ expression }] }))).toThrow();
    for (const limit of [-1, Infinity, 0.5, 10001]) expect(() => compileNativeQuery(select({ limit }))).toThrow();
  });
  it('uses explicit supported relationships and protects relation/column names', () => {
    const q = compileNativeQuery(select({ table: 'org_memberships', columns: 'org_id, role, organizations(name)' }));
    expect(q.sql).toContain('r."id" = t."org_id"');
    expect(q.sql).toContain('AS "organizations"');
    expect(() => compileNativeQuery(select({ table: 'org_memberships', columns: 'auth_users(encrypted_password)' }))).toThrow();
  });
  it('preserves JSON arrays and native SQL arrays using table column types', () => {
    const q = compileNativeQuery(select({ action: 'insert', values: { id: 'x', tags: ['a'], notes: ['b'] } }), { tags: '_text', notes: 'jsonb' });
    expect(q.params).toEqual(['x', ['a'], '["b"]']);
  });
  it('supports upsert conflict columns and heterogeneous row defaults without losing fields', () => {
    const q = compileNativeQuery(select({ action: 'upsert', values: [{ id: 'x', name: 'one' }, { id: 'y', status: 'new' }], onConflict: 'id' }));
    expect(q.sql).toContain('($1, $2, DEFAULT), ($3, DEFAULT, $4)');
    expect(q.sql).toContain('ON CONFLICT ("id") DO UPDATE SET');
    expect(() => compileNativeQuery(select({ action: 'upsert', values: { id: 'x' }, onConflict: 'id) DO NOTHING;--' }))).toThrow();
  });
  it('counts before pagination and implements empty IN safely', () => {
    const q = compileNativeQuery(select({ count: 'exact', limit: 3, offset: 5, filters: [{ column: 'id', operator: 'in', value: [] }] }));
    expect(q.countSql).toContain('WHERE FALSE');
    expect(q.countSql).not.toContain('LIMIT');
    expect(q.countParams).toEqual([]);
  });
  it('does not expose arbitrary RPC or SQL execution', () => {
    expect(() => compileNativeQuery(select({ action: 'rpc', table: 'exec_sql', rpcArgs: { sql: 'select 1' } }))).toThrow();
    expect(() => compileNativeQuery(select({ action: 'rpc', table: 'increment_outreach_count', rpcArgs: { injected: 'x' } }))).toThrow();
    expect(() => compileNativeQuery(select({ action: 'rpc', table: 'match_strategy_cases', rpcArgs: { query_embedding: [1] } }))).toThrow('1536');
  });
  it('refuses unauthenticated or server-only access before acquiring a database connection', async () => {
    expect((await executeNativeQuery(select())).status).toBe(401);
    expect((await executeNativeQuery(select({ table: 'integration_tokens' }), { userId: '00000000-0000-4000-8000-000000000001' })).status).toBe(403);
  });
});
