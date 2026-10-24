import { decodeEngineSignals } from '@/lib/engine/hybrid-pipeline';
import { readEngineRequest, authorizedEngineSources, engineRequestError } from '@/lib/engine/request-guard';
export async function POST(request:Request){
 try{const {ctx,body,scope}=await readEngineRequest(request);const sources=await authorizedEngineSources(body.sources,scope,ctx);return Response.json(await decodeEngineSignals({...scope,sources}))}
 catch(error){return engineRequestError(error)}
}
