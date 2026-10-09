// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupabaseStatelessClient } from "./stateless";

describe("createSupabaseStatelessClient", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("throws a clear error when the environment is not configured", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    expect(() => createSupabaseStatelessClient()).toThrow(/SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY/);
  });

  it("creates a client when configured", () => {
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    expect(createSupabaseStatelessClient().auth).toBeDefined();
  });
});
