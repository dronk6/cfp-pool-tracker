# College Football Playoff Prediction Tracker

A Next.js (App Router) + TypeScript app for tracking College Football Playoff predictions. See [Planning/design-document.md](./Planning/design-document.md) for the full design. Maintainers and the pool admin: see [Admin Responsibilities](#admin-responsibilities) for the yearly runbook.

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
| `npm run seed:participants` | Load participants and their initial picks from a private CSV (see [Seeding participants](#seeding-participants)) |

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

They write to the local database, and refuse to run unless `SUPABASE_URL` points at `127.0.0.1` or `localhost`. To add one, name it `*.db.test.ts`, start it with `// @vitest-environment node`, wrap the suite in `describe.skipIf(!runDbTests)` and create the client with `createLocalAdminClient()` in `beforeAll`, both from [tests/local-db.ts](./tests/local-db.ts). `scripts/seed-teams/seed-teams.db.test.ts` shows the pattern. `app/api/auth/otp.db.test.ts` runs the sign-in routes against the stack (it also needs `SUPABASE_PUBLISHABLE_KEY` in `.env.local`), and `app/api/session.db.test.ts` does the same for `/api/me` and `/api/logout`; it creates throwaway users and deletes them afterwards, and fakes only `next/headers`. `app/api/submissions.db.test.ts` covers `GET /api/submissions/:year`, including that one user can't read another's picks, and `app/api/submissions-put.db.test.ts` covers `PUT` (exact window boundaries against a throwaway season, with only `lib/clock` mocked); both need teams already seeded and never write to `teams`. `app/api/teams.db.test.ts` covers `GET /api/teams` (it needs teams already seeded and never writes to `teams`). `supabase/all-submissions.db.test.ts` checks the `all_submissions` view's contents and that the API can't read it (it also needs `SUPABASE_PUBLISHABLE_KEY` and seeded teams, and never writes to `teams`). Run just those with `RUN_DB_TESTS=1 npx vitest run app/api/auth/otp.db`, `... app/api/session.db`, `... app/api/submissions.db`, `... app/api/submissions-put.db` or `... app/api/teams.db`.

### Routes

| Route | Page |
|-------|------|
| `/` | Home |
| `/rules` | Rules |
| `/login` | Log In (email, then the emailed code) |
| `/my-picks` | My Picks |

The navigation bar (`app/components/NavBar`) is rendered in `app/layout.tsx`, so it appears on every page. Below 768px it shows a hamburger button that opens a side panel; at 768px and wider the links are shown inline. The right end of the bar shows a Log In link, or an account menu when signed in (see [Signing out and the nav bar](#signing-out-and-the-nav-bar)). To add a page, create its `app/<route>/page.tsx` and add an entry to `app/components/NavBar/navLinks.ts`.

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

The flow is a pure reducer (`loginFlow.ts`); `authApi.ts` wraps the two routes above and `navigate.ts` wraps the redirect so tests can replace it. The submit button stays disabled until the page has hydrated so an early native submit can't put the email in the URL. The proxy is not the only gate: pages that load picks check the session server-side too (see [My Picks page](#my-picks-page)).

To try it: follow "Trying it locally" above, open http://localhost:3000/login, and read the code from Mailpit.

### Signing out and the nav bar

| Route | Result |
|-------|--------|
| `GET /api/me` | `200 {"name":"...","email":"..."}` for the session user. `401 {"error":"unauthenticated"}` without a valid session; `404 {"error":"profile-not-found"}` if the user has no `profiles` row; `500 {"error":"internal"}`. The user always comes from the verified session, never from the request. Never cached. |
| `POST /api/logout` | `200 {"success":true}` after signing out this device only (`scope: "local"`; other devices stay signed in), and clears the session cookies. Also `200` if nobody was signed in. `500 {"success":false}` if Supabase fails. There is no CSRF token: the cookies are SameSite=Lax, so browsers don't send them on cross-site POSTs, and the route is POST-only. |

The root layout ([app/layout.tsx](./app/layout.tsx)) reads the session user on the server in `SessionNavBar` and passes only the user's name to the nav bar, wrapped in `<Suspense>` because a session read can't be prerendered (the rest of each page stays in the static shell). While that loads, the right end of the bar is empty, so a signed-in user never sees a flash of "Log In". Signed out, it shows a **Log In** link to `/login`; signed in, an avatar button opens a small "Are you sure?" menu with **Log Out** and **Cancel**. Log Out calls `POST /api/logout`, then reloads the home page; if the call fails the menu stays open with an error. If looking up the user fails, the bar falls back to the signed-out view instead of breaking the page. `GET /api/me` isn't used by the nav bar; it is there for client code that needs to know who is signed in.

### Reading and saving a submission

| Route | Result |
|-------|--------|
| `GET /api/submissions/:year` | `200` with the session user's picks for that year as flat JSON: `{"year":2026,"initialPlayoff":[...12 team ids],"initialTiebreakers":[...3],"currentPlayoff":[...12],"currentTiebreakers":[...3],"championId":null,"submittedAt":"...","updatedAt":null}`. Team ids only (use `GET /api/teams` for names); `championId` and `updatedAt` are `null` until the first revision. `400 {"error":"invalid-year"}` unless the year is exactly four digits with no leading zero; `401 {"error":"unauthenticated"}` without a valid session; `404 {"error":"submission-not-found"}` if the user has no row for that year (the same answer whether nobody or only someone else has one); `500 {"error":"internal"}`. The user always comes from the verified session; only the `:year` path segment is read from the request. Never cached. |

The lookup lives in `getSessionSubmission(year)` in [lib/submissions/submission.ts](./lib/submissions/submission.ts). Server components (such as My Picks) should call it directly rather than fetch this route.

| Route | Result |
|-------|--------|
| `PUT /api/submissions/:year` | Saves the session user's current picks. Body (`Content-Type: application/json`), exactly these three fields and nothing else: `{"currentPlayoff":[...12 team ids],"currentTiebreakers":[...3],"championId":<team id>}`. `200` with the full updated submission in the same shape as `GET`. `initial_*` and `submittedAt` are never changed, and `updatedAt` is set to the server time. Errors, checked in this order: `400 {"error":"invalid-year"}`; `401 {"error":"unauthenticated"}`; `415 {"error":"unsupported-media-type"}` unless the content type is `application/json`; `400 {"error":"invalid-body"}` for malformed JSON, any extra key (such as `userId`, `year` or `initialPlayoff`), a list of the wrong length, an id that isn't an integer from 1 to 2147483647, a missing or null `championId`, or a `championId` that isn't a team; `403 {"error":"outside-edit-window","editOpensAt":"<ISO>"|null,"editClosesAt":"<ISO>"|null}` when the server time is outside the year's `seasons` window (or the year has no `seasons` row, in which case both times are `null`); `404 {"error":"submission-not-found"}`; `500 {"error":"internal"}`. Never cached. |

The edit window is half-open: edits are allowed when `edit_opens_at <= now < edit_closes_at`, so the closing instant itself is already closed. "Now" is the server clock (`now()` in [lib/clock.ts](./lib/clock.ts)), never a time sent by the client. The check is `isEditWindowOpen` in [lib/seasons/edit-window.ts](./lib/seasons/edit-window.ts), the window is read by `getSeason(year)` in [lib/seasons/get-season.ts](./lib/seasons/get-season.ts) (signed-in clients only, because `seasons` is not readable anonymously), and the write is `updateSessionSubmission` in [lib/submissions/update-submission.ts](./lib/submissions/update-submission.ts). The route checks only the shape of the body ([lib/submissions/picks-body.ts](./lib/submissions/picks-body.ts)), not whether the picks follow the pool's rules; the client validates those. There is no CSRF token: the session cookies are `SameSite=Lax`, a form can't send `PUT`, and requiring JSON forces a CORS preflight, which the API never approves.

### Reading teams

| Route | Result |
|-------|--------|
| `GET /api/teams` | `200` with a bare JSON array of every team, ordered by name (the database's ordering; clients that need a specific order should sort themselves): `[{"id":87,"name":"Notre Dame","conference":"FBS Independent","is_power_conf":true,"image_url":"https://..."}, ...]`. Field names are snake_case to match the database and `lib/validation`'s `Team`, so the array can go straight into `validatePicks`. `image_url` is `null` if a team has no logo. An empty `teams` table gives `200 []`. `401 {"error":"unauthenticated"}` without a valid session (a `profiles` row is not required); `500 {"error":"internal"}`. Never cached. |

The lookup lives in `getTeams()` in [lib/teams.ts](./lib/teams.ts). Server components (such as My Picks and the edit view) should call it directly rather than fetch this route. `app/api/teams.db.test.ts` runs the route against the local stack; it reads the seeded teams and never writes to `teams`, so run `npm run seed:teams` first (`RUN_DB_TESTS=1 npx vitest run app/api/teams.db`).

### My Picks page

`/my-picks` shows the signed-in user's current picks for `CURRENT_SEASON_YEAR` ([lib/seasons/current-season.ts](./lib/seasons/current-season.ts)): the champion (once set), the 12 playoff teams, then the first three out, each with its team logo. The page is a static shell; `MyPicksSection` loads the picks per request inside `<Suspense>`, through `loadMyPicks` ([app/my-picks/load-my-picks.ts](./app/my-picks/load-my-picks.ts)), which calls `getSessionSubmission`, then `getTeams`, then (once there are picks to show) `getSeason`, in that order. Only team names, logo URLs, the picks view, the user's own initial top 12 team ids (the browser counts moves against them) and one message about the edit window reach the page: `editDisabledReason` is `null` inside the window, otherwise text such as "Editing opens Sun, Oct 11 at 12:00 AM ET." (times in Eastern, from [lib/seasons/edit-access.ts](./lib/seasons/edit-access.ts)). A year with no `seasons` row says editing isn't open, and a failed lookup says to reload, while the picks still show. The page does not re-check the window while it stays open; the server's check on save is what enforces it. It checks the session itself (the proxy is not the only gate) and shows inline messages instead of redirecting: signed out, no picks for the year, or a generic error (only the error name is logged). A pick whose team id isn't in `teams` shows as "Unknown team (#id)".

The Edit button (top right) opens the edit view (`PicksPanel` and `PicksEditor` in [app/components/Picks](./app/components/Picks)): a native `<select>` for each of the 15 slots and a champion `<select>` limited to the teams in the top 12 (clearing itself if its team leaves the top 12). Edits are local until saved: Cancel discards them and nothing is written. Repeated teams get an "Also in slot N" hint but don't block anything. Save validates in the browser (`validatePicks`, with the team list and the initial top 12 the page sent) and lists any violations above the buttons, with the slots involved, leaving the edits in place and sending nothing. A clean draft is sent with `PUT /api/submissions/:year` ([lib/save-picks.ts](./lib/save-picks.ts)); on success the page shows the picks the server returned (no refetch) and a "Your picks were saved." notice. Failures (signed out, outside the window, submission missing, rejected body, network or server errors) show a fixed message, never a raw server string, and keep the draft; a 401 adds a plain link to `/login` (which can't return to the edit view, so unsaved edits are lost). The browser receives each team's id, name, logo URL, conference and power flag, and the user's initial top 12 ids, but no initial First Three Out, timestamps, user id or email. `PicksPanel`'s required `editDisabledReason` prop (`null` = editing allowed, a string = disabled with that text) gates the button, and `MyPicksSection` passes it the loader's edit-window message. The team chooser is its own file, [TeamSelect.tsx](./app/components/Picks/TeamSelect.tsx), so a future autocomplete only replaces that.

Logos are the reusable `TeamLogo` ([app/components/TeamLogo](./app/components/TeamLogo)): a fixed 32px box on a light background in both light and dark mode (logos lose contrast on the dark theme's background) that is always rendered, so a missing or failed logo leaves a plain placeholder with no layout shift. Hiding the browser's broken-image icon on a failed load is best effort (CSS `::after`): checked by hand in Chromium; Safari doesn't render `::after` on a failed image and may still show the icon. It renders through `next/image` because ESPN's originals are 500px PNGs and the optimizer serves a few KB at the size shown. Only `https://a.espncdn.com/i/teamlogos/ncaa/500/<id>.png` is allowed, both for `images.remotePatterns` in [next.config.ts](./next.config.ts) and for what the component will render ([lib/team-logo.ts](./lib/team-logo.ts)); a new logo host needs a change in both. `app/my-picks/my-picks.db.test.ts` runs the loader against the local stack (needs seeded teams; never writes to `teams`): `RUN_DB_TESTS=1 npx vitest run app/my-picks/my-picks.db`. `app/my-picks/edit-window.db.test.ts` checks the edit-window message against real `seasons` RLS (`RUN_DB_TESTS=1 npx vitest run app/my-picks/edit-window.db`); it creates and removes `seasons` rows for the throwaway years 2095 and 2096, with only `lib/clock` mocked.

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

### Seeding participants

Each participant needs an auth user (so they can sign in), a `profiles` row and an initial `submissions` row. One script creates all three from a CSV, using `SUPABASE_SECRET_KEY`.

**The data file.** One row per participant, with exactly this header:

```
Name,Email,Pick 1,...,Pick 12,First Out 1,First Out 2,First Out 3
```

The file holds real emails, so it lives in the git-ignored `private/` folder (default `private/participants.csv`); the script refuses to read a file git doesn't ignore. Create the folder and start from the template, which uses fake `@example.test` addresses:

```bash
mkdir -p private
cp scripts/seed-participants/participants.example.csv private/participants.csv
```

Team names must match the `teams` table spelling (`Ohio State`, not `Ohio St.`), ignoring case and surrounding spaces. A name with a comma goes in quotes (`"Smith, Bob"`). Save it as **CSV UTF-8** (in Excel: Save As, "CSV UTF-8"); the script rejects a file with garbled characters. Emails are trimmed and lowercased. Empty rows (Excel often pads a file with `,,,,`) are ignored.

**Running it.** `--year` is required, and the `seasons` row for that year must already exist. It is a dry run unless you add `--apply`:

```bash
npm run seed:participants -- --year 2026                # dry run: validates everything, writes nothing
npm run seed:participants -- --year 2026 --apply        # write to the database in .env.local
npm run seed:participants -- --year 2026 other.csv      # a different (git-ignored) file
```

Always do the dry run first. It prints the target host (never a key) and, per participant, what would happen, using the spreadsheet row number (the header is row 1) and the name rather than the email. The whole file is checked before any write, so one misspelled team (the error lists close suggestions), a team picked twice, a bad email or a duplicate email means nothing is written. A participant with no Group of Six team in their top 12 is only a warning. `--apply` against anything other than `127.0.0.1` or `localhost` also needs `--production`.

**Re-running is safe.** Existing auth users are matched by email and reused, profiles are upserted (a changed name is updated), and a submission is only ever inserted when none exists for that user and year, never modified. So a participant's later edits to `current_*`, the champion or `updated_at` survive a re-run, and a run that stopped partway can simply be run again. Each participant's status is `created`, `existing` or `differs` (see below). After `--apply` it also prints the database's actual counts of auth users, profiles and submissions for the year.

**Late participants.** To add someone mid-season, run the script on a file containing only the new rows (same header).

**Production.** The sequence for seeding the real database:

1. Put the production `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env.local` temporarily (see [Environment variables](#environment-variables)), and make sure neither is also set in your shell (see [Seeding teams](#seeding-teams)).
2. Dry run: `npm run seed:participants -- --year 2026`. Fix every error it lists, and read the warnings.
3. Check the printed host is the production project, not `127.0.0.1`.
4. Run `npm run seed:participants -- --year 2026 --apply --production`.
5. Check the counts it prints: `submissions` for the year should equal the number of participants, and `auth.users` and `profiles` should be at least that many (they also count anyone not in the file, such as you). Confirm it exited 0 (`echo $?`) with no `differs` rows.
6. Switch `.env.local` back to the local values.

**If the file changed after seeding.** When an existing submission's initial picks differ from the file (status `differs`), the script warns for that row, leaves it alone and exits non-zero. Fix the initial picks by hand in the Supabase SQL editor, setting `initial_*` and, if the participant hasn't edited, `current_*` too:

```sql
update submissions
set initial_playoff = array[...12 team ids...], initial_tiebreakers = array[...3 ids...],
    current_playoff = array[...12 team ids...], current_tiebreakers = array[...3 ids...]
where year = 2026 and user_id = (select id from profiles where email = 'person@example.com');
```

**Removing a participant.** Delete their submission first (`submissions.user_id` has no cascade), then their auth user in the dashboard (**Authentication → Users**); the profile goes with the user.

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

Each year's edit window (when participants can revise their picks) is a row in `seasons`, defined in [supabase/seed.sql](./supabase/seed.sql). The server's edit-window check (`PUT /api/submissions/:year`, see [Reading and saving a submission](#reading-and-saving-a-submission)) reads it, and so does the My Picks page, to say when editing opens or closes, so changing the window is a data change, not a code change. That file holds only `seasons` rows, because it is also run against production; never add dev-only test data to it. Locally, `npx supabase db reset` (and the first `npx supabase start`) loads it.

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

This section is the yearly runbook. Nothing here happens automatically: the Supabase project is not kept awake, seasons are not created on a schedule, and participants are not imported by the app. It is written for two people:

- **The maintainer** runs everything below that uses a terminal (migrations, seed scripts, the one-line year bump).
- **Tyler**, the pool admin, mostly only reads: he looks at everyone's picks in the Supabase dashboard ([During the season](#during-the-season-view-everyones-picks)). He does not need a terminal.

Details that already have their own section (environment variables, seed scripts, migrations, the edit window) are linked rather than repeated here, so follow the links for the full commands.

### At a glance

Do these in order, a week or more before the edit window opens. Skipping ahead is the usual way to get a broken launch.

1. [Unpause the Supabase project](#before-each-season-unpause-the-supabase-project) and check the data and sign-in.
2. [Apply any new migrations](#database-changes) to production.
3. [Reseed `teams`](#before-each-season-set-up-the-season) if the team list or conferences changed (check the CSV every season).
4. Add the new `seasons` row (same section).
5. Seed the participants (same section).
6. Bump `CURRENT_SEASON_YEAR` and update the Home page's edit-window text (same section), in one pull request, after the seeding.
7. [Verify](#verifying-before-you-announce) the site, then announce it.
8. [During the season](#during-the-season-view-everyones-picks): read picks in the dashboard, and fix problems with the [troubleshooting table](#troubleshooting).

### Accounts and access you need

| What | Who needs it | Used for |
|------|--------------|----------|
| Supabase dashboard login for the project owner | Maintainer | Unpausing, SQL editor, Table Editor, Auth settings, logs, API keys |
| The Supabase project ref (in the dashboard URL, `supabase.com/dashboard/project/<project-ref>`) | Maintainer | `npx supabase link` (see [Applying migrations to production](#applying-migrations-to-production)) |
| The production database password (set when the project was created; reset under **Project Settings → Database** if lost) | Maintainer | `npx supabase link` only |
| The production API URL and secret key (**Project Settings → API** and **API Keys**) | Maintainer | Running the seed scripts against production |
| Vercel project access | Maintainer | Environment variables, checking deployments |
| GitHub write access to the repository | Maintainer | The yearly year-bump pull request |
| The Gmail account that sends login codes, and its app password | Maintainer | Login emails; the app password lives only in the Supabase dashboard (see [Login email sender](#login-email-sender-gmail-through-supabase)) |
| A Supabase dashboard invite for Tyler (**Organization settings → Team**, or the equivalent in the current dashboard) | Tyler | Reading `all_submissions` (see [During the season](#during-the-season-view-everyones-picks)) |

Rules for the keys and `.env.local` (full table in [Environment variables](#environment-variables)):

- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` belong in Vercel (Production and Preview). `SUPABASE_SECRET_KEY` **never** goes in Vercel: it bypasses row-level security and is only for the seed scripts on your own machine.
- Put production values in `.env.local` only for the minutes it takes to run a seed script against production, then restore the local values.
- A variable already set in your shell wins over `.env.local`. Before any script that writes to production, and again before any script you mean to run locally, check that nothing is set in your shell (the commands are under [Seeding teams](#seeding-teams)), and read the host the script prints.

### Before each season: unpause the Supabase project

Supabase's free tier **pauses a project after about a week of inactivity**. This app is only used for a few weeks each year, so the project will almost certainly be paused when a new season starts. We chose a manual unpause over a keep-alive ping. If the project is paused, the site cannot load picks or send login codes.

Do this at least a few days before the edit window opens, so any problem shows up before participants hit it:

1. Sign in at [supabase.com/dashboard](https://supabase.com/dashboard) with the project owner's account.
2. Open the CFP Pool Tracker project. A paused project shows a **"Project paused"** banner.
3. Click **Restore project** and wait a few minutes until the status is active. (Supabase only keeps paused free projects restorable for a limited time, about 90 days from the pause when this was written; the exact period is Supabase's policy and may change, so check the banner for the deadline and don't let one sit past it. A project that is past its deadline cannot be restored in place: you would have to download the backup, if Supabase still offers one, and create a new project, which changes every URL and key.)
4. Confirm the data survived: open **Table Editor** and check that `teams`, `profiles`, `submissions` and `seasons` have rows.
5. Confirm sign-in works: go to the deployed site, request a login code for your own participant email, and sign in.
6. If the codes don't arrive, see [Login email sender](#login-email-sender-gmail-through-supabase) and the [troubleshooting table](#troubleshooting).

Once the project is running again, it stays up for as long as it keeps seeing activity. The pool's heaviest use is the edit window and the weeks after it, so it should not pause again mid-season, but check it before the window opens if there has been a quiet stretch.

### Login email sender (Gmail through Supabase)

Participants sign in with a code sent by email (see [Authentication](#authentication)). Production sends it through a Gmail account over SMTP. All of this is configured in the Supabase dashboard, not in the repo or in an environment variable:

- **Sender credentials:** **Authentication → Emails → SMTP Settings** in the dashboard (older dashboards: **Project Settings → Auth → SMTP Settings**; the labels move around). Host `smtp.gmail.com`, port `465` (SSL) or `587` (STARTTLS), the Gmail address as the username, and a Google **app password** as the password (16 characters, entered without spaces; it needs 2-Step Verification on the Google account). If Google revokes the app password, or the Google account's password or security settings change, codes silently stop arriving: generate a new app password and paste it into the same settings.
- **Email text:** the **Magic Link** template must show the code with `{{ .Token }}` (not a link). The local copy, which production should match, is [supabase/templates/magic_link.html](./supabase/templates/magic_link.html). If the production template is changed in the dashboard, update that file to match so local and production don't drift.
- **Auth settings that matter:** sign-ups are disabled (only seeded participants can get a code), codes are 8 digits, and Supabase allows one email per address every 30 seconds (the login form's resend countdown matches it). [supabase/config.toml](./supabase/config.toml) holds the **local** values of these; `npx supabase config diff` can compare them with the linked project if you want to check for drift (run it after `npx supabase link`; treat the output as a hint and look in the dashboard to confirm).
- **Rate limits:** the number of emails Supabase will send per hour is a dashboard setting (**Authentication → Rate Limits**). The `email_sent` value in `supabase/config.toml` is local-only and does not change production. Gmail itself also caps a normal account at roughly 500 emails a day, which a pool this size should not approach, but a whole group requesting codes at the moment the window opens can hit the hourly limit in Supabase, so raise it before the window if it is low.
- **When a participant says the code never came:** check their spam folder, then **Logs → Auth** in the dashboard for the send attempt and its error (SMTP failures and rate limits show up there). The sign-in route always answers "a code is on its way" whether or not the email is registered, so the page itself will never tell you that the address was wrong; check the address against the `profiles` table.

### Database changes

Schema changes are SQL migrations in [supabase/migrations](./supabase/migrations), and they are applied to production by hand, not by CI. See [Applying migrations to production](#applying-migrations-to-production) for the commands, and [Changing the schema](#changing-the-schema) for the rule never to edit a migration that has already been applied.

Before each season, run `npx supabase db push --dry-run` to see whether production is missing any. Anything the app depends on must be applied first: for example, the migration that creates the `all_submissions` view has to be applied to production before Tyler can see that view.

### Before each season: set up the season

Do these in order, and use the same checks each year. Steps 1 to 3 write to production, so confirm the target each time.

1. **Check the team list, and reseed `teams` only if it changed.** Compare [Planning/d1_fbs_college_football_teams.csv](./Planning/d1_fbs_college_football_teams.csv) with the season's actual FBS teams and conferences (new FBS members, teams that changed conference, renamed teams, changed logos). If nothing changed, production already has the right teams and you can skip the seed. If something changed, edit the CSV, and if a conference was added or realigned, update the power-conference rules at the top of [scripts/seed-teams/teams.ts](./scripts/seed-teams/teams.ts) (`NON_POWER_CONFERENCES` and `POWER_OVERRIDES`; the power conferences themselves are in [lib/conferences.ts](./lib/conferences.ts)). Then run `npm run seed:teams` against production as described in [Seeding teams](#seeding-teams). It upserts by team ID, so re-running is safe, and it never deletes teams. Run `npm test` after editing the rules, and make that change a pull request.
2. **Add the season's `seasons` row.** Add a tuple to [supabase/seed.sql](./supabase/seed.sql) with the new window (times in ET with the right UTC offset), add the matching row to the table in [supabase/seed.test.ts](./supabase/seed.test.ts), run `npm test`, and paste the whole file into the dashboard's **SQL Editor** to load it. Then run the verification query and compare the instants. All the details are in [Seasons (edit window)](#seasons-edit-window). Do this before step 3: the participants script refuses to run for a year without a `seasons` row.
3. **Seed the participants.** Put the season's CSV (UTF-8, git-ignored) at `private/participants.csv`, then run the dry run (`npm run seed:participants -- --year <year>`), fix everything it lists, and run it again with `--apply --production`. Check the counts and that it exited 0 with no `differs` rows. See [Seeding participants](#seeding-participants) for the file format and the full production sequence. Do it for everyone before announcing the site, so nobody logs in to an empty My Picks page.
4. **Bump the year in code**, in one small pull request, only after steps 2 and 3 are done:
   - set `CURRENT_SEASON_YEAR` in [lib/seasons/current-season.ts](./lib/seasons/current-season.ts) to the new year (My Picks reads this, so until it is bumped the page keeps showing last season's picks);
   - update the hard-coded edit-window dates and year in the Home page text ([app/page.tsx](./app/page.tsx); a comment there says to do it each year) to match the new `seasons` row.

   Create a branch, open the pull request, wait for the CI check to pass (see [Continuous Integration](#continuous-integration)), and merge to `main`. Vercel's GitHub integration deploys `main` automatically; there is no deploy workflow in this repo. Check the deployment finished in Vercel.
5. **Restore `.env.local`** to the local values, and make sure nothing production-related is set in your shell.

### The edit window

The window is data, not code (see [Seasons (edit window)](#seasons-edit-window)). Things worth knowing while administering:

- It is half-open: editing is allowed when `edit_opens_at <= now < edit_closes_at`, so the closing instant itself is already closed.
- "Now" is the server's clock, never the participant's.
- Enter instants in Eastern time with the right UTC offset: `-04:00` during daylight time (EDT) and `-05:00` during standard time (EST). A midnight on the first Sunday of November is still `-04:00`.
- To move a window, edit that year's tuple in `supabase/seed.sql` (and the matching row in `supabase/seed.test.ts`), run the file in the dashboard's SQL Editor again, and re-run the verification query. No deploy is needed. If the Home page text states the dates, it is a code change to update it (see step 4 above).
- A year with no `seasons` row means editing is closed for it. My Picks says editing isn't open, and saves are rejected.

### Verifying before you announce

Before telling participants the site is live:

1. In the dashboard's **Table Editor**, check `teams`, `seasons` (the new row) and `submissions` (one row per participant for the year).
2. In the deployed site, sign in with a real participant's email (yours), and confirm My Picks shows the new year's picks with logos. Outside the window, the Edit button should be disabled with a message saying when editing opens.
3. Check [`all_submissions`](#during-the-season-view-everyones-picks) shows every participant.
4. Test a login email to a non-Gmail address if you can, and look in spam.

### During the season: view everyone's picks

There is no admin page. Instead, the database has a view called `all_submissions` with one row per participant per year: their name and email, their initial picks (`initial_1` to `initial_15`), their current picks (`current_1` to `current_15`), the champion, and when they submitted and last updated. Picks are team names in order: slots 1 to 12 are the playoff and 13 to 15 are First Three Out. Rows are sorted by year (newest first), then name. If a pick refers to a team that is missing from `teams`, it shows as `Unknown team <id>`. The champion is empty (`null`) until the participant saves their first revision, and `updated_at` is empty until then too.

To look at it:

1. Sign in at [supabase.com/dashboard](https://supabase.com/dashboard) and open the CFP Pool Tracker project.
2. Open **Table Editor**, and pick `all_submissions` from the table list (views are listed with the tables). To see only one year, add a filter on `year`.
3. To get a spreadsheet, use the table editor's **Export** option to download as CSV; it exports the rows being viewed, so apply any filter first. The dashboard labels may differ slightly from the names here; the intended steps are what is written above, and they are still to be confirmed with Tyler's real account (Task M11 in [the design doc](./Planning/design-document.md)).

Or, in the **SQL Editor**, paste and run:

```sql
select * from public.all_submissions where year = 2026 order by name;
```

(Change the year as needed. The query has not been saved in the dashboard, so paste it each time unless you save it yourself.)

The view is wide (about 40 columns), so scroll sideways; filter to one year; and in the SQL editor, list just the columns you want (for example `name, current_1, current_2, champion`). Exported CSVs contain participants' emails, so don't share them or put them anywhere public.

The view is read-only. To fix a participant's picks, edit the `submissions` table (in the **Table Editor**, or with SQL as in [Seeding participants](#seeding-participants)).

**Security.** The view contains participants' emails, so the API cannot read it: it is created `with (security_invoker = true)` and the migration revokes all access from `public`, `anon` and `authenticated`, so it is only visible in the dashboard (and to scripts using the secret key). [supabase/all-submissions.db.test.ts](./supabase/all-submissions.db.test.ts) checks this against the local stack (see [Testing](#testing)). The migration explains why; keep both the `security_invoker` option and the `revoke` if you ever recreate the view.

**Giving Tyler access.** The intended setup is to invite Tyler to the Supabase organization with the least access that still lets him read the view, so he can open the project's Table Editor or SQL Editor himself (the exact role and steps are not confirmed yet; this is Task M11 in the design doc). Two caveats until that is confirmed:

- Because the view uses `security_invoker`, it runs with the viewer's database role. The dashboard role Tyler gets must be one that bypasses row-level security to see everyone's rows. If he can open `all_submissions` but it is empty, that is the most likely reason; check the role the invite gave him. Whether the dashboard's **Read-only** member role does this has not been verified in production.
- That same role may also be able to read other tables, such as the auth users table, so his access could be wider than just this view. Decide whether that is acceptable before inviting him.

### Troubleshooting

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| The site can't load picks, or login codes never arrive, and the dashboard shows the project is paused | Supabase paused the project for inactivity | [Unpause it](#before-each-season-unpause-the-supabase-project) |
| A participant says "My Picks" shows no picks | They aren't seeded for the current year, or `CURRENT_SEASON_YEAR` is a year that wasn't seeded | Check `submissions` for their `user_id` and year; [seed](#seeding-participants) the late participant; check `CURRENT_SEASON_YEAR` |
| A participant never gets a code | Address not in `profiles`; spam; SMTP credentials revoked; rate limit | Check the address, their spam folder, **Logs → Auth**, and [Login email sender](#login-email-sender-gmail-through-supabase) |
| The Edit button is disabled | Outside the window, or the year has no `seasons` row | Read the message under the button, and check the `seasons` row with the verification query in [Seasons (edit window)](#seasons-edit-window) |
| Tyler can open `all_submissions` but it is empty | His dashboard role doesn't bypass row-level security (the view uses `security_invoker`) | Check his role in the organization settings, or use the maintainer's account to read the view |
| A seed script wrote to the wrong database | A variable set in the shell overrode `.env.local` | Check the shell, then see [Seeding teams](#seeding-teams) for the target check; fix the data in the SQL Editor |

### Reference

- The CI check (`.github/workflows/ci.yml`, see [Continuous Integration](#continuous-integration)) must pass before a pull request is merged. There is no deploy workflow: Vercel deploys `main` on its own.
- Design background and the task list are in [Planning/design-document.md](./Planning/design-document.md).
