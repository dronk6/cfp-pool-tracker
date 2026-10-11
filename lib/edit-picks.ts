import { PLAYOFF_SIZE, type PicksView } from "./picks-view";

export const TIEBREAKER_SIZE = 3;
export const TOTAL_SLOTS = PLAYOFF_SIZE + TIEBREAKER_SIZE;

/**
 * The edit view's working copy of the picks. The shape feeds `validatePicks`
 * directly (a blank slot is `null`).
 */
export type PicksDraft = {
  playoff: (number | null)[];
  tiebreakers: (number | null)[];
  championId: number | null;
};

function fixedLength(ids: readonly number[], size: number): (number | null)[] {
  const slots: (number | null)[] = ids.slice(0, size);
  while (slots.length < size) slots.push(null);
  return slots;
}

/**
 * Starts a draft from the saved picks. Pads with blanks (or trims) to 12 and 3
 * because the database doesn't constrain the array lengths.
 */
export function draftFromView(view: PicksView): PicksDraft {
  const playoff = fixedLength(
    view.playoff.map((pick) => pick.teamId),
    PLAYOFF_SIZE,
  );
  const savedChampion = view.champion?.teamId ?? null;
  return {
    playoff,
    tiebreakers: fixedLength(
      view.tiebreakers.map((pick) => pick.teamId),
      TIEBREAKER_SIZE,
    ),
    // The database doesn't require the champion to be in the top 12; start blank if it isn't.
    championId: savedChampion !== null && playoff.includes(savedChampion) ? savedChampion : null,
  };
}

/** The team in slot 1-15 (13-15 are the First Three Out), or null for a blank or bad slot. */
export function teamInSlot(draft: PicksDraft, slot: number): number | null {
  if (slot <= PLAYOFF_SIZE) return draft.playoff[slot - 1] ?? null;
  return draft.tiebreakers[slot - PLAYOFF_SIZE - 1] ?? null;
}

export type SlotChange = {
  draft: PicksDraft;
  /** True when this change dropped the champion out of the top 12 and cleared it. */
  championCleared: boolean;
};

/**
 * Puts `teamId` (null to blank it) in slot 1-15. If that removes the champion
 * from the top 12, the champion is cleared; it is never restored automatically.
 */
export function setSlot(draft: PicksDraft, slot: number, teamId: number | null): SlotChange {
  if (!Number.isInteger(slot) || slot < 1 || slot > TOTAL_SLOTS) {
    throw new RangeError(`Slot must be 1-${TOTAL_SLOTS}`);
  }
  const playoff = [...draft.playoff];
  const tiebreakers = [...draft.tiebreakers];
  if (slot <= PLAYOFF_SIZE) playoff[slot - 1] = teamId;
  else tiebreakers[slot - PLAYOFF_SIZE - 1] = teamId;

  const champion = draft.championId;
  const championCleared =
    champion !== null && draft.playoff.includes(champion) && !playoff.includes(champion);
  return {
    draft: { playoff, tiebreakers, championId: championCleared ? null : draft.championId },
    championCleared,
  };
}

/** Sets the champion. Choosing one outside the top 12 is ignored. */
export function setChampion(draft: PicksDraft, championId: number | null): PicksDraft {
  if (championId !== null && !draft.playoff.includes(championId)) return draft;
  return { ...draft, championId };
}

/** The teams the champion can be: each distinct team in slots 1-12, in slot order. */
export function championChoices(draft: PicksDraft): number[] {
  return [...new Set(draft.playoff.filter((id): id is number => id !== null))];
}

/**
 * For each slot (1-15) whose team also appears in another slot, the other
 * slots holding that team, in order. Covers repeats within a list and a team
 * in both the top 12 and the First Three Out. Slots without a repeat are absent.
 */
export function duplicateSlots(draft: PicksDraft): Record<number, number[]> {
  const slotsByTeam = new Map<number, number[]>();
  for (let slot = 1; slot <= TOTAL_SLOTS; slot++) {
    const id = teamInSlot(draft, slot);
    if (id === null) continue;
    slotsByTeam.set(id, [...(slotsByTeam.get(id) ?? []), slot]);
  }
  const result: Record<number, number[]> = {};
  for (const slots of slotsByTeam.values()) {
    if (slots.length < 2) continue;
    for (const slot of slots) result[slot] = slots.filter((other) => other !== slot);
  }
  return result;
}
