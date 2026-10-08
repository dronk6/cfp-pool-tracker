export interface Team {
  id: number;
  name: string;
  is_power_conf: boolean;
}

export type ViolationRule = "shape" | "unknown-team" | "duplicate";

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
