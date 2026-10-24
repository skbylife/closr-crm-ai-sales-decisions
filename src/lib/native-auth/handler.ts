import { NextResponse } from 'next/server';
import { isNativeDatabase } from '@/lib/database-backend';
import { readBoundedBody } from '@/lib/native-storage/request';
import { StorageError } from '@/lib/native-storage/policy';
import * as service from './service';
import { getNativeSession, NATIVE_SESSION_COOKIE, requireNativeState } from './server';
import { assertSameOrigin, NativeAuthError, normalizeEmail } from './security';
export async function nativeAuthGet(request:Request){
 if(!isNativeDatabase())return NextResponse.json({error:{message:"Native backend is not enabled"}},{status:404});
 try{const state=await getNativeSession(request);return NextResponse.json({data:{user:state?.user??null,session:state?.session??null},error:null},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({data:{user:null,session:null},error:{message:'Authentication unavailable',code:'auth_unavailable'}},{status:503})}
}
export async function nativeAuthPost(request:Request,forcedAction?:string){
 if(!isNativeDatabase())return NextResponse.json({error:{message:"Native backend is not enabled"}},{status:404});
 try{
  assertSameOrigin(request);
  let raw:string;
  try { raw=new TextDecoder('utf-8',{fatal:true}).decode(await readBoundedBody(request,16384)); }
  catch(error) {
   if(error instanceof StorageError)throw new NativeAuthError(error.status,error.message);
   throw new NativeAuthError(400,'Invalid request body');
  }
  let input:Record<string,unknown>;try{input=JSON.parse(raw)}catch{throw new NativeAuthError(400,'Invalid JSON')}
  if(!input||typeof input!=='object'||Array.isArray(input))throw new NativeAuthError(400,'Invalid request');
  const action=forcedAction??input.action;let token:string|undefined;let clear=false;let data:unknown;
  switch(action){
   case 'setup':await service.checkAuthRateLimit('setup');token=await service.setupOwner(input);break;
   case 'register':await service.checkAuthRateLimit('register:'+normalizeEmail(input.email));token=await service.registerInvited(input);break;
   case 'signInWithPassword':token=await service.signIn(input.email,input.password,input.totpCode);break;
   case 'signOut':await service.signOut(await getNativeSession(request));clear=true;data={};break;
   case 'updateUser':data={user:await service.updateSelf(await requireNativeState(request),input.attributes as Record<string,unknown>??{})};break;
   case 'setSession':{const state=await requireNativeState(request);data={user:state.user,session:state.session};break;}
   case 'resetPasswordForEmail':await service.checkAuthRateLimit('recovery:'+normalizeEmail(input.email));data={message:'Contact your deployment administrator for a single-use recovery link. No email service is configured.'};break;
   case 'recover':await service.checkAuthRateLimit('recovery-consume:'+String(input.token??'').slice(0,64));await service.consumeRecovery(input.token,input.password);clear=true;data={};break;
   case 'mfa.listFactors':data=await service.listFactors(await requireNativeState(request));break;
   case 'mfa.enroll':data=await service.enrollFactor(await requireNativeState(request),input);break;
   case 'mfa.challenge':data=await service.challengeFactor(await requireNativeState(request),input.factorId);break;
   case 'mfa.verify':data=await service.verifyFactor(await requireNativeState(request),input);break;
   case 'mfa.unenroll':data=await service.unenrollFactor(await requireNativeState(request),input.factorId);break;
   default:throw new NativeAuthError(400,'Unsupported authentication action');
  }
  if(token){const state=await service.sessionFromToken(token);data={user:state!.user,session:state!.session}}
  const response=NextResponse.json({data,error:null},{headers:{'Cache-Control':'no-store'}});
  if(token||clear)response.cookies.set(NATIVE_SESSION_COOKIE,token??'',{httpOnly:true,sameSite:'lax',secure:(process.env.NEXT_PUBLIC_APP_URL??request.url).startsWith('https://'),path:'/',maxAge:clear?0:604800});
  return response;
 }catch(error){
  const expected=error instanceof NativeAuthError;const duplicate=(error as {code?:string})?.code==='23505';const status=expected?error.status:duplicate?409:500;
  return NextResponse.json({data:null,error:{message:expected?error.message:duplicate?'An account with this email already exists':'Authentication operation failed',code:expected?error.code:duplicate?'user_exists':'auth_error'}},{status,headers:{'Cache-Control':'no-store'}});
 }
}
