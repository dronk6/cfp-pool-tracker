import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../supabase/server";
import type { Season } from "./edit-window";

/**
 * The edit window for `year`, or null if there is no `seasons` row. `seasons`
 * is readable only when signed in, so the client must carry a session (the
 * default one does). Throws if the lookup fails, so callers can tell "no
 * season" from "couldn't look".
 */
export async function getSeason(year: number, client?: SupabaseClient): Promise<Season | null> {
  const supabase = client ?? (await createSupabaseServerClient());
  const { data, error } = await supabase
    .from("seasons")
    .select("year, edit_opens_at, edit_closes_at")
    .eq("year", year)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { year: data.year, editOpensAt: data.edit_opens_at, editClosesAt: data.edit_closes_at };
}
