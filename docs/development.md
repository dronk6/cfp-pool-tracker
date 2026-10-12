# Development

- [Prerequisites and setup](#prerequisites-and-setup)
- [Commands](#commands)
- [Environment variables](#environment-variables)
- [Trying login locally](#trying-login-locally)
- [Pages and navigation](#pages-and-navigation)

## Prerequisites and setup

Requires Node.js 22.9 or later and npm, and [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running) for the local Supabase stack.

```bash
npm install             # install dependencies (first time, or after package.json changes)
npx supabase start      # start the local database, Auth and Studio (first run downloads images)
cp .env.example .env.local   # then fill in the values from `npx supabase status`
npm run seed:teams      # load the team list into the local database
npm run dev             # start the app at http://localhost:3000
```

After every `npx supabase db reset`, run `npm run seed:teams` again, since a reset empties `teams`. The local database commands are in [Database](./database.md#local-database).

## Commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Generate Next.js types and run the TypeScript type-check |
| `npm test` | Run all tests once |
| `npm run test:watch` | Re-run tests on file changes |
| `npm run seed:teams` | Load the team list into the database (see [Seeding teams](./seeding.md#seeding-teams)) |
| `npm run seed:participants` | Load participants and their initial picks from a private CSV (see [Seeding participants](./seeding.md#seeding-participants)) |

CI runs lint, test, typecheck and build; see [Deployment](./deployment.md#continuous-integration).

## Environment variables

Copy [.env.example](../.env.example) to `.env.local` and fill in the values. `.env.local` is git-ignored; never commit real values.

- **Everyday local development** uses the local Supabase stack, never production. Start it (see [Database](./database.md#database)), then copy the API URL, publishable key and secret key from `npx supabase status` into `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`. Login code emails sent by the local stack are caught by its Mailpit inbox (the Mailpit URL in `npx supabase status`, normally http://127.0.0.1:54324), not delivered.
- **Production values** come from the Supabase dashboard: the URL is under **Project Settings → API**, and the publishable and secret keys are under **Project Settings → API Keys**. They go in Vercel (see [Deployment](./deployment.md#vercel-setup)). Put production values in `.env.local` only temporarily, to run an admin script against production (seeding teams or participants), then switch back to the local values.

| Name | Used by | Where to set it | Secret? |
|------|---------|-----------------|---------|
| `SUPABASE_URL` | Server-side Supabase client and proxy | `.env.local` and Vercel (Production and Preview) | No |
| `SUPABASE_PUBLISHABLE_KEY` | Server-side Supabase client and proxy | `.env.local` and Vercel (Production and Preview) | No, safe to expose by design, but kept server-only here per the design doc |
| `SUPABASE_SECRET_KEY` | Local admin scripts only (seeding teams and participants) | `.env.local` only. **Never set it in Vercel.** | Yes. It bypasses row-level security |

None of these use the `NEXT_PUBLIC_` prefix, so Next.js never ships them to the browser. The browser does not talk to Supabase directly; all database access goes through Next.js server code. Do not add a `NEXT_PUBLIC_` prefix to any of them.

Notes:

- The Gmail app password used to send login codes is **not** an environment variable. It lives only in the Supabase dashboard under **Auth → SMTP Settings**.
- Applying migrations needs no environment variable: `npx supabase link` prompts for the database password (see [Database](./database.md#database)).
- The teams seed script (`npm run seed:teams`) and the opt-in database tests read `SUPABASE_URL` and `SUPABASE_SECRET_KEY`; the app itself reads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (when handling a request, not at import time). The build does not require any of them to be set.

## Trying login locally

Start the local stack, run `npm run dev`, then request a code:

```bash
curl -X POST localhost:3000/api/auth/request-otp -H "Content-Type: application/json" -d '{"email":"someone@example.com"}'
```

The email goes to the stack's Mailpit inbox (http://127.0.0.1:54324), not a real mailbox, and is only sent if that email belongs to an existing user. Create one in local Studio (Authentication, Add user, tick Auto Confirm User). The local auth settings in [supabase/config.toml](../supabase/config.toml) (no sign-up, 30 second resend limit, 8-character codes, code-only email from [supabase/templates/magic_link.html](../supabase/templates/magic_link.html)) mirror production. A running stack only picks up changes to that file after `npx supabase stop` and `npx supabase start`.

## Pages and navigation

| Route | Page |
|-------|------|
| `/` | Home |
| `/rules` | Rules |
| `/login` | Log In (email, then the emailed code) |
| `/my-picks` | My Picks |

The navigation bar (`app/components/NavBar`) is rendered in `app/layout.tsx`, so it appears on every page. Below 768px it shows a hamburger button that opens a side panel; at 768px and wider the links are shown inline. The right end of the bar shows a Log In link, or an account menu when signed in (see [Signing out and the nav bar](./authentication.md#signing-out-and-the-nav-bar)). To add a page, create its `app/<route>/page.tsx` and add an entry to `app/components/NavBar/navLinks.ts`.
