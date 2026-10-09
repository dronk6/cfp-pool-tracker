import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthCookieOptions, getSupabaseEnv } from "./config";

/**
 * Refreshes the Supabase session on each request: getUser() validates the
 * access token and, when it is near expiry, refreshes it. Refreshed cookies go
 * onto the request (so Server Components in this same request see the new
 * session) and onto the response (so the browser keeps it).
 *
 * This does not gate or redirect. It fails open: if Supabase is unreachable or
 * misconfigured the request continues and pages treat the visitor as signed
 * out, rather than the whole site returning errors.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
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
    await supabase.auth.getUser();
    return response;
  } catch (error) {
    console.error("Session refresh failed; continuing without it:", error);
    return NextResponse.next({ request });
  }
}
