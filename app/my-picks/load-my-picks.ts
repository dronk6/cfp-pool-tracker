import { unstable_rethrow } from "next/navigation";
import { now } from "../../lib/clock";
import { buildPicksView, type PicksView } from "../../lib/picks-view";
import { buildEditDisabledReason, lookupFailedReason } from "../../lib/seasons/edit-access";
import { getSeason } from "../../lib/seasons/get-season";
import { getSessionSubmission } from "../../lib/submissions/submission";
import { getTeams } from "../../lib/teams";

export type MyPicksResult =
  | { kind: "ok"; view: PicksView; editDisabledReason: string | null }
  | { kind: "signed-out" }
  | { kind: "no-submission" }
  | { kind: "error" };

/**
 * Loads the session user's picks for `year`. Submission first, then teams, one
 * after the other so two token refreshes never race, and teams are skipped when
 * there is nothing to show. A failed session check counts as signed out
 * (fail closed). Only `view` and the edit-window message leave this function:
 * no user id, email, initial picks or window timestamps.
 */
export async function loadMyPicks(year: number): Promise<MyPicksResult> {
  try {
    const session = await getSessionSubmission(year);
    if (!session.signedIn) return { kind: "signed-out" };
    if (!session.submission) return { kind: "no-submission" };

    const teams = await getTeams();
    if (!teams.signedIn) return { kind: "signed-out" };

    return {
      kind: "ok",
      view: buildPicksView(session.submission, teams.teams),
      editDisabledReason: await loadEditDisabledReason(year),
    };
  } catch (error) {
    // Let Next.js's own control-flow errors (e.g. request-time bailouts) through.
    unstable_rethrow(error);
    // Log the name only: the message could carry row data.
    console.error("my-picks: load failed", error instanceof Error ? error.name : "unknown");
    return { kind: "error" };
  }
}

/**
 * Why editing is unavailable right now, or null inside the window. The clock
 * is read only after the request-scoped reads (session, teams, season), because
 * Cache Components rejects reading the time before a request read. A failed
 * lookup degrades to a message so the picks still show. If the session lapses
 * between getTeams and getSeason, RLS makes getSeason return null and the
 * "Contact Tyler" message shows: still fail-closed, and the window is tiny.
 */
async function loadEditDisabledReason(year: number): Promise<string | null> {
  try {
    const season = await getSeason(year);
    return buildEditDisabledReason(season, now());
  } catch (error) {
    unstable_rethrow(error);
    console.error("my-picks: edit window lookup failed", error instanceof Error ? error.name : "unknown");
    return lookupFailedReason();
  }
}
