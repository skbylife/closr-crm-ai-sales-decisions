/**
 * 简单内存缓存 — LRU + TTL
 * 用于权限上下文、组织设置、AI 响应等高频读取场景
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessed: number;
}

const DEFAULT_MAX_SIZE = 1000;

export class MemoryCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();
  private maxSize: number;

  constructor(maxSize = DEFAULT_MAX_SIZE) {
    this.maxSize = maxSize;
  }

  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    entry.lastAccessed = Date.now();
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    // Evict if at capacity
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      this.evictLRU();
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      lastAccessed: Date.now(),
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** 删除以 prefix 开头的所有 key */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  private evictLRU(): void {
    // Remove expired first
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
    if (this.store.size < this.maxSize) return;

    // Remove least recently accessed
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.store) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey) this.store.delete(oldestKey);
  }
}

// ─── 预配置缓存实例 ────────────────────────────────────────────────

/** 权限上下文缓存 (5分钟 TTL) */
export const permissionCache = new MemoryCache();
export const PERMISSION_TTL = 60 * 1000; // 60 seconds

/** 组织设置缓存 (10分钟 TTL) */
export const orgSettingsCache = new MemoryCache();
export const ORG_SETTINGS_TTL = 10 * 60 * 1000;

/** AI 响应缓存 (30分钟 TTL) */
export const aiResponseCache = new MemoryCache();
export const AI_RESPONSE_TTL = 30 * 60 * 1000;

// ─── 便捷函数 ──────────────────────────────────────────────────────

/**
 * 缓存包装器：如果缓存中有值直接返回，否则执行 fn 并缓存结果
 */
export async function withCache<T>(
  cache: MemoryCache<T>,
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  if (cache.has(key)) return cache.get(key) as T;
  const result = await fn();
  cache.set(key, result, ttlMs);
  return result;
}
