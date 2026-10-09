// @vitest-environment node
// Runs GET /api/teams against the local stack (see README → Testing). Only
// next/headers is faked, with an in-memory cookie jar standing in for the
// request's cookies. Never writes to `teams` (seed-teams.db.test.ts runs in
// parallel and counts those rows): it reads whatever `npm run seed:teams`
// loaded.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

type TeamRow = { id: number; name: string; conference: string; is_power_conf: boolean; image_url: string | null };

describe.skipIf(!runDbTests)("GET /api/teams against the local stack", () => {
  let admin: SupabaseClient;
  let seeded: TeamRow[] = [];
  const createdUserIds: string[] = [];
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const withProfile = { email: `teams13-a-${stamp}@example.test`, name: "Teams Test A" };
  const withoutProfile = { email: `teams13-b-${stamp}@example.test` };

  async function createUser(email: string) {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    createdUserIds.push(data.user.id);
    return data.user.id;
  }

  async function signInAs(email: string) {
    const { POST } = await import("./auth/verify-otp/route");
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (error) throw error;
    const response = await POST(
      new Request("http://localhost/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email, otp: data.properties.email_otp }),
      }),
    );
    expect(response.status).toBe(200);
  }

  beforeAll(async () => {
    admin = createLocalAdminClient();
    expect(process.env.SUPABASE_PUBLISHABLE_KEY, "SUPABASE_PUBLISHABLE_KEY missing from .env.local").toBeTruthy();

    const { data, error } = await admin
      .from("teams")
      .select("id,name,conference,is_power_conf,image_url")
      .order("name")
      .order("id");
    if (error) throw error;
    if (!data.length) throw new Error("teams is empty; run `npm run seed:teams` against the local stack first");
    seeded = data;

    const id = await createUser(withProfile.email);
    const { error: profileError } = await admin
      .from("profiles")
      .insert({ id, name: withProfile.name, email: withProfile.email });
    if (profileError) throw profileError;
    await createUser(withoutProfile.email);
  });

  afterAll(async () => {
    if (!admin) return;
    const failures: string[] = [];
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
    const { GET } = await import("./teams/route");

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns the seeded teams, sorted by name, to a signed-in user", async () => {
    const { GET } = await import("./teams/route");
    await signInAs(withProfile.email);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body: TeamRow[] = await response.json();
    // `seeded` is read with the same order-by-name query, so equality also
    // pins the order. Database collation decides it ("Utah" sorts before
    // "UTEP"), which is not a plain JavaScript string sort.
    expect(body).toEqual(seeded);
    expect(body.find((team) => team.id === 87)).toMatchObject({ name: "Notre Dame", is_power_conf: true });
    expect(body.find((team) => team.id === 41)).toMatchObject({ name: "UConn", is_power_conf: false });
  });

  it("does not need a profiles row", async () => {
    const { GET } = await import("./teams/route");
    await signInAs(withoutProfile.email);

    const response = await GET();

    expect(response.status).toBe(200);
    expect((await response.json()).length).toBe(seeded.length);
  });

  it("row level security hides teams from the anon publishable key", async () => {
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await anon.from("teams").select("id");

    expect(error ? [] : data).toEqual([]);
  });
});
