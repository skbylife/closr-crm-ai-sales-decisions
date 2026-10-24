#!/usr/bin/env node
// Transaction-only regression against an already migrated, isolated test database.
import assert from 'node:assert/strict';
import pg from 'pg';
const url=process.env.CLOSR_SCHEMA_TEST_DATABASE_URL;
if(!url) throw new Error('CLOSR_SCHEMA_TEST_DATABASE_URL must explicitly select an isolated test database');
const client=new pg.Client({connectionString:url,ssl:process.env.PG_SSL==='false'?false:{rejectUnauthorized:true}});
const A='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const ownerA='11111111-1111-4111-8111-111111111111',memberA='22222222-2222-4222-8222-222222222222',ownerB='33333333-3333-4333-8333-333333333333';
let count=0;
async function as(user,fn){await client.query('RESET ROLE');await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[user]);await client.query('SET LOCAL ROLE closr_app');return fn();}
async function denied(sql,params=[],expectedCode='42501'){await client.query('SAVEPOINT expected_denial');let rejected=false;try{await client.query(sql,params);}catch(e){assert.equal(e.code,expectedCode);rejected=true;await client.query('ROLLBACK TO SAVEPOINT expected_denial');}assert.ok(rejected,'Operation must be denied');await client.query('RELEASE SAVEPOINT expected_denial');count++;}
try{
 await client.connect();await client.query('BEGIN');
 await client.query('INSERT INTO auth.users(id,email,encrypted_password) VALUES($1,$2,$3),($4,$5,$3),($6,$7,$3)',[ownerA,'owner-a@example.invalid','EXAMPLE_TEST_HASH_NOT_A_PASSWORD',memberA,'member-a@example.invalid',ownerB,'owner-b@example.invalid']);
 await client.query('INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)',[A,'Fictional organization A',B,'Fictional organization B']);
 await client.query("INSERT INTO org_memberships(user_id,org_id,role,job_level) VALUES($1,$2,'owner',2),($3,$2,'member',0),($4,$5,'owner',2)",[ownerA,A,memberA,ownerB,B]);
 await client.query('INSERT INTO accounts(id,org_id,user_id,owner_id,name) VALUES($1,$2,$3,$3,$4),($5,$2,$6,$6,$7),($8,$9,$10,$10,$11)',['schema-own',A,memberA,'Fictional own account','schema-team',ownerA,'Fictional team account','schema-other',B,ownerB,'Fictional other tenant']);
 await client.query("INSERT INTO contacts(id,org_id,user_id,account_id,name) VALUES('schema-contact-a',$1,$2,'schema-own','Fictional A'),('schema-contact-private',$1,$3,'schema-team','Fictional private'),('schema-contact-b',$4,$5,'schema-other','Fictional B')",[A,memberA,ownerA,B,ownerB]);
 await client.query("INSERT INTO opportunities(id,org_id,user_id,account_id,name) VALUES('schema-opportunity-a',$1,$2,'schema-own','Fictional opportunity')",[A,memberA]);
 await client.query("INSERT INTO org_invitations(org_id,email,role,token,expires_at) VALUES($1,'invite@example.invalid','admin','EXAMPLE_INVITATION_TOKEN_NOT_REAL',now()+interval '1 day')",[A]);
 await client.query("INSERT INTO tasks(id,org_id,user_id,account_id,assigned_to,title) VALUES('schema-assigned',$1,$2,'schema-team',$3,'Fictional assigned task')",[A,ownerA,memberA]);
 await client.query("INSERT INTO quotes(id,org_id,account_id) VALUES('44444444-4444-4444-8444-444444444444',$1,'schema-own')",[A]);
 await client.query("INSERT INTO products(id,org_id,name) VALUES('55555555-5555-4555-8555-555555555555',$1,'Fictional foreign product')",[B]);
 await client.query("INSERT INTO contact_profiles_v2(id,user_id,name) VALUES('66666666-6666-4666-8666-666666666666',$1,'Fictional private profile')",[ownerB]);
 await as(memberA,async()=>{
  assert.deepEqual((await client.query('SELECT id FROM accounts ORDER BY id')).rows.map(r=>r.id),['schema-own']);count++;
  assert.equal((await client.query('SELECT * FROM org_invitations')).rowCount,0);count++;
  await denied("UPDATE org_memberships SET role='owner' WHERE user_id=$1",[memberA]);
  assert.equal((await client.query("UPDATE accounts SET name='forbidden' WHERE id='schema-other' RETURNING id")).rowCount,0);count++;
  await denied("INSERT INTO contacts(id,org_id,user_id,account_id,name) VALUES('schema-cross',$1,$2,'schema-other','Fictional cross-tenant')",[A,memberA],'23503');
  await denied("INSERT INTO contacts(id,org_id,user_id,account_id,name) VALUES('schema-null',NULL,$1,'schema-other','Fictional null-org bypass')",[memberA],'23503');
  await denied("INSERT INTO contact_opportunity_roles(org_id,contact_id,opportunity_id) VALUES($1,'schema-contact-b','schema-opportunity-a')",[A],'23503');
  await denied("INSERT INTO contact_opportunity_roles(org_id,contact_id,opportunity_id) VALUES($1,'schema-contact-private','schema-opportunity-a')",[A]);
  await client.query("INSERT INTO contact_opportunity_roles(org_id,contact_id,opportunity_id) VALUES($1,'schema-contact-a','schema-opportunity-a')",[A]);count++;
  await denied("UPDATE contact_opportunity_roles SET contact_id='schema-contact-b' WHERE contact_id='schema-contact-a'",[],'23503');
  assert.equal((await client.query("SELECT id FROM tasks WHERE id='schema-assigned'")).rowCount,1);count++;
  assert.equal((await client.query("UPDATE tasks SET status='done' WHERE id='schema-assigned' RETURNING id")).rowCount,1);count++;
  await denied("UPDATE tasks SET user_id=$1 WHERE id='schema-assigned'",[memberA]);
  await denied('SELECT * FROM integration_sync_state');
  await denied('SELECT * FROM engine_source_records');
  await denied("INSERT INTO quote_items(quote_id,product_id,name) VALUES('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','Fictional forbidden link')",[],'23503');
  await denied("INSERT INTO outreach_logs(profile_id,user_id) VALUES('66666666-6666-4666-8666-666666666666',$1)",[memberA],'23503');
  await denied("DELETE FROM integration_audit_logs");
  await client.query('INSERT INTO user_settings(id,user_id,locale) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET locale=excluded.locale',[memberA,memberA,'en']);count++;
  await denied('INSERT INTO user_settings(id,user_id,locale) VALUES($1,$2,$3)',[ownerB,ownerB,'en']);
 });
 await as(ownerA,async()=>{
  assert.deepEqual((await client.query('SELECT id FROM accounts ORDER BY id')).rows.map(r=>r.id),['schema-own','schema-team']);count++;
  assert.equal((await client.query('SELECT * FROM org_invitations')).rowCount,1);count++;
  await denied("UPDATE accounts SET owner_id=$1 WHERE id='schema-own'",[ownerB]);
  await denied("INSERT INTO tasks(id,org_id,user_id,account_id,assigned_to,title) VALUES('schema-foreign-task',$1,$2,'schema-other',$2,'Fictional cross tenant task')",[A,ownerA],'23503');
 });
 await client.query('RESET ROLE');
 // The same owner belongs to two organizations: neither browser nor service
 // may move a parent record while leaving an existing junction in the old tenant.
 await client.query("INSERT INTO org_memberships(user_id,org_id,role,job_level) VALUES($1,$2,'owner',2)",[ownerA,B]);
 await client.query("INSERT INTO contacts(id,org_id,user_id,name) VALUES('schema-orphan-parent',$1,$2,'Fictional linked parent')",[A,ownerA]);
 await client.query("INSERT INTO contact_opportunity_roles(org_id,contact_id,opportunity_id) VALUES($1,'schema-orphan-parent','schema-opportunity-a')",[A]);
 await as(ownerA,async()=>{
  await denied("UPDATE contacts SET org_id=$1 WHERE id='schema-orphan-parent'",[B]);
  await denied("UPDATE accounts SET user_id=$1 WHERE id='schema-own'",[ownerA]);
  await denied("UPDATE accounts SET owner_id=$1 WHERE id='schema-own'",[ownerA]);
  await denied("INSERT INTO org_invitations(org_id,email,role,token,expires_at) VALUES($1,'blocked@example.invalid','admin','EXAMPLE_BLOCKED_TOKEN',now()+interval '1 day')",[A]);
  await denied("UPDATE org_invitations SET role='admin' WHERE org_id=$1",[A]);
 });
 await client.query('RESET ROLE');
 await denied("UPDATE contacts SET org_id=$1 WHERE id='schema-orphan-parent'",[B]);
 await client.query("UPDATE accounts SET owner_id=$1,user_id=$1 WHERE id='schema-own'",[ownerA]);count++;
 await client.query("UPDATE contacts SET user_id=$1 WHERE id='schema-contact-a'",[ownerA]);count++;
 await denied("UPDATE accounts SET owner_id=$1,user_id=$1 WHERE id='schema-own'",[ownerB],'23503');
 await client.query("INSERT INTO engine_source_records(id,tenant_id,source_type,occurred_at,content_hash) VALUES('schema-engine-a',$1,'crm_note',now(),'EXAMPLE_HASH')",[A]);
 await client.query('SAVEPOINT engine_parent_check');
 try {
  await client.query("INSERT INTO engine_evidence_refs(id,tenant_id,source_record_id,evidence_type,quote,summary) VALUES('schema-engine-cross',$1,'schema-engine-a','support','Fictional quote','Fictional summary')",[B]);
  assert.fail('Cross-tenant engine parent must fail');
 } catch(error) { assert.equal(error.code,'23503'); await client.query('ROLLBACK TO SAVEPOINT engine_parent_check'); count++; }
 await client.query('RELEASE SAVEPOINT engine_parent_check');
 await client.query("INSERT INTO accounts(id,org_id,user_id,name) VALUES('schema-delete-parent',$1,$2,'Fictional deleted parent')",[A,ownerA]);
 await client.query("INSERT INTO pallas_artifacts(org_id,user_id,kind,title,entity_type,account_id) VALUES($1,$2,'evidence_pack','Fictional retained artifact','account','schema-delete-parent')",[A,ownerA]);
 await client.query("DELETE FROM accounts WHERE id='schema-delete-parent'");
 assert.equal((await client.query("SELECT org_id,account_id FROM pallas_artifacts WHERE title='Fictional retained artifact'")).rows[0].org_id,A);count++;
 assert.equal((await client.query("SELECT account_id FROM pallas_artifacts WHERE title='Fictional retained artifact'")).rows[0].account_id,null);count++;
 await client.query('RESET ROLE');await client.query("SELECT set_config('request.jwt.claim.sub','',true)");await client.query('SET LOCAL ROLE closr_app');
 assert.equal((await client.query('SELECT * FROM accounts')).rowCount,0);count++;
 console.log(`Native schema authorization checks passed: ${count}; all fixture writes rolled back.`);
}finally{await client.query('ROLLBACK').catch(()=>{});await client.end();}
