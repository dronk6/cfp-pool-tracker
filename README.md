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
| `npm test` | Run all tests once |
| `npm run test:watch` | Re-run tests on file changes |

### Testing

Tests use [Vitest](https://vitest.dev) with [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/). Any `*.test.ts` or `*.test.tsx` file is picked up; keep tests next to the code they cover. `tests/example.test.tsx` shows the pattern. Testing Library cannot render async Server Components, so test server-side logic as plain functions or through the API routes.

## Continuous Integration

A GitHub Actions workflow ([.github/workflows/ci.yml](./.github/workflows/ci.yml)) runs on every pull request and on every push to `main`. It installs dependencies with `npm ci`, then runs `npm run lint` and `npm test`. It does not type-check or build, and it does not deploy (Vercel handles deployment).

The check appears on pull requests as **Lint and test**. To reproduce it locally, run `npm ci && npm run lint && npm test`.

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
6. If the codes don't arrive, check **Project Settings → Auth → SMTP Settings** (Resend credentials) and Resend's dashboard.

### Before each season: set up the season

1. Reseed `teams` from the season's `d1_fbs_college_football_teams.csv`.
2. Insert the season's row in `seasons` with `edit_opens_at` and `edit_closes_at` (in ET-aware timestamps).
3. For each participant, create their auth user and `profiles` row using the seeding script (see [otp-authentication-plan.md](./Planning/otp-authentication-plan.md), Step 2), **then** insert their initial `submissions` row. Do both for everyone before announcing the site, so nobody logs in to an empty "My Picks" page.
