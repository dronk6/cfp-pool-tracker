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

Copy [.env.example](./.env.example) to `.env.local` and fill in the values from the Supabase dashboard under **Project Settings → API**. `.env.local` is git-ignored; never commit real values.

| Name | Used by | Where to set it | Secret? |
|------|---------|-----------------|---------|
| `SUPABASE_URL` | Server-side Supabase client and middleware | `.env.local` and Vercel (Production and Preview) | No |
| `SUPABASE_PUBLISHABLE_KEY` | Server-side Supabase client and middleware | `.env.local` and Vercel (Production and Preview) | No, safe to expose by design, but kept server-only here per the design doc |
| `SUPABASE_SECRET_KEY` | Local admin scripts only (seeding teams and participants) | `.env.local` only. **Never set it in Vercel.** | Yes. It bypasses row-level security |

None of these use the `NEXT_PUBLIC_` prefix, so Next.js never ships them to the browser. The browser does not talk to Supabase directly; all database access goes through Next.js server code. Do not add a `NEXT_PUBLIC_` prefix to any of them.

Notes:

- The Gmail app password used to send login codes is **not** an environment variable. It lives only in the Supabase dashboard under **Auth → SMTP Settings**.
- Database migration credentials (such as a database password or connection string) are not listed yet. They will be added when the migration tooling is chosen.
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
2. Insert the season's row in `seasons` with `edit_opens_at` and `edit_closes_at` (in ET-aware timestamps).
3. For each participant, create their auth user and `profiles` row using the seeding script (see [otp-authentication-plan.md](./Planning/otp-authentication-plan.md), Step 2), **then** insert their initial `submissions` row. Do both for everyone before announcing the site, so nobody logs in to an empty "My Picks" page.
