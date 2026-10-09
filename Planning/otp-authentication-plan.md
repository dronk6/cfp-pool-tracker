# Implementation Plan: OTP Authentication (via Supabase Auth)

## Overview

### Problem Statement

Users need to sign in without a password (nobody wants to manage a password for a hobby pool site). A One-Time Password (OTP) sent via email is a lightweight way to prove "I own this email address" without ever storing a password.

### Goal

Give a user a way to prove they are who they say they are, using their email + a short-lived code, and have that proof result in a session the rest of the app can trust — **by using Supabase Auth's built-in email OTP support**, rather than hand-rolling OTP generation, hashing, and expiry ourselves.

### Scope

This document covers **the sign-in mechanics**: requesting an OTP through Supabase Auth, verifying it, and the handful of things Supabase does *not* do for you out of the box (blocking email enumeration, getting pool participants into Supabase as real auth users, and sending the OTP email through our own domain instead of Supabase's default sender). It does not cover how the Next.js app manages the resulting session day-to-day (cookies, reading "who's logged in," logout, route protection) — see [session-management-plan.md](./session-management-plan.md) for that.

**Why this changed from the original plan:** the original version of this document had us build our own OTP generator, hasher, expiry tracker, attempt-limiter, and rate-limiter, as a standalone "auth microservice." We're adopting Supabase for both the database and Auth, and Supabase's `signInWithOtp` / `verifyOtp` APIs already do all of that — generating the code, hashing/storing it, expiring it, capping verification attempts, and rate-limiting requests. Re-implementing any of that ourselves would just be duplicate, divergent logic. What's left for us to actually design is everything below.

## Background: What Supabase Auth Gives You, and What It Doesn't

If you're new to Supabase Auth, here's the mental model:

- **Supabase Auth is a hosted identity service that comes with every Supabase project**, backed by its own `auth.users` table (separate from, but linkable to, your own application tables). You don't manage a signing secret, an OTP table, or a sessions table — Supabase runs all of that for you, on the free tier, as part of the same project that hosts your Postgres database.
- **`supabase.auth.signInWithOtp({ email })`** is the "request a code" call. Supabase generates the one-time code, stores it (hashed) on their side, sets an expiry, and emails it. You never touch the code itself.
- **`supabase.auth.verifyOtp({ email, token, type: 'email' })`** is the "check the code" call. Supabase checks the code against what it generated, enforces its own attempt cap, and — on success — returns a full session (access token + refresh token), which the `@supabase/ssr` package (covered in the session doc) automatically turns into cookies.
- **What Supabase handles for you that the original plan had us build by hand:** generating a cryptographically random code, hashing/storing it, expiring it, capping verification attempts, rate-limiting how often a code can be requested, and issuing a signed session. All of that is deleted from scope.
- **What Supabase does *not* handle for you, and what this document now focuses on:**
  1. **Email enumeration** — by default, Supabase's behavior on `signInWithOtp` can differ depending on whether the email belongs to an existing user, which leaks exactly the kind of "is this person in the pool?" information the original plan warned about. We have to deliberately flatten that.
  2. **Getting participants into `auth.users` in the first place** — Supabase Auth, used the way we're using it (no public sign-up), has no users until something creates them. We need an explicit step for that.
  3. **Sending the email through our own sender** — Supabase's default email sending is a shared, heavily-rate-limited test sender meant only for development. We connect a dedicated Gmail account as Supabase's custom SMTP provider instead (we have no custom domain, which Resend requires); Supabase sends the email, not code we call directly.

## Step-by-Step Implementation

### Step 1: Disable public sign-ups in the Supabase dashboard

This app has no "create an account" flow — participants are pre-registered by Tyler each season (see [design-document.md](./design-document.md)'s user model). In the Supabase dashboard, under **Authentication → Settings**, turn **off** "Allow new users to sign up." This means `signInWithOtp` will only ever succeed for emails that already exist in `auth.users`; anyone else gets an error (which we'll handle carefully in Step 4, so it doesn't leak anything).

### Step 2: Seed participants into `auth.users` (admin-side, once per season)

Since sign-up is disabled, someone has to create the auth user record for each participant before they can ever request an OTP. This replaces the old `users.json`-style "just add a row" model with a one-time admin action:

1. Tyler collects participant names + emails at the start of the season (however he already does this — spreadsheet, form, text messages).
2. A small admin script (run locally by Tyler/the maintainer, **not** exposed as a public API route) loops over that list and calls Supabase's **admin API** using the project's secret key (`SUPABASE_SECRET_KEY`, which bypasses RLS; never shipped to the browser or set in Vercel, kept in a local `.env.local` only):
   ```js
   const { data, error } = await supabaseAdmin.auth.admin.createUser({
     email: 'john@doe.net',
     email_confirm: true, // they're pre-verified by virtue of being on Tyler's list
     user_metadata: { name: 'John Doe' },
   });
   ```
3. Alongside creating the `auth.users` row, upsert a matching row into a `profiles` table in our own schema (`id` = the new auth user's UUID, plus `name`, `email`, and anything else the app needs to display). This gives the rest of the app a normal Postgres table to join `submissions` against, the same way the design doc's `users.json` was meant to be used — it's just populated from, and keyed by, the Supabase Auth user now instead of being its own standalone identity store.
4. Re-run the script if Tyler adds a late participant mid-season; `createUser` calls are idempotent-ish in intent here (check for an existing user by email first, or use `upsert`-style logic in the script, so re-running it for the whole list doesn't error out on existing users).

### Step 3: Configure a Gmail account as Supabase's custom SMTP provider

The original plan had us write our own "call Resend's API to send the OTP email" code. With Supabase Auth, we don't send the email ourselves — Supabase sends it, we just tell it to use Gmail's SMTP server instead of Supabase's shared default sender. The default sender only delivers to members of the Supabase organization and is limited to about 2 emails/hour, so it can't serve real participants.

This is Tasks M2 and M8 in [design-document.md](./design-document.md). It needs no application code, so do it before building the OTP routes.

1. Create a dedicated Gmail account (not a personal one), enable 2-step verification, and generate an app password.
2. In the Supabase dashboard, go to **Authentication → Emails → SMTP Settings**, enable "Custom SMTP," and enter `smtp.gmail.com`, port 465 or 587, the full Gmail address as username and sender email, and the app password (no spaces) as the password. These credentials live only in the dashboard, never in the app's environment variables.
3. Still in the dashboard, under **Authentication → Email Templates**, edit the "Magic Link" template (this is the template Supabase uses for `signInWithOtp` emails). By default it's built around a clickable magic-link button; swap it to surface `{{ .Token }}` instead, so the participant receives an actual code to type in, not a link — e.g., "Your CFP Pool Tracker code is: {{ .Token }}. It expires soon."
4. Optionally tighten the code's lifetime under **Authentication → Settings → Email OTP Expiration** (Supabase defaults to 1 hour; something shorter, like 10 minutes, matches the original plan's intent and the free tier supports changing this).

5. Verify delivery before writing any code: create a confirmed test user with an email address outside the Supabase organization, then request a code directly with `POST <project-url>/auth/v1/otp` (publishable key in the `apikey` header, body `{"email": "...", "create_user": false}`). Confirm the email arrives with a code and isn't spam-foldered. If it doesn't arrive, check **Logs → Auth** in the dashboard.

Consumer Gmail allows roughly 500 emails/day, far more than this pool needs.

### Step 4: Build `POST /api/auth/request-otp` (enumeration-safe wrapper)

Even with public sign-up disabled, calling `signInWithOtp` directly from the browser and passing Supabase's raw response/error back to the client would leak whether an email is a real participant (e.g., a distinct "signups not allowed for otp" error for unknown emails vs. no error for known ones). So this stays a server-side Next.js route handler that normalizes the outcome, same principle as the original plan's "always return `{ success: true }`":

```js
// app/api/auth/request-otp/route.ts (Next.js Route Handler)
export async function POST(request) {
  const { email } = await request.json();

  // Basic format validation can fail loudly — that's not an enumeration leak,
  // it's just "that's not an email address."
  if (!isValidEmailFormat(email)) {
    return Response.json({ success: false, error: 'invalid-email' }, { status: 400 });
  }

  const supabase = createServerClient(/* ... see session-management-plan.md ... */);

  try {
    await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false }, // belt-and-suspenders with Step 1's dashboard setting
    });
  } catch (err) {
    // Swallow it. Whether the email doesn't exist, or Supabase rejected it for
    // some other reason, the client gets the exact same response either way.
    // (Log `err` server-side for debugging — just don't let it reach the client.)
  }

  return Response.json({ success: true });
}
```

The key rule, carried over from the original plan: **the response body and status code must be identical whether the email belongs to a real participant or not.** Don't branch on Supabase's error type when deciding what to send back.

Rate-limit errors are flattened too. The per-email limit (`max_frequency`, 30 seconds) only fires for emails that exist, so a distinct "please wait" response would reveal which emails are registered: request twice, and only a registered email gets the rate-limit error (confirmed against the local stack). Every Supabase error, rate limits included, is logged server-side without the email and answered with the same `{ success: true }`. The login form should instead disable its "send a new code" button for 30 seconds.

Timing is flattened too (the sketch above awaits the call only for simplicity). Supabase sends the email inline for a registered user (slow) but fails immediately for an unknown one, so awaiting `signInWithOtp` would let a caller tell the two apart by response time. The route validates the input, answers `{ success: true }` straight away, and calls `signInWithOtp` inside Next.js's `after()`, so the response time no longer depends on whether the email is registered. That call uses a cookie-less `supabase-js` client, since `signInWithOtp` sets no session and `after()` cannot set cookies.

### Step 5: Build `POST /api/auth/verify-otp`

```js
// app/api/auth/verify-otp/route.ts
export async function POST(request) {
  const { email, otp } = await request.json();
  const supabase = createServerClient(/* ... */);

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: otp,
    type: 'email',
  });

  if (error) {
    return Response.json({ success: false }, { status: 401 });
  }

  // Success: supabase-js + the @supabase/ssr cookie adapter have already set the
  // session cookies on this response. See session-management-plan.md for what
  // that session looks like and how the rest of the app reads it.
  return Response.json({ success: true });
}
```

Supabase handles the "wrong code," "expired code," and "too many attempts" cases internally — we just need to map any error to a generic failure response, the same way the original plan specified.

### Step 6: Test the flow end-to-end

- Request an OTP for a real test participant's email, confirm the email arrives via the Gmail SMTP sender and the code works.
- Confirm requesting an OTP for an email that isn't a seeded participant returns the exact same `{ success: true }` response as a real one.
- Confirm an expired code is rejected.
- Confirm too many wrong attempts locks out further guesses on that code (Supabase's built-in cap).
- Confirm a valid code can only be used once.
- Confirm a participant added mid-season via the admin seeding script (Step 2) can successfully request and verify an OTP.

## Summary of Endpoints

| Endpoint | Input | Output | Backed by |
|---|---|---|---|
| `POST /api/auth/request-otp` | `{ email }` | `{ success: true }` (always, regardless of whether email exists) | `supabase.auth.signInWithOtp` |
| `POST /api/auth/verify-otp` | `{ email, otp }` | On success: sets session cookies (via `@supabase/ssr`), `{ success: true }`. On failure: `{ success: false }` | `supabase.auth.verifyOtp` |
| *(admin-only, not a public route)* participant seeding script | list of `{ name, email }` | creates `auth.users` + `profiles` rows | `supabase.auth.admin.createUser` |

## Open Questions

- ~~How does Tyler want to hand off the participant name/email list?~~ Resolved for this season: a CSV (`Name,Email,Pick 1..12,First Out 1..3`) that the maintainer runs `npm run seed:participants` against; see the README's "Seeding participants". Something Tyler can trigger himself is a future-seasons question.
- If a custom domain is ever acquired, do we want to move to a branded "from" address (e.g., `codes@cfppooltracker.com`) via a transactional email service? Cosmetic; not needed for this season.

## Resources

- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/reference/javascript/auth-signinwithotp
- https://supabase.com/docs/reference/javascript/auth-admin-createuser
