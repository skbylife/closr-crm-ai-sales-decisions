import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, requireAuth, requireAccountAccess, requireOpportunityAccess } from '@/lib/api-guard';
import { POST as snapshot } from '@/app/api/engine/judgment/snapshot/route';
import { POST as decode } from '@/app/api/engine/decode/route';
import { POST as strategic } from '@/app/api/engine/strategic-play/route';
import { buildEngineJudgmentSnapshot, decodeEngineSignals, generateEngineMoves } from './hybrid-pipeline';
import { persistEngineJudgmentSnapshot } from './persistence';
vi.mock('@/lib/api-guard',async()=>({...await vi.importActual<typeof import('@/lib/api-guard')>('@/lib/api-guard'),requireAuth:vi.fn(),requireAccountAccess:vi.fn(),requireOpportunityAccess:vi.fn(),requireContactAccess:vi.fn()}));
vi.mock('./hybrid-pipeline',()=>({buildEngineJudgmentSnapshot:vi.fn(async(input)=>({...input})),decodeEngineSignals:vi.fn(async(input)=>input),generateEngineMoves:vi.fn(async(input)=>input)}));
vi.mock('./persistence',()=>({persistEngineJudgmentSnapshot:vi.fn(async()=>({snapshotId:'snapshot-safe',counts:{}}))}));
const ctx={userId:'user-a',orgId:'org-a',orgRole:'admin' as const,roleLevel:'admin' as const,jobLevel:2,teamId:null,teamMemberIds:[]};
const source={id:'source-a',tenantId:'org-a',accountId:'account-a',sourceType:'email',occurredAt:'2026-01-01T00:00:00Z',content:'Fictional customer requests a security review.'};
const body={tenantId:'org-a',accountId:'account-a',sources:[source]};
function request(value:unknown,origin='http://localhost'){return new Request('http://localhost/api/engine/test',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(value)})}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('NEXT_PUBLIC_APP_URL','http://localhost');vi.mocked(requireAuth).mockResolvedValue(ctx);vi.mocked(requireAccountAccess).mockResolvedValue();vi.mocked(requireOpportunityAccess).mockResolvedValue({id:'opp-a',account_id:'account-a',user_id:'user-a',assigned_to:null})});
afterEach(()=>vi.unstubAllEnvs());
describe('Engine authenticated tenant boundaries',()=>{
 it.each([['snapshot',snapshot],['decode',decode],['strategic',strategic]] as const)('%s rejects anonymous requests before generation',async(_name,handler)=>{
  vi.mocked(requireAuth).mockRejectedValue(new ApiError(401,'Authentication required'));
  expect((await handler(request(body))).status).toBe(401);
  expect(buildEngineJudgmentSnapshot).not.toHaveBeenCalled();expect(decodeEngineSignals).not.toHaveBeenCalled();expect(generateEngineMoves).not.toHaveBeenCalled();
 });
 it.each([snapshot,decode,strategic])('rejects forged tenant and cross-origin requests',async handler=>{
  expect((await handler(request({...body,tenantId:'org-b'}))).status).toBe(403);
  expect((await handler(request(body,'https://evil.example.invalid'))).status).toBe(403);
 });
 it('checks account access and opportunity binding before snapshot generation',async()=>{
  vi.mocked(requireAccountAccess).mockRejectedValueOnce(new ApiError(403,'Forbidden account'));
  expect((await snapshot(request(body))).status).toBe(403);
  vi.mocked(requireOpportunityAccess).mockResolvedValueOnce({id:'opp-b',account_id:'account-b',user_id:'user-a',assigned_to:null});
  expect((await snapshot(request({...body,opportunityId:'opp-b'}))).status).toBe(403);expect(buildEngineJudgmentSnapshot).not.toHaveBeenCalled();
 });
 it('rejects each source carrying a foreign tenant, account or opportunity',async()=>{
  for(const change of [{tenantId:'org-b'},{accountId:'account-b'},{opportunityId:'opp-b'}])expect((await snapshot(request({...body,sources:[{...source,...change}],persist:true}))).status).toBe(403);
  expect(persistEngineJudgmentSnapshot).not.toHaveBeenCalled();
 });
 it('derives tenant and audit actor from the authenticated context',async()=>{
  const response=await snapshot(request({...body,tenantId:undefined,actorId:'forged-actor',persist:true}));expect(response.status).toBe(200);
  expect(buildEngineJudgmentSnapshot).toHaveBeenCalledWith(expect.objectContaining({tenantId:'org-a',accountId:'account-a'}));
  expect(persistEngineJudgmentSnapshot).toHaveBeenCalledWith(expect.objectContaining({tenantId:'org-a'}),{actorId:'user-a',actorType:'user'});
 });
 it('rejects foreign strategic judgment/gap scope and foreign judgment references',async()=>{
  const judgment={id:'j-a',tenantId:'org-a',accountId:'account-a'};const gap={id:'g-a',tenantId:'org-a',accountId:'account-a',linkedJudgmentIds:['j-a']};
  expect((await strategic(request({...body,judgments:[{...judgment,tenantId:'org-b'}],winGaps:[gap]}))).status).toBe(403);
  expect((await strategic(request({...body,judgments:[judgment],winGaps:[{...gap,accountId:'account-b'}]}))).status).toBe(403);
  expect((await strategic(request({...body,judgments:[judgment],winGaps:[{...gap,linkedJudgmentIds:['foreign-j']}]}))).status).toBe(400);
  expect(generateEngineMoves).not.toHaveBeenCalled();
 });
});
