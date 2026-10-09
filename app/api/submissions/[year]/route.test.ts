// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionSubmission = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/submissions/submission", () => ({ getSessionSubmission }));

const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/auth/current-user", () => ({ getCurrentUser }));

const updateSessionSubmission = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/submissions/update-submission", () => ({ updateSessionSubmission }));

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

  it("exports only GET and PUT", () => {
    expect(Object.keys(route).sort()).toEqual(["GET", "PUT"]);
  });
});

const picks = {
  currentPlayoff: [2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  currentTiebreakers: [13, 14, 16],
  championId: 2,
};

const put = (
  year: string,
  body: unknown = picks,
  headers: Record<string, string> = { "content-type": "application/json" },
) =>
  route.PUT(
    new Request("http://localhost/api/submissions/" + year, {
      method: "PUT",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ year }) } as unknown as Ctx,
  );

describe("PUT /api/submissions/:year", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    updateSessionSubmission.mockReset();
    unstable_rethrow.mockReset();
    getCurrentUser.mockResolvedValue({ id: "u1" });
    updateSessionSubmission.mockResolvedValue({ status: "updated", submission });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  async function expectError(response: Response, status: number, body: object) {
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  }

  it("saves the picks and returns the full submission", async () => {
    const response = await put("2026");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(submission);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(updateSessionSubmission).toHaveBeenCalledWith(2026, picks);
  });

  it("accepts a content type with parameters, in any case", async () => {
    const response = await put("2026", picks, { "content-type": "Application/JSON; charset=utf-8" });

    expect(response.status).toBe(200);
  });

  it("rejects an invalid year with 400 before anything else", async () => {
    await expectError(await put("2026abc"), 400, { error: "invalid-year" });
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(updateSessionSubmission).not.toHaveBeenCalled();
  });

  it("rejects a request without a session with 401, even with a bad body or content type", async () => {
    getCurrentUser.mockResolvedValue(null);

    await expectError(await put("2026"), 401, { error: "unauthenticated" });
    await expectError(await put("2026", "nope", { "content-type": "text/plain" }), 401, {
      error: "unauthenticated",
    });
    expect(updateSessionSubmission).not.toHaveBeenCalled();
  });

  it("answers 401 if the session ends before the write", async () => {
    updateSessionSubmission.mockResolvedValue({ status: "unauthenticated" });

    await expectError(await put("2026"), 401, { error: "unauthenticated" });
  });

  it.each(["text/plain", "application/x-www-form-urlencoded", "application/jsonp", ""])(
    "rejects content type %j with 415",
    async (type) => {
      const headers: Record<string, string> = type ? { "content-type": type } : {};
      await expectError(await put("2026", JSON.stringify(picks), headers), 415, {
        error: "unsupported-media-type",
      });
      expect(updateSessionSubmission).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["malformed JSON", "{nope"],
    ["an empty body", ""],
    ["an array", [1, 2, 3]],
    ["a wrong shape", { ...picks, currentTiebreakers: [1] }],
    ["an extra userId", { ...picks, userId: "someone-else" }],
    ["an extra user_id", { ...picks, user_id: "someone-else" }],
    ["a null champion", { ...picks, championId: null }],
  ])("rejects %s with 400 invalid-body", async (_label, body) => {
    await expectError(await put("2026", body), 400, { error: "invalid-body" });
    expect(updateSessionSubmission).not.toHaveBeenCalled();
  });

  it("answers 403 with the window times as ISO strings outside the window", async () => {
    updateSessionSubmission.mockResolvedValue({
      status: "outside-window",
      season: { year: 2026, editOpensAt: "2026-10-11T04:00:00+00:00", editClosesAt: "2026-10-17T16:00:00+00:00" },
    });

    await expectError(await put("2026"), 403, {
      error: "outside-edit-window",
      editOpensAt: "2026-10-11T04:00:00.000Z",
      editClosesAt: "2026-10-17T16:00:00.000Z",
    });
  });

  it("answers 403 with null times when the year has no season", async () => {
    updateSessionSubmission.mockResolvedValue({ status: "outside-window", season: null });

    await expectError(await put("2031"), 403, { error: "outside-edit-window", editOpensAt: null, editClosesAt: null });
  });

  it("checks the body before the window, so an invalid body is 400 even outside the window", async () => {
    updateSessionSubmission.mockResolvedValue({ status: "outside-window", season: null });

    await expectError(await put("2026", { ...picks, userId: "someone-else" }), 400, { error: "invalid-body" });
    expect(updateSessionSubmission).not.toHaveBeenCalled();
  });

  it("answers 400 invalid-body for a champion that is not a team", async () => {
    updateSessionSubmission.mockResolvedValue({ status: "invalid-champion" });

    await expectError(await put("2026"), 400, { error: "invalid-body" });
  });

  it("answers 404 when the user has no submission for the year", async () => {
    updateSessionSubmission.mockResolvedValue({ status: "not-found" });

    await expectError(await put("2026"), 404, { error: "submission-not-found" });
  });

  it("answers 500 and logs only the error name", async () => {
    updateSessionSubmission.mockRejectedValue(new TypeError("secret detail"));

    await expectError(await put("2026"), 500, { error: "internal" });
    expect(console.error).toHaveBeenCalledWith("submissions: unexpected failure", "TypeError");
  });

  it("logs only the PostgREST code for a database error", async () => {
    updateSessionSubmission.mockRejectedValue({ code: "XX000", message: "secret detail", details: "row data" });

    await expectError(await put("2026"), 500, { error: "internal" });
    expect(console.error).toHaveBeenCalledWith("submissions: unexpected failure", "XX000");
  });

  it("rethrows Next.js control-flow errors instead of answering 500", async () => {
    const bailout = new Error("bailout");
    getCurrentUser.mockRejectedValue(bailout);
    unstable_rethrow.mockImplementation((error) => {
      throw error;
    });

    await expect(put("2026")).rejects.toBe(bailout);
  });
});
