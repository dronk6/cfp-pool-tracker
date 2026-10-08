// Seeds `public.teams` from the ESPN teams CSV. Run with `npm run seed:teams`
// (optionally followed by a CSV path); see README → Database → Seeding teams.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseTeamsCsv, toTeamRows, type TeamRow } from "./teams";

const DEFAULT_CSV_PATH = "Planning/d1_fbs_college_football_teams.csv";

/**
 * Upserts the rows by `id`, so re-running updates existing teams in place.
 * Teams missing from `rows` are left alone, never deleted. The client must use
 * the secret key: signed-in users can only read `teams`.
 */
export async function seedTeams(client: SupabaseClient, rows: TeamRow[]): Promise<void> {
  const { error } = await client.from("teams").upsert(rows, { onConflict: "id" });
  if (error) {
    throw new Error(`Upserting teams failed: ${error.message}`);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Put SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local (see .env.example).`,
    );
  }
  return value;
}

async function main(): Promise<void> {
  const url = requireEnv("SUPABASE_URL");
  const secretKey = requireEnv("SUPABASE_SECRET_KEY");
  const csvPath = path.resolve(process.argv[2] ?? DEFAULT_CSV_PATH);

  const rows = toTeamRows(parseTeamsCsv(readFileSync(csvPath, "utf8")));
  const powerCount = rows.filter((row) => row.is_power_conf).length;

  console.log(`Seeding teams into ${url} from ${csvPath}`);
  console.log(`${rows.length} teams: ${powerCount} power, ${rows.length - powerCount} non-power`);

  const client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await seedTeams(client, rows);
  console.log("Done.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
