# Authentication

- [Code layout](#code-layout)
- [Signing in (/login)](#signing-in-login)
- [Signing out and the nav bar](#signing-out-and-the-nav-bar)
- [Cookies and CSRF](#cookies-and-csrf)

Participants sign in without a password: they ask for a code by email and type it in. There is no sign-up; participants are created by an admin script (see [Planning/otp-authentication-plan.md](../Planning/otp-authentication-plan.md)). The sign-in page is `/login` (see [Signing in](#signing-in-login)); the nav bar's "Log In" link goes there (see [Signing out and the nav bar](#signing-out-and-the-nav-bar)). The routes behind it are in [API](./api.md#authentication-routes) and [API](./api.md#session-routes).

## Code layout

- [lib/supabase/server.ts](../lib/supabase/server.ts): `createSupabaseServerClient()`, the only Supabase client the app uses (there is no browser client). It reads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` when called and throws a clear error if they are missing. Session cookies are HttpOnly, SameSite=Lax, and Secure in production ([lib/supabase/config.ts](../lib/supabase/config.ts)).
- [lib/auth/current-user.ts](../lib/auth/current-user.ts): `getCurrentUser()` returns the signed-in user or `null` (it re-validates with Supabase via `getUser()`). Use it in Server Components and Route Handlers to decide who is asking; never trust a user id sent by the client.
- [proxy.ts](../proxy.ts) (Next.js 16's name for middleware) refreshes the session on every request except static assets, then applies [lib/auth/route-gate.ts](../lib/auth/route-gate.ts): logged-out visitors to `/my-picks` go to `/login`, and logged-in visitors to `/login` go to `/my-picks`. Public pages and `/login` fail open if Supabase is unreachable; `/my-picks` fails closed. `/api` is never gated, so each route checks the session itself.

## Signing in (/login)

`/login` ([app/login/page.tsx](../app/login/page.tsx)) hosts the form in [app/components/LoginForm](../app/components/LoginForm). It has two steps, held in memory only (nothing in the URL, storage or logs), so a refresh starts over:

1. Email: submitting always shows "If that email is registered, a code is on its way." whether or not the email is a participant. Only a malformed email (a 400) or a network failure is reported.
2. Code: type the emailed code (non-digits are dropped; there is no length limit because the code length is a Supabase setting). A correct code does a full page load of `/my-picks`, so server-rendered parts of the page see the new session. A wrong code shows one message for every failure. "Send a New Code" and "Cancel" are there from the start; "Send a New Code" is disabled for 30 seconds after each request (matching Supabase's per-email interval) with a countdown, and "Cancel" returns to the email step with the email kept.

The flow is a pure reducer (`loginFlow.ts`); `authApi.ts` wraps the two routes above and `navigate.ts` wraps the redirect so tests can replace it. The submit button stays disabled until the page has hydrated so an early native submit can't put the email in the URL. The proxy is not the only gate: pages that load picks check the session server-side too (see [My Picks page](./my-picks.md)).

To try it: follow [Trying login locally](./development.md#trying-login-locally), open http://localhost:3000/login, and read the code from Mailpit.

## Signing out and the nav bar

The root layout ([app/layout.tsx](../app/layout.tsx)) reads the session user on the server in `SessionNavBar` and passes only the user's name to the nav bar, wrapped in `<Suspense>` because a session read can't be prerendered (the rest of each page stays in the static shell). While that loads, the right end of the bar is empty, so a signed-in user never sees a flash of "Log In". Signed out, it shows a **Log In** link to `/login`; signed in, an avatar button opens a small "Are you sure?" menu with **Log Out** and **Cancel**. Log Out calls `POST /api/logout`, then reloads the home page; if the call fails the menu stays open with an error. If looking up the user fails, the bar falls back to the signed-out view instead of breaking the page. `GET /api/me` isn't used by the nav bar; it is there for client code that needs to know who is signed in. The `GET /api/me` and `POST /api/logout` contracts are in [API](./api.md#session-routes).

## Cookies and CSRF

Session cookies are HttpOnly, SameSite=Lax, and Secure in production. There is no CSRF token on `POST /api/logout` or `PUT /api/submissions/:year`: the cookies are SameSite=Lax, so browsers don't send them on cross-site POSTs, a form can't send `PUT`, and requiring JSON forces a CORS preflight, which the API never approves.
