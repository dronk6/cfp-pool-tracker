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
