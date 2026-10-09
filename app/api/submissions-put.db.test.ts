// @vitest-environment node
// Runs PUT /api/submissions/:year against the local stack (see README →
// Testing). Only next/headers (an in-memory cookie jar) and lib/clock are
// faked. Uses throwaway season years, never the real 2026 row, and never
// writes to `teams`: the champion id comes from the already-seeded table.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalAdminClient, runDbTests } from "../../tests/local-db";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (value === "" || options?.maxAge === 0) jar.delete(name);
      else jar.set(name, value);
    },
  }),
}));

const clock = vi.hoisted(() => ({ at: null as Date | null }));
vi.mock("../../lib/clock", () => ({ now: () => clock.at ?? new Date() }));

const OPENS = new Date("2031-03-01T05:00:00.000Z");
const CLOSES = new Date("2031-03-08T17:00:00.000Z");

const A_PICKS = {
  initial_playoff: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  initial_tiebreakers: [13, 14, 15],
  current_playoff: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  current_tiebreakers: [13, 14, 15],
};
const B_PICKS = {
  initial_playoff: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  initial_tiebreakers: [15, 14, 13],
  current_playoff: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
  current_tiebreakers: [33, 34, 35],
};
const NEW_PICKS = {
  currentPlayoff: [2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 20],
  currentTiebreakers: [13, 14, 16],
};

