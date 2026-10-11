import { POWER_CONFERENCES } from "./conferences";
import { countMoves } from "./moves";

export const MAX_MOVES = 3;

export interface Team {
  id: number;
  name: string;
  conference: string;
  is_power_conf: boolean;
}

export type ViolationRule = "shape" | "unknown-team" | "duplicate" | "overlap" | "g6-required" | "power-four-required" | "champion-required" | "champion-not-in-top-12" | "move-limit";

export interface Violation {
  rule: ViolationRule;
  message: string;
  teamIds?: number[];
}

export interface PicksInput {
  initialTop12: readonly number[];
  /** A blank slot is `null`. */
  newTop12: readonly (number | null)[];
  /** The new First Three Out; a blank slot is `null`. */
  newTiebreakers: readonly (number | null)[];
  championId: number | null;
  teams: readonly Team[];
}

const TOP_12_SIZE = 12;
const TIEBREAKER_SIZE = 3;

/**
 * Checks a user's new picks against the rules in "Validation Rules" in
 * Planning/design-document.md. Returns every violation found, in rule order;
 * an empty list means the picks are valid. Never throws on malformed input.
 */
export function validatePicks(input: PicksInput): Violation[] {
  const { newTop12, newTiebreakers, championId, teams } = input;
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const nameOf = (id: number) => teamsById.get(id)?.name ?? `Team ${id}`;

  return [
    ...checkShape(newTop12, newTiebreakers),
    ...checkUnknownTeams(newTop12, newTiebreakers, championId, teamsById),
    ...checkDuplicates(newTop12, "top 12", nameOf),
    ...checkDuplicates(newTiebreakers, "First Three Out", nameOf),
    ...checkOverlap(newTop12, newTiebreakers, nameOf),
    ...checkGroupOfSix(newTop12, teamsById),
    ...checkPowerFour(newTop12, teamsById),
    ...checkChampion(newTop12, championId, nameOf),
    ...checkMoveLimit(input.initialTop12, newTop12, teamsById),
  ];
}

function checkShape(
  top12: readonly (number | null)[],
  tiebreakers: readonly (number | null)[],
): Violation[] {
  const violations: Violation[] = [];
  if (top12.length !== TOP_12_SIZE) {
    violations.push({
      rule: "shape",
      message: `The top 12 must have exactly ${TOP_12_SIZE} teams (you have ${top12.length}).`,
    });
  }
  if (tiebreakers.length !== TIEBREAKER_SIZE) {
    violations.push({
      rule: "shape",
      message: `The First Three Out must have exactly ${TIEBREAKER_SIZE} teams (you have ${tiebreakers.length}).`,
    });
  }
  // The First Three Out continues the slot numbering after the top 12, as in the UI.
  const emptySlot = (slot: number) => ({
    rule: "shape" as const,
    message: `Slot ${slot} is empty. Pick a team for every slot.`,
  });
  top12.forEach((id, index) => {
    if (id === null) violations.push(emptySlot(index + 1));
  });
  tiebreakers.forEach((id, index) => {
    if (id === null) violations.push(emptySlot(TOP_12_SIZE + index + 1));
  });
  return violations;
}

function checkUnknownTeams(
  top12: readonly (number | null)[],
  tiebreakers: readonly (number | null)[],
  championId: number | null,
  teamsById: ReadonlyMap<number, Team>,
): Violation[] {
  const unknownIds = new Set<number>();
  for (const id of [...top12, ...tiebreakers, championId]) {
    if (id !== null && !teamsById.has(id)) unknownIds.add(id);
  }
  return [...unknownIds].map((id) => ({
    rule: "unknown-team",
    message: `Team ID ${id} is not a recognized team.`,
    teamIds: [id],
  }));
}

function checkDuplicates(
  slots: readonly (number | null)[],
  listName: string,
  nameOf: (id: number) => string,
): Violation[] {
  const seen = new Set<number>();
  const repeated = new Set<number>();
  for (const id of slots) {
    if (id === null) continue;
    if (seen.has(id)) repeated.add(id);
    seen.add(id);
  }
  return [...repeated].map((id) => ({
    rule: "duplicate",
    message: `${nameOf(id)} appears more than once in the ${listName}.`,
    teamIds: [id],
  }));
}

function checkOverlap(
  top12: readonly (number | null)[],
  tiebreakers: readonly (number | null)[],
  nameOf: (id: number) => string,
): Violation[] {
  const inTop12 = new Set(top12);
  const overlapping = new Set(tiebreakers.filter((id): id is number => id !== null && inTop12.has(id)));
  return [...overlapping].map((id) => ({
    rule: "overlap",
    message: `${nameOf(id)} can't be in both the top 12 and the First Three Out.`,
    teamIds: [id],
  }));
}

// Skipped until every slot holds a known team, so an unfinished or malformed
// list doesn't also get a misleading "no non-power team" complaint.
function checkGroupOfSix(
  top12: readonly (number | null)[],
  teamsById: ReadonlyMap<number, Team>,
): Violation[] {
  if (top12.length !== TOP_12_SIZE) return [];
  const picked: Team[] = [];
  for (const id of top12) {
    const team = id === null ? undefined : teamsById.get(id);
    if (!team) return [];
    picked.push(team);
  }
  if (picked.some((team) => !team.is_power_conf)) return [];
  return [
    {
      rule: "g6-required",
      message:
        "The top 12 must include at least one team from a non-power conference (Notre Dame counts as a power-conference team; UConn does not).",
    },
  ];
}

// Skipped under the same conditions as the G6 rule: a blank or unknown slot
// might be where the missing conference's team was going to go.
function checkPowerFour(
  top12: readonly (number | null)[],
  teamsById: ReadonlyMap<number, Team>,
): Violation[] {
  if (top12.length !== TOP_12_SIZE) return [];
  const conferences = new Set<string>();
  for (const id of top12) {
    const team = id === null ? undefined : teamsById.get(id);
    if (!team) return [];
    conferences.add(team.conference);
  }
  const missing = POWER_CONFERENCES.filter((conference) => !conferences.has(conference));
  if (missing.length === 0) return [];
  return [
    {
      rule: "power-four-required",
      message: `Your top 12 needs at least one team from each Power Four conference. Missing: ${missing.join(", ")}.`,
    },
  ];
}

function checkChampion(
  top12: readonly (number | null)[],
  championId: number | null,
  nameOf: (id: number) => string,
): Violation[] {
  if (championId === null) {
    return [{ rule: "champion-required", message: "Choose a champion." }];
  }
  if (top12.includes(championId)) return [];
  return [
    {
      rule: "champion-not-in-top-12",
      message: `${nameOf(championId)} is your champion, but isn't in your top 12. Choose a champion from your top 12.`,
      teamIds: [championId],
    },
  ];
}

// countMoves assumes 12 distinct ids, so malformed lists skip this rule; the
// shape, unknown-team and duplicate rules already explain what to fix.
function checkMoveLimit(
  initialTop12: readonly number[],
  newTop12: readonly (number | null)[],
  teamsById: ReadonlyMap<number, Team>,
): Violation[] {
  const ids = newTop12.filter((id): id is number => id !== null && teamsById.has(id));
  if (ids.length !== TOP_12_SIZE || new Set(ids).size !== TOP_12_SIZE) return [];

  const moves = countMoves(initialTop12, ids);
  if (moves <= MAX_MOVES) return [];
  return [
    {
      rule: "move-limit",
      message: `You've used ${moves} moves, but the limit is ${MAX_MOVES}. Replacing a team counts as 1 move each, and reordering your remaining teams counts as 1 move in total.`,
    },
  ];
}
