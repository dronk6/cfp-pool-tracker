// @vitest-environment node
// Runs the real route handlers against the local Supabase stack (see README →
// Testing). Only next/headers is faked, with an in-memory cookie jar standing
// in for the request's cookies.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalAdminClient, runDbTests } from "../../../tests/local-db";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));

// after() has no request scope here; run its callbacks by hand so we can await them.
const scheduled = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => unknown) => void scheduled.push(callback),
}));
const runScheduled = async () => {
  await Promise.all(scheduled.splice(0).map((callback) => callback()));
};

describe.skipIf(!runDbTests)("OTP sign-in against the local stack", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const registeredEmail = `otp-test-${randomUUID()}@example.test`;
  const unregisteredEmail = `otp-test-${randomUUID()}@example.test`;

  const call = (handler: (r: Request) => Promise<Response>, body: object) =>
    handler(new Request("http://localhost/api/auth", { method: "POST", body: JSON.stringify(body) }));

  beforeAll(async () => {
    admin = createLocalAdminClient();
    // The server client reads these at call time; createLocalAdminClient has loaded .env.local.
    expect(process.env.SUPABASE_PUBLISHABLE_KEY, "SUPABASE_PUBLISHABLE_KEY missing from .env.local").toBeTruthy();
    const { data, error } = await admin.auth.admin.createUser({ email: registeredEmail, email_confirm: true });
    if (error) throw error;
    createdUserIds.push(data.user.id);
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
  });

  beforeEach(() => {
    jar.clear();
    scheduled.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("answers request-otp identically for registered and unregistered emails", async () => {
    const { POST } = await import("./request-otp/route");
    const registered = await call(POST, { email: registeredEmail });
    const unregistered = await call(POST, { email: unregisteredEmail });
    await runScheduled(); // the deferred signInWithOtp calls must not change anything visible

    expect(registered.status).toBe(200);
    expect(unregistered.status).toBe(registered.status);
    expect(await unregistered.text()).toBe(await registered.text());
    // Per-request headers (Date) would differ; the rest must not.
    const comparable = (r: Response) => [...r.headers].filter(([name]) => name !== "date");
    expect(comparable(unregistered)).toEqual(comparable(registered));
    expect(jar.size).toBe(0); // requesting a code sets no cookies in either case
  });

  it("does not create a user for an unregistered email", async () => {
    const { POST } = await import("./request-otp/route");
    await call(POST, { email: unregisteredEmail });
    await runScheduled();
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    expect(data.users.some((u) => u.email === unregisteredEmail)).toBe(false);
  });

  it("verify-otp turns a valid code into a session that getCurrentUser can read", async () => {
    const { POST } = await import("./verify-otp/route");
    const { getCurrentUser } = await import("../../../lib/auth/current-user");
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: registeredEmail });
    if (error) throw error;

    const response = await call(POST, { email: registeredEmail, otp: data.properties.email_otp });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect([...jar.keys()].some((name) => name.startsWith("sb-"))).toBe(true);
    expect((await getCurrentUser())?.email).toBe(registeredEmail);
  });

  it("verify-otp rejects a wrong code and sets no session", async () => {
    const { POST } = await import("./verify-otp/route");
    const { getCurrentUser } = await import("../../../lib/auth/current-user");
    const response = await call(POST, { email: registeredEmail, otp: "00000000" });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false });
    expect(jar.size).toBe(0);
    expect(await getCurrentUser()).toBeNull();
  });
});
