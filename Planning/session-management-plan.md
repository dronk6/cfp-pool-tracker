# Implementation Plan: User Session Management (via Supabase Auth + `@supabase/ssr`)

## Overview

### Problem Statement

Once a user proves their identity via OTP (see [otp-authentication-plan.md](./otp-authentication-plan.md)), the app needs a way to remember "this browser belongs to user X" across page loads and API requests — without re-validating an OTP every time.

### Goal

Establish a session mechanism that:
- Lets the Next.js app know which user is making a request, so it can fetch that user's submissions.
- Lets the app display the user's profile info (name, email) in the UI.
- Lets a user log out.
- Enforces that a user can only modify their own data, and only during the allowed submission window.

### Scope

This document covers everything from "OTP was successfully validated" through day-to-day session handling in the Next.js app: how the session is stored, how the server reads it, how the client gets profile data, logout, and route protection — now built on **Supabase Auth's session model**, delivered to the browser via the **`@supabase/ssr`** package, instead of a hand-rolled JWT + manual cookie code.

**A note on the doc split:** the original plan split "issue the token" (otp-authentication-plan.md) from "manage the token day-to-day" (this doc) because they were two different services — a standalone auth microservice vs. the Next.js app. With Supabase, there is no separate auth microservice to build; Supabase *is* the auth service, and both the OTP route handlers and the session-reading code now live in the same Next.js app, both just calling `supabase-js`. We're keeping the same two-document split anyway because the *concerns* are still distinct and map cleanly: otp-authentication-plan.md is "how does a session get created," this doc is "what do we do with it once it exists." Just know that "the auth service" in what follows means "Supabase," not a service we're writing.

## Background: Concepts You'll Need (Read This First)

### What is a session here, and who manages it?

Supabase Auth issues a session made of two things on successful OTP verification: a short-lived **access token** (a signed JWT, auto-expiring every hour by default) and a longer-lived **refresh token** (used to silently get a new access token without making the user log in again). Supabase manages the signing secret, the expiry, and the refresh mechanics — we never generate or verify a signature ourselves. The access token is still a JWT in the same sense the original plan described (a signed, non-encrypted JSON payload — don't put sensitive data in it, not that we're the ones constructing it anymore), but all of the plumbing around it is now Supabase's responsibility.

### Where does the session live — and how does it get there?

The **`@supabase/ssr`** package is what bridges Supabase's session objects into Next.js cookies. It gives you:
- `createBrowserClient(...)` — a Supabase client for use in Client Components.
- `createServerClient(...)` — a Supabase client for use in Server Components, Route Handlers, and the proxy, wired up with a cookie adapter so that whenever `supabase.auth.signInWithOtp`, `verifyOtp`, `signOut`, or an automatic token refresh happens, the resulting cookies are read from and written to the actual Next.js request/response automatically.

Functionally, this gives us the same properties the original plan specified by hand: the session is carried in cookies set with `HttpOnly`, `Secure` (in production) and `SameSite=Lax`, so client-side JavaScript can't read them directly (XSS protection) and the browser attaches them automatically on every request to our domain. The `@supabase/ssr` defaults do **not** do this on their own: they set `httpOnly: false` and no `secure` flag (checked in 0.12.7), because the library expects a browser client to read the cookies. We have no browser client, so `lib/supabase/config.ts` overrides the defaults explicitly (`secure` is off outside production so sign-in works over http on localhost). We get this by configuring `@supabase/ssr` rather than writing `res.cookie(...)` calls ourselves.

### Local vs. remote verification — now `getSession()` vs. `getUser()`

The original plan framed this as "local JWT verification" (fast, no network call) vs. "remote check against the auth service" (slower, allows instant revocation). Supabase's SDK exposes the same tradeoff as two different calls:

- **`supabase.auth.getSession()`** reads the session out of the cookie/local storage and decodes it locally — fast, but in a server context it's reading a value that arrived with the request and hasn't been re-checked against Supabase.
- **`supabase.auth.getUser()`** sends the access token to Supabase's Auth server to re-validate it before returning the user. Slightly slower (one network hop), but authoritative.

