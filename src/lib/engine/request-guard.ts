import { ApiError, requireAuth, requireAccountAccess, requireOpportunityAccess, requireContactAccess } from '@/lib/api-guard';
import { assertSameOrigin, NativeAuthError } from '@/lib/native-auth/security';
import { readBoundedBody } from '@/lib/native-storage/request';
import { StorageError } from '@/lib/native-storage/policy';
import type { UserContext } from '@/lib/permissions';
import { normalizeSources, type EngineSourceRecord } from './schema';

export interface AuthorizedEngineScope { tenantId:string;accountId:string;opportunityId?:string }
export function isEngineRecord(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)}
export async function readEngineRequest(request:Request){
 const ctx=await requireAuth();
 assertSameOrigin(request);
 let body:unknown;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBoundedBody(request,2*1024*1024)))}catch(e){if(e instanceof StorageError)throw e;throw new ApiError(400,'Invalid JSON request')}
 if(!isEngineRecord(body))throw new ApiError(400,'A request object is required');
 if(typeof body.accountId!=='string'||!body.accountId.trim()||body.accountId.length>200)throw new ApiError(400,'accountId is required');
 if(body.tenantId!==undefined&&body.tenantId!==ctx.orgId)throw new ApiError(403,'Tenant does not match the authenticated organization');
 if(body.opportunityId!==undefined&&body.opportunityId!==null&&(typeof body.opportunityId!=='string'||!body.opportunityId.trim()||body.opportunityId.length>200))throw new ApiError(400,'Invalid opportunityId');
 const scope:AuthorizedEngineScope={tenantId:ctx.orgId,accountId:body.accountId.trim(),opportunityId:typeof body.opportunityId==='string'?body.opportunityId.trim():undefined};
 await requireAccountAccess(ctx,scope.accountId);
 if(scope.opportunityId){const opportunity=await requireOpportunityAccess(ctx,scope.opportunityId);if(opportunity.account_id!==scope.accountId)throw new ApiError(403,'Opportunity does not belong to the requested account')}
 return {ctx,body,scope};
}
export function assertRecordScope(record:Record<string,unknown>,scope:AuthorizedEngineScope){
 if(record.tenantId!==undefined&&record.tenantId!==scope.tenantId)throw new ApiError(403,'Record tenant does not match the authenticated organization');
 if(record.accountId!==undefined&&record.accountId!==scope.accountId)throw new ApiError(403,'Record account does not match the authorized account');
 if(record.opportunityId!==undefined&&record.opportunityId!==scope.opportunityId)throw new ApiError(403,'Record opportunity does not match the authorized opportunity');
}
export function engineRecords(value:unknown,label:string,max=25):Record<string,unknown>[] {
 if(!Array.isArray(value)||!value.length||value.some(x=>!isEngineRecord(x)))throw new ApiError(400,`${label} are required and must be objects`);
 if(value.length>max)throw new ApiError(400,`${label} exceeds maximum of ${max}`);
 return value;
}
export async function authorizedEngineSources(value:unknown,scope:AuthorizedEngineScope,ctx:UserContext){
 const records=engineRecords(value,'sources');const contactIds=new Set<string>();
 for(const source of records){
  assertRecordScope(source,scope);
  if(typeof source.content==='string'&&source.content.length>50_000)throw new ApiError(413,'Source content exceeds maximum length');
  if(source.contactIds!==undefined){if(!Array.isArray(source.contactIds)||source.contactIds.length>20||source.contactIds.some(x=>typeof x!=='string'||!x||x.length>200))throw new ApiError(400,'Invalid source contactIds');for(const id of source.contactIds)contactIds.add(id as string)}
 }
 if(contactIds.size>100)throw new ApiError(400,'Too many source contacts');
 for(const id of contactIds){const contact=await requireContactAccess(ctx,id);if(contact.account_id!==scope.accountId)throw new ApiError(403,'Source contact does not belong to the requested account')}
 try{return normalizeSources(records.map(record=>({...record,...scope})) as unknown as EngineSourceRecord[],scope)}catch{throw new ApiError(400,'Invalid engine source record')}
}
export function engineRequestError(error:unknown):Response{
 if(error instanceof ApiError||error instanceof NativeAuthError||error instanceof StorageError)return Response.json({error:error.message},{status:error.status});
 if(error instanceof Error&&error.name==='EnginePersistenceConflict')return Response.json({error:'Engine record conflicts with another scope'},{status:409});
 if(error instanceof Error&&error.name==='EngineSnapshotScopeError')return Response.json({error:'Invalid engine snapshot scope or references'},{status:400});
 return Response.json({error:'Engine operation failed'},{status:500});
}
