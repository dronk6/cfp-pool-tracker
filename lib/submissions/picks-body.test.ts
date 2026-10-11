import { describe, expect, it } from "vitest";
import { parsePicksBody } from "./picks-body";

const playoff = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const valid = { currentPlayoff: playoff, currentTiebreakers: [13, 14, 15], championId: 3 };

describe("parsePicksBody", () => {
  it("accepts exactly the three fields", () => {
    expect(parsePicksBody(valid)).toEqual(valid);
  });

  it("accepts the smallest and largest int4 ids, and repeated ids (contents are not checked)", () => {
    const body = { ...valid, currentPlayoff: playoff.map(() => 1), championId: 2147483647 };
    expect(parsePicksBody(body)).toEqual(body);
  });

  it.each(["userId", "user_id", "initialPlayoff", "initial_playoff", "year", "id"])(
    "rejects an extra %s key",
    (key) => {
      expect(parsePicksBody({ ...valid, [key]: 1 })).toBeNull();
    },
  );

  it.each(["currentPlayoff", "currentTiebreakers", "championId"])("rejects a missing %s", (key) => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest[key];
    expect(parsePicksBody(rest)).toBeNull();
  });

  it("rejects an empty body", () => {
    expect(parsePicksBody({})).toBeNull();
  });

  it("rejects wrong list lengths", () => {
    expect(parsePicksBody({ ...valid, currentPlayoff: playoff.slice(0, 11) })).toBeNull();
    expect(parsePicksBody({ ...valid, currentPlayoff: [...playoff, 13] })).toBeNull();
    expect(parsePicksBody({ ...valid, currentTiebreakers: [13, 14] })).toBeNull();
    expect(parsePicksBody({ ...valid, currentTiebreakers: [13, 14, 15, 16] })).toBeNull();
    expect(parsePicksBody({ ...valid, currentPlayoff: [] })).toBeNull();
  });

  it("rejects lists that are not arrays", () => {
    expect(parsePicksBody({ ...valid, currentPlayoff: "123456789012" })).toBeNull();
    expect(parsePicksBody({ ...valid, currentTiebreakers: { length: 3 } })).toBeNull();
  });

  it.each([
    ["a float", 1.5],
    ["a string", "7"],
    ["null", null],
    ["a boolean", true],
    ["NaN", Number.NaN],
    ["zero", 0],
    ["a negative", -1],
    ["int4 overflow", 2147483648],
    ["an object", {}],
  ])("rejects %s in a list", (_label, bad) => {
    expect(parsePicksBody({ ...valid, currentPlayoff: [...playoff.slice(0, 11), bad] })).toBeNull();
    expect(parsePicksBody({ ...valid, currentTiebreakers: [13, 14, bad] })).toBeNull();
  });

  it.each([
    ["null", null],
    ["a float", 2.5],
    ["a string", "3"],
    ["zero", 0],
    ["a negative", -3],
    ["int4 overflow", 2147483648],
    ["undefined", undefined],
  ])("rejects %s as the champion", (_label, bad) => {
    expect(parsePicksBody({ ...valid, championId: bad })).toBeNull();
  });
});
