import { readBounded } from '../engine-contract/validation';
import type { Principal } from './engine-handler';
export type ManualPlay = { accountId: string; opportunityId?: string; goalDescription: string; successCriteria: string; steps: { title: string; description: string }[] };
const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const playIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function parseManualPlay(value: unknown): ManualPlay {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_input');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !['accountId','opportunityId','goalDescription','successCriteria','steps'].includes(key))) throw new Error('invalid_input');
  if (!isText(data.accountId,128) || (data.opportunityId !== undefined && !isText(data.opportunityId,128)) || !isText(data.goalDescription,4096) || !isText(data.successCriteria,4096) || !Array.isArray(data.steps) || data.steps.length < 1 || data.steps.length > 20) throw new Error('invalid_input');
  for (const step of data.steps) if (!step || typeof step !== 'object' || Array.isArray(step) || Object.keys(step).some(key => !['title','description'].includes(key)) || !isText(step.title,256) || !isText(step.description,4096)) throw new Error('invalid_input');
  return data as ManualPlay;
}
// Existing strategic_plays storage shape. Only user-supplied text and neutral defaults.
export function manualPlayRow(input: ManualPlay, principal: Principal) {
  return { org_id: principal.orgId, user_id: principal.subject, account_id: input.accountId, opportunity_id: input.opportunityId ?? null, goal_type:'custom', goal_description:input.goalDescription, success_criteria:input.successCriteria, status:'active', momentum:'active', confidence:0, ai_model:null, alternative_paths:[], assumptions:[], learnings:[], steps:input.steps.map((step,index)=>({ index, title:step.title, description:step.description, action:step.description, who:'', target:'', timing:'', purpose:'', risk:'', fallback:'', status:'planned', executionOwnerSource:'manual' })) };
}
export function createManualPlayHandler(deps: {
  authenticate: (request: Request) => Promise<Principal | null>;
  canAccess: (principal: Principal, accountId: string, opportunityId?: string) => Promise<boolean>;
  insert: (row: ReturnType<typeof manualPlayRow>) => Promise<{ id: string }>;
}) {
  const reply=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  return async (request: Request): Promise<Response> => {
    if(request.method!=='POST') return reply({error:'method_not_allowed'},405);
    try {
      const principal=await deps.authenticate(request);
      if(!principal?.subject || !principal.orgId) return reply({error:'unauthorized'},401);
      if(!request.headers.get('content-type')?.startsWith('application/json')) return reply({error:'invalid_input'},415);
      let input: ManualPlay;
      try { input=parseManualPlay(JSON.parse(await readBounded(request.body))); }
      catch { return reply({error:'invalid_input'},400); }
      if(!await deps.canAccess(principal,input.accountId,input.opportunityId)) return reply({error:'forbidden'},403);
      const saved=await deps.insert(manualPlayRow(input,principal));
      if(!isText(saved.id,128)) throw new Error('save_failed');
      return reply({id:saved.id},201);
    } catch { return reply({error:'save_failed'},503); }
  };
}

// Explicit user status changes only; no outcome inference, ranking or automatic replan.
export function createManualStatusHandler(deps: {
  authenticate: (request: Request) => Promise<Principal | null>;
  // Storage adapter must scope lookup/update to principal.orgId AND principal.subject.
  getOwnedAccount: (principal: Principal, playId: string) => Promise<string | null>;
  canAccess: (principal: Principal, accountId: string) => Promise<boolean>;
  updateOwned: (principal: Principal, playId: string, accountId: string, status: string) => Promise<boolean>;
}) {
  const reply=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  return async(request:Request):Promise<Response>=>{
    if(request.method!=='PATCH')return reply({error:'method_not_allowed'},405);
    try {
      const principal=await deps.authenticate(request);
      if(!principal?.subject || !principal.orgId)return reply({error:'unauthorized'},401);
      if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'invalid_input'},415);
      let input:{playId:string;status:string};
      try {
        const value=JSON.parse(await readBounded(request.body));
        if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(key=>!['playId','status'].includes(key)) || !isText(value.playId,128) || !['active','completed','abandoned'].includes(value.status))throw new Error('invalid_input');
        input=value;
      } catch {return reply({error:'invalid_input'},400);}
      const accountId=await deps.getOwnedAccount(principal,input.playId);
      if(!accountId)return reply({error:'not_found'},404);
      if(!await deps.canAccess(principal,accountId))return reply({error:'forbidden'},403);
      if(!await deps.updateOwned(principal,input.playId,accountId,input.status))return reply({error:'not_found'},404);
      return reply({id:input.playId,status:input.status},200);
    }catch{return reply({error:'save_failed'},503);}
  };
}

// Delete only a play owned by this user in their current organization and
// account. The storage adapter repeats every scope predicate at deletion.
export function createManualDeleteHandler(deps: {
  authenticate: (request: Request) => Promise<Principal | null>;
  getOwnedAccount: (principal: Principal, playId: string) => Promise<string | null>;
  canAccess: (principal: Principal, accountId: string) => Promise<boolean>;
  deleteOwned: (principal: Principal, playId: string, accountId: string) => Promise<boolean>;
}) {
  const reply=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  return async(request:Request):Promise<Response>=>{
    if(request.method!=='DELETE')return reply({error:'method_not_allowed'},405);
    try {
      const principal=await deps.authenticate(request);
      if(!principal?.subject || !principal.orgId)return reply({error:'unauthorized'},401);
      if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'invalid_input'},415);
      let playId:string;
      try {
        const value=JSON.parse(await readBounded(request.body,512));
        if(!value || typeof value!=='object' || Array.isArray(value) ||
          Object.keys(value).length!==1 || !Object.hasOwn(value,'playId') ||
          typeof value.playId!=='string' || !playIdPattern.test(value.playId))
          throw new Error('invalid_input');
        playId=value.playId;
      } catch {return reply({error:'invalid_input'},400);}
      const accountId=await deps.getOwnedAccount(principal,playId);
      if(!accountId)return reply({error:'not_found'},404);
      if(!await deps.canAccess(principal,accountId))return reply({error:'forbidden'},403);
      if(!await deps.deleteOwned(principal,playId,accountId))return reply({error:'not_found'},404);
      return reply({id:playId,deleted:true},200);
    }catch{return reply({error:'delete_failed'},503);}
  };
}
