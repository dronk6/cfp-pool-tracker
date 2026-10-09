// @vitest-environment node
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { checkTarget, fetchAuthUserIds, requireGitIgnored } from "./seed-participants";

describe("checkTarget", () => {
  it.each(["http://127.0.0.1:54321", "http://localhost:54321"])("allows writing to %s without --production", (url) => {
    expect(checkTarget(url, { apply: true, production: false })).toBe(new URL(url).hostname);
  });

  it.each(["https://example.invalid", "http://[::1]:54321", "http://127.0.0.1.evil.com"])(
    "refuses --apply against %s without --production",
    (url) => {
      expect(() => checkTarget(url, { apply: true, production: false })).toThrow(/--production/);
    },
  );

  it("allows --apply with --production, and a dry run without it", () => {
    expect(checkTarget("https://example.invalid", { apply: true, production: true })).toBe("example.invalid");
    expect(checkTarget("https://example.invalid", { apply: false, production: false })).toBe("example.invalid");
  });
});

describe("requireGitIgnored", () => {
  it("accepts a path under private/ and refuses a tracked file", () => {
    expect(() => requireGitIgnored("private/participants.csv")).not.toThrow();
    expect(() => requireGitIgnored("scripts/seed-participants/participants.example.csv")).toThrow(/not git-ignored/);
  });
});

describe("fetchAuthUserIds", () => {
  it("pages until an empty page and lowercases emails", async () => {
    const pages = [
      [{ id: "1", email: "A@Example.test" }],
      [
        { id: "2", email: "b@example.test" },
        { id: "3", email: null },
      ],
    ];
    const listUsers = vi.fn(async ({ page }: { page: number }) => ({ data: { users: pages[page - 1] ?? [] }, error: null }));
    const client = { auth: { admin: { listUsers } } } as unknown as SupabaseClient;

    const ids = await fetchAuthUserIds(client);

    expect([...ids]).toEqual([
      ["a@example.test", "1"],
      ["b@example.test", "2"],
    ]);
    expect(listUsers).toHaveBeenCalledTimes(3);
  });

  it("gives up instead of paging forever", async () => {
    const listUsers = vi.fn(async () => ({ data: { users: [{ id: "1", email: "a@example.test" }] }, error: null }));
    const client = { auth: { admin: { listUsers } } } as unknown as SupabaseClient;

    await expect(fetchAuthUserIds(client)).rejects.toThrow(/did not finish/);
    expect(listUsers).toHaveBeenCalledTimes(1000);
  });
});
