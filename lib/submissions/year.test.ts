import { describe, expect, it } from "vitest";
import { parseYear } from "./year";

describe("parseYear", () => {
  it.each([
    ["2026", 2026],
    ["1000", 1000],
    ["9999", 9999],
  ])("accepts %s", (raw, expected) => {
    expect(parseYear(raw)).toBe(expected);
  });

  it.each([
    ["trailing letters", "2026abc"],
    ["empty", ""],
    ["leading zero", "0202"],
    ["all zeros", "0000"],
    ["three digits", "202"],
    ["five digits", "20261"],
    ["decimal", "2026.0"],
    ["exponent", "2e3"],
    ["plus sign", "+2026"],
    ["minus sign", "-2026"],
    ["leading space", " 2026"],
    ["trailing space", "2026 "],
    ["trailing newline", "2026\n"],
    ["hex", "0x7EA"],
    ["non-ASCII digits", "２０２６"],
    ["letters", "abc"],
  ])("rejects %s", (_label, raw) => {
    expect(parseYear(raw)).toBeNull();
  });
});
