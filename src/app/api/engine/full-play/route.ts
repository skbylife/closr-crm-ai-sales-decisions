import 'server-only';
import { communitySession } from '@/lib/community/session';
import { createFullPlayClient } from '@/lib/engine-contract/full-play-client';
import { parseFullPlayRequest } from '@/lib/engine-contract/full-play-dto';
import { readBounded } from '@/lib/engine-contract/validation';

export async function POST(request: Request): Promise<Response> {
  const reply = (body: unknown, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (process.env.CLOSR_ENABLE_FULL_ENGINE !== 'true' || !process.env.CLOSR_FULL_ENGINE_URL) {
    return reply({ error: 'engine_not_configured' }, 501);
  }
  try {
    const session = await communitySession();
    if (!session) return reply({ error: 'unauthorized' }, 401);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'invalid_input' }, 415);
    let input;
    try { input = parseFullPlayRequest(JSON.parse(await readBounded(request.body, 16_384))); }
    catch { return reply({ error: 'invalid_input' }, 400); }
    if (!await session.canAccess(session.principal, input.accountId, input.opportunityId) ||
        (input.targetContactId && !await session.canAccessContact(input.accountId, input.targetContactId))) {
      return reply({ error: 'forbidden' }, 403);
    }
    const client = createFullPlayClient({ endpoint: process.env.CLOSR_FULL_ENGINE_URL,
      expectedOrgId: session.principal.orgId, getAccessToken: session.getAccessToken });
    return reply(await client.generate(input), 200);
  } catch { return reply({ error: 'engine_unavailable' }, 503); }
}
