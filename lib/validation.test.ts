// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validatePicks, type PicksInput, type Team } from "./validation";

// Ids 1-15 are power-conference teams, 16-17 are not.
const teams: Team[] = [
  ...Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: `Team ${i + 1}`, is_power_conf: true })),
  { id: 16, name: "Memphis", is_power_conf: false },
  { id: 17, name: "Tulane", is_power_conf: false },
];
teams[0].name = "Ohio State";

const initialTop12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16];

function picks(overrides: Partial<PicksInput> = {}): PicksInput {
  return {
    initialTop12,
    newTop12: initialTop12,
    newTiebreakers: [12, 13, 14],
    championId: 1,
    teams,
    ...overrides,
  };
}

function rulesOf(input: PicksInput): string[] {
  return validatePicks(input).map((violation) => violation.rule);
}

describe("validatePicks", () => {
  it("returns no violations for unchanged, valid picks", () => {
    expect(validatePicks(picks())).toEqual([]);
  });
});

describe("shape rule", () => {
  it("reports a top 12 of the wrong length", () => {
    const violations = validatePicks(picks({ newTop12: [1, 2, 3] }));
    expect(violations).toContainEqual({
      rule: "shape",
      message: "The top 12 must have exactly 12 teams (you have 3).",
    });
  });

  it("reports a First Three Out of the wrong length", () => {
    const violations = validatePicks(picks({ newTiebreakers: [12, 13] }));
    expect(violations).toContainEqual({
      rule: "shape",
      message: "The First Three Out must have exactly 3 teams (you have 2).",
    });
  });

  it("reports each empty slot, numbering the First Three Out 13-15", () => {
    const newTop12 = [...initialTop12];
    (newTop12 as (number | null)[])[2] = null;
    const violations = validatePicks(picks({ newTop12, newTiebreakers: [12, null, 14] }));
    const messages = violations.filter((v) => v.rule === "shape").map((v) => v.message);
    expect(messages).toEqual([
      "Slot 3 is empty. Pick a team for every slot.",
      "Slot 14 is empty. Pick a team for every slot.",
    ]);
  });
});

describe("unknown-team rule", () => {
  it("reports each unrecognized id once, including the champion", () => {
    const newTop12 = [...initialTop12];
    newTop12[0] = 9999;
    const violations = validatePicks(picks({ newTop12, championId: 8888 }));
    expect(violations.filter((v) => v.rule === "unknown-team")).toEqual([
      { rule: "unknown-team", message: "Team ID 9999 is not a recognized team.", teamIds: [9999] },
      { rule: "unknown-team", message: "Team ID 8888 is not a recognized team.", teamIds: [8888] },
    ]);
  });

  it("passes when every id is known", () => {
    expect(rulesOf(picks())).not.toContain("unknown-team");
  });
});

describe("duplicate rule", () => {
  it("reports a team repeated in the top 12", () => {
    const newTop12 = [...initialTop12];
    newTop12[1] = 1;
    const violations = validatePicks(picks({ newTop12 }));
    expect(violations.filter((v) => v.rule === "duplicate")).toEqual([
      {
        rule: "duplicate",
        message: "Ohio State appears more than once in the top 12.",
        teamIds: [1],
      },
    ]);
  });

  it("reports a team repeated in the First Three Out", () => {
    const violations = validatePicks(picks({ newTiebreakers: [12, 12, 14] }));
    expect(violations.filter((v) => v.rule === "duplicate")).toEqual([
      {
        rule: "duplicate",
        message: "Team 12 appears more than once in the First Three Out.",
        teamIds: [12],
      },
    ]);
  });

  it("passes when all teams are distinct", () => {
    expect(rulesOf(picks())).not.toContain("duplicate");
  });
});

describe("overlap rule", () => {
  it("reports a team in both the top 12 and the First Three Out", () => {
    const violations = validatePicks(picks({ newTiebreakers: [1, 13, 14] }));
    expect(violations.filter((v) => v.rule === "overlap")).toEqual([
      {
        rule: "overlap",
        message: "Ohio State can't be in both the top 12 and the First Three Out.",
        teamIds: [1],
      },
    ]);
  });

  it("reports an overlapping team as overlap only, not also as a duplicate", () => {
    expect(rulesOf(picks({ newTiebreakers: [1, 13, 14] }))).not.toContain("duplicate");
  });

  it("passes when the two lists are disjoint", () => {
    expect(rulesOf(picks())).not.toContain("overlap");
  });
});

