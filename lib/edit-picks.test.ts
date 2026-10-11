import { describe, expect, it } from "vitest";
import {
  championChoices,
  draftFromView,
  duplicateSlots,
  setChampion,
  setSlot,
  type PicksDraft,
} from "./edit-picks";
import type { PicksView } from "./picks-view";

const pick = (rank: number, teamId = rank) => ({ rank, teamId, name: `T${teamId}`, imageUrl: null });

function view(overrides: Partial<PicksView> = {}): PicksView {
  return {
    playoff: Array.from({ length: 12 }, (_, i) => pick(i + 1)),
    tiebreakers: [pick(13), pick(14), pick(15)],
    champion: { teamId: 3, name: "T3", imageUrl: null },
    ...overrides,
  };
}

const draft = (overrides: Partial<PicksDraft> = {}): PicksDraft => ({
  ...draftFromView(view()),
  ...overrides,
});

describe("draftFromView", () => {
  it("copies the saved picks and champion", () => {
    expect(draftFromView(view())).toEqual({
      playoff: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      tiebreakers: [13, 14, 15],
      championId: 3,
    });
  });

  it("pads short lists with blanks and trims long ones", () => {
    const d = draftFromView(
      view({
        playoff: [pick(1), pick(2)],
        tiebreakers: [pick(13), pick(14), pick(15), pick(16, 16)],
        champion: null,
      }),
    );
    expect(d.playoff).toHaveLength(12);
    expect(d.playoff.slice(2)).toEqual(Array(10).fill(null));
    expect(d.tiebreakers).toEqual([13, 14, 15]);
    expect(d.championId).toBeNull();
  });

  it("starts with no champion when the saved one isn't in the saved top 12", () => {
    expect(draftFromView(view({ champion: { teamId: 14, name: "T14", imageUrl: null } })).championId).toBeNull();
    expect(draftFromView(view({ champion: { teamId: 99999, name: "x", imageUrl: null } })).championId).toBeNull();
  });

  it("keeps an id that isn't a known team", () => {
    expect(draftFromView(view({ playoff: [pick(1, 99999)] })).playoff[0]).toBe(99999);
  });
});

describe("setSlot", () => {
  it("changes only the chosen slot, in either list, without mutating the input", () => {
    const before = draft();
    const { draft: after } = setSlot(before, 14, 50);
    expect(after.tiebreakers).toEqual([13, 50, 15]);
    expect(after.playoff).toEqual(before.playoff);
    expect(before.tiebreakers).toEqual([13, 14, 15]);
  });

  it("blanks a slot with null", () => {
    expect(setSlot(draft(), 1, null).draft.playoff[0]).toBeNull();
  });

  it("clears the champion when its team leaves the top 12, and reports it", () => {
    const result = setSlot(draft(), 3, 50);
    expect(result.draft.championId).toBeNull();
    expect(result.championCleared).toBe(true);
  });

  it("does not restore the champion when the team returns", () => {
    const cleared = setSlot(draft(), 3, 50).draft;
    expect(setSlot(cleared, 3, 3).draft.championId).toBeNull();
  });

  it("keeps the champion when its team just moves slots", () => {
    const swapped = setSlot(setSlot(draft(), 1, 3).draft, 3, 1);
    expect(swapped.draft.championId).toBe(3);
    expect(swapped.championCleared).toBe(false);
  });

  it("keeps the champion when a duplicate of it leaves the top 12", () => {
    const withDupe = setSlot(draft(), 4, 3).draft;
    expect(setSlot(withDupe, 4, 50).draft.championId).toBe(3);
  });

  it("does not report a clear when there was no champion", () => {
    const result = setSlot(draft({ championId: null }), 3, 50);
    expect(result.championCleared).toBe(false);
  });

  it("reports no clear for any slot change when the champion started outside the top 12", () => {
    const d = draftFromView(view({ champion: { teamId: 14, name: "T14", imageUrl: null } }));
    for (const slot of [1, 13, 14, 15]) expect(setSlot(d, slot, 50).championCleared).toBe(false);
  });

  it("rejects a slot outside 1-15", () => {
    expect(() => setSlot(draft(), 0, 1)).toThrow(RangeError);
    expect(() => setSlot(draft(), 16, 1)).toThrow(RangeError);
  });
});

describe("setChampion", () => {
  it("sets a champion from the top 12 and clears with null", () => {
    expect(setChampion(draft(), 5).championId).toBe(5);
    expect(setChampion(draft(), null).championId).toBeNull();
  });

  it("ignores a team outside the top 12", () => {
    expect(setChampion(draft(), 13).championId).toBe(3);
  });
});

describe("championChoices", () => {
  it("lists distinct teams from the top 12 in slot order, skipping blanks", () => {
    const d = draft({ playoff: [5, null, 2, 5, 9, 1, 1, 7, 8, 10, 11, 12], tiebreakers: [20, 21, 22] });
    expect(championChoices(d)).toEqual([5, 2, 9, 1, 7, 8, 10, 11, 12]);
  });
});

describe("duplicateSlots", () => {
  it("is empty when every team is distinct", () => {
    expect(duplicateSlots(draft())).toEqual({});
  });

  it("points each repeated slot at the others, across both lists", () => {
    const d = draft({ playoff: [1, 2, 1, 4, 5, 6, 7, 8, 9, 10, 11, 1], tiebreakers: [2, null, null] });
    expect(duplicateSlots(d)).toEqual({ 1: [3, 12], 3: [1, 12], 12: [1, 3], 2: [13], 13: [2] });
  });

  it("ignores blanks", () => {
    expect(duplicateSlots(draft({ tiebreakers: [null, null, null] }))).toEqual({});
  });
});
