import { buildEngineJudgmentSnapshot } from '@/lib/engine/hybrid-pipeline';
import { persistEngineJudgmentSnapshot } from '@/lib/engine/persistence';
import { readEngineRequest, authorizedEngineSources, engineRequestError } from '@/lib/engine/request-guard';

export async function POST(request:Request){
 try{
  const {ctx,body,scope}=await readEngineRequest(request);
  const sources=await authorizedEngineSources(body.sources,scope,ctx);
  const snapshot=await buildEngineJudgmentSnapshot({...scope,sources});
  if(body.persist===true){
   const persisted=await persistEngineJudgmentSnapshot(snapshot,{actorId:ctx.userId,actorType:'user'});
   return Response.json({...snapshot,persistence:{persisted:true,snapshotId:persisted.snapshotId,counts:persisted.counts}});
  }
  return Response.json({...snapshot,persistence:{persisted:false}});
 }catch(error){return engineRequestError(error)}
}
