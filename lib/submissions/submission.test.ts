// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
const maybeSingle = vi.hoisted(() => vi.fn());
const eq = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
vi.mock("../supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, from }),
}));

import { getSessionSubmission } from "./submission";

const row = {
  year: 2026,
  initial_playoff: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  initial_tiebreakers: [13, 14, 15],
  current_playoff: [2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 20],
  current_tiebreakers: [13, 14, 16],
  champion_id: 2,
  submitted_at: "2026-09-01T00:00:00+00:00",
  updated_at: "2026-10-10T00:00:00+00:00",
};

describe("getSessionSubmission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = { eq, maybeSingle };
    eq.mockReturnValue(chain);
    select.mockReturnValue(chain);
    from.mockReturnValue({ select });
  });

  it("is signed out, without touching the database, when there is no user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    expect(await getSessionSubmission(2026)).toEqual({ signedIn: false });
    expect(from).not.toHaveBeenCalled();
  });

  it("is signed out when getUser reports an error", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });

    expect(await getSessionSubmission(2026)).toEqual({ signedIn: false });
    expect(from).not.toHaveBeenCalled();
  });

  it("filters by the session user and the year, selecting exactly the public columns", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    maybeSingle.mockResolvedValue({ data: row, error: null });

    await getSessionSubmission(2026);

    expect(from).toHaveBeenCalledWith("submissions");
    expect(select).toHaveBeenCalledWith(
      "year, initial_playoff, initial_tiebreakers, current_playoff, current_tiebreakers, champion_id, submitted_at, updated_at",
    );
    expect(eq).toHaveBeenCalledTimes(2);
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
    expect(eq).toHaveBeenCalledWith("year", 2026);
  });

  it("maps the row to camelCase", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    maybeSingle.mockResolvedValue({ data: row, error: null });

    expect(await getSessionSubmission(2026)).toEqual({
      signedIn: true,
      submission: {
        year: 2026,
        initialPlayoff: row.initial_playoff,
        initialTiebreakers: row.initial_tiebreakers,
        currentPlayoff: row.current_playoff,
        currentTiebreakers: row.current_tiebreakers,
        championId: 2,
        submittedAt: row.submitted_at,
        updatedAt: row.updated_at,
      },
    });
  });

  it("keeps a null champion and null updatedAt", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    maybeSingle.mockResolvedValue({ data: { ...row, champion_id: null, updated_at: null }, error: null });

    const result = await getSessionSubmission(2026);

    expect(result).toMatchObject({ submission: { championId: null, updatedAt: null } });
  });

  it("returns a null submission for a signed-in user with no row", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    expect(await getSessionSubmission(2026)).toEqual({ signedIn: true, submission: null });
  });

  it("throws when the lookup fails", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const dbError = new Error("db down");
    maybeSingle.mockResolvedValue({ data: null, error: dbError });

    await expect(getSessionSubmission(2026)).rejects.toBe(dbError);
  });
});
