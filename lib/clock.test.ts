import { describe, expect, it } from "vitest";
import { now } from "./clock";

describe("now", () => {
  it("returns the current time as a Date", () => {
    const before = Date.now();
    const value = now();
    expect(value).toBeInstanceOf(Date);
    expect(value.getTime()).toBeGreaterThanOrEqual(before);
    expect(value.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
