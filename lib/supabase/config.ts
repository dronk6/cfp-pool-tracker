import type { CookieOptionsWithName } from "@supabase/ssr";

export type SupabaseEnv = { url: string; publishableKey: string };

/**
 * Read at call time, never at import time: the build and CI run with no
 * environment variables, so importing this module must not throw.
 */
export function getSupabaseEnv(): SupabaseEnv {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set (see .env.example)");
  }
  return { url, publishableKey };
}

/**
 * @supabase/ssr defaults to httpOnly: false and sets no `secure` flag (checked
 * in 0.12.7). We have no browser client, so client-side JavaScript never needs
 * the session cookies and they are made HttpOnly. `secure` is off outside
 * production so sign-in works over http://localhost.
 */
export function getAuthCookieOptions(): CookieOptionsWithName {
  return {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };
}
