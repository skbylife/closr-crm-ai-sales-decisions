// Server-only database adapter. Browser modules must import ../supabase instead.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createNativeServerClient } from '@/lib/native-client/server';
import { isNativeDatabase } from '@/lib/database-backend';

let admin: SupabaseClient | null = null;
export function getSupabaseAdmin(): SupabaseClient | null {
  if (typeof window !== 'undefined') return null;
  if (isNativeDatabase()) {
    if (!process.env.DATABASE_URL) return null;
    return admin ??= createNativeServerClient(true);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return admin ??= createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
