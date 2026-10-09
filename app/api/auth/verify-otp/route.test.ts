// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { verifyOtp } }),
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/auth/verify-otp", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("POST /api/auth/verify-otp", () => {
  beforeEach(() => {
    verifyOtp.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each(["123456", "12345678"])("verifies a %s code and returns success", async (otp) => {
    verifyOtp.mockResolvedValue({ data: {}, error: null });
    const response = await post({ email: " Fan@Example.com ", otp });
    expect(verifyOtp).toHaveBeenCalledWith({ email: "fan@example.com", token: otp, type: "email" });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"success":true}');
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns a generic 401 when Supabase rejects the code", async () => {
    verifyOtp.mockResolvedValue({ data: {}, error: { code: "otp_expired", status: 403 } });
    const response = await post({ email: "a@b.co", otp: "123456" });
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('{"success":false}');
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns the same 401 when Supabase throws", async () => {
    verifyOtp.mockRejectedValue(new Error("down"));
    const response = await post({ email: "a@b.co", otp: "123456" });
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('{"success":false}');
  });

  it.each([
    ["empty code", { email: "a@b.co", otp: "" }],
    ["non-digit code", { email: "a@b.co", otp: "12ab56" }],
    ["code with spaces", { email: "a@b.co", otp: "123 456" }],
    ["numeric code", { email: "a@b.co", otp: 123456 }],
    ["missing code", { email: "a@b.co" }],
    ["overlong code", { email: "a@b.co", otp: "1".repeat(65) }],
    ["bad email", { email: "nope", otp: "123456" }],
    ["invalid JSON", "{oops"],
  ])("returns 401 for %s without calling Supabase", async (_label, body) => {
    const response = await post(body);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('{"success":false}');
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
