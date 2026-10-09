# College Football Playoff Prediction Tracker

A Next.js (App Router) + TypeScript app for tracking College Football Playoff predictions. See [Planning/design-document.md](./Planning/design-document.md) for the full design.

## Local Development

Requires Node.js 22.9 or later and npm.

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
| `npm run seed:teams` | Load the team list into the database (see [Seeding teams](#seeding-teams)) |

### Environment variables

Copy [.env.example](./.env.example) to `.env.local` and fill in the values. `.env.local` is git-ignored; never commit real values.

- **Everyday local development** uses the local Supabase stack, never production. Start it (see [Database](#database)), then copy the API URL, publishable key and secret key from `npx supabase status` into `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`. Login code emails sent by the local stack are caught by its Mailpit inbox (the Mailpit URL in `npx supabase status`, normally http://127.0.0.1:54324), not delivered.
- **Production values** come from the Supabase dashboard: the URL is under **Project Settings → API**, and the publishable and secret keys are under **Project Settings → API Keys**. They go in Vercel (see below). Put production values in `.env.local` only temporarily, to run an admin script against production (seeding teams or participants), then switch back to the local values.

| Name | Used by | Where to set it | Secret? |
|------|---------|-----------------|---------|
| `SUPABASE_URL` | Server-side Supabase client and proxy | `.env.local` and Vercel (Production and Preview) | No |
| `SUPABASE_PUBLISHABLE_KEY` | Server-side Supabase client and proxy | `.env.local` and Vercel (Production and Preview) | No, safe to expose by design, but kept server-only here per the design doc |
| `SUPABASE_SECRET_KEY` | Local admin scripts only (seeding teams and participants) | `.env.local` only. **Never set it in Vercel.** | Yes. It bypasses row-level security |

None of these use the `NEXT_PUBLIC_` prefix, so Next.js never ships them to the browser. The browser does not talk to Supabase directly; all database access goes through Next.js server code. Do not add a `NEXT_PUBLIC_` prefix to any of them.

Notes:

- The Gmail app password used to send login codes is **not** an environment variable. It lives only in the Supabase dashboard under **Auth → SMTP Settings**.
- Applying migrations needs no environment variable: `npx supabase link` prompts for the database password (see [Database](#database)).
- The teams seed script (`npm run seed:teams`) and the opt-in database tests read `SUPABASE_URL` and `SUPABASE_SECRET_KEY`; the app itself reads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (when handling a request, not at import time). The build does not require any of them to be set.

**Vercel setup:** in the Vercel project settings under **Environment Variables**, add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for Production and Preview. Do not add `SUPABASE_SECRET_KEY`. Merges to `main` are deployed by Vercel's GitHub integration; there is no deploy workflow in this repo.

### Testing

Tests use [Vitest](https://vitest.dev) with [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/). Any `*.test.ts` or `*.test.tsx` file is picked up; keep tests next to the code they cover. `tests/example.test.tsx` shows the pattern. Testing Library cannot render async Server Components, so test server-side logic as plain functions or through the API routes.

**Database tests** run against the local Supabase stack and are skipped unless `RUN_DB_TESTS=1` is set, so plain `npm test` and CI never need a database. To run them, start the stack, put its values in `.env.local` (see [Environment variables](#environment-variables)), then:

```bash
RUN_DB_TESTS=1 npm test                        # bash / Git Bash
$env:RUN_DB_TESTS = "1"; npm test              # PowerShell (stays set for that terminal; Remove-Item Env:RUN_DB_TESTS to unset)
```

They write to the local database, and refuse to run unless `SUPABASE_URL` points at `127.0.0.1` or `localhost`. To add one, name it `*.db.test.ts`, start it with `// @vitest-environment node`, wrap the suite in `describe.skipIf(!runDbTests)` and create the client with `createLocalAdminClient()` in `beforeAll`, both from [tests/local-db.ts](./tests/local-db.ts). `scripts/seed-teams/seed-teams.db.test.ts` shows the pattern. `app/api/auth/otp.db.test.ts` runs the sign-in routes against the stack (it also needs `SUPABASE_PUBLISHABLE_KEY` in `.env.local`), and `app/api/session.db.test.ts` does the same for `/api/me` and `/api/logout`; it creates throwaway users and deletes them afterwards, and fakes only `next/headers`. `app/api/teams.db.test.ts` covers `GET /api/teams` (it needs teams already seeded and never writes to `teams`). Run just those with `RUN_DB_TESTS=1 npx vitest run app/api/auth/otp.db`, `... app/api/session.db` or `... app/api/teams.db`.

### Routes

| Route | Page |
|-------|------|
| `/` | Home |
| `/rules` | Rules |
| `/login` | Log In (email, then the emailed code) |
| `/my-picks` | My Picks |

Each page is a placeholder for now. The navigation bar (`app/components/NavBar`) is rendered in `app/layout.tsx`, so it appears on every page. Below 768px it shows a hamburger button that opens a side panel; at 768px and wider the links are shown inline. The right end of the bar shows a Log In link, or an account menu when signed in (see [Signing out and the nav bar](#signing-out-and-the-nav-bar)). To add a page, create its `app/<route>/page.tsx` and add an entry to `app/components/NavBar/navLinks.ts`.

## Authentication

Participants sign in without a password: they ask for a code by email and type it in. There is no sign-up; participants are created by an admin script (see [Planning/otp-authentication-plan.md](./Planning/otp-authentication-plan.md)). The sign-in page is `/login` (see [Signing in](#signing-in-login)); the nav bar's "Log In" link goes there (see [Signing out and the nav bar](#signing-out-and-the-nav-bar)).

| Route | Body | Result |
|-------|------|--------|
| `POST /api/auth/request-otp` | `{ "email": "..." }` | `200 {"success":true}` whether or not the email is a participant, and whether or not Supabase errored or rate limited (so it can't be used to find out who is registered). The email is sent after the response (Next.js `after()`), so response time doesn't reveal registration either. `400 {"success":false,"error":"invalid-email"}` for malformed input. |
| `POST /api/auth/verify-otp` | `{ "email": "...", "otp": "..." }` | `200 {"success":true}` and the session cookies on success; `401 {"success":false}` for any failure. The code length is a Supabase setting (8 characters in production), so the route only checks that the code is digits. |

Code layout:

- [lib/supabase/server.ts](./lib/supabase/server.ts): `createSupabaseServerClient()`, the only Supabase client the app uses (there is no browser client). It reads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` when called and throws a clear error if they are missing. Session cookies are HttpOnly, SameSite=Lax, and Secure in production ([lib/supabase/config.ts](./lib/supabase/config.ts)).
- [lib/auth/current-user.ts](./lib/auth/current-user.ts): `getCurrentUser()` returns the signed-in user or `null` (it re-validates with Supabase via `getUser()`). Use it in Server Components and Route Handlers to decide who is asking; never trust a user id sent by the client.
- [proxy.ts](./proxy.ts) (Next.js 16's name for middleware) refreshes the session on every request except static assets, then applies [lib/auth/route-gate.ts](./lib/auth/route-gate.ts): logged-out visitors to `/my-picks` go to `/login`, and logged-in visitors to `/login` go to `/my-picks`. Public pages and `/login` fail open if Supabase is unreachable; `/my-picks` fails closed. `/api` is never gated, so each route checks the session itself.

**Trying it locally:** start the local stack, run `npm run dev`, then request a code:

```bash
curl -X POST localhost:3000/api/auth/request-otp -H "Content-Type: application/json" -d '{"email":"someone@example.com"}'
```

The email goes to the stack's Mailpit inbox (http://127.0.0.1:54324), not a real mailbox, and is only sent if that email belongs to an existing user. Create one in local Studio (Authentication, Add user, tick Auto Confirm User). The local auth settings in [supabase/config.toml](./supabase/config.toml) (no sign-up, 30 second resend limit, 8-character codes, code-only email from [supabase/templates/magic_link.html](./supabase/templates/magic_link.html)) mirror production. A running stack only picks up changes to that file after `npx supabase stop` and `npx supabase start`.

### Signing in (/login)

`/login` ([app/login/page.tsx](./app/login/page.tsx)) hosts the form in [app/components/LoginForm](./app/components/LoginForm). It has two steps, held in memory only (nothing in the URL, storage or logs), so a refresh starts over:

1. Email: submitting always shows "If that email is registered, a code is on its way." whether or not the email is a participant. Only a malformed email (a 400) or a network failure is reported.
2. Code: type the emailed code (non-digits are dropped; there is no length limit because the code length is a Supabase setting). A correct code does a full page load of `/my-picks`, so server-rendered parts of the page see the new session. A wrong code shows one message for every failure. "Send a New Code" and "Cancel" are there from the start; "Send a New Code" is disabled for 30 seconds after each request (matching Supabase's per-email interval) with a countdown, and "Cancel" returns to the email step with the email kept.

The flow is a pure reducer (`loginFlow.ts`); `authApi.ts` wraps the two routes above and `navigate.ts` wraps the redirect so tests can replace it. The submit button stays disabled until the page has hydrated so an early native submit can't put the email in the URL. The My Picks page itself does not check the session yet; the proxy is the only gate, so the pages that load picks must check it server-side (`getCurrentUser()`).

To try it: follow "Trying it locally" above, open http://localhost:3000/login, and read the code from Mailpit.

### Signing out and the nav bar

| Route | Result |
|-------|--------|
| `GET /api/me` | `200 {"name":"...","email":"..."}` for the session user. `401 {"error":"unauthenticated"}` without a valid session; `404 {"error":"profile-not-found"}` if the user has no `profiles` row; `500 {"error":"internal"}`. The user always comes from the verified session, never from the request. Never cached. |
| `POST /api/logout` | `200 {"success":true}` after signing out this device only (`scope: "local"`; other devices stay signed in), and clears the session cookies. Also `200` if nobody was signed in. `500 {"success":false}` if Supabase fails. There is no CSRF token: the cookies are SameSite=Lax, so browsers don't send them on cross-site POSTs, and the route is POST-only. |

The root layout ([app/layout.tsx](./app/layout.tsx)) reads the session user on the server in `SessionNavBar` and passes only the user's name to the nav bar, wrapped in `<Suspense>` because a session read can't be prerendered (the rest of each page stays in the static shell). While that loads, the right end of the bar is empty, so a signed-in user never sees a flash of "Log In". Signed out, it shows a **Log In** link to `/login`; signed in, an avatar button opens a small "Are you sure?" menu with **Log Out** and **Cancel**. Log Out calls `POST /api/logout`, then reloads the home page; if the call fails the menu stays open with an error. If looking up the user fails, the bar falls back to the signed-out view instead of breaking the page. `GET /api/me` isn't used by the nav bar; it is there for client code that needs to know who is signed in.

### Reading teams

| Route | Result |
|-------|--------|
| `GET /api/teams` | `200` with a bare JSON array of every team, ordered by name (the database's ordering; clients that need a specific order should sort themselves): `[{"id":87,"name":"Notre Dame","conference":"FBS Independent","is_power_conf":true,"image_url":"https://..."}, ...]`. Field names are snake_case to match the database and `lib/validation`'s `Team`, so the array can go straight into `validatePicks`. `image_url` is `null` if a team has no logo. An empty `teams` table gives `200 []`. `401 {"error":"unauthenticated"}` without a valid session (a `profiles` row is not required); `500 {"error":"internal"}`. Never cached. |

The lookup lives in `getTeams()` in [lib/teams.ts](./lib/teams.ts). Server components (such as My Picks and the edit view) should call it directly rather than fetch this route. `app/api/teams.db.test.ts` runs the route against the local stack; it reads the seeded teams and never writes to `teams`, so run `npm run seed:teams` first (`RUN_DB_TESTS=1 npx vitest run app/api/teams.db`).

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

### Seeding teams

The `teams` table is loaded from [Planning/d1_fbs_college_football_teams.csv](./Planning/d1_fbs_college_football_teams.csv) by a script that writes with `SUPABASE_SECRET_KEY`:

```bash
npm run seed:teams                          # seed from the default CSV
npm run seed:teams -- path/to/teams.csv     # seed from another CSV
```

It prints the target URL and the number of power and non-power teams, then writes straight away (there is no confirmation prompt), and exits non-zero on any error. It reads `SUPABASE_URL` and `SUPABASE_SECRET_KEY` from `.env.local`, but a variable already set in your shell wins over `.env.local`, so check which database you are about to hit **before** running it:

- **Local:** with the local values in `.env.local`, run it after `npx supabase start` on a new stack and after every `npx supabase db reset`, since a reset empties `teams`.
- **Production:** put the production URL and secret key in `.env.local` temporarily (see [Environment variables](#environment-variables)), check the target as below, run it, then switch back to the local values.

Before running, check `SUPABASE_URL` in `.env.local`, and make sure it isn't also set in your shell. Each of these should print nothing:

```bash
echo $SUPABASE_URL $SUPABASE_SECRET_KEY                # bash / Git Bash; unset them with: unset SUPABASE_URL SUPABASE_SECRET_KEY
```

```powershell
$env:SUPABASE_URL; $env:SUPABASE_SECRET_KEY            # PowerShell; remove them with: Remove-Item Env:SUPABASE_URL, Env:SUPABASE_SECRET_KEY
```

It upserts by team ID, so it is safe to re-run: existing teams are updated in place. It never deletes teams that are missing from the CSV; remove those by hand if needed. Known limitation: if ESPN changes a team's ID but the name stays the same, the upsert fails on the unique `name` constraint; delete the old row first.

The CSV must have the header `Team ID,Team Name,Conference,Image` and no quoted fields; the script rejects malformed rows, duplicates and unknown conferences rather than guessing. Which conferences count as power conferences (and the Notre Dame and UConn overrides) is set in one commented block at the top of [scripts/seed-teams/teams.ts](./scripts/seed-teams/teams.ts). Update it there when a conference is added or realigns.

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

1. Reseed `teams` in production from the season's `d1_fbs_college_football_teams.csv` with `npm run seed:teams` (see [Seeding teams](#seeding-teams)).
2. Add the season's row to `seasons` and load it in production; see [Seasons (edit window)](#seasons-edit-window).
3. For each participant, create their auth user and `profiles` row using the seeding script (see [otp-authentication-plan.md](./Planning/otp-authentication-plan.md), Step 2), **then** insert their initial `submissions` row. Do both for everyone before announcing the site, so nobody logs in to an empty "My Picks" page.
