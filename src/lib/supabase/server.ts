// Supabase — Server Client
// Used in server components, API routes, and server actions.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicRuntimeConfig } from "@/lib/community/public-runtime-config";

// TODO: Add typed database schema once tables are created
// TODO: Add service role client for admin operations

export async function createClient() {
  const cookieStore = await cookies();
  const config = getPublicRuntimeConfig();
  if (!config) throw new Error('supabase_unavailable');

  return createServerClient(
    config.url,
    config.anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method is called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}
