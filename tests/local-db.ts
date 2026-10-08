// Shared setup for opt-in tests that hit the local Supabase stack. Such tests
// live in `*.db.test.ts` files with `// @vitest-environment node`, wrap their
// suite in `describe.skipIf(!runDbTests)`, and create the client in
// `beforeAll` so that skipped runs never need the env vars. See README →
// Testing.
import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runDbTests = process.env.RUN_DB_TESTS === "1";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * Returns a secret-key client for the local stack, loading `.env.local` if it
 * exists. Throws unless SUPABASE_URL points at this machine, so a test can
 * never write to production.
 */
export function createLocalAdminClient(): SupabaseClient {
  if (existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error("DB tests need SUPABASE_URL and SUPABASE_SECRET_KEY (from `npx supabase status`) in .env.local");
  }
  if (!LOCAL_HOSTS.has(new URL(url).hostname)) {
    throw new Error(`DB tests only run against the local stack, but SUPABASE_URL is ${url}`);
  }
  return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
