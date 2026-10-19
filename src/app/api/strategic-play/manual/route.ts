import { manualPlayDisplay } from '@/lib/community/manual-display';
import 'server-only';
import { communitySession } from '@/lib/community/session';
import { createManualPlayHandler, createManualStatusHandler, createManualDeleteHandler } from '@/lib/community/manual-play';
import { requireAdmin } from '@/lib/api-guard';
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await communitySession();
    if (!session) return Response.json({error:'unauthorized'},{status:401});
    return createManualPlayHandler({
      authenticate: async () => session.principal,
      canAccess: session.canAccess,
      insert: async row => {
        const {data,error} = await requireAdmin().from('strategic_plays').insert(row).select('id').single();
        if (error || !data) throw new Error('save_failed');
        return {id:data.id};
      },
    })(request);
  } catch { return Response.json({error:'save_failed'},{status:503}); }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await communitySession();
    if (!session) return Response.json({error:'unauthorized'},{status:401});
    const accountId = new URL(request.url).searchParams.get('accountId');
    if (!accountId || !await session.canAccess(session.principal,accountId)) return Response.json({error:'forbidden'},{status:403});
    const {data,error} = await requireAdmin().from('strategic_plays')
      .select('id, account_id, opportunity_id, goal_description, success_criteria, status, created_at, steps')
      .eq('org_id',session.principal.orgId).eq('user_id',session.principal.subject)
      .eq('account_id',accountId)
      .order('created_at',{ascending:false}).limit(100);
    if (error) throw new Error('read_failed');
    return Response.json({plays:(data ?? []).map(manualPlayDisplay)},{headers:{'Cache-Control':'no-store'}});
  } catch { return Response.json({error:'read_failed'},{status:503}); }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const session=await communitySession();
    if(!session)return Response.json({error:'unauthorized'},{status:401});
    return createManualStatusHandler({
      authenticate:async()=>session.principal,
      canAccess:session.canAccess,
      getOwnedAccount:async(principal,playId)=>{
        const {data,error}=await requireAdmin().from('strategic_plays').select('account_id').eq('id',playId).eq('org_id',principal.orgId).eq('user_id',principal.subject).single();
        if(error || !data)return null;
        return data.account_id;
      },
      updateOwned:async(principal,playId,accountId,status)=>{
        const {data,error}=await requireAdmin().from('strategic_plays').update({status,updated_at:new Date().toISOString()}).eq('id',playId).eq('org_id',principal.orgId).eq('user_id',principal.subject).eq('account_id',accountId).select('id').single();
        if(error)throw new Error('save_failed');
        return Boolean(data);
      },
    })(request);
  }catch{return Response.json({error:'save_failed'},{status:503});}
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const session=await communitySession();
    if(!session)return Response.json({error:'unauthorized'},{status:401});
    return createManualDeleteHandler({
      authenticate:async()=>session.principal,
      canAccess:session.canAccess,
      getOwnedAccount:async(principal,playId)=>{
        const {data,error}=await requireAdmin().from('strategic_plays').select('account_id')
          .eq('id',playId).eq('org_id',principal.orgId).eq('user_id',principal.subject).single();
        if(error || !data)return null;
        return data.account_id;
      },
      deleteOwned:async(principal,playId,accountId)=>{
        const {data,error}=await requireAdmin().from('strategic_plays').delete()
          .eq('id',playId).eq('org_id',principal.orgId).eq('user_id',principal.subject)
          .eq('account_id',accountId).select('id');
        if(error)throw new Error('delete_failed');
        return Array.isArray(data) && data.length===1 && data[0].id===playId;
      },
    })(request);
  }catch{return Response.json({error:'delete_failed'},{status:503});}
}
