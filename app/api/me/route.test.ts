// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionProfile = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/auth/profile", () => ({ getSessionProfile }));

const unstable_rethrow = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ unstable_rethrow }));

import * as route from "./route";

describe("GET /api/me", () => {
  beforeEach(() => {
    getSessionProfile.mockReset();
    unstable_rethrow.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns the session user's name and email", async () => {
    getSessionProfile.mockResolvedValue({ signedIn: true, profile: { name: "Ada", email: "ada@example.test" } });

    const response = await route.GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "Ada", email: "ada@example.test" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects a request without a valid session with 401", async () => {
    getSessionProfile.mockResolvedValue({ signedIn: false });

    const response = await route.GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 404 for a signed-in user with no profile row", async () => {
    getSessionProfile.mockResolvedValue({ signedIn: true, profile: null });

    const response = await route.GET();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "profile-not-found" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 500 and logs only the error name when the lookup fails", async () => {
    getSessionProfile.mockRejectedValue(new TypeError("secret detail"));

    const response = await route.GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(console.error).toHaveBeenCalledWith("me: unexpected failure", "TypeError");
  });

  it("rethrows Next.js control-flow errors instead of answering 500", async () => {
    const bailout = new Error("bailout");
    getSessionProfile.mockRejectedValue(bailout);
    unstable_rethrow.mockImplementation((error) => {
      throw error;
    });

    await expect(route.GET()).rejects.toBe(bailout);
  });

  it("takes no request input and exports only GET", () => {
    expect(route.GET.length).toBe(0);
    expect(Object.keys(route)).toEqual(["GET"]);
  });
});
