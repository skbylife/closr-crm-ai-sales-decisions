import { cookies } from 'next/headers';
import * as service from './service';
import { NativeAuthError } from './security';
export { assertSameOrigin } from './security';
export const NATIVE_SESSION_COOKIE = 'closr_native_session';
export async function readNativeToken(request?:Request):Promise<string|undefined>{
 if(request){const value=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(NATIVE_SESSION_COOKIE+'='))?.slice(NATIVE_SESSION_COOKIE.length+1);return value}
 return (await cookies()).get(NATIVE_SESSION_COOKIE)?.value;
}
export async function getNativeSession(request?:Request){return service.sessionFromToken(await readNativeToken(request))}
export async function getNativeUser(request?:Request){return (await getNativeSession(request))?.user??null}
export async function getNativeAuthUser(){return getNativeUser()}
function authError(error:unknown){if(error instanceof NativeAuthError)return {message:error.message,code:error.code,status:error.status};return {message:'Authentication operation failed',code:'auth_error',status:500}}
export async function requireNativeState(request?:Request){const state=await getNativeSession(request);if(!state)throw new NativeAuthError(401,'Authentication required');return state}
async function storeToken(token:string){const store=await cookies();store.set(NATIVE_SESSION_COOKIE,token,{httpOnly:true,sameSite:'lax',secure:process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://')??false,path:'/',maxAge:604800})}
async function result<T,F>(fn:()=>Promise<T>,fallback:F){try{return {data:await fn(),error:null}}catch(e){return {data:fallback,error:authError(e)}}}
/** Server-only auth adapter. Admin methods are never exposed through native HTTP auth. */
export function createNativeServerAuth(options:{admin?:boolean}|boolean={}) {
 const adminGuard=()=>{if(!(typeof options==='boolean'?options:options.admin))throw new NativeAuthError(403,'Server administrator context required')};
 const admin={
  getUserById:(id:string)=>result(async()=>{adminGuard();return {user:await service.adminGetUser(id)}},{user:null}),
  listUsers:(args:{page?:number;perPage?:number}={})=>result(async()=>{adminGuard();return {users:await service.adminListUsers(args.page,args.perPage)}},{users:[]}),
  createUser:(input:Record<string,unknown>)=>result(async()=>{adminGuard();return {user:await service.adminCreateUser(input)}},{user:null}),
  updateUserById:(id:string,input:Record<string,unknown>)=>result(async()=>{adminGuard();return {user:await service.adminUpdateUser(id,input)}},{user:null}),
 };
 return {
  admin,
  getUser:()=>result(async()=>({user:await getNativeUser()}),{user:null}),
  getSession:()=>result(async()=>({session:(await getNativeSession())?.session??null}),{session:null}),
  signInWithPassword:(input:{email:string;password:string;totpCode?:string})=>result(async()=>{const token=await service.signIn(input.email,input.password,input.totpCode);await storeToken(token);const state=await service.sessionFromToken(token);return {user:state!.user,session:state!.session}},{user:null,session:null}),
  signOut:()=>result(async()=>{await service.signOut(await getNativeSession());(await cookies()).delete(NATIVE_SESSION_COOKIE);return {}},{}),
  updateUser:(input:Record<string,unknown>)=>result(async()=>({user:await service.updateSelf(await requireNativeState(),input)}),{user:null}),
  setSession:()=>result(async()=>{const state=await requireNativeState();return {user:state.user,session:state.session}},{user:null,session:null}),
  exchangeCodeForSession:()=>Promise.resolve({data:{user:null,session:null},error:{message:'Native accounts use password login or operator-assisted recovery',code:'unsupported_oauth',status:400}}),
  resetPasswordForEmail:()=>Promise.resolve({data:{},error:null}),
  mfa:{
   listFactors:()=>result(async()=>service.listFactors(await requireNativeState()),{all:[],totp:[]}),
   enroll:(input:Record<string,unknown>)=>result(async()=>service.enrollFactor(await requireNativeState(),input),null),
   challenge:(input:{factorId:string})=>result(async()=>service.challengeFactor(await requireNativeState(),input.factorId),null),
   verify:(input:Record<string,unknown>)=>result(async()=>service.verifyFactor(await requireNativeState(),input),null),
   unenroll:(input:{factorId:string})=>result(async()=>service.unenrollFactor(await requireNativeState(),input.factorId),null),
  },
 };
}