describe.skipIf(!runDbTests)("PUT /api/submissions/:year against the local stack", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const userA = { email: `subs23-a-${stamp}@example.test`, name: "Put Test A", id: "" };
  const userB = { email: `subs23-b-${stamp}@example.test`, name: "Put Test B", id: "" };
  // Throwaway years, far from the real season and unlikely to collide with
  // other suites running against the same stack.
  const baseYear = 5000 + Math.floor(Math.random() * 4000);
  const seasonYear = baseYear;
  const noSeasonYear = baseYear + 1;
  const noSubmissionYear = baseYear + 2;
  let championId = 0;

  const body = () => ({ ...NEW_PICKS, championId });

  async function put(year: number, payload: unknown = body(), headers: Record<string, string> = {}) {
    const { PUT } = await import("./submissions/[year]/route");
    const request = new Request(`http://localhost/api/submissions/${year}`, {
      method: "PUT",
      headers: { "content-type": "application/json", ...headers },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
    return PUT(request, { params: Promise.resolve({ year: String(year) }) } as never);
  }

  async function rowOf(userId: string, year = seasonYear) {
    const { data, error } = await admin.from("submissions").select("*").eq("user_id", userId).eq("year", year).single();
    if (error) throw error;
    return data;
  }

  async function createUserWithProfile(user: typeof userA) {
    const { data, error } = await admin.auth.admin.createUser({ email: user.email, email_confirm: true });
    if (error) throw error;
    user.id = data.user.id;
    createdUserIds.push(user.id);
    const { error: profileError } = await admin
      .from("profiles")
      .insert({ id: user.id, name: user.name, email: user.email });
    if (profileError) throw profileError;
  }

  async function signInAsA() {
    const { POST } = await import("./auth/verify-otp/route");
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: userA.email });
    if (error) throw error;
    const response = await POST(
      new Request("http://localhost/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email: userA.email, otp: data.properties.email_otp }),
      }),
    );
    expect(response.status).toBe(200);
  }

  beforeAll(async () => {
    admin = createLocalAdminClient();
    expect(process.env.SUPABASE_PUBLISHABLE_KEY, "SUPABASE_PUBLISHABLE_KEY missing from .env.local").toBeTruthy();

    const { data: team, error: teamError } = await admin.from("teams").select("id").limit(1).maybeSingle();
    if (teamError) throw teamError;
    if (!team) throw new Error("teams is empty; run `npm run seed:teams` against the local stack first");
    championId = team.id;

    // The "no season" test relies on this year being absent.
    const { data: stray, error: strayError } = await admin.from("seasons").select("year").eq("year", noSeasonYear);
    if (strayError) throw strayError;
    expect(stray, `seasons row exists for ${noSeasonYear}`).toEqual([]);

    await createUserWithProfile(userA);
    await createUserWithProfile(userB);
    const { error: seasonError } = await admin
      .from("seasons")
      .insert({ year: seasonYear, edit_opens_at: OPENS.toISOString(), edit_closes_at: CLOSES.toISOString() });
    if (seasonError) throw seasonError;
    const { error: noSubmissionSeasonError } = await admin.from("seasons").insert({
      year: noSubmissionYear,
      edit_opens_at: OPENS.toISOString(),
      edit_closes_at: CLOSES.toISOString(),
    });
    if (noSubmissionSeasonError) throw noSubmissionSeasonError;

    const { error } = await admin.from("submissions").insert([
      { user_id: userA.id, year: seasonYear, ...A_PICKS, champion_id: null },
      { user_id: userB.id, year: seasonYear, ...B_PICKS, champion_id: null },
      { user_id: userB.id, year: noSubmissionYear, ...B_PICKS, champion_id: null },
    ]);
    if (error) throw error;
  });

  afterAll(async () => {
    if (!admin) return;
    const failures: string[] = [];
    // submissions -> profiles has no cascade, so submissions go first.
    for (const id of createdUserIds) {
      const { error } = await admin.from("submissions").delete().eq("user_id", id);
      if (error) failures.push(`submissions ${id}: ${error.message}`);
    }
    for (const id of createdUserIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) failures.push(`user ${id}: ${error.message}`);
    }
    for (const year of [seasonYear, noSubmissionYear]) {
      const { error } = await admin.from("seasons").delete().eq("year", year);
      if (error) failures.push(`season ${year}: ${error.message}`);
    }
    if (failures.length) throw new Error(`cleanup failed: ${failures.join("; ")}`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    jar.clear();
    clock.at = new Date(OPENS.getTime() + 60_000);
    // Restored in afterEach so the spy doesn't leak into other suites.
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Put A back to the starting state so tests don't depend on each other.
    const { error } = await admin
      .from("submissions")
      .update({ ...A_PICKS, champion_id: null, updated_at: null })
      .eq("user_id", userA.id)
      .eq("year", seasonYear);
    if (error) throw error;
  });

  describe("the edit window boundaries", () => {
    it.each([
      ["one millisecond before it opens", () => new Date(OPENS.getTime() - 1), 403],
      ["at the exact opening instant", () => OPENS, 200],
      ["one millisecond before it closes", () => new Date(CLOSES.getTime() - 1), 200],
      ["at the exact closing instant", () => CLOSES, 403],
    ])("%s", async (_label, at, expectedStatus) => {
      await signInAsA();
      clock.at = at();
      const before = await rowOf(userA.id);

      const response = await put(seasonYear);

      expect(response.status).toBe(expectedStatus);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      if (expectedStatus === 403) {
        expect(await response.json()).toEqual({
          error: "outside-edit-window",
          editOpensAt: OPENS.toISOString(),
          editClosesAt: CLOSES.toISOString(),
        });
        expect(await rowOf(userA.id)).toEqual(before);
      }
    });
  });

  it("saves the picks, returns the stored row, and leaves initial picks and submitted_at alone", async () => {
    await signInAsA();
    const before = await rowOf(userA.id);

    const response = await put(seasonYear);

    expect(response.status).toBe(200);
    const result = await response.json();
    const after = await rowOf(userA.id);
    expect(result).toEqual({
      year: seasonYear,
      initialPlayoff: after.initial_playoff,
      initialTiebreakers: after.initial_tiebreakers,
      currentPlayoff: after.current_playoff,
      currentTiebreakers: after.current_tiebreakers,
      championId: after.champion_id,
      submittedAt: after.submitted_at,
      updatedAt: after.updated_at,
    });
    expect(after.current_playoff).toEqual(NEW_PICKS.currentPlayoff);
    expect(after.current_tiebreakers).toEqual(NEW_PICKS.currentTiebreakers);
    expect(after.champion_id).toBe(championId);
    expect(after.initial_playoff).toEqual(A_PICKS.initial_playoff);
    expect(after.initial_tiebreakers).toEqual(A_PICKS.initial_tiebreakers);
    expect(after.submitted_at).toBe(before.submitted_at);
    expect(new Date(after.updated_at).getTime()).toBe(clock.at!.getTime());
  });

  it("a valid PUT by A leaves B's row unchanged", async () => {
    await signInAsA();
    const bBefore = await rowOf(userB.id);

    expect((await put(seasonYear)).status).toBe(200);

    expect(await rowOf(userB.id)).toEqual(bBefore);
  });

  it.each(["userId", "user_id"])("a body naming another user (%s) is rejected and B is unchanged", async (key) => {
    await signInAsA();
    const bBefore = await rowOf(userB.id);
    const aBefore = await rowOf(userA.id);

    const response = await put(seasonYear, { ...body(), [key]: userB.id });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid-body" });
    expect(await rowOf(userB.id)).toEqual(bBefore);
    expect(await rowOf(userA.id)).toEqual(aBefore);
  });

  it("a body trying to change initial picks is rejected", async () => {
    await signInAsA();
    const before = await rowOf(userA.id);

    const response = await put(seasonYear, { ...body(), initialPlayoff: NEW_PICKS.currentPlayoff });

    expect(response.status).toBe(400);
    expect(await rowOf(userA.id)).toEqual(before);
  });

  // The next two tests go around the route and prove RLS and the column
  // grants on their own. The app's own user_id filter is pinned by
  // lib/submissions/update-submission.test.ts.
  it("A's server client updating B's row affects no rows", async () => {
    const { createSupabaseServerClient } = await import("../../lib/supabase/server");
    await signInAsA();
    const bBefore = await rowOf(userB.id);

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("submissions")
      .update({ current_tiebreakers: [1, 2, 3] })
      .eq("user_id", userB.id)
      .select();

    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await rowOf(userB.id)).toEqual(bBefore);
  });

  it("A's server client cannot update initial_playoff (permission denied)", async () => {
    const { createSupabaseServerClient } = await import("../../lib/supabase/server");
    await signInAsA();
    const before = await rowOf(userA.id);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("submissions")
      .update({ initial_playoff: NEW_PICKS.currentPlayoff })
      .eq("user_id", userA.id)
      .eq("year", seasonYear);

    expect(error?.code).toBe("42501");
    expect(await rowOf(userA.id)).toEqual(before);
  });

  it("returns 401 without a session and writes nothing", async () => {
    const before = await rowOf(userA.id);

    const response = await put(seasonYear);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await rowOf(userA.id)).toEqual(before);
  });

  it("returns 403 with null times for a year with no season", async () => {
    await signInAsA();

    const response = await put(noSeasonYear);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "outside-edit-window", editOpensAt: null, editClosesAt: null });
  });

  it("returns 404 when A has no submission in an open year", async () => {
    await signInAsA();
    const bBefore = await rowOf(userB.id, noSubmissionYear);

    const response = await put(noSubmissionYear);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "submission-not-found" });
    expect(await rowOf(userB.id, noSubmissionYear)).toEqual(bBefore);
  });

  it("returns 400 for a champion that is not a team and writes nothing", async () => {
    await signInAsA();
    const before = await rowOf(userA.id);

    const response = await put(seasonYear, { ...body(), championId: 2147483647 });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid-body" });
    expect(await rowOf(userA.id)).toEqual(before);
  });

  it("returns 415 for the wrong content type", async () => {
    await signInAsA();

    const response = await put(seasonYear, JSON.stringify(body()), { "content-type": "text/plain" });

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "unsupported-media-type" });
  });

  it("returns 400 for malformed JSON", async () => {
    await signInAsA();

    const response = await put(seasonYear, "{not json");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid-body" });
  });
});
