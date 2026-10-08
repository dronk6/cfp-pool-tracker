# College Football Playoff Prediction Tracker

A Next.js (App Router) + TypeScript app for tracking College Football Playoff predictions. See [Planning/design-document.md](./Planning/design-document.md) for the full design.

## Local Development

Requires Node.js 22 or later and npm.

```bash
npm install     # install dependencies (first time, or after package.json changes)
npm run dev     # start the app at http://localhost:3000
```

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Generate Next.js types and run the TypeScript type-check |
| `npm test` | Run all tests once |
| `npm run test:watch` | Re-run tests on file changes |

### Environment variables

Copy [.env.example](./.env.example) to `.env.local` and fill in the values. `.env.local` is git-ignored; never commit real values.

- **Everyday local development** uses the local Supabase stack, never production. Start it (see [Database](#database)), then copy the API URL, publishable key and secret key from `npx supabase status` into `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`. Login code emails sent by the local stack are caught by its Mailpit inbox (the Mailpit URL in `npx supabase status`, normally http://127.0.0.1:54324), not delivered.
- **Production values** come from the Supabase dashboard: the URL is under **Project Settings → API**, and the publishable and secret keys are under **Project Settings → API Keys**. They go in Vercel (see below). Put production values in `.env.local` only temporarily, to run an admin script against production (seeding teams or participants), then switch back to the local values.

| Name | Used by | Where to set it | Secret? |
|------|---------|-----------------|---------|
| `SUPABASE_URL` | Server-side Supabase client and middleware | `.env.local` and Vercel (Production and Preview) | No |
| `SUPABASE_PUBLISHABLE_KEY` | Server-side Supabase client and middleware | `.env.local` and Vercel (Production and Preview) | No, safe to expose by design, but kept server-only here per the design doc |
| `SUPABASE_SECRET_KEY` | Local admin scripts only (seeding teams and participants) | `.env.local` only. **Never set it in Vercel.** | Yes. It bypasses row-level security |

None of these use the `NEXT_PUBLIC_` prefix, so Next.js never ships them to the browser. The browser does not talk to Supabase directly; all database access goes through Next.js server code. Do not add a `NEXT_PUBLIC_` prefix to any of them.

Notes:

- The Gmail app password used to send login codes is **not** an environment variable. It lives only in the Supabase dashboard under **Auth → SMTP Settings**.
- Applying migrations needs no environment variable: `npx supabase link` prompts for the database password (see [Database](#database)).
- Nothing reads these variables yet; the Supabase client that uses them arrives in a later change. The build does not require them to be set.

**Vercel setup:** in the Vercel project settings under **Environment Variables**, add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for Production and Preview. Do not add `SUPABASE_SECRET_KEY`. Merges to `main` are deployed by Vercel's GitHub integration; there is no deploy workflow in this repo.

### Testing

Tests use [Vitest](https://vitest.dev) with [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/). Any `*.test.ts` or `*.test.tsx` file is picked up; keep tests next to the code they cover. `tests/example.test.tsx` shows the pattern. Testing Library cannot render async Server Components, so test server-side logic as plain functions or through the API routes.

### Routes

| Route | Page |
|-------|------|
| `/` | Home |
| `/rules` | Rules |
| `/my-picks` | My Picks |

Each page is a placeholder for now. The navigation bar (`app/components/NavBar`) is rendered in `app/layout.tsx`, so it appears on every page. Below 768px it shows a hamburger button that opens a side panel; at 768px and wider the links are shown inline. To add a page, create its `app/<route>/page.tsx` and add an entry to `app/components/NavBar/navLinks.ts`.

## Continuous Integration

A GitHub Actions workflow ([.github/workflows/ci.yml](./.github/workflows/ci.yml)) runs on every pull request and on every push to `main`. It installs dependencies with `npm ci`, then runs `npm run lint`, `npm test`, `npm run typecheck` (`next typegen && tsc --noEmit`) and `npm run build`. It does not deploy (Vercel handles deployment).

The check appears on pull requests as **Checks**. To reproduce it locally, run `npm ci && npm run lint && npm test && npm run typecheck && npm run build`.

Making the check required before merging is a branch protection rule on `main`, configured by hand in the repository settings. The workflow does not set it up.

## Database

The schema (`teams`, `profiles`, `seasons`, `submissions`) lives in SQL migrations under [supabase/migrations](./supabase/migrations), managed with the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). The CLI is a pinned devDependency, so run it with `npx supabase`; no global install is needed.

### Local database

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/), running. The CLI runs a full local Supabase stack (Postgres, Auth, API, Studio) in containers.

| Command | What it does |
|---------|--------------|
| `npx supabase start` | Start the local stack. The first run downloads the images (a few minutes) and creates the database from the migrations; later runs keep the existing data and do not apply new migrations |
| `npx supabase migration up` | Apply migrations the local database doesn't have yet (e.g. after pulling new ones), keeping its data |
| `npx supabase status` | Show local URLs and keys |
| `npx supabase db reset` | Recreate the local database from scratch, reapply every migration and load [supabase/seed.sql](./supabase/seed.sql) (wipes local data) |
| `npx supabase stop` | Stop the local stack (data is kept until the next `db reset`) |

The local stack has its own URL and keys, different from production. Get them from `npx supabase status` (see [Environment variables](#environment-variables)). Local Studio, for browsing tables, is at the Studio URL it prints (normally http://127.0.0.1:54323).

### Changing the schema

Never edit a migration that has already been applied to production; add a new one instead:

1. `npx supabase migration new <short_name>` creates an empty, timestamped file in `supabase/migrations`.
2. Write the SQL, then run `npx supabase db reset` to check that every migration applies cleanly.
3. Commit the file with the change that needs it.

### Row level security

Every table has row level security enabled. Signed-in users (the `authenticated` role) can read `teams` and `seasons`, read only their own `profiles` row and `submissions` rows, and update only their own submissions, and in those only the current picks (`current_playoff`, `current_tiebreakers`, `champion_id`, `updated_at`; enforced with column privileges). Nothing is readable by anonymous requests, and no user can insert or delete rows. The app server calls Supabase with the publishable key and the user's session, so it runs under these policies; this limits the damage if that key leaks. Admin scripts use the secret key, which bypasses row level security, to seed teams, profiles and submissions; the dashboard's SQL editor also bypasses it. These policies back up the API's own checks (session user only, edit window); they don't replace them.

**Removing a participant:** deleting their auth user also deletes their `profiles` row, but not their picks. If they have a `submissions` row, the delete fails until you delete that row first; this is deliberate, so picks are never removed by accident.

### Applying migrations to production

This is done by hand (Task M5, [#10](https://github.com/dronk6/cfp-pool-tracker/issues/10)), not by CI:

```bash
npx supabase login                                # once per machine; opens the browser
npx supabase link --project-ref <project-ref>     # prompts for the database password
npx supabase db push --dry-run                    # lists the migrations that would be applied
npx supabase db push                              # applies migrations not yet in production
```

The project ref is in the dashboard URL (`supabase.com/dashboard/project/<project-ref>`). The database password is the one set when the project was created (reset it under **Project Settings → Database** if lost); it is not stored in the repo or in any environment variable.

### Seasons (edit window)

Each year's edit window (when participants can revise their picks) is a row in `seasons`, defined in [supabase/seed.sql](./supabase/seed.sql). The server's edit-window check and the Edit button are designed to read it (neither exists yet), so changing the window is a data change, not a code change. That file holds only `seasons` rows, because it is also run against production; never add dev-only test data to it. Locally, `npx supabase db reset` (and the first `npx supabase start`) loads it.

**Adding next season's row:** add a tuple to the `values` list in `supabase/seed.sql`, with a comment giving the window in ET and in UTC like the 2026 one. Write each instant in US Eastern time with its UTC offset:

- `-04:00` (EDT, daylight time) from 2:00 a.m. on the second Sunday of March until 2:00 a.m. on the first Sunday of November.
- `-05:00` (EST, standard time) otherwise.

A midnight on the first Sunday of November is still `-04:00`. For example, 2026 opens at `'2026-10-11T00:00:00-04:00'`. Then add a row for the new year to the table in [supabase/seed.test.ts](./supabase/seed.test.ts) with its expected UTC instants, and run `npx supabase db reset` and `npm test`. The insert is an upsert on `year`, so re-running the file is safe, and editing an existing year's window and re-running it updates that row.

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

## Admin Responsibilities

These are the things Tyler (or the maintainer) must do by hand. The app does not do them automatically.

### Before each season: unpause the Supabase project

Supabase's free tier **pauses a project after about a week of inactivity**. This app is only used for a few weeks each year, so the project will almost certainly be paused when a new season starts. We chose a manual unpause over a keep-alive ping. If the project is paused, the site cannot load picks or send login codes.

Do this at least a few days before the edit window opens, so any problem shows up before participants hit it:

1. Sign in at [supabase.com/dashboard](https://supabase.com/dashboard) with the project owner's account.
2. Open the CFP Pool Tracker project. A paused project shows a **"Project paused"** banner.
3. Click **Restore project** and wait a few minutes until the status is active. (Supabase only keeps paused free projects restorable for a limited time, currently about 90 days from the pause, so check the banner for the deadline. Don't let one sit past it.)
4. Confirm the data survived: open **Table Editor** and check that `teams`, `profiles`, `submissions` and `seasons` have rows.
5. Confirm sign-in works: go to the deployed site, request a login code for your own participant email, and sign in.
6. If the codes don't arrive, check **Project Settings → Auth → SMTP Settings** (the Gmail sender's credentials; if Google revoked the app password, generate a new one) and **Logs → Auth** in the Supabase dashboard.

### Before each season: set up the season

1. Reseed `teams` from the season's `d1_fbs_college_football_teams.csv`.
2. Add the season's row to `seasons` and load it in production; see [Seasons (edit window)](#seasons-edit-window).
3. For each participant, create their auth user and `profiles` row using the seeding script (see [otp-authentication-plan.md](./Planning/otp-authentication-plan.md), Step 2), **then** insert their initial `submissions` row. Do both for everyone before announcing the site, so nobody logs in to an empty "My Picks" page.
