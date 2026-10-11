import type { Submission } from "./submissions/submission";
import type { Team } from "./teams";

export type TeamView = {
  teamId: number;
  name: string;
  /** Null for a team id that isn't in `teams`, so the row still renders. */
  imageUrl: string | null;
};

export type PickView = TeamView & { rank: number };

export type PicksView = {
  playoff: PickView[];
  tiebreakers: PickView[];
  champion: TeamView | null;
};

export const PLAYOFF_SIZE = 12;

function toTeamView(teamId: number, teamsById: Map<number, Team>): TeamView {
  const team = teamsById.get(teamId);
  return {
    teamId,
    name: team ? team.name : `Unknown team (#${teamId})`,
    imageUrl: team?.image_url ?? null,
  };
}

function toPickView(rank: number, teamId: number, teamsById: Map<number, Team>): PickView {
  return { rank, ...toTeamView(teamId, teamsById) };
}

/**
 * Turns a submission's current picks into display rows. Ranks run 1-12 for
 * the playoff, then continue 13-15 for the tiebreakers. Never throws on a
 * team id missing from `teams`.
 */
export function buildPicksView(submission: Submission, teams: Team[]): PicksView {
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  return {
    playoff: submission.currentPlayoff.map((id, i) => toPickView(i + 1, id, teamsById)),
    tiebreakers: submission.currentTiebreakers.map((id, i) =>
      toPickView(PLAYOFF_SIZE + i + 1, id, teamsById),
    ),
    champion: submission.championId === null ? null : toTeamView(submission.championId, teamsById),
  };
}
