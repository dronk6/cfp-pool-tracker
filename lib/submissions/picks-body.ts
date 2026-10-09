// Sizes duplicated from lib/validation.ts on purpose: this is a shape check,
// not pick validation, and it shouldn't change when the rules do.
const PLAYOFF_SIZE = 12;
const TIEBREAKER_SIZE = 3;
const MAX_INT4 = 2_147_483_647;

export type PicksBody = {
  currentPlayoff: number[];
  currentTiebreakers: number[];
  championId: number;
};

const BODY_KEYS = ["championId", "currentPlayoff", "currentTiebreakers"];

const isTeamId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_INT4;

const isIdList = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) && value.length === length && value.every(isTeamId);

/**
 * Checks only the shape of a PUT body: exactly the three pick fields, lists of
 * 12 and 3 positive int4 ids, and a required champion id. Pick contents (G6,
 * move limit, champion in the top 12, ...) are deliberately not checked; the
 * client does that. Unknown keys are rejected so that a body can never name a
 * user, year or initial picks. Returns null if the shape is wrong.
 */
export function parsePicksBody(body: Record<string, unknown>): PicksBody | null {
  const keys = Object.keys(body).sort();
  if (keys.length !== BODY_KEYS.length || keys.some((key, i) => key !== BODY_KEYS[i])) return null;

  const { currentPlayoff, currentTiebreakers, championId } = body;
  if (!isIdList(currentPlayoff, PLAYOFF_SIZE)) return null;
  if (!isIdList(currentTiebreakers, TIEBREAKER_SIZE)) return null;
  if (!isTeamId(championId)) return null;
  return { currentPlayoff, currentTiebreakers, championId };
}
