// @vitest-environment node
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalAdminClient, runDbTests } from "../../tests/local-db";
import { seedTeams } from "./seed-teams";
import { parseTeamsCsv, toTeamRows, type TeamRow } from "./teams";

describe.skipIf(!runDbTests)("seedTeams against the local database", () => {
  let client: SupabaseClient;
  let rows: TeamRow[];

  beforeAll(() => {
    client = createLocalAdminClient();
    rows = toTeamRows(parseTeamsCsv(readFileSync("Planning/d1_fbs_college_football_teams.csv", "utf8")));
  });

  // Leave the shared local database seeded with the real CSV values.
  afterAll(async () => {
    if (client) await seedTeams(client, rows);
  });

  async function countTeams(): Promise<number | null> {
    const { count, error } = await client.from("teams").select("*", { count: "exact", head: true });
    if (error) throw error;
    return count;
  }

  async function getTeam(id: number) {
    const { data, error } = await client.from("teams").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  }

  it("can be re-run without adding rows", async () => {
    await seedTeams(client, rows);
    const countAfterFirst = await countTeams();
    await seedTeams(client, rows);

    expect(countAfterFirst).toBeGreaterThanOrEqual(rows.length);
    expect(await countTeams()).toBe(countAfterFirst);
  });

  it("updates a changed value in place", async () => {
    const changed = rows.map((row) => (row.name === "UConn" ? { ...row, image_url: "https://example.test/uconn.png" } : row));
    await seedTeams(client, changed);

    expect(await getTeam(41)).toMatchObject({ name: "UConn", image_url: "https://example.test/uconn.png" });
  });

  it("stores the Notre Dame and UConn overrides", async () => {
    await seedTeams(client, rows);

    expect(await getTeam(87)).toMatchObject({ name: "Notre Dame", conference: "FBS Independent", is_power_conf: true });
    expect(await getTeam(41)).toMatchObject({ name: "UConn", conference: "FBS Independent", is_power_conf: false });
  });
});
