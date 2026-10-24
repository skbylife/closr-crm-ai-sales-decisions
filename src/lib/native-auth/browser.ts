'use client';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
// Compatibility types only: no Supabase runtime/service is used by this adapter.
type Listener=(event:AuthChangeEvent,session:Session|null)=>void;
const listeners=new Set<Listener>();
let channel:BroadcastChannel|undefined;
let listening=false;
function emit(event:AuthChangeEvent,session:Session|null,broadcast=true){for(const listener of listeners)listener(event,session);if(broadcast)channel?.postMessage({event})}
async function request(action:string,input:Record<string,unknown>={}){
 try{
  const response=await fetch('/api/native/auth',{method:action==='getSession'?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:action==='getSession'?{}:{'Content-Type':'application/json'},...(action==='getSession'?{}:{body:JSON.stringify({...input,action})})});
  const result=await response.json();return result;
 }catch{return {data:null,error:{message:'Authentication service unavailable',code:'network_error'}}}
}
function init(){if(listening||typeof window==='undefined')return;listening=true;
 if(typeof BroadcastChannel!=='undefined'){channel=new BroadcastChannel('closr-native-auth');channel.onmessage=async e=>{const r=await request('getSession');emit(e.data.event,r.data?.session??null,false)}}
 window.addEventListener('focus',async()=>{const r=await request('getSession');if(!r.error)emit('TOKEN_REFRESHED',r.data?.session??null,false)});
}
export function createNativeBrowserAuth(){
 init();
 return {
  getSession:async()=>{const r=await request('getSession');return {...r,data:{session:r.data?.session??null}}},
  getUser:async()=>{const r=await request('getSession');return {...r,data:{user:r.data?.user??null}}},
  signInWithPassword:async(input:{email:string;password:string;totpCode?:string})=>{const r=await request('signInWithPassword',input);if(!r.error)emit('SIGNED_IN',r.data?.session??null);return {...r,data:r.data??{user:null,session:null}}},
  signOut:async()=>{const r=await request('signOut');if(!r.error)emit('SIGNED_OUT',null);return r},
  setSession:async()=>{const r=await request('setSession');if(!r.error)emit('SIGNED_IN',r.data?.session??null);return {...r,data:r.data??{user:null,session:null}}},
  updateUser:async(attributes:Record<string,unknown>)=>{const r=await request('updateUser',{attributes});if(!r.error){const current=await request('getSession');emit('USER_UPDATED',current.data?.session??null)}return r},
  resetPasswordForEmail:(email:string)=>request('resetPasswordForEmail',{email}),
  exchangeCodeForSession:async()=>({data:{user:null,session:null},error:{message:'Native accounts do not use OAuth callback codes',code:'unsupported_oauth'}}),
  onAuthStateChange:(callback:Listener)=>{listeners.add(callback);queueMicrotask(async()=>{const r=await request('getSession');if(listeners.has(callback))callback('INITIAL_SESSION',r.data?.session??null)});return {data:{subscription:{unsubscribe:()=>listeners.delete(callback)}}}},
  mfa:{
   listFactors:()=>request('mfa.listFactors'),
   enroll:(input:Record<string,unknown>)=>request('mfa.enroll',input),
   challenge:(input:Record<string,unknown>)=>request('mfa.challenge',input),
   verify:(input:Record<string,unknown>)=>request('mfa.verify',input),
   unenroll:(input:Record<string,unknown>)=>request('mfa.unenroll',input),
   getAuthenticatorAssuranceLevel:async()=>{const r=await request('getSession');return {data:{currentLevel:r.data?.session?.aal??null,nextLevel:r.data?.session?.aal??null},error:r.error}},
  },
 };
}
