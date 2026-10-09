// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerClient = vi.hoisted(() => vi.fn());
vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { updateSession } from "./proxy";

type CookieAdapter = {
  getAll: () => { name: string; value: string }[];
  setAll: (c: { name: string; value: string; options: object }[], headers: Record<string, string>) => void;
};

function mockClient(getUser: () => Promise<unknown>, onCreate?: (cookies: CookieAdapter) => void) {
  createServerClient.mockImplementation((_url: string, _key: string, options: { cookies: CookieAdapter }) => {
    onCreate?.(options.cookies);
    return { auth: { getUser } };
  });
}

describe("updateSession", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.spyOn(console, "error").mockImplementation(() => {});
    createServerClient.mockReset();
  });

  it("reads the request cookies and calls getUser", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: null });
    let seen: { name: string; value: string }[] = [];
    mockClient(getUser, (cookies) => {
      seen = cookies.getAll();
    });
    const { response } = await updateSession(
      new NextRequest("http://localhost/rules", { headers: { cookie: "sb-x-auth-token=old" } }),
    );
    expect(getUser).toHaveBeenCalledOnce();
    expect(seen).toEqual([{ name: "sb-x-auth-token", value: "old" }]);
    expect(response.status).toBe(200);
  });

  it("copies refreshed cookies and cache headers onto the request and response", async () => {
    const request = new NextRequest("http://localhost/rules", { headers: { cookie: "sb-x-auth-token=old" } });
    let adapter!: CookieAdapter;
    const getUser = vi.fn(async () => {
      adapter.setAll([{ name: "sb-x-auth-token", value: "new", options: { httpOnly: true, path: "/" } }], {
        "Cache-Control": "private, no-store",
      });
      return { data: { user: null }, error: null };
    });
    mockClient(getUser, (cookies) => {
      adapter = cookies;
    });

    const { response } = await updateSession(request);

    expect(request.cookies.get("sb-x-auth-token")?.value).toBe("new");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("sb-x-auth-token=new");
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns the user when the session is valid", async () => {
    const user = { id: "u1", email: "a@b.co" };
    mockClient(vi.fn().mockResolvedValue({ data: { user }, error: null }));
    const result = await updateSession(new NextRequest("http://localhost/my-picks"));
    expect(result.user).toEqual(user);
  });

  it("returns no user when getUser reports an error", async () => {
    mockClient(vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("bad jwt") }));
    const result = await updateSession(new NextRequest("http://localhost/my-picks"));
    expect(result.user).toBeNull();
  });

  it("fails open when getUser throws", async () => {
    mockClient(vi.fn().mockRejectedValue(new Error("network down")));
    const { response, user } = await updateSession(new NextRequest("http://localhost/"));
    expect(user).toBeNull();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(console.error).toHaveBeenCalled();
  });

  it("fails open when the environment is not configured", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    const { response, user } = await updateSession(new NextRequest("http://localhost/"));
    expect(user).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(createServerClient).not.toHaveBeenCalled();
  });
});
