import { isNativeDatabase } from '@/lib/database-backend';
import { getNativeUser } from '@/lib/native-auth/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function getAuthUser(): Promise<{ id: string; email?: string } | null> {
  if (isNativeDatabase()) {
    const user = await getNativeUser();
    return user ? { id: user.id, email: user.email } : null;
  }
  if (!supabaseUrl || !supabaseAnonKey) return null;

  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* read-only in API routes */ },
      },
    });
    const { data: { user } } = await supabase.auth.getUser();

    if (user) return { id: user.id, email: user.email ?? undefined };

    return null;
  } catch (e) {
    console.error('[api-auth] getAuthUser failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

export function unauthorizedResponse() {
  return Response.json({ error: '请先登录' }, { status: 401 });
}
