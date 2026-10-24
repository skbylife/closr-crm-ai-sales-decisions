// Tiered in-memory rate limiter for API routes.
// Note: this process-local limiter resets when the Node/PM2 process restarts.
// This provides a last-mile app guard; production deployments still require edge/WAF controls.

export type RateLimitTierName = 'default' | 'read' | 'ai' | 'import';
type TierConfig = { window: number; max: number; envMax?: string };

const TIERS: Record<RateLimitTierName, TierConfig> = {
  // Browser navigation in Next.js can fan out into many RSC/API reads.
  // Keep write protection meaningful, but do not let normal logged-in browsing
  // or QA page walks trip a global per-IP limiter.
  default: { window: 60_000, max: 120, envMax: 'RATE_LIMIT_API_WRITE_PER_MINUTE' },
  read:    { window: 60_000, max: 600, envMax: 'RATE_LIMIT_API_READ_PER_MINUTE' },
  ai:      { window: 60_000, max: 10, envMax: 'RATE_LIMIT_AI_PER_MINUTE' },
  import:  { window: 60_000, max: 5, envMax: 'RATE_LIMIT_IMPORT_PER_MINUTE' },
};

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Lazy cleanup instead of setInterval (avoids leaks during HMR/test)
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 300_000; // 5 minutes

function resolveTier(tierName: RateLimitTierName): TierConfig {
  const tier = TIERS[tierName];
  const envValue = tier.envMax ? Number(process.env[tier.envMax]) : NaN;
  return Number.isFinite(envValue) && envValue > 0
    ? { ...tier, max: Math.trunc(envValue) }
    : tier;
}

export interface RateLimitDecision {
  limited: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter: number;
}

export function checkRateLimit(key: string, tierName: RateLimitTierName): RateLimitDecision {
  const tier = resolveTier(tierName);
  const now = Date.now();

  // Lazy stale-entry cleanup
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    lastCleanup = now;
    for (const [k, entry] of rateLimitMap) {
      if (now >= entry.resetAt) rateLimitMap.delete(k);
    }
  }

  const entry = rateLimitMap.get(key);

  if (entry && now < entry.resetAt) {
    if (entry.count >= tier.max) {
      return {
        limited: true,
        limit: tier.max,
        remaining: 0,
        resetAt: entry.resetAt,
        retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      };
    }
    entry.count++;
    return {
      limited: false,
      limit: tier.max,
      remaining: Math.max(0, tier.max - entry.count),
      resetAt: entry.resetAt,
      retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  rateLimitMap.set(key, { count: 1, resetAt: now + tier.window });
  return {
    limited: false,
    limit: tier.max,
    remaining: Math.max(0, tier.max - 1),
    resetAt: now + tier.window,
    retryAfter: Math.max(1, Math.ceil(tier.window / 1000)),
  };
}

export function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(decision.limit),
    'X-RateLimit-Remaining': String(decision.remaining),
    'X-RateLimit-Reset': String(Math.ceil(decision.resetAt / 1000)),
  };
}

/**
 * Check if an IP has exceeded the general mutating/API fallback limit.
 * @returns true if rate limited (should return 429)
 */
export function isRateLimited(ip: string): boolean {
  return checkRateLimit(`ip:${ip}`, 'default').limited;
}

/**
 * Check if an IP has exceeded the read/navigation limit.
 * GET-heavy dashboard routes use this so normal browsing does not get blocked
 * by the stricter write/API fallback limiter.
 */
export function isReadRateLimited(ip: string): boolean {
  return checkRateLimit(`read:${ip}`, 'read').limited;
}

/**
 * Check if a user has exceeded the AI rate limit (10 req/min).
 * Use userId (not IP) since AI calls are expensive.
 * @returns true if rate limited
 */
export function isAIRateLimited(userId: string): boolean {
  return checkRateLimit(`ai:${userId}`, 'ai').limited;
}

/**
 * Check if a user has exceeded the import rate limit (5 req/min).
 * @returns true if rate limited
 */
export function isImportRateLimited(userId: string): boolean {
  return checkRateLimit(`import:${userId}`, 'import').limited;
}

/**
 * Apply AI rate limit check to a request by extracting userId from UserContext.
 * Throws ApiError(429) if rate limited, with retry-after headers.
 * Use in route handlers:
 *   const ctx = await requireAuth();
 *   applyAIRateLimit(ctx.userId);
 */
import { ApiError } from '@/lib/api-guard';

export function applyAIRateLimit(userId: string): void {
  const decision = checkRateLimit(`ai:${userId}`, 'ai');
  if (decision.limited) {
    throw new ApiError(429, 'AI 请求过于频繁，请稍后重试');
  }
}
