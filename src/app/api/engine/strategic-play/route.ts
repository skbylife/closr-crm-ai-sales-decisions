import { generateEngineMoves } from '@/lib/engine/hybrid-pipeline';
import type { EngineJudgment, EngineWinGap } from '@/lib/engine/schema';
import { readEngineRequest, engineRecords, assertRecordScope, engineRequestError } from '@/lib/engine/request-guard';
import { ApiError } from '@/lib/api-guard';
export async function POST(request:Request){
 try{
  const {body,scope}=await readEngineRequest(request);
  const judgments=engineRecords(body.judgments,'judgments');const winGaps=engineRecords(body.winGaps,'winGaps');
  for(const record of [...judgments,...winGaps]){assertRecordScope(record,scope);if(typeof record.id!=='string'||!record.id||record.id.length>200)throw new ApiError(400,'Invalid engine record ID')}
  const judgmentIds=new Set(judgments.map(j=>j.id));
  for(const gap of winGaps){if(!Array.isArray(gap.linkedJudgmentIds)||gap.linkedJudgmentIds.some(id=>!judgmentIds.has(id)))throw new ApiError(400,'Win gap references a judgment outside this request')}
  if(typeof body.playGoal==='string'&&body.playGoal.length>5000)throw new ApiError(413,'playGoal exceeds maximum length');
  return Response.json(await generateEngineMoves({...scope,playGoal:typeof body.playGoal==='string'?body.playGoal.trim():undefined,
   judgments:judgments.map(j=>({...j,...scope})) as unknown as EngineJudgment[],winGaps:winGaps.map(g=>({...g,...scope})) as unknown as EngineWinGap[]}));
 }catch(error){return engineRequestError(error)}
}