**Recommendation for this project, anywhere we're deciding "is this request authenticated" on the server (the proxy, Route Handlers, Server Components): use `getUser()`, not `getSession()`.** This is also Supabase's own official guidance for server-side code — `getSession()` alone is explicitly called out in their docs as unsafe to trust server-side. Given this is a hobby project with low traffic, the extra network hop is not a meaningful cost, and it's the same "don't trust what the client handed you without checking" instinct the original plan applied to JWTs.

### A critical distinction: identity vs. permission

This carries over from the original plan **unchanged**, because it has nothing to do with how auth is implemented:

Verifying a session tells you *who* is making a request. It does **not** tell you whether the *action* they're requesting is currently allowed. For this app specifically: the fact that a user is logged in doesn't mean they're allowed to edit their submission right now — that depends on the current date relative to the contest's submission window.

**This means: disabling the "Edit" button in the UI outside the submission window is a UX nicety, not a security control.** Anyone can bypass client-side UI restrictions by calling the API directly (browser devtools, curl, etc.). The code handling "update picks" must independently check the current server time against the contest's close/open dates (stored in the DB) on every write request, regardless of whether the session is valid. Do this check even though you're also disabling the button — both matter, for different reasons (UX vs. actual enforcement).

## Step-by-Step Implementation

### Step 1: Set up the Supabase clients

Install `@supabase/supabase-js` and `@supabase/ssr`. Create a server client factory (`createServerClient`), used anywhere server-side code needs to know who's logged in. This is where the cookie adapter is wired up — it needs read/write access to the request's cookies, which looks slightly different in a Route Handler vs. a Server Component vs. the proxy, per `@supabase/ssr`'s Next.js setup docs (linked below).

We don't create a browser client (`createBrowserClient`): per [design-document.md](./design-document.md), the browser never talks to Supabase directly, and all auth calls go through the Route Handlers in the OTP doc to keep the enumeration-safe wrapping server-side.

