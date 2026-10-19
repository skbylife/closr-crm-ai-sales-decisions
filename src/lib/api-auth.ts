import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPublicRuntimeConfig } from '@/lib/community/public-runtime-config';

export async function getAuthUser(): Promise<{ id: string; email?: string } | null> {
  const config = getPublicRuntimeConfig();
  if (!config) return null;

  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(config.url, config.anonKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* read-only in API routes */ },
      },
    });
    const { data: { user } } = await supabase.auth.getUser();

    if (user) return { id: user.id, email: user.email ?? undefined };

    return null;
  } catch {
    console.error('[api-auth] getAuthUser failed');
    return null;
  }
}

export function unauthorizedResponse() {
  return Response.json({ error: '请先登录' }, { status: 401 });
}
