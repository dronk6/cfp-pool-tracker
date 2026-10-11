import { now } from "../clock";
import { isEditWindowOpen, type Season } from "../seasons/edit-window";
import { getSeason } from "../seasons/get-season";
import { createSupabaseServerClient } from "../supabase/server";
import type { PicksBody } from "./picks-body";
import { SUBMISSION_COLUMNS, toSubmission, type Submission, type SubmissionRow } from "./submission";

export type UpdateResult =
  | { status: "unauthenticated" }
  | { status: "outside-window"; season: Season | null }
  | { status: "invalid-champion" }
  | { status: "not-found" }
  | { status: "updated"; submission: Submission };

const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Overwrites the session user's current picks for `year`, if the edit window
 * is open. The user comes from the verified session only, and the update names
 * its four columns explicitly (never spread from the request), so `initial_*`,
 * `user_id` and `year` can't be written. Runs as the user (publishable key),
 * so RLS and column privileges back up these checks.
 *
 * `invalid-champion` means the champion id isn't a team. Throws on any other
 * database failure.
 */
export async function updateSessionSubmission(year: number, picks: PicksBody): Promise<UpdateResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { status: "unauthenticated" };

  const season = await getSeason(year, supabase);
  // One instant for both the window check and `updated_at`. Read after the
  // session (a request read) so it is never taken during prerendering.
  const at = now();
  if (!season || !isEditWindowOpen(season, at)) return { status: "outside-window", season };

  const { data: row, error: updateError } = await supabase
    .from("submissions")
    .update({
      current_playoff: picks.currentPlayoff,
      current_tiebreakers: picks.currentTiebreakers,
      champion_id: picks.championId,
      updated_at: at.toISOString(),
    })
    .eq("user_id", data.user.id)
    .eq("year", year)
    .select(SUBMISSION_COLUMNS)
    .maybeSingle();
  if (updateError) {
    if (updateError.code === FOREIGN_KEY_VIOLATION) return { status: "invalid-champion" };
    throw updateError;
  }
  if (!row) return { status: "not-found" };

  return { status: "updated", submission: toSubmission(row as SubmissionRow) };
}
