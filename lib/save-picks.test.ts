import { describe, expect, it, vi } from "vitest";
import type { PicksDraft } from "./edit-picks";
import type { TeamOption } from "./picks-view";
import { messageForError, savePicks, toPicksBody, UNREACHABLE_MESSAGE } from "./save-picks";

// Ids 1-3 ACC, 4-6 Big Ten, 7-9 Big 12, 10-12 SEC, 13-20 non-power (G6).
const conferenceOf = (id: number) => ["ACC", "Big Ten", "Big 12", "SEC"][Math.floor((id - 1) / 3)] ?? "Sun Belt";
const teams: TeamOption[] = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  name: `Team ${i + 1}`,
  imageUrl: null,
  conference: conferenceOf(i + 1),
  isPowerConf: i + 1 <= 12,
}));
// Initial top 12 holds one G6 team (13) in place of team 12.
const initialTop12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13];

const validDraft: PicksDraft = {
  playoff: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13],
  tiebreakers: [14, 15, 16],
  championId: 1,
};
const picksBody = {
  currentPlayoff: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13],
  currentTiebreakers: [14, 15, 16],
  championId: 1,
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function run(draft: PicksDraft, fetchFn: (input: string, init: RequestInit) => Promise<Response>) {
  return savePicks({ draft, initialTop12, teams, year: 2026, fetchFn });
}

describe("toPicksBody", () => {
  it("returns exactly the three pick fields", () => {
    expect(toPicksBody(validDraft)).toEqual(picksBody);
  });

  it.each([
    ["a blank top-12 slot", { ...validDraft, playoff: [null, ...validDraft.playoff.slice(1)] }],
    ["a blank tiebreaker", { ...validDraft, tiebreakers: [14, null, 16] }],
    ["no champion", { ...validDraft, championId: null }],
  ])("returns null for %s", (_name, draft) => {
    expect(toPicksBody(draft)).toBeNull();
  });
});

describe("savePicks", () => {
  it("sends a valid draft with the exact URL, headers and body, and returns what the server stored", async () => {
    const stored = { ...picksBody, currentTiebreakers: [16, 15, 14], year: 2026, initialPlayoff: [] };
    const fetchFn = vi.fn().mockResolvedValue(json(stored, 200));

    const outcome = await run(validDraft, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/submissions/2026");
    expect(init).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });
    expect(JSON.parse(init.body)).toEqual(picksBody);
    expect(Object.keys(JSON.parse(init.body)).sort()).toEqual(["championId", "currentPlayoff", "currentTiebreakers"]);
    // Only the three pick fields come back, read from the response and not the draft.
    expect(outcome).toEqual({
      kind: "saved",
      picks: { currentPlayoff: picksBody.currentPlayoff, currentTiebreakers: [16, 15, 14], championId: 1 },
    });
  });

  it.each([
    ["a duplicate team", { ...validDraft, playoff: [1, 1, ...validDraft.playoff.slice(2)] }],
    ["no champion", { ...validDraft, championId: null }],
    ["a blank slot", { ...validDraft, tiebreakers: [14, null, 16] }],
    ["too many moves", { ...validDraft, playoff: [14, 15, 16, 17, ...validDraft.playoff.slice(4)] }],
  ])("returns the violations and sends nothing for %s", async (_name, draft) => {
    const fetchFn = vi.fn();

    const outcome = await run(draft, fetchFn);

    expect(outcome.kind).toBe("invalid");
    if (outcome.kind === "invalid") expect(outcome.violations.length).toBeGreaterThan(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("counts moves against the initial picks, not the draft's starting point", async () => {
    const fetchFn = vi.fn();
    // Four replacements against the initial top 12.
    const outcome = await run({ ...validDraft, playoff: [14, 15, 16, 17, ...validDraft.playoff.slice(4)] }, fetchFn);
    expect(outcome.kind === "invalid" && outcome.violations.map((v) => v.rule)).toContain("move-limit");
  });

  it("maps a rejected fetch to a retryable message", async () => {
    const outcome = await run(validDraft, vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(outcome).toEqual({ kind: "failed", message: UNREACHABLE_MESSAGE });
  });

  it.each([
    ["an empty object", {}],
    ["short lists", { ...picksBody, currentPlayoff: [1, 2] }],
    ["a missing champion", { ...picksBody, championId: null }],
    ["a string champion", { ...picksBody, championId: "1" }],
  ])("treats a 200 with %s as unusable and says the save may have happened", async (_name, body) => {
    const outcome = await run(validDraft, vi.fn().mockResolvedValue(json(body, 200)));
    expect(outcome.kind).toBe("failed");
    expect(outcome.kind === "failed" && outcome.message).toMatch(/may have been saved/);
  });

  it("treats a 200 with a non-JSON body as unusable", async () => {
    const outcome = await run(validDraft, vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })));
    expect(outcome.kind === "failed" && outcome.message).toMatch(/may have been saved/);
  });

  it("offers the login link on 401", async () => {
    const outcome = await run(validDraft, vi.fn().mockResolvedValue(json({ error: "unauthenticated" }, 401)));
    expect(outcome).toMatchObject({ kind: "failed", loginLink: true });
  });

  it("never shows a raw server string, even from a hostile body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ error: "internal", message: "SECRET-DETAIL" }, 500));
    const outcome = await run(validDraft, fetchFn);
    expect(outcome.kind === "failed" && outcome.message).not.toContain("SECRET-DETAIL");
  });
});

describe("messageForError", () => {
  const opens = "2026-10-11T04:00:00.000Z";
  const closes = "2026-10-17T16:00:00.000Z";

  it("says the saved picks are unchanged for 403, 400 and 500", () => {
    for (const [status, body] of [
      [403, { error: "outside-edit-window", editOpensAt: opens, editClosesAt: closes }],
      [403, { error: "outside-edit-window", editOpensAt: null, editClosesAt: null }],
      [400, { error: "invalid-body" }],
      [500, { error: "internal" }],
    ] as const) {
      expect(messageForError(status, body, 2026).message).toMatch(/weren't changed/);
    }
  });

  it("says editing isn't open for a year with no season (null times)", () => {
    const { message } = messageForError(403, { error: "outside-edit-window", editOpensAt: null, editClosesAt: null }, 2026);
    expect(message).toMatch(/isn't open for this season/);
  });

  it("names the window in Eastern time for a 403, from the server's ISO times", () => {
    const { message } = messageForError(403, { error: "outside-edit-window", editOpensAt: opens, editClosesAt: closes }, 2026);
    expect(message).toContain("from Sun, Oct 11 at 12:00 AM ET until Sat, Oct 17 at 12:00 PM ET");
  });

  it("names the year when the submission is missing", () => {
    expect(messageForError(404, { error: "submission-not-found" }, 2031).message).toContain("2031");
  });

  it("only offers the login link for 401", () => {
    expect(messageForError(401, null, 2026).loginLink).toBe(true);
    for (const status of [400, 403, 404, 415, 500, 502]) {
      expect(messageForError(status, null, 2026).loginLink).toBeUndefined();
    }
  });

  it("falls back to a generic retry message for an unknown status or an unparsable body", () => {
    expect(messageForError(502, null, 2026).message).toMatch(/Something went wrong on our side/);
    expect(messageForError(500, "not an object", 2026).message).toMatch(/Something went wrong on our side/);
  });

  it("tells the user to reload on 415", () => {
    expect(messageForError(415, { error: "unsupported-media-type" }, 2026).message).toMatch(/Reload/);
  });
});
