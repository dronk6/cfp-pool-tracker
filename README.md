# College Football Playoff Prediction Tracker

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
