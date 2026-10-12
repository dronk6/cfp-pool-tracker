# Documentation

- [How these docs are organized](#how-these-docs-are-organized)
- [The docs](#the-docs)
- [When you change X, update Y](#when-you-change-x-update-y)

## How these docs are organized

- **`docs/` describes how the system works today.** It is the place to learn how to run, use, modify and maintain the app.
- **[`Planning/`](../Planning/design-document.md) holds the design, the decisions behind it, and the task breakdown.** It explains why and what comes next, and is not kept as a description of current behavior.
- If the two disagree about current behavior, **`docs/` wins**.

## The docs

| Doc | Scope |
|-----|-------|
| [architecture.md](./architecture.md) | System overview, request flow, repository layout, key `lib/` modules, conventions, theming |
| [development.md](./development.md) | Prerequisites, local setup, environment variables, commands, trying login locally, adding a page |
| [testing.md](./testing.md) | Vitest and Testing Library conventions, the opt-in database tests, and a catalogue of them |
| [authentication.md](./authentication.md) | The email-code sign-in flow, the proxy and route gate, the login page, sign-out and the nav bar |
| [api.md](./api.md) | Every API route: request and response contracts, status codes, and the edit-window rules |
| [my-picks.md](./my-picks.md) | The My Picks page, its loader and what reaches the browser, the edit view and save flow, team logos, validation |
| [database.md](./database.md) | Schema, the `all_submissions` view, local database commands, changing the schema, row-level security, migrations to production, seasons and the edit window |
| [seeding.md](./seeding.md) | Seeding teams and participants: CSV formats, dry runs, `--apply --production`, re-running, corrections |
| [deployment.md](./deployment.md) | Vercel, the CI check, and branch protection |
| [admin-runbook.md](./admin-runbook.md) | The yearly admin steps for the maintainer, and how Tyler views everyone's picks |

## When you change X, update Y

| If you change | Update |
|---------------|--------|
| Routes or response shapes | [api.md](./api.md) |
| Authentication, the proxy, or sessions | [authentication.md](./authentication.md) |
| The My Picks page, its loader, or the edit view | [my-picks.md](./my-picks.md) |
| Migrations, row-level security, `supabase/seed.sql`, or seasons | [database.md](./database.md) |
| The seed scripts or their CSV formats | [seeding.md](./seeding.md) |
| Environment variables, `.env.example`, or npm commands | [development.md](./development.md) |
| Database tests, or the contrast and hard-coded-color tests | [testing.md](./testing.md) |
| Colors, themes, or the variables in `app/globals.css` | [architecture.md](./architecture.md#theming) |
| CI or Vercel setup | [deployment.md](./deployment.md) |
| The yearly steps or admin access | [admin-runbook.md](./admin-runbook.md) |
