# Testing

- [Conventions](#conventions)
- [Database tests](#database-tests)

Tests use [Vitest](https://vitest.dev) with [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/). `npm test` runs everything once; `npm run test:watch` re-runs on changes. CI runs `npm test` and never needs a database ([Deployment](./deployment.md#continuous-integration)).

## Conventions

- Any `*.test.ts` or `*.test.tsx` file is picked up. Keep tests next to the code they cover. [tests/example.test.tsx](../tests/example.test.tsx) shows the pattern.
- Testing Library cannot render async Server Components, so test server-side logic as plain functions or through the API routes.
- Test behavior and logic, not static copy.

## Database tests

Database tests run against the **local** Supabase stack and are skipped unless `RUN_DB_TESTS=1` is set, so plain `npm test` and CI never need a database. To run them, start the stack, put its values in `.env.local` (see [Environment variables](./development.md#environment-variables)), then:

```bash
RUN_DB_TESTS=1 npm test                        # bash / Git Bash
$env:RUN_DB_TESTS = "1"; npm test              # PowerShell (stays set for that terminal; Remove-Item Env:RUN_DB_TESTS to unset)
```

They write to the local database, and refuse to run unless `SUPABASE_URL` points at `127.0.0.1` or `localhost`. Every database test needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env.local`; all except the two seed-script tests also need `SUPABASE_PUBLISHABLE_KEY`. Tests that read the reference data need `teams` already seeded (`npm run seed:teams`); none of them writes to `teams` except the teams seed test.

**Adding one.** Name it `*.db.test.ts`, start it with `// @vitest-environment node`, wrap the suite in `describe.skipIf(!runDbTests)` and create the client with `createLocalAdminClient()` in `beforeAll`, both from [tests/local-db.ts](../tests/local-db.ts). [scripts/seed-teams/seed-teams.db.test.ts](../scripts/seed-teams/seed-teams.db.test.ts) shows the pattern.

**Catalogue.** Run one with `RUN_DB_TESTS=1 npx vitest run <path fragment>`.

| File | Covers | Notes | Command fragment |
|------|--------|-------|------------------|
| `app/api/auth/otp.db.test.ts` | The sign-in routes | | `app/api/auth/otp.db` |
| `app/api/session.db.test.ts` | `/api/me` and `/api/logout` | Creates throwaway users and deletes them afterwards; fakes only `next/headers` | `app/api/session.db` |
| `app/api/submissions.db.test.ts` | `GET /api/submissions/:year`, including that one user can't read another's picks | | `app/api/submissions.db` |
| `app/api/submissions-put.db.test.ts` | `PUT /api/submissions/:year`, with exact window boundaries against a throwaway season | Only `lib/clock` is mocked | `app/api/submissions-put.db` |
| `app/api/teams.db.test.ts` | `GET /api/teams` | | `app/api/teams.db` |
| `app/my-picks/my-picks.db.test.ts` | The My Picks loader | | `app/my-picks/my-picks.db` |
| `app/my-picks/edit-window.db.test.ts` | The edit-window message against real `seasons` RLS | Needs at least 15 teams seeded; creates and removes `seasons` rows for the throwaway years 2095 and 2096; only `lib/clock` is mocked | `app/my-picks/edit-window.db` |
| `supabase/all-submissions.db.test.ts` | The `all_submissions` view's contents, and that the API can't read it | | `supabase/all-submissions.db` |
| `scripts/seed-teams/seed-teams.db.test.ts`, `scripts/seed-participants/seed-participants.db.test.ts` | The seed scripts | Need no publishable key | `scripts/seed-teams`, `scripts/seed-participants` |
