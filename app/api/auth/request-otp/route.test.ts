// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/supabase/stateless", () => ({
  createSupabaseStatelessClient: () => ({ auth: { signInWithOtp } }),
}));

// Outside a real request, after() has no scope, so collect its callbacks and run them by hand.
const scheduled = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => unknown) => void scheduled.push(callback),
}));

import { POST } from "./route";

const runScheduled = async () => {
  await Promise.all(scheduled.splice(0).map((callback) => callback()));
};

const post = (body: string) => POST(new Request("http://localhost/api/auth/request-otp", { method: "POST", body }));
const postEmail = (email: unknown) => post(JSON.stringify({ email }));

async function snapshot(response: Response) {
  return { status: response.status, body: await response.text(), cacheControl: response.headers.get("cache-control") };
}

describe("POST /api/auth/request-otp", () => {
  beforeEach(() => {
    signInWithOtp.mockReset();
    scheduled.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("requests a code without creating users, using the normalised email", async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: null });
    const result = await snapshot(await postEmail("  Fan@Example.com "));
    expect(signInWithOtp).not.toHaveBeenCalled(); // deferred until after the response
    await runScheduled();
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "fan@example.com",
      options: { shouldCreateUser: false },
    });
    expect(result).toEqual({ status: 200, body: '{"success":true}', cacheControl: "no-store" });
  });

  it("answers byte-identically whatever Supabase does, without waiting for it", async () => {
    const outcomes = [
      { data: {}, error: null },
      { data: {}, error: { name: "AuthApiError", status: 422, code: "otp_disabled" } }, // signups not allowed
      { data: {}, error: { name: "AuthApiError", status: 429, code: "over_email_send_rate_limit" } },
      { data: {}, error: { name: "AuthApiError", status: 429, code: "over_request_rate_limit" } },
      { data: {}, error: { name: "AuthRetryableFetchError", status: 0 } },
    ];
    const snapshots = [];
    for (const outcome of outcomes) {
      signInWithOtp.mockResolvedValue(outcome);
      snapshots.push(await snapshot(await postEmail("a@b.co")));
      await runScheduled();
    }
    signInWithOtp.mockRejectedValue(new Error("boom"));
    snapshots.push(await snapshot(await postEmail("a@b.co")));
    await runScheduled();

    expect(snapshots[0]).toEqual({ status: 200, body: '{"success":true}', cacheControl: "no-store" });
    for (const s of snapshots) expect(s).toEqual(snapshots[0]);
  });

  it("responds before a slow Supabase call finishes", async () => {
    signInWithOtp.mockReturnValue(new Promise(() => {})); // never settles
    const response = await postEmail("a@b.co");
    expect(response.status).toBe(200);
  });

  it("logs errors from the deferred call instead of throwing", async () => {
    signInWithOtp.mockRejectedValue(new Error("boom"));
    await postEmail("a@b.co");
    await expect(runScheduled()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("does not log the email address", async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: { name: "E", status: 400, code: "x", message: "a@b.co" } });
    await postEmail("a@b.co");
    await runScheduled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("a@b.co");
  });

  it.each([
    ["missing email", "{}"],
    ["not an email", JSON.stringify({ email: "nope" })],
    ["non-string email", JSON.stringify({ email: 5 })],
    ["too long", JSON.stringify({ email: `${"a".repeat(250)}@b.co` })],
    ["invalid JSON", "{oops"],
  ])("returns 400 invalid-email for %s without calling Supabase", async (_label, body) => {
    const response = await post(body);
    expect(await snapshot(response)).toEqual({
      status: 400,
      body: '{"success":false,"error":"invalid-email"}',
      cacheControl: "no-store",
    });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});
