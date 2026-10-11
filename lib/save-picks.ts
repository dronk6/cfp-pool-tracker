import type { PicksDraft } from "./edit-picks";
import { formatEt } from "./seasons/edit-access";
import { PLAYOFF_SIZE, toValidationTeams, type CurrentPicks, type TeamOption } from "./picks-view";
import { validatePicks, type Violation } from "./validation";

const TIEBREAKER_SIZE = 3;

export type SaveOutcome =
  /** `picks` is what the server stored, read from the PUT response. */
  | { kind: "saved"; picks: CurrentPicks }
  /** The draft broke a rule. Nothing was sent. */
  | { kind: "invalid"; violations: Violation[] }
  /** The save did not go through (or its result is unknown); the message is safe to show. */
  | { kind: "failed"; message: string; loginLink?: boolean };

export type SaveFetch = (input: string, init: RequestInit) => Promise<Response>;

type PicksBody = { currentPlayoff: number[]; currentTiebreakers: number[]; championId: number };

/** The exact PUT body, or null if any slot or the champion is blank. */
export function toPicksBody(draft: PicksDraft): PicksBody | null {
  const { playoff, tiebreakers, championId } = draft;
  if (championId === null || playoff.includes(null) || tiebreakers.includes(null)) return null;
  return { currentPlayoff: playoff as number[], currentTiebreakers: tiebreakers as number[], championId };
}

const isIdList = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) && value.length === length && value.every((id) => Number.isInteger(id));

function readPicks(body: unknown): CurrentPicks | null {
  if (typeof body !== "object" || body === null) return null;
  const { currentPlayoff, currentTiebreakers, championId } = body as Record<string, unknown>;
  if (!isIdList(currentPlayoff, PLAYOFF_SIZE) || !isIdList(currentTiebreakers, TIEBREAKER_SIZE)) return null;
  if (typeof championId !== "number" || !Number.isInteger(championId)) return null;
  return { currentPlayoff, currentTiebreakers, championId };
}

const UNCHANGED = "Your saved picks weren't changed.";
export const UNREACHABLE_MESSAGE =
  "Couldn't reach the server. Your picks may not have been saved. Try again or reload to check.";
export const UNUSABLE_RESPONSE_MESSAGE =
  "Your picks may have been saved, but the server's answer was unreadable. Reload the page to check.";

type ErrorMessage = { message: string; loginLink?: boolean };

/**
 * Maps a failed PUT to a message for the user. Only the status and the
 * error code decide the text; raw server strings are never shown.
 */
export function messageForError(status: number, body: unknown, year: number): ErrorMessage {
  const code = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
  if (status === 401) {
    return { message: "You're signed out. Log in again to save. Anything you've changed here will be lost.", loginLink: true };
  }
  if (status === 403) {
    const { editOpensAt, editClosesAt } = (body ?? {}) as { editOpensAt?: unknown; editClosesAt?: unknown };
    if (typeof editOpensAt === "string" && typeof editClosesAt === "string") {
      return {
        message: `Your picks weren't saved. Editing is open from ${formatEt(editOpensAt)} until ${formatEt(editClosesAt)}. ${UNCHANGED}`,
      };
    }
    return { message: `Editing isn't open for this season. ${UNCHANGED}` };
  }
  if (status === 404) return { message: `We couldn't find your ${year} picks. Contact Tyler.` };
  if (status === 400 && code === "invalid-body") {
    return {
      message: `The server rejected these picks. Check that every slot and the champion hold real teams, then try again. ${UNCHANGED}`,
    };
  }
  if (status === 415) return { message: "Something went wrong sending your picks. Reload and try again." };
  return { message: `Something went wrong on our side. ${UNCHANGED} Try again.` };
}

type SaveArgs = {
  draft: PicksDraft;
  /** The user's initial top 12; moves are counted against it, never against the last save. */
  initialTop12: readonly number[];
  teams: readonly TeamOption[];
  year: number;
  fetchFn?: SaveFetch;
};

/**
 * Validates the draft and, only if it is clean, PUTs it. Validation lives in
 * the client (the server checks just the body's shape), so a draft with any
 * violation is never sent. Never throws: every outcome is a SaveOutcome.
 */
export async function savePicks({ draft, initialTop12, teams, year, fetchFn = fetch }: SaveArgs): Promise<SaveOutcome> {
  const violations = validatePicks({
    initialTop12,
    newTop12: draft.playoff,
    newTiebreakers: draft.tiebreakers,
    championId: draft.championId,
    teams: toValidationTeams(teams),
  });
  if (violations.length > 0) return { kind: "invalid", violations };

  const body = toPicksBody(draft);
  // Unreachable once validation passes; kept so a blank slot can never be sent.
  if (!body) return { kind: "failed", message: "Something went wrong preparing your picks. Reload and try again." };

  let response: Response;
  try {
    response = await fetchFn(`/api/submissions/${year}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "failed", message: UNREACHABLE_MESSAGE };
  }

  let responseBody: unknown = null;
  try {
    responseBody = await response.json();
  } catch {
    // Handled below by status.
  }

  if (response.status === 200) {
    const picks = readPicks(responseBody);
    return picks ? { kind: "saved", picks } : { kind: "failed", message: UNUSABLE_RESPONSE_MESSAGE };
  }
  return { kind: "failed", ...messageForError(response.status, responseBody, year) };
}
