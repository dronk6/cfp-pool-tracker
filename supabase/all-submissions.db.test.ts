// @vitest-environment node
// Checks the all_submissions view against the local Supabase stack (see README
// → Testing): its rows are correct and ordered, and nobody but the secret key
// can read it through the API.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalAdminClient, runDbTests } from "../tests/local-db";

const YEAR = 2999;
const ORPHAN_TEAM_ID = 900099; // deliberately has no teams row
const PERMISSION_DENIED = "42501";

const unknownTeam = `Unknown team ${ORPHAN_TEAM_ID}`;

describe.skipIf(!runDbTests)("all_submissions view against the local stack", () => {
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  // Real seeded teams, in a deliberately non-sorted order. teams[n] is slot n's team (index 0 unused).
  // The test only reads teams: other DB tests count them, so adding or deleting rows would break those.
  let teams: { id: number; name: string }[] = [];
  const teamId = (n: number) => teams[n].id;
  const teamName = (n: number) => teams[n].name;
  const userIds: string[] = [];
  const email = `all-submissions-${randomUUID()}@example.test`;

  const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
  const rowsForTestYear = () => admin.from("all_submissions").select("*").eq("year", YEAR);

  beforeAll(async () => {
    admin = createLocalAdminClient();
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    expect(publishableKey, "SUPABASE_PUBLISHABLE_KEY missing from .env.local").toBeTruthy();
    anon = createClient(process.env.SUPABASE_URL!, publishableKey!, clientOptions);

    const { data: seeded, error: teamsError } = await admin.from("teams").select("id, name").order("id").limit(15);
    if (teamsError) throw teamsError;
    if (!seeded || seeded.length < 15) {
      throw new Error("This test needs at least 15 rows in teams; run `npm run seed:teams` against the local stack first");
    }
    // Reverse the id order and swap neighbours so no slot's team follows id order.
    const picked = [...seeded].reverse();
    for (let i = 0; i + 1 < picked.length; i += 2) [picked[i], picked[i + 1]] = [picked[i + 1], picked[i]];
    teams = [{ id: 0, name: "" }, ...picked];

    const { data, error: userError } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (userError) throw userError;
    userIds.push(data.user.id);
    const { error: profileError } = await admin.from("profiles").insert({ id: data.user.id, name: "Zed Test", email });
    if (profileError) throw profileError;

    // Initial picks are teams 1..15 in order. Current picks reverse the playoff
    // and swap one tiebreaker for an id that has no teams row.
    const ids = (numbers: number[]) => numbers.map(teamId);
    const { error: submissionError } = await admin.from("submissions").insert({
      user_id: data.user.id,
      year: YEAR,
      initial_playoff: ids([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
      initial_tiebreakers: ids([13, 14, 15]),
      current_playoff: ids([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]),
      current_tiebreakers: [teamId(15), ORPHAN_TEAM_ID, teamId(13)],
    });
    if (submissionError) throw submissionError;
  });

  afterAll(async () => {
    if (!admin) return;
    const { error: submissionsError } = await admin.from("submissions").delete().eq("year", YEAR);
    if (submissionsError) throw submissionsError;
    for (const id of userIds) {
      const { error } = await admin.auth.admin.deleteUser(id); // profile cascades
      if (error) throw error;
    }
  });

  it("lists each pick in slot order with names, and shows no champion before the first revision", async () => {
    const { data, error } = await rowsForTestYear();
    if (error) throw error;
    expect(data).toHaveLength(1);
    const row = data![0];

    expect(row).toMatchObject({ year: YEAR, name: "Zed Test", email, champion: null, updated_at: null });
    expect(row.submitted_at).toBeTruthy();
    for (let slot = 1; slot <= 15; slot++) {
      expect(row[`initial_${slot}`]).toBe(teamName(slot));
    }
    const expectedCurrent = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(teamName);
    expectedCurrent.push(teamName(15), unknownTeam, teamName(13));
    for (let slot = 1; slot <= 15; slot++) {
      expect(row[`current_${slot}`]).toBe(expectedCurrent[slot - 1]);
    }
  });

  it("shows the champion's name once one is set", async () => {
    const { error } = await admin.from("submissions").update({ champion_id: teamId(12) }).eq("year", YEAR);
    if (error) throw error;
    const { data, error: readError } = await rowsForTestYear();
    if (readError) throw readError;
    expect(data![0].champion).toBe(teamName(12));
  });

  it("is refused to anonymous requests with a permission error, not an empty result", async () => {
    const { data, error } = await anon.from("all_submissions").select("*");
    expect(data).toBeNull();
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it("is refused to a signed-in participant", async () => {
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError) throw linkError;
    const participant = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, clientOptions);
    const { error: verifyError } = await participant.auth.verifyOtp({
      email,
      token: link.properties.email_otp,
      type: "email",
    });
    if (verifyError) throw verifyError;

    const { data, error } = await participant.from("all_submissions").select("*");
    expect(data).toBeNull();
    expect(error?.code).toBe(PERMISSION_DENIED);
  });
});
