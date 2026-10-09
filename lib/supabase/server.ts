import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAuthCookieOptions, getSupabaseEnv } from "./config";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions,
 * carrying the caller's session from the request cookies. Create one per
 * request; never share it between requests.
 */
export async function createSupabaseServerClient() {
  // Read cookies first: it makes every caller request-time, so a build with no
  // env vars fails here (at runtime) instead of baking a signed-out page or a
  // static response into the output.
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseEnv();

  return createServerClient(url, publishableKey, {
    cookieOptions: getAuthCookieOptions(),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components can't set cookies. That is fine: proxy.ts
          // refreshes the session and writes the cookies on every request.
        }
      },
    },
  });
}
