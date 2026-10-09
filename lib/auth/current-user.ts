import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../supabase/server";

/**
 * The signed-in user for this request, or null. Uses getUser(), which
 * re-validates the token with Supabase, rather than getSession(), which
 * trusts the cookie as sent.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
