// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
vi.mock("../supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));

import { getCurrentUser } from "./current-user";

describe("getCurrentUser", () => {
  it("returns the verified user", async () => {
    const user = { id: "u1", email: "a@b.co" };
    getUser.mockResolvedValue({ data: { user }, error: null });
    expect(await getCurrentUser()).toBe(user);
  });

  it("returns null when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null when Supabase reports an error", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });
    expect(await getCurrentUser()).toBeNull();
  });
});
