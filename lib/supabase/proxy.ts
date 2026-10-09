import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthCookieOptions, getSupabaseEnv } from "./config";

/**
 * Refreshes the Supabase session on each request: getUser() validates the
 * access token and, when it is near expiry, refreshes it. Refreshed cookies go
 * onto the request (so Server Components in this same request see the new
 * session) and onto the response (so the browser keeps it).
 *
 * This does not gate or redirect; the caller decides what to do with `user`.
 * It fails open: if Supabase is unreachable or misconfigured the request
 * continues with `user: null`, so "signed out" and "could not tell" look the
 * same here. Callers that gate a page must treat null as no access.
 */
export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; user: User | null }> {
  let response = NextResponse.next({ request });

  try {
    const { url, publishableKey } = getSupabaseEnv();
    const supabase = createServerClient(url, publishableKey, {
      cookieOptions: getAuthCookieOptions(),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          // Cache headers that keep a CDN from sharing one user's cookies with another.
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    });
    const { data, error } = await supabase.auth.getUser();
    return { response, user: error ? null : data.user };
  } catch (error) {
    console.error("Session refresh failed; continuing without it:", error);
    return { response: NextResponse.next({ request }), user: null };
  }
}
