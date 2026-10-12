# College Football Playoff Prediction Tracker

A Next.js (App Router) + TypeScript app for a College Football Playoff prediction pool. Participants sign in with an emailed code to view their picks and, during a short window each October, revise them.

**Admin or maintainer? Start at [docs/admin-runbook.md](./docs/admin-runbook.md).**

- [Status](#status)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Key commands](#key-commands)
- [Repo map](#repo-map)
- [Documentation](#documentation)
- [Admin Responsibilities](#admin-responsibilities)
- [License](#license)

## Status

The 2026 season is in progress. Milestones 1 to 9 (setup, data, validation, auth, API, My Picks, static pages, participant seeding) are done; Milestone 10, pre-launch verification, is in flight. The milestone list and task breakdown are in [Planning/design-document.md](./Planning/design-document.md#milestones); open work is tracked in GitHub issues.

## Tech stack

- Next.js 16 (App Router) and React 19, TypeScript
- Supabase: Postgres and Auth (passwordless email codes, sent through Gmail SMTP)
- Vercel for hosting, GitHub Actions for CI
- Vitest and React Testing Library for tests

## Quick start

Requires Node.js 22.9 or later, npm, and [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running).

```bash
npm install
npx supabase start             # local database, Auth and Studio; the first run downloads images
cp .env.example .env.local     # fill in SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY
                               # from the output of `npx supabase status`
npm run seed:teams             # load the team list into the local database
npm run dev                    # http://localhost:3000
```

Login codes sent by the local stack arrive in its Mailpit inbox (the URL is in `npx supabase status`, normally http://127.0.0.1:54324), not in a real mailbox. See [docs/development.md](./docs/development.md) for the details and for trying login locally.

## Key commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Generate Next.js types and run the TypeScript type-check |
| `npm test` | Run all tests once (`RUN_DB_TESTS=1 npm test` adds the [database tests](./docs/testing.md#database-tests)) |
| `npm run seed:teams` | Load the team list ([docs/seeding.md](./docs/seeding.md#seeding-teams)) |
| `npm run seed:participants` | Load participants and their initial picks ([docs/seeding.md](./docs/seeding.md#seeding-participants)) |
| `npx supabase start` / `stop` / `db reset` | Run, stop, or rebuild the local database ([docs/database.md](./docs/database.md#local-database)) |

## Repo map

| Path | What is there |
|------|---------------|
| `app/` | Pages, API routes (`app/api`) and components |
| `lib/` | Server and shared logic: Supabase clients, auth, submissions, seasons, validation |
| `proxy.ts` | Session refresh and route gating |
| `scripts/` | The admin seed scripts (teams and participants) |
| `supabase/` | Local stack config, migrations, `seed.sql` (the `seasons` rows), login-email template |
| `tests/` | Shared test helpers |
| `docs/` | How the system works today |
| `Planning/` | Design, decisions, rules and task breakdown |
| `.github/workflows/ci.yml` | The CI check |

More in [docs/architecture.md](./docs/architecture.md).

## Documentation

`docs/` describes how the system works today; `Planning/` holds the design, decisions and tasks. If they disagree about current behavior, `docs/` wins. Start at [docs/README.md](./docs/README.md), which also says which doc to update when you change something.

- [Architecture](./docs/architecture.md)
- [Development](./docs/development.md)
- [Testing](./docs/testing.md)
- [Authentication](./docs/authentication.md)
- [API](./docs/api.md)
- [My Picks](./docs/my-picks.md)
- [Database](./docs/database.md)
- [Seeding](./docs/seeding.md)
- [Deployment](./docs/deployment.md)
- [Admin runbook](./docs/admin-runbook.md)
- [Planning/](./Planning/design-document.md): the design document, rules and plans

## Admin Responsibilities

Moved: see [docs/admin-runbook.md](./docs/admin-runbook.md).

## License

[MIT](./LICENSE)
