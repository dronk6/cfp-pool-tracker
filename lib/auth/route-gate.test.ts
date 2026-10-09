// @vitest-environment node
import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import { gateRequest, isLoginPage, requiresLogin } from "./route-gate";

const user = { id: "u1" } as User;
const request = (path: string) => new NextRequest(`http://localhost${path}`);

describe("requiresLogin", () => {
  it.each(["/my-picks", "/my-picks/", "/my-picks/x", "/my-picks.rsc", "/my-picks/x/y", "/%6dy-picks", "/my%2Dpicks/x"])(
    "gates %s",
    (path) => {
      expect(requiresLogin(path)).toBe(true);
    },
  );

  it.each(["/", "/rules", "/my-picksx", "/my-pick", "/x/my-picks", "/login", "/api/auth/verify-otp", "/%zz"])(
    "does not gate %s",
    (path) => {
      expect(requiresLogin(path)).toBe(false);
    },
  );

  it("still decodes a gated path when another escape is malformed", () => {
    expect(requiresLogin("/%6dy-picks/%zz")).toBe(true);
  });
});

describe("isLoginPage", () => {
  it.each(["/login", "/login/"])("matches %s", (path) => {
    expect(isLoginPage(path)).toBe(true);
  });

  it.each(["/", "/loginx", "/my-picks", "/api/login"])("does not match %s", (path) => {
    expect(isLoginPage(path)).toBe(false);
  });
});

describe("gateRequest", () => {
  it("redirects a logged-out visitor on My Picks to /login, dropping the query", () => {
    const session = NextResponse.next();
    const response = gateRequest(request("/my-picks?next=//evil.example&x=1"), null, session);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("redirects a logged-out visitor on a My Picks sub-path", () => {
    const response = gateRequest(request("/my-picks/x"), null, NextResponse.next());
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("copies the session cookies, with their options, onto the redirect", () => {
    const session = NextResponse.next();
    session.cookies.set("sb-x-auth-token", "", { path: "/", maxAge: 0, httpOnly: true });
    session.cookies.set("other", "1", { path: "/", sameSite: "lax" });

    const response = gateRequest(request("/my-picks"), null, session);

    expect(response.cookies.get("sb-x-auth-token")).toMatchObject({ value: "", maxAge: 0, httpOnly: true, path: "/" });
    expect(response.cookies.get("other")).toMatchObject({ value: "1", sameSite: "lax" });
  });

  it("redirects a logged-in visitor on /login to My Picks", () => {
    const response = gateRequest(request("/login?x=1"), user, NextResponse.next());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/my-picks");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("lets a logged-in visitor through to My Picks", () => {
    const session = NextResponse.next();
    expect(gateRequest(request("/my-picks"), user, session)).toBe(session);
  });

  it.each(["/login", "/rules", "/"])("lets a logged-out visitor through to %s", (path) => {
    const session = NextResponse.next();
    expect(gateRequest(request(path), null, session)).toBe(session);
  });

  it.each(["/api/auth/request-otp", "/api/auth/verify-otp", "/api/me"])("never gates %s", (path) => {
    const session = NextResponse.next();
    expect(gateRequest(request(path), null, session)).toBe(session);
    expect(gateRequest(request(path), user, session)).toBe(session);
  });
});
