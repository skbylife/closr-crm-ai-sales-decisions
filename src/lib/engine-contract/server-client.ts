import 'server-only';
// Call from the Community server only. Never pass service credentials to a browser.
import { parseInput, parseResult, readBounded } from './validation';
import type { EngineStrategicPlayInput, EngineStrategicPlayResult } from './dto';
export function createEngineClient(config: { endpoint?: string; getAccessToken: () => Promise<string>; fetch?: typeof fetch; timeoutMs?: number }) {
  if (typeof window !== 'undefined') throw new Error('server_only');
  let endpoint: URL;
  try { endpoint = new URL(config.endpoint ?? ''); } catch { throw new Error('engine_unavailable'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('invalid_engine_endpoint');
  const timeoutMs = config.timeoutMs ?? 30000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error('invalid_timeout');
  return {
    async generate(input: EngineStrategicPlayInput): Promise<EngineStrategicPlayResult> {
      try {
        const payload = JSON.stringify(parseInput(input));
        if (new TextEncoder().encode(payload).length > 131072) throw new Error('invalid_input');
        const token = await config.getAccessToken();
        if (!token || /[\r\n]/.test(token)) throw new Error('missing_authentication');
        const response = await (config.fetch ?? fetch)(endpoint, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs), headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` }, body: payload });
        if (!response.ok) { await response.body?.cancel(); throw new Error('upstream_failed'); }
        const mediaType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
        if (mediaType !== 'application/json') { await response.body?.cancel(); throw new Error('upstream_failed'); }
        const result = parseResult(JSON.parse(await readBounded(response.body)));
        if (result.orgId !== input.orgId || result.accountId !== input.accountId || result.opportunityId !== input.opportunityId) throw new Error('invalid_scope');
        return result;
      } catch { throw new Error('engine_unavailable'); }
    },
  };
}
