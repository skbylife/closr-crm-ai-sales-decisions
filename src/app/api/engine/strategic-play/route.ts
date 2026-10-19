import 'server-only';
import { communitySession } from '@/lib/community/session';
import { createRemoteGateway } from '@/lib/community/remote-gateway';
export async function POST(request: Request): Promise<Response> {
  // The local Community preview does not ship or promise a private Engine.
  // An operator must explicitly opt in after deploying an independently
  // authenticated private service; missing configuration fails closed.
  if (process.env.CLOSR_ENABLE_ENGINE_PREVIEW !== 'true' || !process.env.CLOSR_ENGINE_URL) {
    return Response.json({error:'engine_not_configured'},{status:501,headers:{'Cache-Control':'no-store'}});
  }
  try {
    const session = await communitySession();
    if (!session) return Response.json({error:'unauthorized'},{status:401});
    return createRemoteGateway({
      authenticate: async () => session.principal,
      canAccess: session.canAccess,
      endpoint: process.env.CLOSR_ENGINE_URL,
      getAccessToken: session.getAccessToken,
    })(request);
  } catch { return Response.json({error:'engine_unavailable'},{status:503}); }
}
