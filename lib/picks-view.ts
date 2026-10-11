import type { Submission } from "./submissions/submission";
import type { Team } from "./teams";
import type { Team as ValidationTeam } from "./validation";

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

function toTeamView(teamId: number, teamsById: ReadonlyMap<number, TeamOption>): TeamView {
  const team = teamsById.get(teamId);
  return {
    teamId,
    name: team ? team.name : `Unknown team (#${teamId})`,
    imageUrl: team?.imageUrl ?? null,
  };
}

function toPickView(rank: number, teamId: number, teamsById: ReadonlyMap<number, TeamOption>): PickView {
  return { rank, ...toTeamView(teamId, teamsById) };
}

/** The pick fields a view is built from: a submission's current picks, or a PUT response. */
export type CurrentPicks = Pick<Submission, "currentPlayoff" | "currentTiebreakers" | "championId">;

/**
 * Turns current picks into display rows. Ranks run 1-12 for the playoff, then
 * continue 13-15 for the tiebreakers. Never throws on a team id missing from
 * `teams`.
 */
export function viewFromPicks(picks: CurrentPicks, teams: readonly TeamOption[]): PicksView {
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  return {
    playoff: picks.currentPlayoff.map((id, i) => toPickView(i + 1, id, teamsById)),
    tiebreakers: picks.currentTiebreakers.map((id, i) => toPickView(PLAYOFF_SIZE + i + 1, id, teamsById)),
    champion: picks.championId === null ? null : toTeamView(picks.championId, teamsById),
  };
}

/** Turns a submission's current picks into display rows (see `viewFromPicks`). */
export function buildPicksView(submission: Submission, teams: Team[]): PicksView {
  return viewFromPicks(submission, toTeamOptions(teams));
}

/**
 * What the edit view needs to know about a team: the selectors use the id,
 * name and logo, and `toValidationTeams` uses the rest. Nothing else goes to
 * the browser. camelCase, unlike the database's `Team`.
 */
export type TeamOption = {
  id: number;
  name: string;
  imageUrl: string | null;
  conference: string;
  isPowerConf: boolean;
};

/** The part of a team the selectors need. */
export type TeamChoice = Pick<TeamOption, "id" | "name">;

/** Strips every column but the ones the browser uses; keeps the given order. */
export function toTeamOptions(teams: Team[]): TeamOption[] {
  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    imageUrl: team.image_url,
    conference: team.conference,
    isPowerConf: team.is_power_conf,
  }));
}

/** The snake_case shape `validatePicks` expects. */
export function toValidationTeams(options: readonly TeamOption[]): ValidationTeam[] {
  return options.map((team) => ({
    id: team.id,
    name: team.name,
    conference: team.conference,
    is_power_conf: team.isPowerConf,
  }));
}
