// @vitest-environment node
// Runs /api/me and /api/logout against the local stack (see README → Testing).
// Only next/headers is faked, with an in-memory cookie jar standing in for the
// request's cookies. Setting a cookie with maxAge 0 or an empty value removes
// it, as a browser would.
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

describe.skipIf(!runDbTests)("session routes against the local stack", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const userA = { email: `logout20-a-${stamp}@example.test`, name: "Session Test A", id: "" };
  const userB = { email: `logout20-b-${stamp}@example.test`, name: "Session Test B", id: "" };

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
    await createUserWithProfile(userA);
    await createUserWithProfile(userB);
  });

  afterAll(async () => {
    if (!admin) return;
    // Deleting the auth user cascades to its profiles row.
    for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
  });

  beforeEach(() => {
    jar.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("GET /api/me returns 401 without a session", async () => {
    const { GET } = await import("./me/route");
    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  it("GET /api/me returns only the signed-in user's name and email", async () => {
    const { GET } = await import("./me/route");
    await signInAsA();

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: userA.name, email: userA.email });
  });

  it("row level security shows a signed-in user only their own profile", async () => {
    const { createSupabaseServerClient } = await import("../../lib/supabase/server");
    await signInAsA();

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("profiles").select("id, email");

    expect(error).toBeNull();
    expect(data).toEqual([{ id: userA.id, email: userA.email }]);
  });

  it("logout clears the cookies, and replaying the old ones is rejected", async () => {
    const { GET } = await import("./me/route");
    const { POST } = await import("./logout/route");
    await signInAsA();
    const oldCookies = new Map(jar);
    expect(oldCookies.size).toBeGreaterThan(0);

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(jar.size).toBe(0);

    for (const [name, value] of oldCookies) jar.set(name, value);
    expect((await GET()).status).toBe(401);
  });

  it("logout succeeds when already signed out", async () => {
    const { POST } = await import("./logout/route");
    expect((await POST()).status).toBe(200);
  });
});
