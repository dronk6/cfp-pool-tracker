// @vitest-environment node
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLocalAdminClient, runDbTests } from "../../tests/local-db";
import { HEADER } from "./participants";
import { seedParticipants } from "./seed-participants";

// A year no real season uses, and an email domain that identifies test data.
const YEAR = 2099;
const DOMAIN = "@seedtest.example.test";

const PICKS = [
  ["Ohio State", "Indiana", "Georgia", "Texas Tech", "Oregon", "Ole Miss", "Texas A&M", "Alabama", "Miami", "Notre Dame", "Vanderbilt", "Tulane"],
  ["BYU", "Utah", "James Madison"],
];

function csv(...rows: { name: string; email: string; picks?: string[][] }[]): string {
  const field = (value: string) => (/[",]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
  const lines = rows.map(({ name, email, picks = PICKS }) => [name, email, ...picks.flat()].map(field).join(","));
  return [HEADER.join(","), ...lines].join("\r\n");
}

describe.skipIf(!runDbTests)("seedParticipants against the local database", () => {
  let client: SupabaseClient;

  beforeAll(async () => {
    client = createLocalAdminClient();
    // Never write to `teams` here: seed-teams.db.test.ts runs in parallel and counts its rows.
    const { count, error: teamsError } = await client.from("teams").select("*", { count: "exact", head: true });
    if (teamsError) throw teamsError;
    if (!count) throw new Error("The teams table is empty: run `npm run seed:teams` first.");
    const { error } = await client
      .from("seasons")
      .upsert({ year: YEAR, edit_opens_at: "2099-10-01T00:00:00Z", edit_closes_at: "2099-10-08T00:00:00Z" });
    if (error) throw error;
  });

  // submissions.user_id has no cascade, so they must go before the users.
  async function cleanUp() {
    const submissionsDeleted = await client.from("submissions").delete().eq("year", YEAR);
    if (submissionsDeleted.error) throw submissionsDeleted.error;
    const { data, error } = await client.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      if (!user.email?.endsWith(DOMAIN)) continue;
      const deleted = await client.auth.admin.deleteUser(user.id);
      if (deleted.error) throw deleted.error;
    }
  }

  afterEach(cleanUp);
  afterAll(async () => {
    if (!client) return;
    await cleanUp();
    const { error } = await client.from("seasons").delete().eq("year", YEAR);
    if (error) throw error;
  });

  async function authUsers() {
    const { data, error } = await client.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    return data.users.filter((user) => user.email?.endsWith(DOMAIN));
  }

  async function profiles() {
    const { data, error } = await client.from("profiles").select("*").like("email", `%${DOMAIN}`);
    if (error) throw error;
    return data;
  }

  async function submissions() {
    const { data, error } = await client.from("submissions").select("*").eq("year", YEAR).order("user_id");
    if (error) throw error;
    return data;
  }

  const alex = { name: "Alex Example", email: `alex${DOMAIN}` };
  const bob = { name: "Example, Bob", email: `  Bob${DOMAIN.toUpperCase()} ` };

  it("creates the auth user, profile and submission with initial equal to current", async () => {
    const result = await seedParticipants(client, csv(alex, bob), { year: YEAR, apply: true });

    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => [r.auth, r.profile, r.submission])).toEqual([
      ["created", "created", "created"],
      ["created", "created", "created"],
    ]);
    const users = await authUsers();
    expect(users.map((u) => u.email).sort()).toEqual([`alex${DOMAIN}`, `bob${DOMAIN}`]);
    expect(users.find((u) => u.email === `bob${DOMAIN}`)?.user_metadata).toMatchObject({ name: "Example, Bob" });
    expect((await profiles()).map((p) => p.name).sort()).toEqual(["Alex Example", "Example, Bob"]);
    const rows = await submissions();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.initial_playoff).toHaveLength(12);
      expect(row.initial_tiebreakers).toHaveLength(3);
      expect(row.current_playoff).toEqual(row.initial_playoff);
      expect(row.current_tiebreakers).toEqual(row.initial_tiebreakers);
      expect(row.champion_id).toBeNull();
      expect(row.updated_at).toBeNull();
    }
  });

  it("can be re-run without adding or changing anything", async () => {
    await seedParticipants(client, csv(alex, bob), { year: YEAR, apply: true });
    const before = await submissions();
    const result = await seedParticipants(client, csv(alex, bob), { year: YEAR, apply: true });

    expect(result.warnings).toEqual([]);
    expect(result.rows.map((r) => [r.auth, r.profile, r.submission])).toEqual([
      ["existing", "existing", "existing"],
      ["existing", "existing", "existing"],
    ]);
    expect(await authUsers()).toHaveLength(2);
    expect(await submissions()).toEqual(before);
  });

  it("updates the profile name when the file's name changed", async () => {
    await seedParticipants(client, csv(alex), { year: YEAR, apply: true });

    await seedParticipants(client, csv({ ...alex, name: "Alexandra Example" }), { year: YEAR, apply: true });

    expect((await profiles()).map((p) => p.name)).toEqual(["Alexandra Example"]);
    expect(await submissions()).toHaveLength(1);
  });

  it("reads back database counts after applying, but not on a dry run", async () => {
    const dry = await seedParticipants(client, csv(alex, bob), { year: YEAR, apply: false });
    const applied = await seedParticipants(client, csv(alex, bob), { year: YEAR, apply: true });

    expect(dry.counts).toBeUndefined();
    expect(applied.counts?.submissions).toBe(2);
    expect(applied.counts?.profiles).toBeGreaterThanOrEqual(2);
    expect(applied.counts?.authUsers).toBeGreaterThanOrEqual(2);
  });

  it("leaves a participant's edited current picks, champion and updated_at alone", async () => {
    await seedParticipants(client, csv(alex), { year: YEAR, apply: true });
    const [original] = await submissions();
    const edited = {
      current_playoff: [...original.current_playoff].reverse(),
      champion_id: original.current_playoff[3],
      updated_at: "2099-10-05T12:00:00Z",
    };
    const { error } = await client.from("submissions").update(edited).eq("id", original.id);
    if (error) throw error;

    const result = await seedParticipants(client, csv(alex), { year: YEAR, apply: true });

    expect(result.rows[0].submission).toBe("existing");
    const [after] = await submissions();
    expect(after).toMatchObject({
      current_playoff: edited.current_playoff,
      champion_id: edited.champion_id,
      initial_playoff: original.initial_playoff,
    });
    expect(new Date(after.updated_at).toISOString()).toBe(new Date(edited.updated_at).toISOString());
  });

  it("completes a participant who has an auth user but no profile", async () => {
    const { data, error } = await client.auth.admin.createUser({ email: alex.email, email_confirm: true });
    if (error) throw error;

    const result = await seedParticipants(client, csv(alex), { year: YEAR, apply: true });

    expect(result.rows[0]).toMatchObject({ auth: "existing", profile: "created", submission: "created" });
    expect((await profiles())[0]).toMatchObject({ id: data.user.id, name: "Alex Example" });
    expect(await authUsers()).toHaveLength(1);
  });

  it("reuses an existing user whose email differs only in case or padding", async () => {
    const { data, error } = await client.auth.admin.createUser({ email: alex.email, email_confirm: true });
    if (error) throw error;

    const padded = { name: alex.name, email: `  ALEX${DOMAIN.toUpperCase()} ` };
    const result = await seedParticipants(client, csv(padded), { year: YEAR, apply: true });

    expect(result.rows[0].auth).toBe("existing");
    expect(await authUsers()).toHaveLength(1);
    expect((await submissions())[0].user_id).toBe(data.user.id);
  });

  it("writes nothing at all when any team name is unknown", async () => {
    const bad = csv(alex, { ...bob, picks: [[...PICKS[0].slice(0, 11), "Tulaen"], PICKS[1]] });

    const result = await seedParticipants(client, bad, { year: YEAR, apply: true });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('"Tulaen"');
    expect(await authUsers()).toEqual([]);
    expect(await profiles()).toEqual([]);
    expect(await submissions()).toEqual([]);
  });

  it("fails when the season does not exist", async () => {
    await expect(seedParticipants(client, csv(alex), { year: 2098, apply: true })).rejects.toThrow(/seasons row for 2098/);
  });

  it("writes nothing in a dry run but reports what it would do", async () => {
    const result = await seedParticipants(client, csv(alex), { year: YEAR, apply: false });

    expect(result.applied).toBe(false);
    expect(result.rows[0]).toMatchObject({ auth: "created", profile: "created", submission: "created" });
    expect(await authUsers()).toEqual([]);
    expect(await profiles()).toEqual([]);
    expect(await submissions()).toEqual([]);
  });

  it("reports a submission whose initial picks differ from the file, without changing it", async () => {
    await seedParticipants(client, csv(alex), { year: YEAR, apply: true });
    const before = await submissions();
    const changed = [[...PICKS[0].slice(0, 11), "Memphis"], PICKS[1]];

    const result = await seedParticipants(client, csv({ ...alex, picks: changed }), { year: YEAR, apply: true });

    expect(result.rows[0].submission).toBe("differs");
    expect(result.warnings).toEqual([expect.stringContaining("Row 2 (Alex Example)")]);
    expect(await submissions()).toEqual(before);
  });
});
