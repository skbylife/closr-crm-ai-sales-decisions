const DEMO_LOGIN_RATE_WINDOW_MS = 60_000;
const DEMO_LOGIN_MAX_FAILED_ATTEMPTS = 5;
const DEMO_LOGIN_LOCKOUT_MS = 5 * 60_000;

type DemoLoginRateBucket = {
  windowStartedAt: number;
  failedAttempts: number;
  lockedUntil: number;
};

const demoLoginRateBuckets = new Map<string, DemoLoginRateBucket>();

export function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor
    || request.headers.get('x-real-ip')?.trim()
    || request.headers.get('cf-connecting-ip')?.trim()
    || 'unknown';
}

export function getDemoLoginRateLimit(key: string, now = Date.now()): { blocked: boolean; retryAfterSeconds?: number } {
  const bucket = demoLoginRateBuckets.get(key);
  if (!bucket) return { blocked: false };

  if (bucket.lockedUntil > now) {
    return { blocked: true, retryAfterSeconds: Math.ceil((bucket.lockedUntil - now) / 1000) };
  }

  if (now - bucket.windowStartedAt > DEMO_LOGIN_RATE_WINDOW_MS) {
    demoLoginRateBuckets.delete(key);
  }

  return { blocked: false };
}

export function recordDemoLoginFailure(key: string, now = Date.now()) {
  const current = demoLoginRateBuckets.get(key);
  const bucket = !current || now - current.windowStartedAt > DEMO_LOGIN_RATE_WINDOW_MS
    ? { windowStartedAt: now, failedAttempts: 0, lockedUntil: 0 }
    : current;

  bucket.failedAttempts += 1;
  if (bucket.failedAttempts >= DEMO_LOGIN_MAX_FAILED_ATTEMPTS) {
    bucket.lockedUntil = now + DEMO_LOGIN_LOCKOUT_MS;
  }
  demoLoginRateBuckets.set(key, bucket);
}

export function clearDemoLoginFailures(key: string) {
  demoLoginRateBuckets.delete(key);
}

export function __resetDemoLoginRateLimitForTests() {
  demoLoginRateBuckets.clear();
}
