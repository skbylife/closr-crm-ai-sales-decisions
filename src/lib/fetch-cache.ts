/**
 * Client-side fetch result cache.
 * Prevents redundant API calls when components remount (navigation, tab switch).
 * Module-level Map — lives for the duration of the browser session.
 * NOT persistent across full page reload — intentional for freshness.
 */

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const store = new Map<string, CacheEntry>();

/** Default freshness window: 1 hour */
const DEFAULT_FRESHNESS_MS = 60 * 60 * 1000;

/**
 * Return cached data if it exists and is within the freshness window.
 */
export function getCached<T>(
  key: string,
  freshnessMs = DEFAULT_FRESHNESS_MS,
): { data: T; fetchedAt: number } | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > freshnessMs) {
    store.delete(key);
    return null;
  }
  return { data: entry.data as T, fetchedAt: entry.fetchedAt };
}

/**
 * Store data in cache. Returns the fetchedAt timestamp.
 */
export function setCache(key: string, data: unknown): number {
  const fetchedAt = Date.now();
  store.set(key, { data, fetchedAt });
  return fetchedAt;
}

/**
 * Remove a specific cache entry (used before force-refresh).
 */
export function invalidate(key: string): void {
  store.delete(key);
}

/** Freshness presets (ms) */
export const FRESHNESS = {
  /** Morning briefing — once per day */
  BRIEFING: 24 * 60 * 60 * 1000,
  /** AI insights from DB — 1 hour */
  INSIGHTS: 60 * 60 * 1000,
  /** CIL health reports — 1 hour */
  CIL_HEALTH: 60 * 60 * 1000,
  /** Intel signals — 30 min */
  INTEL: 30 * 60 * 1000,
  /** Daily actions — 1 hour */
  ACTIONS: 60 * 60 * 1000,
  /** Daily briefing card — 1 hour */
  DAILY_BRIEFING: 60 * 60 * 1000,
  /** Store hydration — 3 minutes (covers page navigation) */
  HYDRATION: 3 * 60 * 1000,
} as const;

/**
 * Invalidate all cache entries matching a key prefix.
 * Used to clear hydration caches (e.g., 'hydrate:' prefix).
 */
export function invalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

/**
 * Clear the entire cache. Used on auth transitions to prevent cross-user data leakage.
 */
export function clearAll(): void {
  store.clear();
}

/**
 * Format a fetchedAt timestamp into a human-readable relative string (Chinese).
 * Used by components to show "缓存 · 12分钟前" vs "刚刚更新".
 */
export function formatCacheAge(fetchedAt: number): { label: string; isCached: boolean } {
  const ageMs = Date.now() - fetchedAt;
  const ageSec = Math.floor(ageMs / 1000);
  if (ageSec < 30) return { label: "刚刚更新", isCached: false };
  if (ageSec < 60) return { label: `${ageSec}秒前`, isCached: true };
  const ageMin = Math.floor(ageSec / 60);
  if (ageMin < 60) return { label: `${ageMin}分钟前缓存`, isCached: true };
  const ageHr = Math.floor(ageMin / 60);
  return { label: `${ageHr}小时前缓存`, isCached: true };
}
