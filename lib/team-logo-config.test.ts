import { matchRemotePattern } from "next/dist/shared/lib/match-remote-pattern";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

const patterns = nextConfig.images?.remotePatterns ?? [];
// Next accepts URL objects or plain patterns; this config uses plain ones.
const matches = (url: string) =>
  patterns.some((p) => !(p instanceof URL) && matchRemotePattern(p, new URL(url)));

describe("images.remotePatterns", () => {
  it("accepts a normal team logo", () => {
    expect(matches("https://a.espncdn.com/i/teamlogos/ncaa/500/103.png")).toBe(true);
  });

  it.each([
    ["a query string", "https://a.espncdn.com/i/teamlogos/ncaa/500/103.png?x=1"],
    ["another port", "https://a.espncdn.com:8443/i/teamlogos/ncaa/500/103.png"],
    ["another host", "https://example.com/i/teamlogos/ncaa/500/103.png"],
    ["another path", "https://a.espncdn.com/i/teamlogos/nfl/500/phi.png"],
    ["plain http", "http://a.espncdn.com/i/teamlogos/ncaa/500/103.png"],
  ])("rejects %s", (_name, url) => {
    expect(matches(url)).toBe(false);
  });
});
