import { createSupabaseServerClient } from "./supabase/server";

// snake_case to match the database and lib/validation's Team, so the array
// can go straight into validatePicks.
export type Team = {
  id: number;
  name: string;
  conference: string;
  is_power_conf: boolean;
  image_url: string | null;
};

export type SessionTeams = { signedIn: false } | { signedIn: true; teams: Team[] };

/**
 * Every team, sorted by name, for a signed-in user. The only check is a
 * verified session (no `profiles` row needed). Throws if the lookup fails, so
 * callers can tell "signed out" from "couldn't look". Never cached: the
 * session decides who may see the list.
 */
export async function getTeams(): Promise<SessionTeams> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { signedIn: false };

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id,name,conference,is_power_conf,image_url")
    .order("name")
    .order("id");
  if (teamsError) throw teamsError;

  return { signedIn: true, teams };
}
