// @vitest-environment node
// Loads the My Picks data against the local stack (see README → Testing).
// Only next/headers is faked, with an in-memory cookie jar standing in for the
// request's cookies. Never writes to `teams`: names come from the
// already-seeded table, and a throwaway year keeps these rows apart from real ones.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

const YEAR = 2098;
const EMPTY_YEAR = 2097;
const UNKNOWN_TEAM_ID = 999999;

describe.skipIf(!runDbTests)("My Picks data against the local stack", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const userA = { email: `mypicks-a-${stamp}@example.test`, name: "My Picks Test A", id: "" };
  const userB = { email: `mypicks-b-${stamp}@example.test`, name: "My Picks Test B", id: "" };
  let teamNames: Map<number, string>;
  let ids: number[];

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

  async function signInAs(user: typeof userA) {
    const { POST } = await import("../api/auth/verify-otp/route");
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email });
    if (error) throw error;
    const response = await POST(
      new Request("http://localhost/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email: user.email, otp: data.properties.email_otp }),
      }),
    );
    expect(response.status).toBe(200);
  }

  const picks = (playoff: number[], tiebreakers: number[]) => ({
    initial_playoff: playoff,
    initial_tiebreakers: tiebreakers,
    current_playoff: playoff,
    current_tiebreakers: tiebreakers,
  });

  beforeAll(async () => {
    admin = createLocalAdminClient();
    expect(process.env.SUPABASE_PUBLISHABLE_KEY, "SUPABASE_PUBLISHABLE_KEY missing from .env.local").toBeTruthy();

    const { data: teams, error: teamError } = await admin.from("teams").select("id,name").order("id").limit(30);
    if (teamError) throw teamError;
    if (!teams || teams.length < 30) throw new Error("teams is not seeded; run `npm run seed:teams` against the local stack first");
    teamNames = new Map(teams.map((t) => [t.id, t.name]));
    ids = teams.map((t) => t.id);

    await createUserWithProfile(userA);
    await createUserWithProfile(userB);
    const { error } = await admin.from("submissions").insert([
      // A's last tiebreaker is an id that isn't a team.
      { user_id: userA.id, year: YEAR, ...picks(ids.slice(0, 12), [ids[12], ids[13], UNKNOWN_TEAM_ID]), champion_id: ids[0] },
      { user_id: userB.id, year: YEAR, ...picks(ids.slice(15, 27), ids.slice(27, 30)), champion_id: null },
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
    // Deleting the auth user cascades to its profiles row.
    for (const id of createdUserIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) failures.push(`user ${id}: ${error.message}`);
    }
    if (failures.length) throw new Error(`cleanup failed: ${failures.join("; ")}`);
  });

  beforeEach(() => {
    jar.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("is signed out without a session", async () => {
    const { loadMyPicks } = await import("./load-my-picks");

    expect(await loadMyPicks(YEAR)).toEqual({ kind: "signed-out" });
  });

  it("shows the signed-in user's own picks with names, the champion and the unknown-team fallback", async () => {
    const { loadMyPicks } = await import("./load-my-picks");
    await signInAs(userA);

    const result = await loadMyPicks(YEAR);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.view.playoff.map((p) => p.name)).toEqual(ids.slice(0, 12).map((id) => teamNames.get(id)));
    expect(result.view.tiebreakers.map((p) => [p.rank, p.name])).toEqual([
      [13, teamNames.get(ids[12])],
      [14, teamNames.get(ids[13])],
      [15, `Unknown team (#${UNKNOWN_TEAM_ID})`],
    ]);
    expect(result.view.champion?.name).toBe(teamNames.get(ids[0]));
  });

  it("never shows user A another user's picks", async () => {
    const { loadMyPicks } = await import("./load-my-picks");
    await signInAs(userA);

    const result = await loadMyPicks(YEAR);
    const json = JSON.stringify(result);

    // The team list for the choosers holds every team, so only the picks view can show whose picks these are.
    const viewJson = JSON.stringify(result.kind === "ok" ? result.view : result);
    for (const id of ids.slice(15, 30)) expect(viewJson).not.toContain(JSON.stringify(teamNames.get(id)));
    expect(json).not.toContain(userA.email);
    expect(json).not.toContain(userA.id);
  });

  it("shows user B their own picks, with no champion", async () => {
    const { loadMyPicks } = await import("./load-my-picks");
    await signInAs(userB);

    const result = await loadMyPicks(YEAR);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.view.playoff[0].name).toBe(teamNames.get(ids[15]));
    expect(result.view.champion).toBeNull();
  });

  it("has no submission for a year the user has no row for", async () => {
    const { loadMyPicks } = await import("./load-my-picks");
    await signInAs(userA);

    expect(await loadMyPicks(EMPTY_YEAR)).toEqual({ kind: "no-submission" });
  });
});
