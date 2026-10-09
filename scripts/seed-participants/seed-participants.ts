// Seeds participants (auth user, profile, initial submission) from a private
// CSV. Run with `npm run seed:participants -- --year 2026`; it is a dry run
// unless you add --apply. See README -> Database -> Seeding participants.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  parseParticipants,
  resolveParticipants,
  type ParticipantPlan,
  type TeamRef,
} from "./participants";

const DEFAULT_DATA_PATH = "private/participants.csv";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const USERS_PER_PAGE = 1000;
const MAX_USER_PAGES = 1000;

export type RowStatus = "created" | "existing" | "differs";

export interface RowResult {
  row: number;
  name: string;
  auth: "created" | "existing";
  profile: "created" | "existing";
  submission: RowStatus;
}

/** Row counts read back from the database after a write. */
export interface DatabaseCounts {
  authUsers: number;
  profiles: number;
  /** For the seeded year only. */
  submissions: number;
}

export interface SeedResult {
  /** Problems in the file or database setup. When non-empty, nothing was written. */
  errors: string[];
  warnings: string[];
  rows: RowResult[];
  /** True when changes were actually written (false for a dry run). */
  applied: boolean;
  /** Read back after `--apply`, for comparing with the participant list. */
  counts?: DatabaseCounts;
}

interface ExistingSubmission {
  user_id: string;
  initial_playoff: number[];
  initial_tiebreakers: number[];
}

function sameList(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/**
 * Refuses to write anywhere but this machine unless the caller also said
 * `production`. Returns the host so callers can show what they are targeting.
 */
export function checkTarget(supabaseUrl: string, options: { apply: boolean; production: boolean }): string {
  const host = new URL(supabaseUrl).hostname;
  if (options.apply && !LOCAL_HOSTS.has(host) && !options.production) {
    throw new Error(`${host} is not a local database. Add --production to --apply to write to it.`);
  }
  return host;
}

async function fetchTeams(client: SupabaseClient): Promise<TeamRef[]> {
  const { data, error } = await client.from("teams").select("id, name, is_power_conf");
  if (error) throw new Error(`Reading teams failed: ${error.message}`);
  if (!data.length) throw new Error("The teams table is empty. Run `npm run seed:teams` first.");
  return data;
}

async function requireSeason(client: SupabaseClient, year: number): Promise<void> {
  const { data, error } = await client.from("seasons").select("year").eq("year", year);
  if (error) throw new Error(`Reading seasons failed: ${error.message}`);
  if (!data.length) throw new Error(`There is no seasons row for ${year}. Add it (supabase/seed.sql) first.`);
}

/**
 * Lowercased email -> auth user id. Pages until an empty page rather than
 * trusting `nextPage`, whose parsing is unreliable in this SDK version.
 */
export async function fetchAuthUserIds(client: SupabaseClient): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (let page = 1; page <= MAX_USER_PAGES; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
    if (error) throw new Error(`Listing auth users failed: ${error.message}`);
    if (!data.users.length) return ids;
    for (const user of data.users) {
      if (user.email) ids.set(user.email.toLowerCase(), user.id);
    }
  }
  throw new Error(`Listing auth users did not finish after ${MAX_USER_PAGES} pages.`);
}

/**
 * Validates the whole file, then creates whatever is missing. Per participant:
 * auth user (reusing an existing one by email), profile upsert, then the
 * submission, which is only ever inserted: an existing submission is never
 * modified, so participants' later edits survive a re-run. A submission whose
 * stored initial picks differ from the file is reported as "differs".
 *
 * Nothing is written unless `apply` is set, and nothing at all if any row of
 * the file is invalid. There is no rollback; every step is idempotent, so
 * after an infrastructure error (which throws) a re-run finishes the job.
 */
export async function seedParticipants(
  client: SupabaseClient,
  csvText: string,
  options: { year: number; apply: boolean },
): Promise<SeedResult> {
  const { year, apply } = options;
  const parsed = parseParticipants(csvText);
  const teams = await fetchTeams(client);
  await requireSeason(client, year);
  const resolved = resolveParticipants(parsed.records, teams);
  const warnings = [...parsed.warnings, ...resolved.warnings];
  const errors = [...parsed.errors, ...resolved.errors];
  if (!errors.length && !resolved.plans.length) errors.push("The file has no participants.");
  if (errors.length) return { errors, warnings, rows: [], applied: false };

  const authIds = await fetchAuthUserIds(client);
  const existingProfileIds = await fetchProfileIds(client);
  const existingSubmissions = await fetchSubmissions(client, year);

  const rows: RowResult[] = [];
  for (const plan of resolved.plans) {
    rows.push(await seedOne(client, plan, { year, apply, authIds, existingProfileIds, existingSubmissions }));
  }
  for (const row of rows.filter((r) => r.submission === "differs")) {
    warnings.push(
      `Row ${row.row} (${row.name}): the stored initial picks differ from the file. Left untouched; fix by hand (see README).`,
    );
  }
  const counts = apply
    ? {
        authUsers: (await fetchAuthUserIds(client)).size,
        profiles: (await fetchProfileIds(client)).size,
        submissions: (await fetchSubmissions(client, year)).size,
      }
    : undefined;
  return { errors, warnings, rows, applied: apply, counts };
}

async function fetchProfileIds(client: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await client.from("profiles").select("id");
  if (error) throw new Error(`Reading profiles failed: ${error.message}`);
  return new Set(data.map((row) => row.id as string));
}

