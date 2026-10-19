import type { EngineStrategicPlayInput, EngineStrategicPlayResult } from '../engine-contract/dto';
import { parseInput, parseResult, readBounded } from '../engine-contract/validation';
// Community gateway: verify session and stored ACLs before calling a remote Engine.
// There is deliberately no default identity, body-derived tenant, or local fallback.
export type Principal = { subject: string; orgId: string };
export function createCommunityHandler(deps: {
  authenticate: (request: Request) => Promise<Principal | null>;
  canAccess: (principal: Principal, accountId: string, opportunityId?: string) => Promise<boolean>;
  generate: (input: EngineStrategicPlayInput) => Promise<EngineStrategicPlayResult> | EngineStrategicPlayResult;
}) {
  const reply = (body: unknown, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    try {
      const principal = await deps.authenticate(request);
      if (!principal?.subject || !principal.orgId) return reply({ error: 'unauthorized' }, 401);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'invalid_input' }, 415);
      let input: EngineStrategicPlayInput;
      try { input = parseInput(JSON.parse(await readBounded(request.body))); }
      catch { return reply({ error: 'invalid_input' }, 400); }
      if (input.orgId !== principal.orgId || !await deps.canAccess(principal, input.accountId, input.opportunityId)) return reply({ error: 'forbidden' }, 403);
      const result = parseResult(await deps.generate(input));
      if (result.orgId !== principal.orgId || result.accountId !== input.accountId || result.opportunityId !== input.opportunityId) throw new Error('invalid_result');
      return reply(result, 200);
    } catch { return reply({ error: 'engine_unavailable' }, 503); }
  };
}
