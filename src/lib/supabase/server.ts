import { createNativeServerClient } from '@/lib/native-client/server';
import { isNativeDatabase } from '@/lib/database-backend';
// Supabase — Server Client
// Used in server components, API routes, and server actions.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// TODO: Add typed database schema once tables are created
// TODO: Add service role client for admin operations

export async function createClient() {
  if (isNativeDatabase()) return createNativeServerClient();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
