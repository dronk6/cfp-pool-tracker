import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Submission } from "../../lib/submissions/submission";
import type { Team } from "../../lib/teams";
import { loadMyPicks } from "./load-my-picks";

const getSessionSubmission = vi.hoisted(() => vi.fn());
vi.mock("../../lib/submissions/submission", () => ({ getSessionSubmission }));
const getTeams = vi.hoisted(() => vi.fn());
vi.mock("../../lib/teams", () => ({ getTeams }));
const getSeason = vi.hoisted(() => vi.fn());
vi.mock("../../lib/seasons/get-season", () => ({ getSeason }));
const now = vi.hoisted(() => vi.fn());
vi.mock("../../lib/clock", () => ({ now }));
const unstable_rethrow = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ unstable_rethrow }));

const season = { year: 2026, editOpensAt: "2026-10-11T04:00:00Z", editClosesAt: "2026-10-17T16:00:00Z" };
const duringWindow = new Date("2026-10-12T12:00:00Z");

const submission: Submission = {
  year: 2026,
  initialPlayoff: [99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88],
  initialTiebreakers: [87, 86, 85],
  currentPlayoff: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  currentTiebreakers: [13, 14, 15],
  championId: 1,
  submittedAt: "2026-01-01T00:00:00Z",
  updatedAt: null,
};
const teams: Team[] = Array.from({ length: 15 }, (_, i) => ({
  id: i + 1,
  name: `Team ${i + 1}`,
  conference: "X",
  is_power_conf: true,
  image_url: null,
}));

describe("loadMyPicks", () => {
  beforeEach(() => {
    getSessionSubmission.mockReset();
    getTeams.mockReset();
    getSeason.mockReset().mockResolvedValue(season);
    now.mockReset().mockReturnValue(duringWindow);
    unstable_rethrow.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns a view for a signed-in user with a submission, asking for the given year", async () => {
    getSessionSubmission.mockResolvedValue({ signedIn: true, submission });
    getTeams.mockResolvedValue({ signedIn: true, teams });

    const result = await loadMyPicks(2026);

    expect(getSessionSubmission).toHaveBeenCalledWith(2026);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.view.playoff[0].name).toBe("Team 1");
      expect(result.view.champion?.name).toBe("Team 1");
    }
  });

  it("exposes nothing but the view: no initial picks or timestamps", async () => {
    getSessionSubmission.mockResolvedValue({ signedIn: true, submission });
    getTeams.mockResolvedValue({ signedIn: true, teams });

    const json = JSON.stringify(await loadMyPicks(2026));

    expect(json).not.toContain("99");
    expect(json).not.toContain("submittedAt");
    expect(json).not.toContain("2026-01-01");
  });

  it("is signed out, without loading teams, when there is no session", async () => {
    getSessionSubmission.mockResolvedValue({ signedIn: false });

    expect(await loadMyPicks(2026)).toEqual({ kind: "signed-out" });
    expect(getTeams).not.toHaveBeenCalled();
    expect(getSeason).not.toHaveBeenCalled();
  });

  it("has no submission, without loading teams, when the user has no row", async () => {
    getSessionSubmission.mockResolvedValue({ signedIn: true, submission: null });

    expect(await loadMyPicks(2026)).toEqual({ kind: "no-submission" });
    expect(getTeams).not.toHaveBeenCalled();
    expect(getSeason).not.toHaveBeenCalled();
  });

  it("is signed out if the session ends before teams load", async () => {
    getSessionSubmission.mockResolvedValue({ signedIn: true, submission });
    getTeams.mockResolvedValue({ signedIn: false });

    expect(await loadMyPicks(2026)).toEqual({ kind: "signed-out" });
    expect(getSeason).not.toHaveBeenCalled();
  });

  describe("edit window", () => {
    beforeEach(() => {
      getSessionSubmission.mockResolvedValue({ signedIn: true, submission });
      getTeams.mockResolvedValue({ signedIn: true, teams });
    });

    async function reasonAt(at: Date) {
      now.mockReturnValue(at);
      const result = await loadMyPicks(2026);
      expect(result.kind).toBe("ok");
      return result.kind === "ok" ? result.editDisabledReason : undefined;
    }

    it("has no reason inside the window, asking for the given year", async () => {
      expect(await reasonAt(duringWindow)).toBeNull();
      expect(getSeason).toHaveBeenCalledWith(2026);
    });

    it("says when editing opens before the window", async () => {
      expect(await reasonAt(new Date("2026-10-10T12:00:00Z"))).toBe("Editing opens Sun, Oct 11 at 12:00 AM ET.");
    });

    it("says when editing closed after the window", async () => {
      expect(await reasonAt(new Date("2026-10-17T16:00:00Z"))).toBe("Editing closed Sat, Oct 17 at 12:00 PM ET.");
    });

    it("explains a year with no season", async () => {
      getSeason.mockResolvedValue(null);

      expect(await reasonAt(duringWindow)).toBe(
        "Editing isn't open yet for this season. Contact Tyler if that's wrong.",
      );
    });

    it("reads the clock only after the season lookup has finished", async () => {
      let release!: (s: typeof season) => void;
      getSeason.mockReturnValue(new Promise((resolve) => (release = resolve)));

      const pending = loadMyPicks(2026);
      await vi.waitFor(() => expect(getSeason).toHaveBeenCalled());
      expect(now).not.toHaveBeenCalled();
      release(season);
      await pending;

      expect(now).toHaveBeenCalledTimes(1);
      expect(getSeason.mock.invocationCallOrder[0]).toBeLessThan(now.mock.invocationCallOrder[0]);
    });

    it("still shows the picks, with a reload message, when the season lookup fails", async () => {
      getSeason.mockRejectedValue(new TypeError("secret detail"));

      const result = await loadMyPicks(2026);

      expect(result.kind).toBe("ok");
      if (result.kind === "ok") {
        expect(result.view.playoff).toHaveLength(12);
        expect(result.editDisabledReason).toContain("Reload");
      }
      expect(unstable_rethrow).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith("my-picks: edit window lookup failed", "TypeError");
    });

    it("lets Next.js control-flow errors from the season lookup through", async () => {
      const bailout = new Error("bailout");
      getSeason.mockRejectedValue(bailout);
      unstable_rethrow.mockImplementation((e) => {
        throw e;
      });

      await expect(loadMyPicks(2026)).rejects.toBe(bailout);
    });

    it("sends only the reason: no window timestamps", async () => {
      const json = JSON.stringify(await loadMyPicks(2026));

      expect(json).not.toContain("2026-10-11");
      expect(json).not.toContain("2026-10-17");
      expect(json).not.toContain("editOpensAt");
    });
  });

  it.each([
    ["the submission lookup", () => getSessionSubmission.mockRejectedValue(new TypeError("secret detail"))],
    [
      "the teams lookup",
      () => {
        getSessionSubmission.mockResolvedValue({ signedIn: true, submission });
        getTeams.mockRejectedValue(new TypeError("secret detail"));
      },
    ],
  ])("returns error when %s throws, logging only the error name", async (_name, arrange) => {
    arrange();

    expect(await loadMyPicks(2026)).toEqual({ kind: "error" });
    expect(unstable_rethrow).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("my-picks: load failed", "TypeError");
  });

  it("lets Next.js control-flow errors through", async () => {
    const bailout = new Error("bailout");
    getSessionSubmission.mockRejectedValue(bailout);
    unstable_rethrow.mockImplementation((e) => {
      throw e;
    });

    await expect(loadMyPicks(2026)).rejects.toBe(bailout);
  });
});
