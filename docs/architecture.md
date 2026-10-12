# Architecture

- [System overview](#system-overview)
- [Request flow](#request-flow)
- [Repository layout](#repository-layout)
- [Key `lib/` modules](#key-lib-modules)
- [Conventions](#conventions)
- [Theming](#theming)

A Next.js (App Router, TypeScript) app backed by Supabase (Postgres and Auth). Participants sign in by emailed code and view or revise their picks during a short window each October. For the reasoning behind these choices, see the "Decisions" section of [the design document](../Planning/design-document.md#decisions-from-design-review).

## System overview

```
browser  --->  Next.js on Vercel (pages, API routes, proxy.ts)  --->  Supabase (Postgres + Auth)
                                                                        |
local scripts (seed teams / participants, secret key) ----------------->+
```

- **The browser never talks to Supabase.** All database and Auth calls happen in Next.js server code (Server Components, Route Handlers, `proxy.ts`), using the publishable key and the user's session cookies. Row-level security backs up the app's own checks ([Database](./database.md#row-level-security)).
- **Admin work happens outside the app.** The seed scripts run on the maintainer's machine with the secret key, which bypasses row-level security and is never set in Vercel ([Seeding](./seeding.md)).
- **Tyler has no admin page.** He reads everyone's picks through the `all_submissions` view in the Supabase dashboard ([Database](./database.md#the-all_submissions-view)).

## Request flow

1. Every request except static assets passes through [proxy.ts](../proxy.ts), which refreshes the session cookies and redirects signed-out visitors away from `/my-picks` and signed-in visitors away from `/login` ([Authentication](./authentication.md)). `/api` is never redirected; each route checks the session itself.
2. Pages are mostly a static shell. Data-dependent parts (the nav bar's user, the picks) load per request inside `<Suspense>`.
3. Route Handlers under `app/api` read the user from the verified session (see Conventions below) and call functions in `lib/` ([API](./api.md)).
4. `lib/` talks to Supabase through `createSupabaseServerClient()` and returns plain data.

## Repository layout

| Path | What is there |
|------|---------------|
| `app/` | Next.js App Router. `page.tsx` files are the pages (`/`, `/rules`, `/login`, `/my-picks`); `app/api/` holds the Route Handlers; `app/layout.tsx` renders the nav bar. |
| `app/components/` | React components: `LoginForm`, `NavBar`, `Picks` (list, editor, panel), `TeamLogo`. Each has its CSS module and tests beside it. |
| `app/my-picks/` | The My Picks page, its `load-my-picks.ts` loader and `MyPicksSection` ([My Picks](./my-picks.md)). |
| `lib/` | Server and shared logic, below. |
| `proxy.ts` | Session refresh and route gating (Next.js 16's name for middleware). |
| `scripts/seed-teams/`, `scripts/seed-participants/` | The admin seed scripts ([Seeding](./seeding.md)). |
| `supabase/` | `config.toml` (local stack), `migrations/`, `seed.sql` (the `seasons` rows), `templates/magic_link.html` (login-code email), and DB-level tests. |
| `tests/` | Shared test helpers (`local-db.ts`) and the example test ([Testing](./testing.md)). |
| `Planning/` | Design, decisions, rules and task breakdown (not the current-behavior docs). |
| `docs/` | These docs: how the system works today. |
| `.github/workflows/ci.yml` | The CI check ([Deployment](./deployment.md)). |
| `private/` | Git-ignored; holds the real participants CSV. |

## Key `lib/` modules

| Module | Role |
|--------|------|
| `lib/supabase/server.ts`, `config.ts`, `proxy.ts`, `stateless.ts` | The Supabase clients (cookie-backed for requests; stateless for requesting a login code), environment reading, and the proxy's session refresh |
| `lib/auth/` | `getCurrentUser()`, `route-gate.ts`, profile lookup, and input checks |
| `lib/submissions/` | `getSessionSubmission`, `updateSessionSubmission`, request-body and year validation |
| `lib/seasons/` | `CURRENT_SEASON_YEAR`, `getSeason`, `isEditWindowOpen`, and the edit-window message shown on My Picks |
| `lib/teams.ts` | `getTeams()` |
| `lib/validation.ts`, `lib/moves.ts` | The pick rules (`validatePicks`) and move counting; pure functions |
| `lib/edit-picks.ts`, `lib/picks-view.ts`, `lib/save-picks.ts` | Client-side editing state, the picks view model, and the `PUT` call |
| `lib/clock.ts` | `now()`, the single source of the server's time (tests replace it) |
| `lib/conferences.ts` | The list of power conferences, shared by seeding and validation |
| `lib/team-logo.ts` | The logo-URL allowlist |

## Conventions

- **Server-only environment variables.** None use the `NEXT_PUBLIC_` prefix; never add one ([Development](./development.md#environment-variables)).
- **No secrets in the browser or in Vercel.** `SUPABASE_SECRET_KEY` is for local admin scripts only.
- **Never edit a migration that has been applied to production.** Add a new one ([Database](./database.md#changing-the-schema)).
- **Tests live beside the code they cover** ([Testing](./testing.md)).
- **The edit window is data, not code.** It is a `seasons` row; changing it needs no deploy ([Database](./database.md#seasons-edit-window)). The one yearly code change is `CURRENT_SEASON_YEAR` ([Admin runbook](./admin-runbook.md)).
- **The user always comes from the verified session.** Never trust a user id sent by the client.

## Theming

All colors come from CSS variables in [`app/globals.css`](../app/globals.css). Light is the default and a `prefers-color-scheme: dark` block overrides what differs; there is no manual toggle, and `color-scheme: light dark` makes form controls and scrollbars follow the OS. No other CSS or TSX may hard-code a color.

| Variable | Role | Light | Dark |
|----------|------|-------|------|
| `--primary-1` | Background | `#F0F0F1` | `#004800` |
| `--primary-2` | Text and outlines | `#004800` | `#F0F0F1` |
| `--accent-1` | Emphasized text: inline links, the current nav page, warnings such as "Also in slot N", and the focus ring | `#B34A0E` | `#F59A63` |
| `--accent-2` | Highlights and primary buttons | `#78A8FC` | `#78A8FC` |
| `--danger` | Error messages only (not part of the brand palette) | `#B3123B` | `#FFB3C1` |

Lighter shades are never new hex values. Two are derived with `color-mix`: `--outline-soft` (softer borders such as the nav bar edge) and `--accent-2-tint` (hover states). Two literals are fixed in both modes: `--on-accent-2` (`#004800`, the label on primary buttons, because `--primary-2` is light in dark mode) and `--logo-chip` (`#F0F0F1`, the team logo background, because logos are designed for light backgrounds).

**Contrast.** [`app/globals.contrast.test.ts`](../app/globals.contrast.test.ts) reads the variables from `globals.css` and fails if a pairing drops below 4.5:1 for text or 3:1 for outlines and the focus ring, in both modes. The one documented exception is `--accent-2` against the light background (about 2.09:1), so it is never the only thing marking a boundary: primary buttons also carry a `--primary-2` border.

**Rules**
- Primary buttons (Save, Send Code, Verify Code and the Log Out confirm) use `--accent-2`; every other button is `--primary-1` with a `--primary-2` border.
- Errors use `--danger` and warnings use `--accent-1`. They are close in lightness, so each message starts with the `StatusCue` component (`app/components/StatusCue`), an `aria-hidden` "Error: " or "Warning: " prefix that does not change accessible names or message strings. Never put orange or red text on a tinted background.
- A global `:focus-visible` rule draws the `--accent-1` focus ring. Elements that are focused by script and are not controls (the edit form and its error summary) opt out with `outline: none`.
- A `forced-colors: active` block keeps state visible in Windows high-contrast mode: hovers get an outline, and disabled controls get a dashed border.
- The team dropdown is a native `<select>`. The closed control is fully themed, but the open list's hover and selected highlight is drawn by the browser; it is tinted only where `appearance: base-select` is supported (Chromium 135 and later), and other browsers keep their default.

**Adding or changing a color.** Define it as a variable in the light block and, if it differs, in the dark block of `globals.css`, then add its pairings to `app/globals.contrast.test.ts`. Derive lighter shades with `color-mix` instead of a new hex. [`app/colors.guard.test.ts`](../app/colors.guard.test.ts) fails on any `#hex`, `rgb()`, `hsl()` or named color in the module CSS files and non-test TSX, and in `globals.css` outside the `:root` blocks.
