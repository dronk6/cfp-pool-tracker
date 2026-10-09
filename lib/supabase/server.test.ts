// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createServerClient = vi.hoisted(() => vi.fn(() => ({ kind: "client" })));
const cookiesCalled = vi.hoisted(() => vi.fn());
const cookieStore = vi.hoisted(() => ({
  getAll: vi.fn(() => [{ name: "a", value: "1" }]),
  set: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("next/headers", () => ({
  cookies: async () => {
    cookiesCalled();
    return cookieStore;
  },
}));

import { createSupabaseServerClient } from "./server";

type Options = {
  cookieOptions: Record<string, unknown>;
  cookies: {
    getAll: () => unknown;
    setAll: (c: { name: string; value: string; options: object }[]) => void;
  };
};

function lastOptions(): Options {
  const calls = createServerClient.mock.calls as unknown as [string, string, Options][];
  return calls[calls.length - 1][2];
}

describe("createSupabaseServerClient", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    createServerClient.mockClear();
    cookiesCalled.mockClear();
    cookieStore.set.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("builds the client from the URL and publishable key", async () => {
    await createSupabaseServerClient();
    expect(createServerClient).toHaveBeenCalledWith(
      "http://127.0.0.1:54321",
      "sb_publishable_test",
      expect.any(Object),
    );
  });

  it.each(["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"])("throws a clear error when %s is missing", async (name) => {
    vi.stubEnv(name, "");
    await expect(createSupabaseServerClient()).rejects.toThrow(/SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY/);
  });

  it("reads the request cookies before the env, so a missing env fails at request time", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    await expect(createSupabaseServerClient()).rejects.toThrow(/SUPABASE_URL/);
    expect(cookiesCalled).toHaveBeenCalledOnce();
  });

  it("makes cookies HttpOnly, SameSite=Lax, path /, and Secure only in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await createSupabaseServerClient();
    expect(lastOptions().cookieOptions).toEqual({ path: "/", sameSite: "lax", httpOnly: true, secure: true });

    vi.stubEnv("NODE_ENV", "development");
    await createSupabaseServerClient();
    expect(lastOptions().cookieOptions).toMatchObject({ httpOnly: true, secure: false });
  });

  it("reads cookies from the request and writes them through next/headers", async () => {
    await createSupabaseServerClient();
    const { cookies } = lastOptions();
    expect(cookies.getAll()).toEqual([{ name: "a", value: "1" }]);
    cookies.setAll([{ name: "sb", value: "v", options: { path: "/" } }]);
    expect(cookieStore.set).toHaveBeenCalledWith("sb", "v", { path: "/" });
  });

  it("ignores a failed cookie write (Server Components can't set cookies)", async () => {
    cookieStore.set.mockImplementation(() => {
      throw new Error("read-only");
    });
    await createSupabaseServerClient();
    expect(() => lastOptions().cookies.setAll([{ name: "sb", value: "v", options: {} }])).not.toThrow();
  });
});
