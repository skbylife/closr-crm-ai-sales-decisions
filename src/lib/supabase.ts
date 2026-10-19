// Server-only Supabase service-role client. Browser auth uses supabase/client.ts.

import 'server-only';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { getPublicRuntimeConfig } from '@/lib/community/public-runtime-config';

// Use generic database type (no generated types yet)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, 'public', any>;

// Singleton admin client (service role key, for API routes only — bypasses RLS)
let _adminClient: AnySupabaseClient | null = null;

export function getSupabaseAdmin(): AnySupabaseClient | null {
  const config = getPublicRuntimeConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !serviceRoleKey) return null;
  if (!_adminClient) {
    _adminClient = createSupabaseClient(config.url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _adminClient;
}
