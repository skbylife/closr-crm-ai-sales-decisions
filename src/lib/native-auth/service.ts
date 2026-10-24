import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword, tokenHash, randomToken, generateTotpSecret, encryptSecret, decryptSecret, verifyTotp } from './crypto';
import { NativeAuthError, normalizeEmail, validatePassword } from './security';

let pool: Pool | undefined;
export function authPool(): Pool {
 if (!process.env.DATABASE_URL) throw new NativeAuthError(503,'DATABASE_URL is not configured');
 if (!pool) pool = new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PG_SSL==='false'?false:undefined,max:5});
 return pool;
}
export interface NativeUser {
 id:string; email:string; aud:string; role:string; user_metadata:Record<string,unknown>; app_metadata:Record<string,unknown>;
 created_at:string; updated_at:string; email_confirmed_at:string|null; factors?: Array<{id:string;factor_type:string;status:string;friendly_name:string}>;
}
interface UserRow { id:string;email:string;encrypted_password:string;raw_user_meta_data:Record<string,unknown>;raw_app_meta_data:Record<string,unknown>;created_at:Date;updated_at:Date;email_confirmed_at:Date|null;banned_until:Date|null }
export interface NativeSession { user:NativeUser;access_token:string;refresh_token:string;token_type:string;expires_in:number;expires_at:number;aal:'aal1'|'aal2' }
export interface SessionState { tokenHash:string;user:NativeUser;session:NativeSession;aal:number }
function publicUser(row:UserRow):NativeUser { return {id:row.id,email:row.email,aud:'authenticated',role:'authenticated',user_metadata:row.raw_user_meta_data??{},app_metadata:row.raw_app_meta_data??{},created_at:new Date(row.created_at).toISOString(),updated_at:new Date(row.updated_at).toISOString(),email_confirmed_at:row.email_confirmed_at?new Date(row.email_confirmed_at).toISOString():null}; }
async function transaction<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{const c=await authPool().connect();try{await c.query('BEGIN');const x=await fn(c);await c.query('COMMIT');return x}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
export async function checkAuthRateLimit(key:string):Promise<void>{
 const {rows}=await authPool().query(`INSERT INTO auth.native_rate_limits(key_hash) VALUES($1)
 ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN native_rate_limits.window_start < now()-interval '15 minutes' THEN 1 ELSE native_rate_limits.attempts+1 END,
 window_start=CASE WHEN native_rate_limits.window_start < now()-interval '15 minutes' THEN now() ELSE native_rate_limits.window_start END RETURNING attempts`,[tokenHash(key)]);
 if(rows[0].attempts>12)throw new NativeAuthError(429,'Too many attempts; try again later','rate_limited');
}
export async function sessionFromToken(token:string|undefined):Promise<SessionState|null>{
 if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
 const h=tokenHash(token);const {rows}=await authPool().query(`SELECT u.*,s.aal,s.expires_at FROM auth.native_sessions s JOIN auth.users u ON u.id=s.user_id
 WHERE s.token_hash=$1 AND s.expires_at>now() AND (u.banned_until IS NULL OR u.banned_until<now())
 AND (s.aal=2 OR NOT EXISTS(SELECT 1 FROM auth.native_mfa f WHERE f.user_id=u.id AND f.status='verified'))`,[h]);
 if(!rows[0])return null;const row=rows[0];const expires=Math.floor(new Date(row.expires_at).getTime()/1000);const user=publicUser(row);
 return {tokenHash:h,user,aal:row.aal,session:{user,access_token:'native-http-only-cookie',refresh_token:'native-http-only-cookie',token_type:'cookie',expires_at:expires,expires_in:Math.max(0,expires-Math.floor(Date.now()/1000)),aal:row.aal===2?'aal2':'aal1'}};
}
async function newSession(c:PoolClient,userId:string,aal:number):Promise<string>{const token=randomToken();await c.query('DELETE FROM auth.native_sessions WHERE expires_at<now()');await c.query(`INSERT INTO auth.native_sessions(token_hash,user_id,aal,expires_at) VALUES($1,$2,$3,now()+interval '7 days')`,[tokenHash(token),userId,aal]);return token}
export async function signIn(emailInput:unknown,password:unknown,code?:unknown):Promise<string>{
 const email=normalizeEmail(emailInput);await checkAuthRateLimit('login:'+email);
 if(typeof password!=='string'||password.length>256)throw new NativeAuthError(401,'Invalid email or password','invalid_credentials');
 const {rows}=await authPool().query('SELECT * FROM auth.users WHERE lower(email)=$1',[email]);const row=rows[0] as UserRow|undefined;
 // A fixed dummy hash keeps unknown users on the password hashing path.
 const dummy='scrypt$00000000000000000000000000000000$'+'0'.repeat(128);
 const valid=await verifyPassword(password,row?.encrypted_password??dummy);
 if(!row||!valid||(row.banned_until&&new Date(row.banned_until)>new Date()))throw new NativeAuthError(401,'Invalid email or password','invalid_credentials');
 return transaction(async c=>{
 const factors=await c.query(`SELECT * FROM auth.native_mfa WHERE user_id=$1 AND status='verified' FOR UPDATE`,[row.id]);let aal=1;
 if(factors.rows.length){
  if(typeof code!=='string')throw new NativeAuthError(401,'Enter your authenticator code','mfa_required');
  const factor=factors.rows[0];const counter=verifyTotp(await decryptSecret(factor.secret_ciphertext),code,factor.last_counter===null?null:Number(factor.last_counter));
  if(counter===null)throw new NativeAuthError(401,'Invalid authenticator code','mfa_invalid');
  await c.query('UPDATE auth.native_mfa SET last_counter=$1 WHERE id=$2',[counter,factor.id]);aal=2;
 }
 await c.query('UPDATE auth.users SET last_sign_in_at=now() WHERE id=$1',[row.id]);return newSession(c,row.id,aal);
 });
}
export async function signOut(state:SessionState|null):Promise<void>{if(state)await authPool().query('DELETE FROM auth.native_sessions WHERE token_hash=$1',[state.tokenHash])}
export async function setupRequired():Promise<boolean>{const r=await authPool().query('SELECT NOT EXISTS(SELECT 1 FROM auth.users) AS required');return r.rows[0].required}
export async function setupOwner(input:Record<string,unknown>):Promise<string>{
 const email=normalizeEmail(input.email);validatePassword(input.password);const encrypted=await hashPassword(input.password);
 const name=typeof input.organizationName==='string'?input.organizationName.trim():'';
 if(!name||name.length>160)throw new NativeAuthError(400,'Organization name is required (max 160 characters)');
 return transaction(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(675938204)');
  if((await c.query('SELECT 1 FROM auth.users LIMIT 1')).rowCount)throw new NativeAuthError(409,'Initial setup is already complete','setup_complete');
  const user=await c.query(`INSERT INTO auth.users(email,encrypted_password,email_confirmed_at,raw_user_meta_data) VALUES($1,$2,now(),$3) RETURNING id`,[email,encrypted,JSON.stringify({display_name:String(input.displayName??'Owner').slice(0,120)})]);
  const org=await c.query('INSERT INTO public.organizations(name) VALUES($1) RETURNING id',[name]);
  await c.query(`INSERT INTO public.org_memberships(user_id,org_id,role,display_name,job_level) VALUES($1,$2,'owner',$3,4)`,[user.rows[0].id,org.rows[0].id,String(input.displayName??'Owner').slice(0,120)]);
  return newSession(c,user.rows[0].id,1);
 });
}
export async function updateSelf(state:SessionState,input:Record<string,unknown>):Promise<NativeUser>{
 if(input.email!==undefined)throw new NativeAuthError(400,'Email changes require administrator verification');
 if(input.password!==undefined){validatePassword(input.password);const password=await hashPassword(input.password);await transaction(async c=>{await c.query('UPDATE auth.users SET encrypted_password=$1,updated_at=now() WHERE id=$2',[password,state.user.id]);await c.query('DELETE FROM auth.native_sessions WHERE user_id=$1 AND token_hash<>$2',[state.user.id,state.tokenHash])})}
 if(input.data!==undefined){if(!input.data||typeof input.data!=='object'||Array.isArray(input.data)||JSON.stringify(input.data).length>8192)throw new NativeAuthError(400,'Invalid user metadata');await authPool().query('UPDATE auth.users SET raw_user_meta_data=raw_user_meta_data||$1::jsonb,updated_at=now() WHERE id=$2',[JSON.stringify(input.data),state.user.id])}
 return (await adminGetUser(state.user.id))!;
}
export async function adminGetUser(id:string):Promise<NativeUser|null>{
 const r=await authPool().query('SELECT * FROM auth.users WHERE id=$1',[id]);if(!r.rows[0])return null;const user=publicUser(r.rows[0]);const f=await authPool().query('SELECT id,status,friendly_name FROM auth.native_mfa WHERE user_id=$1',[id]);user.factors=f.rows.map(x=>({...x,factor_type:'totp'}));return user;
}
export async function adminListUsers(page=1,perPage=50):Promise<NativeUser[]>{const r=await authPool().query('SELECT * FROM auth.users ORDER BY created_at,id LIMIT $1 OFFSET $2',[Math.min(Math.max(perPage,1),100),(Math.max(page,1)-1)*Math.min(Math.max(perPage,1),100)]);return r.rows.map(publicUser)}
export async function adminCreateUser(input:Record<string,unknown>):Promise<NativeUser>{const email=normalizeEmail(input.email);validatePassword(input.password);const r=await authPool().query(`INSERT INTO auth.users(email,encrypted_password,email_confirmed_at,raw_user_meta_data) VALUES($1,$2,CASE WHEN $3 THEN now() ELSE NULL END,$4) RETURNING *`,[email,await hashPassword(input.password),input.email_confirm===true,JSON.stringify(input.user_metadata??{})]);return publicUser(r.rows[0])}
export async function adminUpdateUser(id:string,input:Record<string,unknown>):Promise<NativeUser>{
 if(input.password!==undefined){validatePassword(input.password);await transaction(async c=>{await c.query('UPDATE auth.users SET encrypted_password=$1,updated_at=now() WHERE id=$2',[await hashPassword(input.password as string),id]);await c.query('DELETE FROM auth.native_sessions WHERE user_id=$1',[id])})}
 if(input.user_metadata!==undefined)await authPool().query('UPDATE auth.users SET raw_user_meta_data=raw_user_meta_data||$1::jsonb WHERE id=$2',[JSON.stringify(input.user_metadata),id]);
 if(input.email_confirm===true)await authPool().query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1',[id]);
 const user=await adminGetUser(id);if(!user)throw new NativeAuthError(404,'User not found');return user;
}
export async function listFactors(state:SessionState){const r=await authPool().query('SELECT id,status,friendly_name,created_at FROM auth.native_mfa WHERE user_id=$1',[state.user.id]);const factors=r.rows.map(x=>({...x,factor_type:'totp'}));return {all:factors,totp:factors}}
export async function enrollFactor(state:SessionState,input:Record<string,unknown>){
 if(input.factorType!=='totp')throw new NativeAuthError(400,'Only TOTP factors are supported');
 const secret=generateTotpSecret();const name=String(input.friendlyName??'Closr').slice(0,120);const cipher=await encryptSecret(secret);
 const id=await transaction(async c=>{
  await c.query('SELECT id FROM auth.users WHERE id=$1 FOR UPDATE',[state.user.id]);
  if((await c.query(`SELECT 1 FROM auth.native_mfa WHERE user_id=$1 AND status='verified'`,[state.user.id])).rowCount)throw new NativeAuthError(409,'An authenticator is already enrolled');
  await c.query(`DELETE FROM auth.native_mfa WHERE user_id=$1 AND status='unverified'`,[state.user.id]);
  return (await c.query('INSERT INTO auth.native_mfa(user_id,secret_ciphertext,friendly_name) VALUES($1,$2,$3) RETURNING id',[state.user.id,cipher,name])).rows[0].id;
 });
 const uri=`otpauth://totp/${encodeURIComponent('Closr:'+state.user.email)}?secret=${secret}&issuer=Closr&algorithm=SHA1&digits=6&period=30`;
 // Existing UI supports manual key entry; avoid third-party QR services leaking the secret.
 return {id,type:'totp',totp:{secret,uri,qr_code:''},friendly_name:name};
}
export async function challengeFactor(state:SessionState,factorId:unknown){if(typeof factorId!=='string')throw new NativeAuthError(400,'Factor is required');const r=await authPool().query(`INSERT INTO auth.native_challenges(factor_id,session_hash) SELECT id,$1 FROM auth.native_mfa WHERE id=$2 AND user_id=$3 RETURNING id,expires_at`,[state.tokenHash,factorId,state.user.id]);if(!r.rows[0])throw new NativeAuthError(404,'Factor not found');return r.rows[0]}
export async function verifyFactor(state:SessionState,input:Record<string,unknown>){
 await checkAuthRateLimit('mfa:'+state.user.id);
 // Reserve/consume failed attempts outside the verification transaction so rollback cannot erase them.
 const attempt=await authPool().query(`UPDATE auth.native_challenges c SET attempts=attempts+1 FROM auth.native_mfa f WHERE c.id=$1 AND c.factor_id=f.id AND c.factor_id=$2 AND c.session_hash=$3 AND f.user_id=$4 AND c.consumed_at IS NULL AND c.expires_at>now() AND c.attempts<5 RETURNING c.id`,[input.challengeId,input.factorId,state.tokenHash,state.user.id]);
 if(!attempt.rows[0])throw new NativeAuthError(400,'Challenge is invalid or expired');
 await transaction(async c=>{
 const r=await c.query(`SELECT f.* FROM auth.native_mfa f JOIN auth.native_challenges ch ON ch.factor_id=f.id WHERE ch.id=$1 AND ch.session_hash=$2 AND ch.consumed_at IS NULL AND ch.expires_at>now() FOR UPDATE OF f,ch`,[input.challengeId,state.tokenHash]);
 if(!r.rows[0])throw new NativeAuthError(400,'Challenge is invalid or expired');const f=r.rows[0];const counter=verifyTotp(await decryptSecret(f.secret_ciphertext),String(input.code??''),f.last_counter===null?null:Number(f.last_counter));
 if(counter===null)throw new NativeAuthError(400,'Invalid authenticator code');
 await c.query(`UPDATE auth.native_mfa SET status='verified',last_counter=$1 WHERE id=$2`,[counter,f.id]);await c.query('UPDATE auth.native_challenges SET consumed_at=now() WHERE id=$1',[input.challengeId]);
 await c.query('DELETE FROM auth.native_sessions WHERE user_id=$1 AND token_hash<>$2',[state.user.id,state.tokenHash]);await c.query('UPDATE auth.native_sessions SET aal=2 WHERE token_hash=$1',[state.tokenHash]);
 });return {success:true};
}
export async function unenrollFactor(state:SessionState,factorId:unknown){const r=await authPool().query('SELECT status FROM auth.native_mfa WHERE id=$1 AND user_id=$2',[factorId,state.user.id]);if(!r.rows[0])throw new NativeAuthError(404,'Factor not found');if(r.rows[0].status==='verified'&&state.aal!==2)throw new NativeAuthError(403,'Authenticator verification required');await authPool().query('DELETE FROM auth.native_mfa WHERE id=$1 AND user_id=$2',[factorId,state.user.id]);return {id:factorId}}
export async function consumeRecovery(token:unknown,password:unknown):Promise<void>{
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new NativeAuthError(400,'Invalid recovery token');validatePassword(password);const hashed=await hashPassword(password);
 await transaction(async c=>{const r=await c.query('SELECT * FROM auth.native_recovery WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE',[tokenHash(token)]);if(!r.rows[0])throw new NativeAuthError(400,'Invalid or expired recovery token');const user=r.rows[0].user_id;
 await c.query('UPDATE auth.users SET encrypted_password=$1,updated_at=now() WHERE id=$2',[hashed,user]);await c.query('UPDATE auth.native_recovery SET consumed_at=now() WHERE user_id=$1',[user]);await c.query('DELETE FROM auth.native_sessions WHERE user_id=$1',[user]);
 // Recovery revokes the browser's session, so record its completion here using
 // the token's verified account, not an unauthenticated follow-up client event.
 await c.query(`INSERT INTO public.audit_log(org_id,user_id,action,object_type,record_id,changes)
   SELECT org_id,$1::uuid,'password_reset_completed','auth_session',$1::text,'{"source":"native_recovery"}'::jsonb
   FROM public.org_memberships WHERE user_id=$1::uuid`,[user]);});
}
export async function registerInvited(input:Record<string,unknown>):Promise<string>{
 const email=normalizeEmail(input.email);validatePassword(input.password);const hashed=await hashPassword(input.password);
 if(typeof input.invitationToken!=='string'||input.invitationToken.length>256)throw new NativeAuthError(400,'An invitation is required');
 return transaction(async c=>{const r=await c.query(`SELECT * FROM public.org_invitations WHERE token=$1 AND lower(email)=$2 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE`,[input.invitationToken,email]);if(!r.rows[0])throw new NativeAuthError(403,'Invalid or expired invitation');const invite=r.rows[0];const id=randomUUID();await c.query(`INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at) VALUES($1,$2,$3,now())`,[id,email,hashed]);await c.query('INSERT INTO public.org_memberships(user_id,org_id,role) VALUES($1,$2,$3)',[id,invite.org_id,invite.role]);await c.query('UPDATE public.org_invitations SET accepted_at=now() WHERE id=$1',[invite.id]);return newSession(c,id,1);});
}