The server client is initialized with `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (deliberately no `NEXT_PUBLIC_` prefix, so neither is bundled for the browser) — **never** `SUPABASE_SECRET_KEY` from the OTP doc's seeding script, which bypasses RLS and is for local admin scripts only. Because the client carries the user's session, the RLS policies in Step 4 apply to every query it makes.

### Step 2: Add `proxy.ts` to refresh sessions and gate routes

`@supabase/ssr`'s documented Next.js pattern has the middleware do two things on every request (Next.js 16 renamed `middleware.ts` to `proxy.ts`):
1. Call `supabase.auth.getUser()` using the server client. This both validates the session *and* triggers an automatic token refresh if the access token is near expiry, rewriting the refreshed cookies onto the response — this replaces the original plan's manual "match cookie maxAge to JWT exp" bookkeeping, since Supabase/`@supabase/ssr` handles refreshing for you.
2. If there's no valid user and the request is for a page that requires login (e.g., "My Picks"), redirect to `/login`. If there is a valid user, let the request through.

Both are built. `proxy.ts` calls `updateSession` in `lib/supabase/proxy.ts` (session refresh, returning the user) and then `gateRequest` in `lib/auth/route-gate.ts`, which redirects a logged-out visitor on `/my-picks` to `/login` and a logged-in visitor on `/login` to `/my-picks`. If Supabase errors, public pages and `/login` fail open, but `/my-picks` fails closed (redirects to `/login`).

This is the same role `middleware.ts` played in the original plan — gating permissioned pages before they render — just backed by `getUser()` instead of manual JWT verification.

### Step 3: Expose profile info to the client

Client Components can't read the session cookies directly (they're `HttpOnly`), so we still need a small server-side bridge, same as the original plan's `/api/me`:

- `GET /api/me` (or a Server Component that does this directly for a page that doesn't need client-side fetching): call `supabase.auth.getUser()` to get the authenticated user's id and email, then look up the matching `profiles` row (name, etc. — see the OTP doc's seeding step for how that row got there) and return it as JSON.
- The client calls this once on app load (e.g., a top-level layout or shared auth context) to know who's logged in and display their info.

### Step 4: Scope data requests to the logged-in user

When the "My Picks" page needs to fetch a user's submission, server-side code (not the client) should:
1. Call `supabase.auth.getUser()` to get the verified, server-checked user id.
2. Use that id — **never** one from a client-supplied query parameter or request body, since that's spoofable (a user could just change `?userId=456` in the URL otherwise) — to query the `submissions` table for that user's rows.

As defense in depth, **Row Level Security (RLS)** is enabled on all tables (added with the schema migrations in PR 5; the policies are listed in [design-document.md](./design-document.md)'s Data section). For example, a `submissions` row is only selectable/updatable where `user_id = auth.uid()`. It's not a replacement for the application-level scoping above (keep both), but it means that even a bug in our own query-scoping code can't leak another participant's picks.

### Step 5: Enforce the submission window server-side

**Unchanged from the original plan — this has nothing to do with auth and must stay exactly this strict regardless of how sign-in works:**

In the code handling the "update picks" write, independent of the session check:
1. Look up the contest's current submission window (start/end dates) from the `seasons` table (`edit_opens_at` / `edit_closes_at`, see [design-document.md](./design-document.md)) for the year in the request.
2. Compare against the current server time.
3. Reject the write (with a clear error) if outside the window — even if the user's session is perfectly valid.

This is in addition to, not instead of, disabling the Edit button in the UI during the same window.

### Step 6: Implement logout

```js
await supabase.auth.signOut();
```

called from a Route Handler (e.g., `POST /api/logout`) using the server client. Unlike the original hand-rolled plan — where "logout" just cleared a cookie and the JWT remained technically valid until it expired, because there was no server-side session list to revoke it from — `supabase.auth.signOut()` actually **revokes the refresh token on Supabase's side**, in addition to clearing the local cookies via the `@supabase/ssr` adapter. This is a meaningful improvement over the original plan's accepted tradeoff, not just a rename: a logged-out session can't be silently refreshed back to life.

### Step 7: Test the flow end-to-end

- Confirm a logged-out user hitting "My Picks" gets redirected to `/login`.
- Confirm `/api/me` returns the right profile after login.
- Confirm submissions fetched are scoped to the logged-in user only (test with two different accounts).
- Confirm editing picks outside the submission window is rejected by the API even if you manually re-enable the button via devtools.
- Confirm logout clears the session and subsequent requests are treated as logged out, including that the old refresh token can no longer silently produce a new access token.
- Confirm an access token near/at expiry is transparently refreshed by `proxy.ts` without forcing a re-login.

## Summary of Pieces

| Piece | Where it lives | Purpose |
|---|---|---|
| Supabase project (Auth + Postgres) | Supabase, free tier | Issues, signs, stores, and refreshes sessions; stores `auth.users` and our `profiles`/`submissions` tables |
| `@supabase/ssr` server client | Server Components, Route Handlers, `proxy.ts` | Reads/writes the session cookies; the only place `getUser()` should be trusted |
| `proxy.ts` | Next.js | Refreshes the session on each request, gates permissioned pages, redirects unauthenticated users |
| `GET /api/me` | Next.js Route Handler | Gives the client profile info the `HttpOnly` cookies themselves can't expose |
| `POST /api/logout` | Next.js Route Handler | Calls `supabase.auth.signOut()`, which revokes the session server-side and clears cookies |
| `profiles` table + RLS policies | Supabase Postgres | Holds name/email data linked to `auth.users`; RLS adds defense-in-depth scoping |
| Submission window check | Wherever "update picks" is handled | Server-side enforcement of the edit deadline, independent of auth — unchanged from original plan |

## Open Questions

- None yet — the main open question from the OTP doc (how Tyler hands off the participant list each season) affects when `profiles` rows exist, but doesn't change anything in this document's mechanics.

## Resources

- https://supabase.com/docs/guides/auth/server-side/nextjs
- https://supabase.com/docs/guides/auth/server-side/advanced-guide (why `getUser()` over `getSession()` server-side)
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/reference/javascript/auth-signout
