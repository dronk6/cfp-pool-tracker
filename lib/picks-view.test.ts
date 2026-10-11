import { describe, expect, it } from "vitest";
import { buildPicksView } from "./picks-view";
import type { Submission } from "./submissions/submission";
import type { Team } from "./teams";

const team = (id: number, name: string, image_url: string | null = null): Team => ({
  id,
  name,
  conference: "X",
  is_power_conf: true,
  image_url,
});

const teams = Array.from({ length: 15 }, (_, i) => team(i + 1, `Team ${i + 1}`, `https://logo/${i + 1}.png`));

function submission(overrides: Partial<Submission> = {}): Submission {
  return {
    year: 2026,
    initialPlayoff: [],
    initialTiebreakers: [],
    currentPlayoff: [3, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    currentTiebreakers: [13, 14, 15],
    championId: null,
    submittedAt: "2026-01-01T00:00:00Z",
    updatedAt: null,
    ...overrides,
  };
}

describe("buildPicksView", () => {
  it("keeps the submitted order and numbers playoff 1-12 and tiebreakers 13-15", () => {
    const view = buildPicksView(submission(), teams);

    expect(view.playoff.map((p) => [p.rank, p.name])).toEqual([
      [1, "Team 3"], [2, "Team 1"], [3, "Team 2"], [4, "Team 4"], [5, "Team 5"], [6, "Team 6"],
      [7, "Team 7"], [8, "Team 8"], [9, "Team 9"], [10, "Team 10"], [11, "Team 11"], [12, "Team 12"],
    ]);
    expect(view.tiebreakers.map((p) => p.rank)).toEqual([13, 14, 15]);
    expect(view.tiebreakers.map((p) => p.name)).toEqual(["Team 13", "Team 14", "Team 15"]);
  });

  it("carries the team's logo url", () => {
    expect(buildPicksView(submission(), teams).playoff[0].imageUrl).toBe("https://logo/3.png");
  });

  it("shows an unknown id as a fallback name without a logo", () => {
    const view = buildPicksView(submission({ currentTiebreakers: [999999, 14, 15] }), teams);

    expect(view.tiebreakers[0]).toMatchObject({ name: "Unknown team (#999999)", imageUrl: null });
  });

  it("has no champion when none is set", () => {
    expect(buildPicksView(submission(), teams).champion).toBeNull();
  });

  it("resolves a known champion and falls back for an unknown one", () => {
    expect(buildPicksView(submission({ championId: 2 }), teams).champion).toMatchObject({ name: "Team 2" });
    expect(buildPicksView(submission({ championId: 777 }), teams).champion?.name).toBe("Unknown team (#777)");
  });

  it("does not throw on lists of the wrong length", () => {
    const view = buildPicksView(submission({ currentPlayoff: [1], currentTiebreakers: [] }), teams);

    expect(view.playoff).toHaveLength(1);
    expect(view.tiebreakers).toEqual([]);
  });
});