/** Accept an invitation as the existing authenticated account, never as an arbitrary token holder. */
export async function acceptExistingInvitation(user:{id:string;email?:string},token:unknown):Promise<{orgId:string;role:string}>{
 if(typeof token!=='string'||token.length<1||token.length>256)throw new NativeAuthError(400,'Invitation token is required');
 return transaction(async c=>{
  const account=await c.query('SELECT email FROM auth.users WHERE id=$1',[user.id]);
  if(!account.rows[0])throw new NativeAuthError(401,'Authentication required');
  const r=await c.query(`SELECT * FROM public.org_invitations WHERE token=$1 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE`,[token]);
  const invitation=r.rows[0];
  if(!invitation||String(invitation.email).toLowerCase()!==String(account.rows[0].email).toLowerCase())throw new NativeAuthError(403,'Invalid invitation or account email does not match');
  await c.query(`INSERT INTO public.org_memberships(user_id,org_id,role) VALUES($1,$2,$3) ON CONFLICT(user_id,org_id) DO NOTHING`,[user.id,invitation.org_id,invitation.role]);
  await c.query('UPDATE public.org_invitations SET accepted_at=now() WHERE id=$1',[invitation.id]);
  const membership=await c.query('SELECT role FROM public.org_memberships WHERE user_id=$1 AND org_id=$2',[user.id,invitation.org_id]);
  return {orgId:invitation.org_id,role:membership.rows[0].role};
 });
}
