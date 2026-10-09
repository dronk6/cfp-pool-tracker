// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionSubmission = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/submissions/submission", () => ({ getSessionSubmission }));

const unstable_rethrow = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ unstable_rethrow }));

import * as route from "./route";

const submission = {
  year: 2026,
  initialPlayoff: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  initialTiebreakers: [13, 14, 15],
  currentPlayoff: [2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 20],
  currentTiebreakers: [13, 14, 16],
  championId: null,
  submittedAt: "2026-09-01T00:00:00+00:00",
  updatedAt: null,
};

type Ctx = Parameters<typeof route.GET>[1];
const call = (year: string, request = new Request("http://localhost/api/submissions/" + year)) =>
  route.GET(request, { params: Promise.resolve({ year }) } as unknown as Ctx);

describe("GET /api/submissions/:year", () => {
  beforeEach(() => {
    getSessionSubmission.mockReset();
    unstable_rethrow.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns the session user's submission as flat camelCase", async () => {
    getSessionSubmission.mockResolvedValue({ signedIn: true, submission });

    const response = await call("2026");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(submission);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getSessionSubmission).toHaveBeenCalledWith(2026);
  });

  it("rejects an invalid year with 400 and never looks anything up", async () => {
    const response = await call("2026abc");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid-year" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getSessionSubmission).not.toHaveBeenCalled();
  });

  it("rejects a request without a valid session with 401", async () => {
    getSessionSubmission.mockResolvedValue({ signedIn: false });

    const response = await call("2026");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 404 when the user has no submission for the year", async () => {
    getSessionSubmission.mockResolvedValue({ signedIn: true, submission: null });

    const response = await call("2025");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "submission-not-found" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("ignores a spoofed user id in the query, a header and the body", async () => {
    getSessionSubmission.mockResolvedValue({ signedIn: true, submission });
    const spoofed = new Request("http://localhost/api/submissions/2026?userId=other&user_id=other", {
      method: "GET",
      headers: { "x-user-id": "other", "x-supabase-user-id": "other" },
    });

    const response = await call("2026", spoofed);

    expect(response.status).toBe(200);
    expect(getSessionSubmission).toHaveBeenCalledTimes(1);
    expect(getSessionSubmission).toHaveBeenCalledWith(2026);
    expect(spoofed.bodyUsed).toBe(false);
  });

  it("returns 500 and logs only the error name when the lookup fails", async () => {
    getSessionSubmission.mockRejectedValue(new TypeError("secret detail"));

    const response = await call("2026");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(console.error).toHaveBeenCalledWith("submissions: unexpected failure", "TypeError");
  });

  it("rethrows Next.js control-flow errors instead of answering 500", async () => {
    const bailout = new Error("bailout");
    getSessionSubmission.mockRejectedValue(bailout);
    unstable_rethrow.mockImplementation((error) => {
      throw error;
    });

    await expect(call("2026")).rejects.toBe(bailout);
  });

  it("exports only GET", () => {
    expect(Object.keys(route)).toEqual(["GET"]);
  });
});
