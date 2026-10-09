// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeEmail, readJsonObject } from "./input";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Fan@Example.COM ")).toBe("fan@example.com");
  });

  it.each([undefined, null, 42, "", "no-at-sign", "a@b", "a b@c.com", "@c.com", `${"a".repeat(250)}@b.co`])(
    "rejects %j",
    (value) => {
      expect(normalizeEmail(value)).toBeNull();
    },
  );
});

describe("readJsonObject", () => {
  const post = (body: string) => new Request("http://localhost/x", { method: "POST", body });

  it("parses an object", async () => {
    expect(await readJsonObject(post('{"a":1}'))).toEqual({ a: 1 });
  });

  it.each(["not json", "", "[1]", "null", "7"])("returns {} for %j", async (body) => {
    expect(await readJsonObject(post(body))).toEqual({});
  });
});
