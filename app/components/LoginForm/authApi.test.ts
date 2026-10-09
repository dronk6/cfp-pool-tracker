import { afterEach, describe, expect, it, vi } from "vitest";
import { requestCode, verifyCode } from "./authApi";

function stubFetch(result: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestCode", () => {
  it("posts the email as JSON without caching", async () => {
    const fetchMock = stubFetch(new Response(null, { status: 200 }));

    await requestCode("a@b.co");

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.co" }),
      cache: "no-store",
    });
  });

  it("reports sent for a 200", async () => {
    stubFetch(new Response("{}", { status: 200 }));
    expect(await requestCode("a@b.co")).toBe("sent");
  });

  it("reports invalid-email for a 400", async () => {
    stubFetch(new Response("{}", { status: 400 }));
    expect(await requestCode("nope")).toBe("invalid-email");
  });

  it.each([429, 500, 503])("reports sent for a %i so the answer never varies", async (status) => {
    stubFetch(new Response(null, { status }));
    expect(await requestCode("a@b.co")).toBe("sent");
  });

  it("reports network-error when fetch rejects", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    expect(await requestCode("a@b.co")).toBe("network-error");
  });
});

describe("verifyCode", () => {
  it("posts the email and code as JSON without caching", async () => {
    const fetchMock = stubFetch(new Response("{}", { status: 200 }));

    await verifyCode("a@b.co", "12345678");

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.co", otp: "12345678" }),
      cache: "no-store",
    });
  });

  it("reports ok for a successful response", async () => {
    stubFetch(new Response("{}", { status: 200 }));
    expect(await verifyCode("a@b.co", "1")).toBe("ok");
  });

  it.each([400, 401, 429, 500])("reports rejected for a %i", async (status) => {
    stubFetch(new Response("{}", { status }));
    expect(await verifyCode("a@b.co", "1")).toBe("rejected");
  });

  it("reports network-error when fetch rejects", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    expect(await verifyCode("a@b.co", "1")).toBe("network-error");
  });
});
