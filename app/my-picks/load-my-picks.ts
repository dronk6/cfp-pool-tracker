import { unstable_rethrow } from "next/navigation";
import { buildPicksView, toTeamOptions, type PicksView, type TeamOption } from "../../lib/picks-view";
import { getSessionSubmission } from "../../lib/submissions/submission";
import { getTeams } from "../../lib/teams";

export type MyPicksResult =
  | { kind: "ok"; view: PicksView; teams: TeamOption[]; initialTop12: number[] }
  | { kind: "signed-out" }
  | { kind: "no-submission" }
  | { kind: "error" };

/**
 * Loads the session user's picks for `year`. Submission first, then teams, one
 * after the other so two token refreshes never race, and teams are skipped when
 * there is nothing to show. A failed session check counts as signed out
 * (fail closed). What leaves this function is the view, the team options and
 * the user's own initial top 12 ids (the browser counts moves against them);
 * no user id, email, timestamps or initial First Three Out.
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
      teams: toTeamOptions(teams.teams),
      initialTop12: session.submission.initialPlayoff,
    };
  } catch (error) {
    // Let Next.js's own control-flow errors (e.g. request-time bailouts) through.
    unstable_rethrow(error);
    // Log the name only: the message could carry row data.
    console.error("my-picks: load failed", error instanceof Error ? error.name : "unknown");
    return { kind: "error" };
  }
}