async function fetchSubmissions(client: SupabaseClient, year: number): Promise<Map<string, ExistingSubmission>> {
  const { data, error } = await client
    .from("submissions")
    .select("user_id, initial_playoff, initial_tiebreakers")
    .eq("year", year);
  if (error) throw new Error(`Reading submissions failed: ${error.message}`);
  return new Map((data as ExistingSubmission[]).map((row) => [row.user_id, row]));
}

interface SeedContext {
  year: number;
  apply: boolean;
  authIds: Map<string, string>;
  existingProfileIds: Set<string>;
  existingSubmissions: Map<string, ExistingSubmission>;
}

async function seedOne(client: SupabaseClient, plan: ParticipantPlan, context: SeedContext): Promise<RowResult> {
  const label = `row ${plan.row} (${plan.name})`;
  let userId = context.authIds.get(plan.email);
  const authStatus = userId ? "existing" : "created";

  if (!userId && context.apply) {
    const { data, error } = await client.auth.admin.createUser({
      email: plan.email,
      email_confirm: true,
      user_metadata: { name: plan.name },
    });
    if (error) throw new Error(`Creating the auth user for ${label} failed: ${error.message}`);
    userId = data.user.id;
    context.authIds.set(plan.email, userId);
  }

  const profileStatus = userId && context.existingProfileIds.has(userId) ? "existing" : "created";
  if (userId && context.apply) {
    const { error } = await client.from("profiles").upsert({ id: userId, name: plan.name, email: plan.email }, { onConflict: "id" });
    if (error) throw new Error(`Upserting the profile for ${label} failed: ${error.message}`);
  }

  const existing = userId ? context.existingSubmissions.get(userId) : undefined;
  if (existing) {
    const matches = sameList(existing.initial_playoff, plan.playoff) && sameList(existing.initial_tiebreakers, plan.tiebreakers);
    return { row: plan.row, name: plan.name, auth: authStatus, profile: profileStatus, submission: matches ? "existing" : "differs" };
  }

  if (userId && context.apply) {
    // ON CONFLICT DO NOTHING, so a concurrent insert or an edited row is never overwritten.
    const { error } = await client.from("submissions").upsert(
      {
        user_id: userId,
        year: context.year,
        initial_playoff: plan.playoff,
        initial_tiebreakers: plan.tiebreakers,
        current_playoff: plan.playoff,
        current_tiebreakers: plan.tiebreakers,
      },
      { onConflict: "user_id,year", ignoreDuplicates: true },
    );
    if (error) throw new Error(`Inserting the submission for ${label} failed: ${error.message}`);
  }
  return { row: plan.row, name: plan.name, auth: authStatus, profile: profileStatus, submission: "created" };
}

/** Refuses a data file that git does not ignore (or if git cannot tell). */
export function requireGitIgnored(file: string): void {
  const result = spawnSync("git", ["check-ignore", "-q", "--", file], { stdio: "ignore" });
  if (result.status !== 0) {
    throw new Error(
      `${file} is not git-ignored (or git could not check). Keep participant data under /private/ so it is never committed.`,
    );
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

function summarize(rows: RowResult[], applied: boolean): string[] {
  const verb = applied ? "" : "would be ";
  const count = (values: string[], status: string) => values.filter((value) => value === status).length;
  const auth = rows.map((r) => r.auth);
  const profiles = rows.map((r) => r.profile);
  const submissions = rows.map((r) => r.submission);
  return [
    `Participants in file: ${rows.length}`,
    `auth.users:  ${count(auth, "created")} ${verb}created, ${count(auth, "existing")} existing`,
    `profiles:    ${count(profiles, "created")} ${verb}created, ${count(profiles, "existing")} existing`,
    `submissions: ${count(submissions, "created")} ${verb}created, ${count(submissions, "existing")} existing, ${count(submissions, "differs")} differ from the file`,
  ];
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      year: { type: "string" },
      apply: { type: "boolean", default: false },
      production: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  const year = Number(values.year);
  if (!values.year || !Number.isInteger(year)) {
    throw new Error("Usage: npm run seed:participants -- --year <year> [--apply [--production]] [file]");
  }
  const apply = values.apply === true;
  const dataPath = positionals[0] ?? DEFAULT_DATA_PATH;

  const url = requireEnv("SUPABASE_URL");
  const secretKey = requireEnv("SUPABASE_SECRET_KEY");
  const host = checkTarget(url, { apply, production: values.production === true });
  requireGitIgnored(dataPath);
  const text = readFileSync(path.resolve(dataPath), "utf8");

  console.log(`${apply ? "APPLYING to" : "Dry run against"} ${host} for ${year} from ${dataPath}`);
  const client = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await seedParticipants(client, text, { year, apply });

  for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
  if (result.errors.length) {
    for (const error of result.errors) console.error(`Error: ${error}`);
    console.error(`${result.errors.length} error(s); nothing was written.`);
    process.exitCode = 1;
    return;
  }

  const verb = apply ? "" : "would be ";
  for (const row of result.rows) {
    console.log(
      `Row ${row.row} (${row.name}): auth ${verb}${row.auth}, profile ${verb}${row.profile}, submission ${row.submission === "created" ? verb : ""}${row.submission}`,
    );
  }
  for (const line of summarize(result.rows, apply)) console.log(line);
  if (result.counts) {
    console.log(
      `Database now has: ${result.counts.authUsers} auth.users, ${result.counts.profiles} profiles, ${result.counts.submissions} submissions for ${year}.`,
    );
    console.log(`Compare with the ${result.rows.length} participants in the file (auth.users and profiles also count anyone not in it).`);
  }
  if (!apply) console.log("Dry run only. Re-run with --apply to write.");
  if (result.rows.some((row) => row.submission === "differs")) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
