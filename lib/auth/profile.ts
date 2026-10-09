import { createSupabaseServerClient } from "../supabase/server";

export type Profile = { name: string; email: string };

export type SessionProfile = { signedIn: false } | { signedIn: true; profile: Profile | null };

/**
 * Who is asking, from the verified session only (nothing is read from the
 * request). `profile` is null for a signed-in user with no `profiles` row.
 * Throws if the profile lookup fails, so callers can tell "no profile" from
 * "couldn't look".
 */
export async function getSessionProfile(): Promise<SessionProfile> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { signedIn: false };

  const { data: row, error: profileError } = await supabase
    .from("profiles")
    .select("name, email")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  return { signedIn: true, profile: row ? { name: row.name, email: row.email } : null };
}
