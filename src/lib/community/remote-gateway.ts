import { createCommunityHandler, type Principal } from './engine-handler';
import { createEngineClient } from '../engine-contract/server-client';
export function createRemoteGateway(deps: {
  authenticate: (request: Request) => Promise<Principal | null>;
  canAccess: (principal: Principal, accountId: string, opportunityId?: string) => Promise<boolean>;
  endpoint?: string;
  getAccessToken: () => Promise<string>;
  fetch?: typeof fetch;
}) {
  return createCommunityHandler({
    authenticate: deps.authenticate,
    canAccess: deps.canAccess,
    // Lazy creation keeps basic/manual functions usable with no Engine configured.
    generate: input => createEngineClient(deps).generate(input),
  });
}
