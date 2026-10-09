// @vitest-environment node
import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateSession = vi.hoisted(() => vi.fn());
vi.mock("./lib/supabase/proxy", () => ({ updateSession }));
const createServerClient = vi.hoisted(() => vi.fn());
vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { config, proxy } from "./proxy";

const runsOn = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("proxy matcher", () => {
  it.each(["/", "/rules", "/my-picks", "/login", "/api/auth/verify-otp", "/foo-png", "/something-ico"])(
    "runs on %s",
    (url) => {
      expect(runsOn(url)).toBe(true);
    },
  );

  it.each(["/_next/static/chunks/x.js", "/_next/image", "/favicon.ico", "/logo.png", "/images/team.webp"])(
    "skips %s",
    (url) => {
      expect(runsOn(url)).toBe(false);
    },
  );
});

describe("proxy", () => {
  const session = () => NextResponse.next();
  const run = (path: string) => proxy(new NextRequest(`http://localhost${path}`));

  beforeEach(() => {
    updateSession.mockReset();
  });

  it("redirects a logged-out visitor from My Picks to /login", async () => {
    updateSession.mockResolvedValue({ response: session(), user: null });

    const response = await run("/my-picks");

    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  describe("when the session cannot be checked (real updateSession)", () => {
    beforeEach(async () => {
      const actual = await vi.importActual<typeof import("./lib/supabase/proxy")>("./lib/supabase/proxy");
      updateSession.mockImplementation(actual.updateSession);
      vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
      vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
      vi.spyOn(console, "error").mockImplementation(() => {});
      createServerClient.mockReset();
    });

    it("fails closed on My Picks when Supabase is down", async () => {
      createServerClient.mockReturnValue({ auth: { getUser: vi.fn().mockRejectedValue(new Error("network down")) } });

      const response = await run("/my-picks/anything");

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("http://localhost/login");
    });

    it("fails closed on My Picks when the environment is not configured", async () => {
      vi.stubEnv("SUPABASE_URL", "");

      const response = await run("/my-picks");

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("http://localhost/login");
    });

    it("fails open on public pages and /login when Supabase is down", async () => {
      createServerClient.mockReturnValue({ auth: { getUser: vi.fn().mockRejectedValue(new Error("network down")) } });

      for (const path of ["/rules", "/login"]) {
        const response = await run(path);
        expect(response.status).toBe(200);
        expect(response.headers.get("x-middleware-next")).toBe("1");
      }
    });
  });

  it("fails open on public pages when the session cannot be checked", async () => {
    const sessionResponse = session();
    updateSession.mockResolvedValue({ response: sessionResponse, user: null });

    expect(await run("/rules")).toBe(sessionResponse);
  });

  it("lets a logged-out visitor see /login", async () => {
    const sessionResponse = session();
    updateSession.mockResolvedValue({ response: sessionResponse, user: null });

    expect(await run("/login")).toBe(sessionResponse);
  });

  it("redirects a logged-in visitor from /login to My Picks", async () => {
    updateSession.mockResolvedValue({ response: session(), user: { id: "u1" } as User });

    const response = await run("/login");

    expect(response.headers.get("location")).toBe("http://localhost/my-picks");
  });

  it("lets a logged-in visitor into My Picks", async () => {
    const sessionResponse = session();
    updateSession.mockResolvedValue({ response: sessionResponse, user: { id: "u1" } as User });

    expect(await run("/my-picks")).toBe(sessionResponse);
  });

  it("does not gate the API", async () => {
    const sessionResponse = session();
    updateSession.mockResolvedValue({ response: sessionResponse, user: null });

    expect(await run("/api/auth/verify-otp")).toBe(sessionResponse);
  });
});
