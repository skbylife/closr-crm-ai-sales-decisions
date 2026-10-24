// Health check endpoint — used by monitoring / load balancers.
// Public (unauthenticated) response is minimal to avoid leaking infrastructure state.
// Detailed checks are only returned when HEALTH_CHECK_TOKEN matches.

import { timingSafeEqual } from 'crypto';
import { isAiConfigured } from '@/lib/ai-provider-config';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function GET(request: Request) {
  const expectedToken = process.env.HEALTH_CHECK_TOKEN;
  const providedToken = request.headers.get('x-health-token') ?? '';
  const isAuthorized = expectedToken ? safeEqual(providedToken, expectedToken) : false;

  // Default: minimal public health signal — no infra fingerprinting.
  if (!isAuthorized) {
    return Response.json({ status: 'ok' }, { status: 200 });
  }

  // Authorized: detailed diagnostics.
  const checks: Record<string, 'ok' | 'error'> = {
    server: 'ok',
    database: 'error',
    ai_config: 'error',
  };

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error('No admin client');
    const { error } = await supabase.from('organizations').select('id').limit(1);
    checks.database = error ? 'error' : 'ok';
  } catch {
    checks.database = 'error';
  }

  checks.ai_config = isAiConfigured() ? 'ok' : 'error';

  const allOk = Object.values(checks).every((v) => v === 'ok');

  return Response.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 },
  );
}
