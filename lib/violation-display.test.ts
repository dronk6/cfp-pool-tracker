import { describe, expect, it } from "vitest";
import type { PicksDraft } from "./edit-picks";
import type { Violation } from "./validation";
import { describeViolations } from "./violation-display";

const draft: PicksDraft = {
  playoff: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 3],
  tiebreakers: [3, 20, 21],
  championId: 40,
};

describe("describeViolations", () => {
  it("adds the slots where a named team sits, including the First Three Out", () => {
    const violation: Violation = { rule: "duplicate", message: "Team 3 appears more than once.", teamIds: [3] };
    expect(describeViolations([violation], draft)).toEqual(["Team 3 appears more than once (slots 3, 12 and 13)."]);
  });

  it("says 'slot' for a single slot", () => {
    const violation: Violation = { rule: "unknown-team", message: "Team ID 20 is not a recognized team.", teamIds: [20] };
    expect(describeViolations([violation], draft)).toEqual(["Team ID 20 is not a recognized team (slot 14)."]);
  });

  it("leaves the champion rule and violations without team ids as they are", () => {
    const violations: Violation[] = [
      { rule: "champion-not-in-top-12", message: "Team 40 is your champion, but isn't in your top 12.", teamIds: [40] },
      { rule: "move-limit", message: "You've used 4 moves." },
      { rule: "champion-required", message: "Choose a champion." },
    ];
    expect(describeViolations(violations, draft)).toEqual(violations.map((v) => v.message));
  });

  it("leaves the message alone when the named team is not in the draft", () => {
    const violation: Violation = { rule: "overlap", message: "Gone can't be in both.", teamIds: [999] };
    expect(describeViolations([violation], draft)).toEqual(["Gone can't be in both."]);
  });

  it("keeps the order of the violations", () => {
    const violations: Violation[] = [
      { rule: "shape", message: "Slot 5 is empty. Pick a team for every slot." },
      { rule: "duplicate", message: "Team 3 appears more than once.", teamIds: [3] },
    ];
    expect(describeViolations(violations, draft)).toHaveLength(2);
    expect(describeViolations(violations, draft)[0]).toBe(violations[0].message);
  });
});
