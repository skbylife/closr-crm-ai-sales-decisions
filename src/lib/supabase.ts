// Supabase — Unified Client
// Browser client uses @supabase/ssr for cookie-based auth (RLS compatible).
// Server admin client uses service role key.

import { createNativeBrowserClient } from '@/lib/native-client/browser';
import { isNativeDatabase } from '@/lib/database-backend';
import { createBrowserClient } from '@supabase/ssr';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Check if Supabase is configured
export const isSupabaseConfigured = isNativeDatabase() || Boolean(supabaseUrl && supabaseAnonKey);

// Use generic database type (no generated types yet)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, 'public', any>;

// Singleton browser client (anon key, cookie-based auth for RLS)
let _client: AnySupabaseClient | null = null;

export function getSupabase(): AnySupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (typeof window === 'undefined') return null; // Server-side: don't use browser client
  if (isNativeDatabase()) return createNativeBrowserClient() as AnySupabaseClient;
  if (!_client) {
    _client = createBrowserClient(supabaseUrl!, supabaseAnonKey!) as AnySupabaseClient;
  }
  return _client;
}

// Singleton admin client (service role key, for API routes only — bypasses RLS)
let _adminClient: AnySupabaseClient | null = null;

export function getSupabaseAdmin(): AnySupabaseClient | null {
  // Browser/shared callers never receive a privileged native database connection.
  // Server callers use the separate supabase/admin module.
  if (isNativeDatabase()) return null;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  if (!_adminClient) {
    _adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _adminClient;
}
