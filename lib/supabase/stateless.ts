import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./config";

/**
 * Supabase client that reads and writes no cookies and keeps no session. For
 * calls that don't need the caller's session, such as requesting a login
 * code: with the cookie-backed client, signInWithOtp leaves PKCE
 * "code-verifier" cookies behind, which the code-entry flow never uses.
 */
export function createSupabaseStatelessClient() {
  const { url, publishableKey } = getSupabaseEnv();
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
