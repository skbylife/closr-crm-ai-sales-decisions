export const DAILY_AI_TTL_MS = 24 * 60 * 60 * 1000;

export interface FreshnessMeta {
  generatedAt: string;
  staleAfter: string;
  stale: boolean;
}

export function buildFreshnessMeta(generatedAt: string | Date, ttlMs = DAILY_AI_TTL_MS): FreshnessMeta {
  const generated = typeof generatedAt === 'string' ? new Date(generatedAt) : generatedAt;
  const staleAfter = new Date(generated.getTime() + ttlMs);

  return {
    generatedAt: generated.toISOString(),
    staleAfter: staleAfter.toISOString(),
    stale: Date.now() >= staleAfter.getTime(),
  };
}

export function isStale(generatedAt: string | Date, ttlMs = DAILY_AI_TTL_MS): boolean {
  return buildFreshnessMeta(generatedAt, ttlMs).stale;
}
