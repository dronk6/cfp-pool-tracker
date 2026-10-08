// @vitest-environment node
import { describe, expect, it } from "vitest";
import { countMoves } from "./moves";

// ESPN-style integer ids for the teams used in Planning/example_valid_moves.md.
const ids = {
  "Ohio State": 194,
  "Notre Dame": 87,
  Georgia: 61,
  Oregon: 2483,
  Texas: 251,
  Indiana: 84,
  Miami: 2390,
  "Texas Tech": 2641,
  Oklahoma: 201,
  LSU: 99,
  "Ole Miss": 145,
  Memphis: 235,
  "Penn State": 213,
  Alabama: 333,
  Tennessee: 2633,
  Utah: 254,
} as const;

type TeamName = keyof typeof ids;

function top12(...names: TeamName[]): number[] {
  return names.map((name) => ids[name]);
}

const before = top12(
  "Ohio State",
  "Notre Dame",
  "Georgia",
  "Oregon",
  "Texas",
  "Indiana",
  "Miami",
  "Texas Tech",
  "Oklahoma",
  "LSU",
  "Ole Miss",
  "Memphis",
);

function withSlot(slot: number, name: TeamName): number[] {
  return before.map((id, index) => (index === slot - 1 ? ids[name] : id));
}

describe("countMoves: replacements", () => {
  it("counts no changes as 0 moves", () => {
    expect(countMoves(before, [...before])).toBe(0);
  });

  it("counts a team replaced in its exact slot as 1 move", () => {
    expect(countMoves(before, withSlot(1, "Penn State"))).toBe(1);
  });

  it("counts three teams replaced in their exact slots as 3 moves", () => {
    const after = withSlot(1, "Penn State");
    after[4] = ids.Alabama;
    after[11] = ids.Tennessee;
    expect(countMoves(before, after)).toBe(3);
  });

  it("counts a First Three Out team promoted into the vacated slot as 1 move", () => {
    // Memphis drops to the First Three Out (not part of the input) and Utah takes slot 12.
    expect(countMoves(before, withSlot(12, "Utah"))).toBe(1);
  });

  it("counts replacing every team as 12 moves", () => {
    const after = Array.from({ length: 12 }, (_, index) => 1000 + index);
    expect(countMoves(before, after)).toBe(12);
  });

  it("does not mutate its inputs", () => {
    const initial = [...before];
    const after = withSlot(1, "Penn State");
    const afterCopy = [...after];
    countMoves(initial, after);
    expect(initial).toEqual(before);
    expect(after).toEqual(afterCopy);
  });
});

describe("countMoves: reorders", () => {
  it("counts rearranging four teams as 1 move", () => {
    const after = top12(
      "Ohio State",
      "Memphis",
      "Texas",
      "Oregon",
      "Georgia",
      "Indiana",
      "Miami",
      "Texas Tech",
      "Oklahoma",
      "LSU",
      "Ole Miss",
      "Notre Dame",
    );
    expect(countMoves(before, after)).toBe(1);
  });

  it("counts an adjacent swap as 1 move", () => {
    const after = [...before];
    [after[0], after[1]] = [after[1], after[0]];
    expect(countMoves(before, after)).toBe(1);
  });

  it("counts a full reversal as 1 move", () => {
    expect(countMoves(before, [...before].reverse())).toBe(1);
  });

  it("counts a rotation as 1 move", () => {
    const after = [...before.slice(1), before[0]];
    expect(countMoves(before, after)).toBe(1);
  });
});

describe("countMoves: combined replacements and reorders", () => {
  it("counts a replacement plus a swap of Notre Dame and Texas as 2 moves", () => {
    const after = withSlot(12, "Penn State");
    [after[1], after[4]] = [after[4], after[1]];
    expect(countMoves(before, after)).toBe(2);
  });

  it("counts a new team in slot 1, shifting everyone down, as 2 moves", () => {
    const after = [ids["Penn State"], ...before.slice(0, 11)];
    expect(countMoves(before, after)).toBe(2);
  });

  it("counts a new team in a different slot than the one it replaced as 2 moves", () => {
    // Memphis is removed, Utah goes in slot 1 and Ohio State shifts to slot 2.
    const after = [ids.Utah, ...before.slice(0, 11)];
    expect(countMoves(before, after)).toBe(2);
  });

  it("counts three replacements plus any reorder as 4 moves", () => {
    const after = withSlot(1, "Penn State");
    after[4] = ids.Alabama;
    after[11] = ids.Tennessee;
    [after[1], after[2]] = [after[2], after[1]];
    expect(countMoves(before, after)).toBe(4);
  });
});
