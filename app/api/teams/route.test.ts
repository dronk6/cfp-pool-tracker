// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getTeams = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/teams", () => ({ getTeams }));

const unstable_rethrow = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ unstable_rethrow }));

import * as route from "./route";

const teams = [
  { id: 1, name: "Alabama", conference: "SEC", is_power_conf: true, image_url: "https://example.test/1.png" },
  { id: 41, name: "UConn", conference: "FBS Independent", is_power_conf: false, image_url: null },
];

describe("GET /api/teams", () => {
  beforeEach(() => {
    getTeams.mockReset();
    unstable_rethrow.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns the teams as a bare array", async () => {
    getTeams.mockResolvedValue({ signedIn: true, teams });

    const response = await route.GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(teams);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns an empty array for an empty table", async () => {
    getTeams.mockResolvedValue({ signedIn: true, teams: [] });

    const response = await route.GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("rejects a request without a valid session with 401", async () => {
    getTeams.mockResolvedValue({ signedIn: false });

    const response = await route.GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 500 and logs only the error name when the lookup fails", async () => {
    getTeams.mockRejectedValue(new TypeError("secret detail"));

    const response = await route.GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(console.error).toHaveBeenCalledWith("teams: unexpected failure", "TypeError");
  });

  it("rethrows Next.js control-flow errors instead of answering 500", async () => {
    const bailout = new Error("bailout");
    getTeams.mockRejectedValue(bailout);
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
