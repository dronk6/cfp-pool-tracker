// @vitest-environment node
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "./proxy";

const runsOn = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("proxy matcher", () => {
  it.each(["/", "/rules", "/my-picks", "/api/auth/verify-otp", "/foo-png", "/something-ico"])(
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
