import { describe, expect, it } from "vitest";
import { isEditWindowOpen, type Season } from "./edit-window";

const opens = Date.parse("2026-10-11T04:00:00Z");
const closes = Date.parse("2026-10-17T16:00:00Z");
const season: Season = {
  year: 2026,
  editOpensAt: "2026-10-11T04:00:00+00:00",
  editClosesAt: "2026-10-17T16:00:00+00:00",
};

describe("isEditWindowOpen", () => {
  it("is closed one millisecond before it opens", () => {
    expect(isEditWindowOpen(season, new Date(opens - 1))).toBe(false);
  });

  it("is open at the exact opening instant", () => {
    expect(isEditWindowOpen(season, new Date(opens))).toBe(true);
  });

  it("is open one millisecond before it closes", () => {
    expect(isEditWindowOpen(season, new Date(closes - 1))).toBe(true);
  });

  it("is closed at the exact closing instant", () => {
    expect(isEditWindowOpen(season, new Date(closes))).toBe(false);
  });

  it("is open in the middle and closed long after", () => {
    expect(isEditWindowOpen(season, new Date(opens + 86_400_000))).toBe(true);
    expect(isEditWindowOpen(season, new Date(closes + 86_400_000))).toBe(false);
  });

  it("understands offsets other than UTC", () => {
    const eastern = { ...season, editOpensAt: "2026-10-11T00:00:00-04:00" };
    expect(isEditWindowOpen(eastern, new Date(opens))).toBe(true);
    expect(isEditWindowOpen(eastern, new Date(opens - 1))).toBe(false);
  });

  it("is never open when the window is empty or inverted", () => {
    const empty = { ...season, editClosesAt: season.editOpensAt };
    expect(isEditWindowOpen(empty, new Date(opens))).toBe(false);
    const inverted = { ...season, editOpensAt: season.editClosesAt, editClosesAt: season.editOpensAt };
    expect(isEditWindowOpen(inverted, new Date(opens + 1000))).toBe(false);
  });
});
