// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
const maybeSingle = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());
const eq = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const client = vi.hoisted(() => ({ auth: { getUser }, from }));
vi.mock("../supabase/server", () => ({ createSupabaseServerClient: async () => client }));

const getSeason = vi.hoisted(() => vi.fn());
vi.mock("../seasons/get-season", () => ({ getSeason }));

const now = vi.hoisted(() => vi.fn());
vi.mock("../clock", () => ({ now }));

import { updateSessionSubmission } from "./update-submission";

const picks = {
  currentPlayoff: [2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  currentTiebreakers: [13, 14, 16],
  championId: 2,
};
const season = { year: 2026, editOpensAt: "2026-10-11T04:00:00+00:00", editClosesAt: "2026-10-17T16:00:00+00:00" };
const inside = new Date("2026-10-12T12:00:00.123Z");
const row = {
  year: 2026,
  initial_playoff: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  initial_tiebreakers: [13, 14, 15],
  current_playoff: picks.currentPlayoff,
  current_tiebreakers: picks.currentTiebreakers,
  champion_id: 2,
  submitted_at: "2026-09-01T00:00:00+00:00",
  updated_at: inside.toISOString(),
};

describe("updateSessionSubmission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = { eq, select, maybeSingle };
    eq.mockReturnValue(chain);
    select.mockReturnValue(chain);
    update.mockReturnValue(chain);
    from.mockReturnValue({ update });
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getSeason.mockResolvedValue(season);
    now.mockReturnValue(inside);
    maybeSingle.mockResolvedValue({ data: row, error: null });
  });

  it("is unauthenticated, touching nothing, when there is no user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    expect(await updateSessionSubmission(2026, picks)).toEqual({ status: "unauthenticated" });
    expect(getSeason).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("is unauthenticated when getUser reports an error", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });

    expect(await updateSessionSubmission(2026, picks)).toEqual({ status: "unauthenticated" });
    expect(from).not.toHaveBeenCalled();
  });

  it("looks the season up with the signed-in client", async () => {
    await updateSessionSubmission(2026, picks);

    expect(getSeason).toHaveBeenCalledWith(2026, client);
  });

  it("does not write when the window is closed", async () => {
    now.mockReturnValue(new Date(season.editClosesAt));

    expect(await updateSessionSubmission(2026, picks)).toEqual({ status: "outside-window", season });
    expect(from).not.toHaveBeenCalled();
  });

  it("does not write when the year has no season", async () => {
    getSeason.mockResolvedValue(null);

    expect(await updateSessionSubmission(2026, picks)).toEqual({ status: "outside-window", season: null });
    expect(from).not.toHaveBeenCalled();
  });

  it("writes exactly the four allowed columns, with updated_at from the clock", async () => {
    await updateSessionSubmission(2026, picks);

    expect(from).toHaveBeenCalledWith("submissions");
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toEqual({
      current_playoff: picks.currentPlayoff,
      current_tiebreakers: picks.currentTiebreakers,
      champion_id: 2,
      updated_at: "2026-10-12T12:00:00.123Z",
    });
    expect(Object.keys(update.mock.calls[0][0]).sort()).toEqual([
      "champion_id",
      "current_playoff",
      "current_tiebreakers",
      "updated_at",
    ]);
  });

  it("filters by the session user and the year, and selects the public columns", async () => {
    await updateSessionSubmission(2026, picks);

    expect(eq).toHaveBeenCalledTimes(2);
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
    expect(eq).toHaveBeenCalledWith("year", 2026);
    expect(select).toHaveBeenCalledWith(expect.stringContaining("initial_playoff"));
    expect(select.mock.calls[0][0]).not.toMatch(/user_id|\bid\b/);
  });

  it("returns the updated submission in the GET shape", async () => {
    expect(await updateSessionSubmission(2026, picks)).toEqual({
      status: "updated",
      submission: {
        year: 2026,
        initialPlayoff: row.initial_playoff,
        initialTiebreakers: row.initial_tiebreakers,
        currentPlayoff: picks.currentPlayoff,
        currentTiebreakers: picks.currentTiebreakers,
        championId: 2,
        submittedAt: row.submitted_at,
        updatedAt: row.updated_at,
      },
    });
  });

  it("is not-found when no row was updated", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    expect(await updateSessionSubmission(2026, picks)).toEqual({ status: "not-found" });
  });

  it("reports a champion that is not a team (foreign key violation)", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { code: "23503", message: "fk" } });

    expect(await updateSessionSubmission(2026, picks)).toEqual({ status: "invalid-champion" });
  });

  it("throws other database errors", async () => {
    const failure = { code: "XX000", message: "boom" };
    maybeSingle.mockResolvedValue({ data: null, error: failure });

    await expect(updateSessionSubmission(2026, picks)).rejects.toBe(failure);
  });

  it("propagates a season lookup failure", async () => {
    const failure = new Error("down");
    getSeason.mockRejectedValue(failure);

    await expect(updateSessionSubmission(2026, picks)).rejects.toBe(failure);
    expect(from).not.toHaveBeenCalled();
  });
});
