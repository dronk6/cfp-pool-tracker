// @vitest-environment node
// The edit-window message against the local stack, with real RLS on `seasons`
// (readable only when signed in). Only next/headers (an in-memory cookie jar)
// and lib/clock are faked. Uses throwaway years and a throwaway user; never
// touches a real season's row.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalAdminClient, runDbTests } from "../../tests/local-db";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (value === "" || options?.maxAge === 0) jar.delete(name);
      else jar.set(name, value);
    },
  }),
}));
const clock = vi.hoisted(() => ({ current: new Date() }));
vi.mock("../../lib/clock", () => ({ now: () => clock.current }));

const OPENS = "2026-10-11T04:00:00Z";
const CLOSES = "2026-10-17T16:00:00Z";
const WINDOW_YEAR = 2096;
const NO_SEASON_YEAR = 2095;

describe.skipIf(!runDbTests)("edit window message against the local stack", () => {
  let admin: SupabaseClient;
  let userId = "";
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = `editwindow-${stamp}@example.test`;

  async function signIn() {
    const { POST } = await import("../api/auth/verify-otp/route");
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (error) throw error;
    const response = await POST(
      new Request("http://localhost/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email, otp: data.properties.email_otp }),
      }),
    );
    expect(response.status).toBe(200);
  }

  async function reasonAt(iso: string, year = WINDOW_YEAR) {
    const { loadMyPicks } = await import("./load-my-picks");
    clock.current = new Date(iso);
    const result = await loadMyPicks(year);
    expect(result.kind).toBe("ok");
    return result.kind === "ok" ? result.editDisabledReason : undefined;
  }

  beforeAll(async () => {
    admin = createLocalAdminClient();
    expect(process.env.SUPABASE_PUBLISHABLE_KEY, "SUPABASE_PUBLISHABLE_KEY missing from .env.local").toBeTruthy();

    const { data: teams, error: teamError } = await admin.from("teams").select("id").order("id").limit(15);
    if (teamError) throw teamError;
    if (!teams || teams.length < 15) throw new Error("teams is not seeded; run `npm run seed:teams` against the local stack first");
    const ids = teams.map((t) => t.id);

    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    const { error: profileError } = await admin.from("profiles").insert({ id: userId, name: "Edit Window Test", email });
    if (profileError) throw profileError;

    // A killed earlier run may have left these years behind.
    await admin.from("submissions").delete().in("year", [WINDOW_YEAR, NO_SEASON_YEAR]).throwOnError();
    await admin.from("seasons").delete().eq("year", WINDOW_YEAR).throwOnError();
    const { error: seasonError } = await admin
      .from("seasons")
      .insert({ year: WINDOW_YEAR, edit_opens_at: OPENS, edit_closes_at: CLOSES });
    if (seasonError) throw seasonError;
    const rows = [WINDOW_YEAR, NO_SEASON_YEAR].map((year) => ({
      user_id: userId,
      year,
      initial_playoff: ids.slice(0, 12),
      initial_tiebreakers: ids.slice(12, 15),
      current_playoff: ids.slice(0, 12),
      current_tiebreakers: ids.slice(12, 15),
      champion_id: ids[0],
    }));
    const { error: submissionError } = await admin.from("submissions").insert(rows);
    if (submissionError) throw submissionError;
  });

  afterAll(async () => {
    if (!admin) return;
    const failures: string[] = [];
    if (userId) {
      const { error } = await admin.from("submissions").delete().eq("user_id", userId);
      if (error) failures.push(`submissions: ${error.message}`);
      const { error: userError } = await admin.auth.admin.deleteUser(userId);
      if (userError) failures.push(`user: ${userError.message}`);
    }
    const { error } = await admin.from("seasons").delete().eq("year", WINDOW_YEAR);
    if (error) failures.push(`seasons: ${error.message}`);
    if (failures.length) throw new Error(`cleanup failed: ${failures.join("; ")}`);
  });

  beforeEach(async () => {
    jar.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await signIn();
  });

  it("says when editing opens until the opening instant, which is itself open", async () => {
    expect(await reasonAt("2026-10-11T03:59:59.999Z")).toBe("Editing opens Sun, Oct 11 at 12:00 AM ET.");
    expect(await reasonAt(OPENS)).toBeNull();
  });

  it("is open until the closing instant, which is itself closed", async () => {
    expect(await reasonAt("2026-10-17T15:59:59.999Z")).toBeNull();
    expect(await reasonAt(CLOSES)).toBe("Editing closed Sat, Oct 17 at 12:00 PM ET.");
  });

  it("explains a year with no seasons row", async () => {
    expect(await reasonAt("2026-10-12T00:00:00Z", NO_SEASON_YEAR)).toContain("Tyler");
  });
});
