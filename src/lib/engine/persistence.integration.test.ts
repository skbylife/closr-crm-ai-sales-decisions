import { beforeAll, describe, expect, it } from 'vitest';
import { buildEngineJudgmentSnapshot, type EngineJudgmentSnapshot } from './schema';
import { persistEngineJudgmentSnapshot } from './persistence';
import { query } from '@/lib/postgres';
const testUrl=process.env.NATIVE_ENGINE_TEST_DATABASE_URL;
const suite=testUrl?describe:describe.skip;
function make(tenant:string,account:string,ids:string[],opportunityId?:string):EngineJudgmentSnapshot{return buildEngineJudgmentSnapshot({tenantId:tenant,accountId:account,opportunityId,sources:ids.map(id=>({id,tenantId:tenant,accountId:account,opportunityId,sourceType:'email',occurredAt:'2026-01-01T00:00:00Z',content:'Fictional example: CFO requests ROI evidence before budget approval.'}))})}
suite('Engine persistence isolation and atomicity in PostgreSQL',()=>{
 let original:EngineJudgmentSnapshot;
 beforeAll(()=>{const url=new URL(testUrl!);if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.endsWith('_test'))throw new Error('Explicit local *_test database required');process.env.DATABASE_URL=testUrl;process.env.PG_SSL='false';original=make('tenant-a','account-a',['shared-source']);});
 it('stores and idempotently updates objects within the same immutable scope',async()=>{
  const a=await persistEngineJudgmentSnapshot(original,{actorId:'user-a',actorType:'user'});const b=await persistEngineJudgmentSnapshot(original,{actorId:'user-a',actorType:'user'});expect(a.snapshotId).toBe(b.snapshotId);
  expect((await query<{count:string}>('SELECT count(*) FROM engine_source_records'))[0].count).toBe('1');
  expect((await query<{tenant_id:string;actor_id:string}>('SELECT tenant_id,actor_id FROM engine_audit_events'))[0]).toEqual({tenant_id:'tenant-a',actor_id:'user-a'});
 });
 it('rejects cross-tenant source collisions and rolls back earlier writes',async()=>{
  const before=await query('SELECT * FROM engine_source_records WHERE id=$1',['shared-source']);
  await expect(persistEngineJudgmentSnapshot(make('tenant-b','account-b',['new-source-before-conflict','shared-source']))).rejects.toMatchObject({name:'EnginePersistenceConflict'});
  expect(await query('SELECT * FROM engine_source_records WHERE id=$1',['shared-source'])).toEqual(before);
  expect(await query('SELECT id FROM engine_source_records WHERE id=$1',['new-source-before-conflict'])).toEqual([]);
 });
 it('also prevents moving an existing source to another account or opportunity inside one tenant',async()=>{
  await expect(persistEngineJudgmentSnapshot(make('tenant-a','account-b',['shared-source']))).rejects.toMatchObject({name:'EnginePersistenceConflict'});
  await expect(persistEngineJudgmentSnapshot(make('tenant-a','account-a',['shared-source'],'different-opportunity'))).rejects.toMatchObject({name:'EnginePersistenceConflict'});
 });
 it.each(['evidence','judgment','gap','move'])('rejects a foreign %s identifier and atomically rolls back the snapshot',async(kind)=>{
  const s=make('tenant-b','account-b',['source-for-'+kind]);
  if(kind==='evidence'){
   const old=s.evidenceRefs[0].id;s.evidenceRefs[0].id=original.evidenceRefs[0].id;
   for(const j of s.judgments){j.supportEvidenceIds=j.supportEvidenceIds.map(x=>x===old?s.evidenceRefs[0].id:x);j.counterEvidenceIds=j.counterEvidenceIds.map(x=>x===old?s.evidenceRefs[0].id:x)}
  }else if(kind==='judgment'){
   const old=s.judgments[0].id;s.judgments[0].id=original.judgments[0].id;for(const g of s.winGaps)g.linkedJudgmentIds=g.linkedJudgmentIds.map(x=>x===old?s.judgments[0].id:x);
  }else if(kind==='gap'){
   const old=s.winGaps[0].id;s.winGaps[0].id=original.winGaps[0].id;for(const m of s.moves)if(m.winGapId===old)m.winGapId=s.winGaps[0].id;
  }else{s.moves[0].id=original.moves[0].id}
  await expect(persistEngineJudgmentSnapshot(s)).rejects.toMatchObject({name:'EnginePersistenceConflict'});
  for(const table of ['engine_source_records','engine_evidence_refs','engine_judgments','engine_win_gaps','engine_moves','engine_audit_events'])expect(await query(`SELECT id FROM ${table} WHERE tenant_id=$1`,['tenant-b'])).toEqual([]);
 });
 it('rejects inconsistent object scopes and references before writing anything',async()=>{
  const s=make('tenant-b','account-b',['invalid-reference-source']);s.evidenceRefs[0].sourceRecordId='shared-source';
  await expect(persistEngineJudgmentSnapshot(s)).rejects.toMatchObject({name:'EngineSnapshotScopeError'});
  const t=make('tenant-b','account-b',['invalid-scope-source']);t.sources[0].tenantId='tenant-a';
  await expect(persistEngineJudgmentSnapshot(t)).rejects.toMatchObject({name:'EngineSnapshotScopeError'});
  expect(await query("SELECT id FROM engine_source_records WHERE tenant_id='tenant-b'")).toEqual([]);
 });
});
