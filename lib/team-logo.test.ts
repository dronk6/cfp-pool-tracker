import { describe, expect, it } from "vitest";
import { allowedLogoSrc } from "./team-logo";

describe("allowedLogoSrc", () => {
  it("accepts an ESPN team logo", () => {
    const url = "https://a.espncdn.com/i/teamlogos/ncaa/500/103.png";
    expect(allowedLogoSrc(url)).toBe(url);
  });

  it.each([
    ["null", null],
    ["empty", ""],
    ["not a url", "not a url"],
    ["another host", "https://example.com/i/teamlogos/ncaa/500/103.png"],
    ["a lookalike host", "https://a.espncdn.com.evil.test/i/teamlogos/ncaa/500/103.png"],
    ["credentials trick", "https://a.espncdn.com@evil.test/i/teamlogos/ncaa/500/103.png"],
    ["plain http", "http://a.espncdn.com/i/teamlogos/ncaa/500/103.png"],
    ["another path", "https://a.espncdn.com/other/103.png"],
    ["a query string", "https://a.espncdn.com/i/teamlogos/ncaa/500/103.png?x=1"],
    ["a hash", "https://a.espncdn.com/i/teamlogos/ncaa/500/103.png#x"],
    ["a port", "https://a.espncdn.com:8443/i/teamlogos/ncaa/500/103.png"],
    ["a javascript url", "javascript:alert(1)"],
  ])("rejects %s", (_name, value) => {
    expect(allowedLogoSrc(value)).toBeNull();
  });
});
