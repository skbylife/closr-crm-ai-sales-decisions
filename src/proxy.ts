import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, rateLimitHeaders, type RateLimitTierName } from '@/lib/rate-limit';
import { updateSession } from '@/lib/supabase/middleware';

const RATE_LIMIT_EXEMPT_PATHS = new Set([
  '/api/health',
  '/api/ping',
  '/api/integration/webhook/microsoft',
]);

const PUBLIC_PATHS = [
  '/api/email-webhook',
  '/api/integration/webhook',
  '/api/integration/oauth/microsoft/callback',
  '/api/invite/accept',
  '/api/verify-demo',
  '/api/demo-login',
  '/api/health',
  '/api/agent/daily-analysis',
  '/api/agent/intelligence/scan',
  '/api/agent/morning-briefing',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

function clientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    forwardedFor ||
    'unknown'
  );
}

function tierFor(method: string, pathname: string): RateLimitTierName {
  // Native reads use POST for a structured query body. The authenticated handler
  // applies a separate write quota after parsing the actual action; headers from
  // the browser cannot opt writes into the read allowance.
  if (pathname === '/api/native/data' && method === 'POST') return 'read';
  return method === 'GET' || method === 'HEAD' ? 'read' : 'default';
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API-wide last-mile rate limiting. Keep it off in local development because
  // React StrictMode and hot reload can double-fire dashboard requests.
  if (pathname.startsWith('/api/') && process.env.NODE_ENV !== 'development' && !RATE_LIMIT_EXEMPT_PATHS.has(pathname)) {
    const tier = tierFor(request.method, pathname);
    const decision = checkRateLimit(`proxy:${tier}:${clientIp(request)}`, tier);
    const headers = rateLimitHeaders(decision);

    if (decision.limited) {
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            ...headers,
            'Retry-After': String(decision.retryAfter),
          },
        },
      );
    }

    const response = isPublicPath(pathname) ? NextResponse.next() : await updateSession(request);
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
    return response;
  }

  if (isPublicPath(pathname)) return NextResponse.next();
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
