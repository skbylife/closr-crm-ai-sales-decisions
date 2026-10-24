import { createNativeBrowserClient } from '@/lib/native-client/browser';
import { isNativeDatabase } from '@/lib/database-backend';
// Supabase — Browser Client
// Used in client components for real-time subscriptions and auth state.

import { createBrowserClient } from "@supabase/ssr";

// TODO: Add typed database schema once tables are created
// TODO: Add real-time channel subscriptions for inbox updates

export function createClient() {
  if (isNativeDatabase()) return createNativeBrowserClient();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
