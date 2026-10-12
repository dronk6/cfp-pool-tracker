# API

- [Authentication routes](#authentication-routes)
- [Session routes](#session-routes)
- [Reading and saving a submission](#reading-and-saving-a-submission)
- [Reading teams](#reading-teams)

All routes live under `app/api` and return JSON. Every route that acts for a user takes the user from the verified session cookie, never from the request. Responses are never cached. Field names in team objects are snake_case to match the database. Server components should call the underlying `lib/` functions directly instead of fetching these routes.

## Authentication routes

| Route | Body | Result |
|-------|------|--------|
| `POST /api/auth/request-otp` | `{ "email": "..." }` | `200 {"success":true}` whether or not the email is a participant, and whether or not Supabase errored or rate limited (so it can't be used to find out who is registered). The email is sent after the response (Next.js `after()`), so response time doesn't reveal registration either. `400 {"success":false,"error":"invalid-email"}` for malformed input. |
| `POST /api/auth/verify-otp` | `{ "email": "...", "otp": "..." }` | `200 {"success":true}` and the session cookies on success; `401 {"success":false}` for any failure. The code length is a Supabase setting (8 characters in production), so the route only checks that the code is digits. |

## Session routes

| Route | Result |
|-------|--------|
| `GET /api/me` | `200 {"name":"...","email":"..."}` for the session user. `401 {"error":"unauthenticated"}` without a valid session; `404 {"error":"profile-not-found"}` if the user has no `profiles` row; `500 {"error":"internal"}`. The user always comes from the verified session, never from the request. Never cached. |
| `POST /api/logout` | `200 {"success":true}` after signing out this device only (`scope: "local"`; other devices stay signed in), and clears the session cookies. Also `200` if nobody was signed in. `500 {"success":false}` if Supabase fails. There is no CSRF token: the cookies are SameSite=Lax, so browsers don't send them on cross-site POSTs, and the route is POST-only. |

## Reading and saving a submission

| Route | Result |
|-------|--------|
| `GET /api/submissions/:year` | `200` with the session user's picks for that year as flat JSON: `{"year":2026,"initialPlayoff":[...12 team ids],"initialTiebreakers":[...3],"currentPlayoff":[...12],"currentTiebreakers":[...3],"championId":null,"submittedAt":"...","updatedAt":null}`. Team ids only (use `GET /api/teams` for names); `championId` and `updatedAt` are `null` until the first revision. `400 {"error":"invalid-year"}` unless the year is exactly four digits with no leading zero; `401 {"error":"unauthenticated"}` without a valid session; `404 {"error":"submission-not-found"}` if the user has no row for that year (the same answer whether nobody or only someone else has one); `500 {"error":"internal"}`. The user always comes from the verified session; only the `:year` path segment is read from the request. Never cached. |

The lookup lives in `getSessionSubmission(year)` in [lib/submissions/submission.ts](../lib/submissions/submission.ts). Server components (such as My Picks) should call it directly rather than fetch this route.

| Route | Result |
|-------|--------|
| `PUT /api/submissions/:year` | Saves the session user's current picks. Body (`Content-Type: application/json`), exactly these three fields and nothing else: `{"currentPlayoff":[...12 team ids],"currentTiebreakers":[...3],"championId":<team id>}`. `200` with the full updated submission in the same shape as `GET`. `initial_*` and `submittedAt` are never changed, and `updatedAt` is set to the server time. Errors, checked in this order: `400 {"error":"invalid-year"}`; `401 {"error":"unauthenticated"}`; `415 {"error":"unsupported-media-type"}` unless the content type is `application/json`; `400 {"error":"invalid-body"}` for malformed JSON, any extra key (such as `userId`, `year` or `initialPlayoff`), a list of the wrong length, an id that isn't an integer from 1 to 2147483647, a missing or null `championId`, or a `championId` that isn't a team; `403 {"error":"outside-edit-window","editOpensAt":"<ISO>"|null,"editClosesAt":"<ISO>"|null}` when the server time is outside the year's `seasons` window (or the year has no `seasons` row, in which case both times are `null`); `404 {"error":"submission-not-found"}`; `500 {"error":"internal"}`. Never cached. |

The edit window is half-open: edits are allowed when `edit_opens_at <= now < edit_closes_at`, so the closing instant itself is already closed. "Now" is the server clock (`now()` in [lib/clock.ts](../lib/clock.ts)), never a time sent by the client. The check is `isEditWindowOpen` in [lib/seasons/edit-window.ts](../lib/seasons/edit-window.ts), the window is read by `getSeason(year)` in [lib/seasons/get-season.ts](../lib/seasons/get-season.ts) (signed-in clients only, because `seasons` is not readable anonymously), and the write is `updateSessionSubmission` in [lib/submissions/update-submission.ts](../lib/submissions/update-submission.ts). The route checks only the shape of the body ([lib/submissions/picks-body.ts](../lib/submissions/picks-body.ts)), not whether the picks follow the pool's rules; the client validates those. There is no CSRF token: the session cookies are `SameSite=Lax`, a form can't send `PUT`, and requiring JSON forces a CORS preflight, which the API never approves.

## Reading teams

| Route | Result |
|-------|--------|
| `GET /api/teams` | `200` with a bare JSON array of every team, ordered by name (the database's ordering; clients that need a specific order should sort themselves): `[{"id":87,"name":"Notre Dame","conference":"FBS Independent","is_power_conf":true,"image_url":"https://..."}, ...]`. Field names are snake_case to match the database and `lib/validation`'s `Team`, so the array can go straight into `validatePicks`. `image_url` is `null` if a team has no logo. An empty `teams` table gives `200 []`. `401 {"error":"unauthenticated"}` without a valid session (a `profiles` row is not required); `500 {"error":"internal"}`. Never cached. |

The lookup lives in `getTeams()` in [lib/teams.ts](../lib/teams.ts). Server components (such as My Picks and the edit view) should call it directly rather than fetch this route. `app/api/teams.db.test.ts` runs the route against the local stack; it reads the seeded teams and never writes to `teams`, so run `npm run seed:teams` first (`RUN_DB_TESTS=1 npx vitest run app/api/teams.db`).
