import { isNativeDatabase } from '@/lib/database-backend';
// Supabase — Auth Middleware
// Refreshes the auth session on every request and protects routes.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isExpectedMissingSessionError(error: { message?: string; status?: number }) {
  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("auth session missing") ||
    message.includes("session missing") ||
    message.includes("no session")
  );
}

export async function updateSession(request: NextRequest) {
  // Native opaque sessions are validated by every protected API handler.
  if (isNativeDatabase()) return NextResponse.next({ request });
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the auth token — this keeps cookies fresh but does NOT gate access.
  // Route protection is handled client-side by AuthProvider + dashboard layout.
  // Doing redirects here causes full-page reloads on transient auth errors.
  try {
    const { error } = await supabase.auth.getUser();
    if (error) {
      const isExpectedMissingSession = isExpectedMissingSessionError(error);
      if (!isExpectedMissingSession) {
        console.warn("[middleware] auth.getUser error:", error.message);
      }
      // On invalid refresh token, sign out to clear bad cookies
      if (error.message.includes("Refresh Token") || error.status === 401 || error.status === 403) {
        await supabase.auth.signOut();
      }
    }
  } catch (e) {
    console.error("[middleware] auth.getUser unexpected error:", e);
  }

  return supabaseResponse;
}
