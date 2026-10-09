// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signOut } }),
}));

import * as route from "./route";

describe("POST /api/logout", () => {
  beforeEach(() => {
    signOut.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("signs out this device only and reports success", async () => {
    signOut.mockResolvedValue({ error: null });

    const response = await route.POST();

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("succeeds when nobody is signed in (Supabase has nothing to do)", async () => {
    signOut.mockResolvedValue({ error: null });

    expect((await route.POST()).status).toBe(200);
  });

  it("returns 500 and logs only the code and status when Supabase errors", async () => {
    signOut.mockResolvedValue({ error: { code: "unexpected_failure", status: 500, message: "private detail" } });

    const response = await route.POST();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(console.error).toHaveBeenCalledWith("logout: Supabase signOut failed", {
      code: "unexpected_failure",
      status: 500,
    });
  });

  it("returns 500 and logs only the error name when something throws", async () => {
    signOut.mockRejectedValue(new TypeError("secret detail"));

    const response = await route.POST();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false });
    expect(console.error).toHaveBeenCalledWith("logout: unexpected failure", "TypeError");
  });

  it("exports only POST, so GET is not allowed", () => {
    expect(Object.keys(route)).toEqual(["POST"]);
  });
});
