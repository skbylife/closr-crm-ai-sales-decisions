import 'server-only';
import { parseFullPlayRequest, projectFullPlayResult, type FullPlayRequest, type FullPlayResponse } from './full-play-dto';
import { readBounded } from './validation';

export function createFullPlayClient(config: {
  endpoint?: string;
  expectedOrgId: string;
  getAccessToken: () => Promise<string>;
  fetch?: typeof fetch;
}) {
  let endpoint: URL;
  try { endpoint = new URL(config.endpoint ?? ''); }
  catch { throw new Error('engine_unavailable'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('engine_unavailable');
  if (!config.expectedOrgId || !/^[A-Za-z0-9_-]{1,128}$/.test(config.expectedOrgId)) throw new Error('engine_unavailable');
  return {
    async generate(input: FullPlayRequest): Promise<FullPlayResponse> {
      try {
        const payload = JSON.stringify(parseFullPlayRequest(input));
        const token = await config.getAccessToken();
        if (!token || /[\r\n]/.test(token)) throw new Error('engine_unavailable');
        const response = await (config.fetch ?? fetch)(endpoint, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30_000),
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` }, body: payload });
        if (!response.ok || (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
          await response.body?.cancel(); throw new Error('engine_unavailable');
        }
        const value = JSON.parse(await readBounded(response.body, 65_536));
        if (!value || typeof value !== 'object' || value.accountId !== input.accountId || value.orgId !== config.expectedOrgId) throw new Error('engine_unavailable');
        return projectFullPlayResult(value, value.orgId, value.accountId);
      } catch { throw new Error('engine_unavailable'); }
    },
  };
}
