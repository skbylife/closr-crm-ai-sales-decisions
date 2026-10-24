import { NativeAuthError } from '@/lib/native-auth/security';
import { readBoundedBody } from '@/lib/native-storage/request';
import { StorageError } from '@/lib/native-storage/policy';
import { NextResponse } from 'next/server';
import { isNativeDatabase } from '@/lib/database-backend';
import { getNativeUser, assertSameOrigin } from '@/lib/native-auth/server';
import { executeNativeQuery } from '@/lib/native-db/executor';
import type { QuerySpec } from '@/lib/native-db/types';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isNativeDatabase()) return NextResponse.json({ error: { message: 'Native backend is not enabled' } }, { status: 404 });
  try {
    assertSameOrigin(request);
    const user = await getNativeUser(request);
    if (!user) return NextResponse.json({ error: { message: 'Authentication required', code: '401' } }, { status: 401 });
    const raw = new TextDecoder().decode(await readBoundedBody(request, 2_000_000));
    const spec = JSON.parse(raw) as QuerySpec;
    // Only an actual select operation receives the read allowance. Mutations,
    // RPCs and malformed actions all use the stricter write tier. The executor
    // independently validates the query and never interprets a client tier hint.
    const tier = spec?.action === 'select' ? 'read' : 'default';
    const decision = checkRateLimit(`native-data:${tier}:${user.id}`, tier);
    if (decision.limited) return NextResponse.json({ data: null, error: { message: 'Too many requests', code: 'RATE_LIMIT' } }, {
      status: 429, headers: { ...rateLimitHeaders(decision), 'Retry-After': String(decision.retryAfter) },
    });
    // Identity and privileges always come from the validated session, never JSON.
    const result = await executeNativeQuery(spec, { userId: user.id });
    return NextResponse.json(result, { headers: rateLimitHeaders(decision) });
  } catch (error) {
    if (error instanceof NativeAuthError) return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: error.status });
    if (error instanceof StorageError) return NextResponse.json({ data: null, error: { message: error.message, code: 'REQUEST_SIZE' } }, { status: error.status });
    return NextResponse.json({ data: null, error: { message: 'Invalid database request', code: 'BAD_REQUEST' } }, { status: 400 });
  }
}
