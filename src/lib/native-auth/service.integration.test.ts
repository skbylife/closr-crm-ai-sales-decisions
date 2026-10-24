import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as auth from './service';
import { nativeAuthGet, nativeAuthPost } from './handler';
import { randomToken, tokenHash, totpCode } from './crypto';
const testUrl=process.env.NATIVE_AUTH_TEST_DATABASE_URL;
const suite=testUrl?describe:describe.skip;
suite('native authentication against isolated PostgreSQL',()=>{
 let dir:string;let ownerToken:string;let owner:auth.SessionState;
 const password='EXAMPLE_ONLY_Strong_Password_123';
 beforeAll(async()=>{
  const url=new URL(testUrl!);if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.endsWith('_test'))throw new Error('Integration test requires an explicit local *_test database');
  process.env.DATABASE_URL=testUrl;process.env.PG_SSL='false';process.env.CLOSR_DATABASE_BACKEND='postgres';process.env.NEXT_PUBLIC_APP_URL='http://127.0.0.1:3000';dir=await mkdtemp(join(tmpdir(),'closr-auth-test-'));process.env.CLOSR_DATA_DIR=dir;
 });
 afterAll(async()=>{await auth.authPool().end();if(dir)await rm(dir,{recursive:true,force:true})});
 it('atomically creates only one initial owner, without shared credentials',async()=>{
  expect(await auth.setupRequired()).toBe(true);
  const args={email:'owner@example.invalid',password,organizationName:'Fictional Test Organization',displayName:'Example Owner'};
  const results=await Promise.allSettled([auth.setupOwner(args),auth.setupOwner(args)]);
  expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  ownerToken=(results.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<string>).value;
  owner=(await auth.sessionFromToken(ownerToken))!;expect(owner.user.email).toBe(args.email);expect(await auth.setupRequired()).toBe(false);
  expect((await auth.authPool().query('SELECT role FROM public.org_memberships WHERE user_id=$1',[owner.user.id])).rows[0].role).toBe('owner');
  const stored=(await auth.authPool().query('SELECT token_hash FROM auth.native_sessions')).rows[0].token_hash;expect(stored).not.toBe(ownerToken);
 });
 it('rejects invalid login, expired sessions and browser-role reads of auth tables',async()=>{
  await expect(auth.signIn('owner@example.invalid','wrong-password')).rejects.toMatchObject({status:401});
  await expect(auth.signIn('unknown@example.invalid',password)).rejects.toMatchObject({status:401});
  const expired=randomToken();await auth.authPool().query("INSERT INTO auth.native_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()-interval '1 second')",[tokenHash(expired),owner.user.id]);expect(await auth.sessionFromToken(expired)).toBeNull();
  const c=await auth.authPool().connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE closr_app');await expect(c.query('SELECT * FROM auth.users')).rejects.toMatchObject({code:'42501'})}finally{await c.query('ROLLBACK');c.release()}
 });
 it('enrolls TOTP, revokes weaker sessions, enforces codes and rejects replay',async()=>{
  const second=await auth.signIn(owner.user.email,password);expect(await auth.sessionFromToken(second)).not.toBeNull();
  const factor=await auth.enrollFactor(owner,{factorType:'totp',friendlyName:'Test authenticator'});const challenge=await auth.challengeFactor(owner,factor.id);
  await expect(auth.verifyFactor(owner,{factorId:factor.id,challengeId:challenge.id,code:'wrong'})).rejects.toMatchObject({status:400});
  expect((await auth.authPool().query('SELECT attempts FROM auth.native_challenges WHERE id=$1',[challenge.id])).rows[0].attempts).toBe(1);
  const now=Math.floor(Date.now()/30_000);await auth.verifyFactor(owner,{factorId:factor.id,challengeId:challenge.id,code:totpCode(factor.totp.secret,now)});
  expect(await auth.sessionFromToken(second)).toBeNull();owner=(await auth.sessionFromToken(ownerToken))!;expect(owner.aal).toBe(2);
  await expect(auth.signIn(owner.user.email,password)).rejects.toMatchObject({code:'mfa_required'});
  await expect(auth.signIn(owner.user.email,password,totpCode(factor.totp.secret,now))).rejects.toMatchObject({code:'mfa_invalid'});
  const verified=await auth.signIn(owner.user.email,password,totpCode(factor.totp.secret,now+1));expect((await auth.sessionFromToken(verified))?.aal).toBe(2);
  await expect(auth.verifyFactor(owner,{factorId:factor.id,challengeId:challenge.id,code:totpCode(factor.totp.secret,now+1)})).rejects.toMatchObject({status:400});
  const stored=(await auth.authPool().query('SELECT secret_ciphertext FROM auth.native_mfa WHERE id=$1',[factor.id])).rows[0].secret_ciphertext;expect(stored).not.toContain(factor.totp.secret);
  await auth.unenrollFactor(owner,factor.id);expect((await auth.listFactors(owner)).all).toHaveLength(0);
 });
 it('recovers using a single-use hashed token, invalidating all prior sessions',async()=>{
  const token=randomToken();await auth.authPool().query("INSERT INTO auth.native_recovery(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '15 minutes')",[tokenHash(token),owner.user.id]);
  await auth.consumeRecovery(token,'EXAMPLE_ONLY_New_Password_456');expect(await auth.sessionFromToken(ownerToken)).toBeNull();
  const audit=await auth.authPool().query("SELECT changes FROM public.audit_log WHERE user_id=$1 AND action='password_reset_completed'",[owner.user.id]);
  expect(audit.rows).toEqual([{changes:{source:'native_recovery'}}]);
  await expect(auth.consumeRecovery(token,password)).rejects.toMatchObject({status:400});
  const session=await auth.signIn(owner.user.email,'EXAMPLE_ONLY_New_Password_456');const state=await auth.sessionFromToken(session);expect(state?.user.id).toBe(owner.user.id);await auth.signOut(state);expect(await auth.sessionFromToken(session)).toBeNull();
 });
 it('rejects invitation theft and consumes existing-account invitations once without downgrading an owner',async()=>{
  const org=(await auth.authPool().query('SELECT id FROM public.organizations LIMIT 1')).rows[0].id;
  const stolen=randomUUID();await auth.authPool().query("INSERT INTO public.org_invitations(org_id,email,role,token,expires_at) VALUES($1,'somebody-else@example.invalid','admin',$2,now()+interval '1 day')",[org,stolen]);
  await expect(auth.acceptExistingInvitation(owner.user,stolen)).rejects.toMatchObject({status:403});
  const own=randomUUID();await auth.authPool().query("INSERT INTO public.org_invitations(org_id,email,role,token,expires_at) VALUES($1,'owner@example.invalid','member',$2,now()+interval '1 day')",[org,own]);
  expect(await auth.acceptExistingInvitation(owner.user,own)).toEqual({orgId:org,role:'owner'});
  await expect(auth.acceptExistingInvitation(owner.user,own)).rejects.toMatchObject({status:403});
 });
 it('consumes only an unexpired matching invitation and attaches the correct organization',async()=>{
  const org=(await auth.authPool().query('SELECT id FROM public.organizations LIMIT 1')).rows[0].id;const token=randomUUID();
  await auth.authPool().query("INSERT INTO public.org_invitations(org_id,email,role,token,expires_at) VALUES($1,'invited@example.invalid','member',$2,now()+interval '1 day')",[org,token]);
  await expect(auth.registerInvited({email:'other@example.invalid',password,invitationToken:token})).rejects.toMatchObject({status:403});
  const session=await auth.registerInvited({email:'invited@example.invalid',password,invitationToken:token});const state=await auth.sessionFromToken(session);
  expect((await auth.authPool().query('SELECT org_id,role FROM public.org_memberships WHERE user_id=$1',[state!.user.id])).rows[0]).toEqual({org_id:org,role:'member'});
  await expect(auth.registerInvited({email:'invited@example.invalid',password,invitationToken:token})).rejects.toMatchObject({status:403});
 });
 it('enforces HTTP origin checks and HttpOnly cookie sessions without exposing tokens or admin operations',async()=>{
  const origin='http://127.0.0.1:3000';
  const req=(body:Record<string,unknown>,cookie?:string,source=origin)=>new Request(origin+'/api/native/auth',{method:'POST',headers:{'Content-Type':'application/json',Origin:source,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  const login={action:'signInWithPassword',email:'invited@example.invalid',password};
  expect((await nativeAuthPost(req(login,undefined,'https://evil.example.invalid'))).status).toBe(403);
  expect((await nativeAuthPost(req({action:'setSession',access_token:randomToken(),refresh_token:randomToken()}))).status).toBe(401);
  const response=await nativeAuthPost(req(login));expect(response.status).toBe(200);
  const setCookie=response.headers.get('set-cookie')!;expect(setCookie).toContain('HttpOnly');expect(setCookie).toContain('SameSite=lax');
  const cookie=setCookie.split(';')[0];const token=cookie.split('=')[1];const body=await response.text();expect(body).not.toContain(token);expect(body).not.toContain(tokenHash(token));
  const session=await nativeAuthGet(new Request(origin+'/api/native/auth',{headers:{Cookie:cookie}}));expect((await session.json()).data.user.email).toBe('invited@example.invalid');
  expect((await nativeAuthPost(req({action:'admin.createUser',email:'attacker@example.invalid',password},cookie))).status).toBe(400);
  const logout=await nativeAuthPost(req({action:'signOut'},cookie));expect(logout.status).toBe(200);expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');expect(await auth.sessionFromToken(token)).toBeNull();
  process.env.CLOSR_DATABASE_BACKEND='supabase';expect((await nativeAuthGet(new Request(origin+'/api/native/auth'))).status).toBe(404);process.env.CLOSR_DATABASE_BACKEND='postgres';
 });

});
