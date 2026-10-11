import { describe, expect, it } from "vitest";
import { buildEditDisabledReason, formatEt, lookupFailedReason } from "./edit-access";

const season = { year: 2026, editOpensAt: "2026-10-11T04:00:00Z", editClosesAt: "2026-10-17T16:00:00Z" };
const opens = Date.parse(season.editOpensAt);
const closes = Date.parse(season.editClosesAt);

describe("buildEditDisabledReason", () => {
  it("says when editing opens, until the opening instant", () => {
    expect(buildEditDisabledReason(season, new Date(opens - 1))).toBe("Editing opens Sun, Oct 11 at 12:00 AM ET.");
  });

  it("has no reason at the opening instant (inclusive) or just before closing", () => {
    expect(buildEditDisabledReason(season, new Date(opens))).toBeNull();
    expect(buildEditDisabledReason(season, new Date(closes - 1))).toBeNull();
  });

  it("says when editing closed, from the closing instant (exclusive)", () => {
    expect(buildEditDisabledReason(season, new Date(closes))).toBe("Editing closed Sat, Oct 17 at 12:00 PM ET.");
  });

  it("explains a missing season without a date, and names who to contact", () => {
    const reason = buildEditDisabledReason(null, new Date(opens));
    expect(reason).toContain("Tyler");
    expect(reason).not.toMatch(/\d/);
  });

  it("differs from the lookup-failed reason", () => {
    expect(buildEditDisabledReason(null, new Date())).not.toBe(lookupFailedReason());
  });
});

describe("formatEt", () => {
  it.each([
    ["2026-10-11T04:00:00Z", "Sun, Oct 11 at 12:00 AM ET"], // EDT: UTC-4, not 4:00 AM
    ["2026-01-15T17:05:00Z", "Thu, Jan 15 at 12:05 PM ET"], // EST: UTC-5
    ["2026-03-08T06:59:00Z", "Sun, Mar 8 at 1:59 AM ET"], // last minute before spring forward
    ["2026-03-08T07:00:00Z", "Sun, Mar 8 at 3:00 AM ET"], // clocks skip 2:00
    ["2026-11-01T05:59:00Z", "Sun, Nov 1 at 1:59 AM ET"], // before fall back (EDT)
    ["2026-11-01T12:00:00Z", "Sun, Nov 1 at 7:00 AM ET"], // after fall back (EST)
    ["2026-11-01T03:30:00Z", "Sat, Oct 31 at 11:30 PM ET"], // previous ET day
  ])("%s -> %s", (iso, expected) => {
    expect(formatEt(iso)).toBe(expected);
  });

  it("uses a plain ASCII space before AM/PM", () => {
    expect(formatEt("2026-10-11T04:00:00Z")).not.toMatch(/[  ]/);
  });
});
