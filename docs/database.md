# Database

- [Schema](#schema)
- [Local database](#local-database)
- [Changing the schema](#changing-the-schema)
- [Row level security](#row-level-security)
- [The all_submissions view](#the-all_submissions-view)
- [Applying migrations to production](#applying-migrations-to-production)
- [Seasons (edit window)](#seasons-edit-window)

The schema (`teams`, `profiles`, `seasons`, `submissions`) lives in SQL migrations under [supabase/migrations](../supabase/migrations), managed with the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). The CLI is a pinned devDependency, so run it with `npx supabase`; no global install is needed.

## Schema

| Table | Holds |
|-------|-------|
| `teams` | Every FBS team: ESPN `id`, unique `name`, `conference`, `is_power_conf`, `image_url` |
| `profiles` | One row per participant, keyed to their auth user: `name`, unique `email` |
| `seasons` | One row per year: `edit_opens_at` and `edit_closes_at` |
| `submissions` | One row per participant per year: `initial_playoff` (12 team ids), `initial_tiebreakers` (3), `current_playoff`, `current_tiebreakers`, `champion_id` (null until the first revision), `submitted_at`, `updated_at` (null until the first revision) |

A view, `all_submissions`, reads these for the admin (below). The migrations in [supabase/migrations](../supabase/migrations) are the source of truth.

## Local database

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/), running. The CLI runs a full local Supabase stack (Postgres, Auth, API, Studio) in containers.

| Command | What it does |
|---------|--------------|
| `npx supabase start` | Start the local stack. The first run downloads the images (a few minutes) and creates the database from the migrations; later runs keep the existing data and do not apply new migrations |
| `npx supabase migration up` | Apply migrations the local database doesn't have yet (e.g. after pulling new ones), keeping its data |
| `npx supabase status` | Show local URLs and keys |
| `npx supabase db reset` | Recreate the local database from scratch, reapply every migration and load [supabase/seed.sql](../supabase/seed.sql) (wipes local data) |
| `npx supabase stop` | Stop the local stack (data is kept until the next `db reset`) |

The local stack has its own URL and keys, different from production. Get them from `npx supabase status` (see [Environment variables](./development.md#environment-variables)). Local Studio, for browsing tables, is at the Studio URL it prints (normally http://127.0.0.1:54323).

## Changing the schema

Never edit a migration that has already been applied to production; add a new one instead:

1. `npx supabase migration new <short_name>` creates an empty, timestamped file in `supabase/migrations`.
2. Write the SQL, then run `npx supabase db reset` to check that every migration applies cleanly.
3. Commit the file with the change that needs it.

## Row level security

Every table has row level security enabled. Signed-in users (the `authenticated` role) can read `teams` and `seasons`, read only their own `profiles` row and `submissions` rows, and update only their own submissions, and in those only the current picks (`current_playoff`, `current_tiebreakers`, `champion_id`, `updated_at`; enforced with column privileges). Nothing is readable by anonymous requests, and no user can insert or delete rows. The app server calls Supabase with the publishable key and the user's session, so it runs under these policies; this limits the damage if that key leaks. Admin scripts use the secret key, which bypasses row level security, to seed teams, profiles and submissions; the dashboard's SQL editor also bypasses it. These policies back up the API's own checks (session user only, edit window); they don't replace them.

**Removing a participant:** deleting their auth user also deletes their `profiles` row, but not their picks. If they have a `submissions` row, the delete fails until you delete that row first; this is deliberate, so picks are never removed by accident.

## The all_submissions view

`public.all_submissions` is a read-only, one-row-per-participant-per-year view of `submissions` joined to `profiles` and `teams`, with team names instead of ids: `year`, `name`, `email`, `initial_1` to `initial_15`, `current_1` to `current_15`, `champion`, `submitted_at`, `updated_at`, ordered by year (newest first) then name. Slots 1 to 12 are the playoff and 13 to 15 are First Three Out. Order is kept by unnesting the id arrays `with ordinality`. A team id missing from `teams` shows as `Unknown team <id>`; the champion is a left join, so it is null until the first revision. [How Tyler uses it](./admin-runbook.md#during-the-season-view-everyones-picks).

**Security.** The view contains participants' emails, so it must not be readable through the API. It is created `with (security_invoker = true)`, so it runs with the caller's rights (a default view runs as its owner and would bypass RLS), and the same migration revokes all access from `public`, `anon` and `authenticated`, because Supabase's default privileges would otherwise expose it. `service_role` and `postgres` keep access, and so does the dashboard. If you ever drop and recreate the view, or change it with `create or replace`, restate both the `security_invoker` option and the `revoke`. [supabase/all-submissions.db.test.ts](../supabase/all-submissions.db.test.ts) tests the contents and that anonymous and signed-in API requests get a permission error ([Testing](./testing.md#database-tests)).

## Applying migrations to production

This is done by hand (Task M5, [#10](https://github.com/dronk6/cfp-pool-tracker/issues/10)), not by CI:

```bash
npx supabase login                                # once per machine; opens the browser
npx supabase link --project-ref <project-ref>     # prompts for the database password
npx supabase db push --dry-run                    # lists the migrations that would be applied
npx supabase db push                              # applies migrations not yet in production
```

The project ref is in the dashboard URL (`supabase.com/dashboard/project/<project-ref>`). The database password is the one set when the project was created (reset it under **Project Settings → Database** if lost); it is not stored in the repo or in any environment variable.

## Seasons (edit window)

Each year's edit window (when participants can revise their picks) is a row in `seasons`, defined in [supabase/seed.sql](../supabase/seed.sql). The server's edit-window check (`PUT /api/submissions/:year`, see [Reading and saving a submission](./api.md#reading-and-saving-a-submission)) reads it, and so does the My Picks page, to say when editing opens or closes, so changing the window is a data change, not a code change. That file holds only `seasons` rows, because it is also run against production; never add dev-only test data to it. Locally, `npx supabase db reset` (and the first `npx supabase start`) loads it.

**Adding next season's row:** add a tuple to the `values` list in `supabase/seed.sql`, with a comment giving the window in ET and in UTC like the 2026 one. Write each instant in US Eastern time with its UTC offset:

- `-04:00` (EDT, daylight time) from 2:00 a.m. on the second Sunday of March until 2:00 a.m. on the first Sunday of November.
- `-05:00` (EST, standard time) otherwise.

A midnight on the first Sunday of November is still `-04:00`. For example, 2026 opens at `'2026-10-11T00:00:00-04:00'`. Then add a row for the new year to the table in [supabase/seed.test.ts](../supabase/seed.test.ts) with its expected UTC instants, and run `npx supabase db reset` and `npm test`. The insert is an upsert on `year`, so re-running the file is safe, and editing an existing year's window and re-running it updates that row.

**Loading it in production:** in the Supabase dashboard, open **SQL Editor**, paste the whole of `supabase/seed.sql`, and run it. (Use the SQL editor rather than `npx supabase db push --include-seed`, so applying migrations and loading seasons stay separate steps.) Then check the stored instants:

```sql
select year,
       edit_opens_at  at time zone 'America/New_York' as opens_et,
       edit_closes_at at time zone 'America/New_York' as closes_et,
       edit_opens_at  at time zone 'UTC'              as opens_utc,
       edit_closes_at at time zone 'UTC'              as closes_utc
from public.seasons
order by year;
```

For 2026 this must show:

| year | opens_et | closes_et | opens_utc | closes_utc |
|------|----------|-----------|-----------|------------|
| 2026 | 2026-10-11 00:00:00 | 2026-10-17 12:00:00 | 2026-10-11 04:00:00 | 2026-10-17 16:00:00 |