describe("g6-required rule", () => {
  it("reports a top 12 made up only of power-conference teams", () => {
    const newTop12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const violations = validatePicks(picks({ newTop12, newTiebreakers: [13, 14, 15] }));
    expect(violations.filter((v) => v.rule === "g6-required")).toEqual([
      {
        rule: "g6-required",
        message:
          "The top 12 must include at least one team from a non-power conference (Notre Dame counts as a power-conference team; UConn does not).",
      },
    ]);
  });

  it("passes when the top 12 includes a non-power-conference team", () => {
    expect(rulesOf(picks())).not.toContain("g6-required");
  });

  it("is not reported while a slot is empty or unrecognized", () => {
    const withEmpty = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, null];
    const withUnknown = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 9999];
    expect(rulesOf(picks({ newTop12: withEmpty }))).not.toContain("g6-required");
    expect(rulesOf(picks({ newTop12: withUnknown }))).not.toContain("g6-required");
  });
});

describe("champion rules", () => {
  it("requires a champion", () => {
    const violations = validatePicks(picks({ championId: null }));
    expect(violations).toEqual([{ rule: "champion-required", message: "Choose a champion." }]);
  });

  it("reports a champion outside the top 12", () => {
    const violations = validatePicks(picks({ championId: 12 }));
    expect(violations).toEqual([
      {
        rule: "champion-not-in-top-12",
        message: "Team 12 is your champion, but isn't in your top 12. Choose a champion from your top 12.",
        teamIds: [12],
      },
    ]);
  });

  it("also reports an unrecognized champion as not in the top 12", () => {
    expect(rulesOf(picks({ championId: 9999 }))).toEqual(["unknown-team", "champion-not-in-top-12"]);
  });

  it("passes when the champion is in the top 12", () => {
    expect(rulesOf(picks({ championId: 16 }))).toEqual([]);
  });
});

describe("move-limit rule", () => {
  it("passes at exactly 3 moves", () => {
    // Replace 3 teams (4, 5, 6 -> 12, 13, 14) without reordering the rest.
    const newTop12 = [1, 2, 3, 12, 13, 14, 7, 8, 9, 10, 11, 16];
    expect(rulesOf(picks({ newTop12, newTiebreakers: [4, 5, 6] }))).not.toContain("move-limit");
  });

  it("reports more than 3 moves, counting a reorder as one", () => {
    // 3 replacements plus a swap of two retained teams = 4 moves.
    const newTop12 = [2, 1, 3, 12, 13, 14, 7, 8, 9, 10, 11, 16];
    const violations = validatePicks(picks({ newTop12, newTiebreakers: [4, 5, 6] }));
    expect(violations.filter((v) => v.rule === "move-limit")).toEqual([
      {
        rule: "move-limit",
        message:
          "You've used 4 moves, but the limit is 3. Replacing a team counts as 1 move each, and reordering your remaining teams counts as 1 move in total.",
      },
    ]);
  });

  it("is skipped, without throwing, when the top 12 is malformed", () => {
    const base = [12, 13, 14, 15, 17, 1, 2, 3, 4, 5, 6];
    const malformed: (number | null)[][] = [
      [...base, null],
      [...base, 9999],
      [...base, 12],
      base.slice(0, 5),
    ];
    for (const newTop12 of malformed) {
      const rules = rulesOf(picks({ newTop12, newTiebreakers: [8, 9, 10] }));
      expect(rules).not.toContain("move-limit");
      expect(rules.length).toBeGreaterThan(0);
    }
  });
});

describe("multiple violations", () => {
  it("returns every independent violation together, in rule order", () => {
    const newTop12 = [12, 13, 14, 15, 1, 2, 3, 4, 5, 6, 7, 8];
    const rules = rulesOf(picks({ newTop12, newTiebreakers: [9, 9, 12], championId: null }));
    expect(rules).toEqual(["duplicate", "overlap", "g6-required", "champion-required", "move-limit"]);
  });
});
