// @vitest-environment node
// Runs GET /api/submissions/:year against the local stack (see README →
// Testing). Only next/headers is faked, with an in-memory cookie jar standing
// in for the request's cookies. Never writes to `teams`: the champion id comes
// from the already-seeded table.
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

const YEAR = 2026;
const A_PICKS = {
  initial_playoff: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  initial_tiebreakers: [13, 14, 15],
  current_playoff: [2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  current_tiebreakers: [13, 14, 16],
};
const B_PICKS_2026 = {
  initial_playoff: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  initial_tiebreakers: [15, 14, 13],
  current_playoff: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
  current_tiebreakers: [33, 34, 35],
};
const B_PICKS_2025 = {
  initial_playoff: [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52],
  initial_tiebreakers: [53, 54, 55],
  current_playoff: [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52],
  current_tiebreakers: [53, 54, 55],
};

describe.skipIf(!runDbTests)("GET /api/submissions/:year against the local stack", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const userA = { email: `subs22-a-${stamp}@example.test`, name: "Submissions Test A", id: "" };
  const userB = { email: `subs22-b-${stamp}@example.test`, name: "Submissions Test B", id: "" };
  let championId = 0;

  async function get(year: string, init?: RequestInit, query = "") {
    const { GET } = await import("./submissions/[year]/route");
    const request = new Request(`http://localhost/api/submissions/${year}${query}`, init);
    return GET(request, { params: Promise.resolve({ year }) } as never);
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

  const headersWithoutDate = (response: Response) => {
    const copy = new Headers(response.headers);
    copy.delete("date");
    return [...copy].sort();
  };

  beforeAll(async () => {
    admin = createLocalAdminClient();
    expect(process.env.SUPABASE_PUBLISHABLE_KEY, "SUPABASE_PUBLISHABLE_KEY missing from .env.local").toBeTruthy();

    const { data: team, error: teamError } = await admin.from("teams").select("id").limit(1).maybeSingle();
    if (teamError) throw teamError;
    if (!team) throw new Error("teams is empty; run `npm run seed:teams` against the local stack first");
    championId = team.id;

    await createUserWithProfile(userA);
    await createUserWithProfile(userB);
    const { error } = await admin.from("submissions").insert([
      { user_id: userA.id, year: YEAR, ...A_PICKS, champion_id: championId },
      { user_id: userB.id, year: YEAR, ...B_PICKS_2026, champion_id: null },
      { user_id: userB.id, year: 2025, ...B_PICKS_2025, champion_id: null },
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

  it("returns 401 without a session", async () => {
    const response = await get("2026");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns exactly the signed-in user's picks for the year", async () => {
    await signInAsA();

    const response = await get("2026");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({
      year: YEAR,
      initialPlayoff: A_PICKS.initial_playoff,
      initialTiebreakers: A_PICKS.initial_tiebreakers,
      currentPlayoff: A_PICKS.current_playoff,
      currentTiebreakers: A_PICKS.current_tiebreakers,
      championId,
      submittedAt: expect.any(String),
      updatedAt: null,
    });
  });

  it("user A cannot read user B's submission", async () => {
    await signInAsA();

    const response = await get(
      "2026",
      {
        method: "GET",
        headers: { "x-user-id": userB.id, "x-supabase-user-id": userB.id },
      },
      `?userId=${userB.id}&user_id=${userB.id}`,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.initialPlayoff).toEqual(A_PICKS.initial_playoff);
    expect(body.currentPlayoff).toEqual(A_PICKS.current_playoff);
    expect(JSON.stringify(body)).not.toContain(JSON.stringify(B_PICKS_2026.current_playoff));
  });

  it("answers a year only B has exactly like a year nobody has", async () => {
    await signInAsA();

    const onlyB = await get("2025");
    const nobody = await get("2031");

    expect(onlyB.status).toBe(404);
    expect(onlyB.status).toBe(nobody.status);
    expect(await onlyB.json()).toEqual(await nobody.json());
    expect(headersWithoutDate(onlyB)).toEqual(headersWithoutDate(nobody));
  });

  it("row level security shows a signed-in user only their own submissions", async () => {
    const { createSupabaseServerClient } = await import("../../lib/supabase/server");
    await signInAsA();

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("submissions").select("user_id, year");

    expect(error).toBeNull();
    expect(data).toEqual([{ user_id: userA.id, year: YEAR }]);
  });

  it("rejects replayed cookies after logout", async () => {
    const { POST } = await import("./logout/route");
    await signInAsA();
    const oldCookies = new Map(jar);
    expect((await get("2026")).status).toBe(200);

    expect((await POST()).status).toBe(200);
    expect(jar.size).toBe(0);

    for (const [name, value] of oldCookies) jar.set(name, value);
    expect((await get("2026")).status).toBe(401);
  });

  it("rejects an invalid year with 400", async () => {
    await signInAsA();

    const response = await get("2026abc");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid-year" });
  });
});
