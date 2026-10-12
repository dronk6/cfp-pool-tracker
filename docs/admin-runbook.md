# Admin runbook

- [At a glance](#at-a-glance)
- [Accounts and access you need](#accounts-and-access-you-need)
- [Before each season: unpause the Supabase project](#before-each-season-unpause-the-supabase-project)
- [Login email sender (Gmail through Supabase)](#login-email-sender-gmail-through-supabase)
- [Database changes](#database-changes)
- [Before each season: set up the season](#before-each-season-set-up-the-season)
- [The edit window](#the-edit-window)
- [Verifying before you announce](#verifying-before-you-announce)
- [During the season: view everyone's picks](#during-the-season-view-everyones-picks)
- [Troubleshooting](#troubleshooting)
- [Reference](#reference)

This is the yearly runbook. Nothing here happens automatically: the Supabase project is not kept awake, seasons are not created on a schedule, and participants are not imported by the app. It is written for two people:

- **The maintainer** runs everything that uses a terminal (migrations, seed scripts, the one-line year bump).
- **Tyler**, the pool admin, mostly only reads: he looks at everyone's picks in the Supabase dashboard (the [Tyler section](#during-the-season-view-everyones-picks) below). He does not need a terminal.

Commands and details that have their own doc are linked, not repeated: [Development](./development.md) (environment variables), [Seeding](./seeding.md), [Database](./database.md) (migrations, seasons) and [Deployment](./deployment.md).

## At a glance

Do these in order, a week or more before the edit window opens.

1. [Unpause the Supabase project](#before-each-season-unpause-the-supabase-project) and check the data and sign-in.
2. [Apply any new migrations](#database-changes) to production.
3. [Reseed `teams`](#before-each-season-set-up-the-season) if the team list or conferences changed (check the CSV every season).
4. Add the new `seasons` row.
5. Seed the participants.
6. Bump `CURRENT_SEASON_YEAR` and update the Home page's edit-window text, in one pull request, after the seeding.
7. [Verify](#verifying-before-you-announce), then announce.
8. [During the season](#during-the-season-view-everyones-picks), read picks in the dashboard; use [Troubleshooting](#troubleshooting) when something breaks.

## Accounts and access you need

| What | Who needs it | Used for |
|------|--------------|----------|
| Supabase dashboard login for the project owner | Maintainer | Unpausing, SQL editor, Table Editor, Auth settings, logs, API keys |
| The Supabase project ref (in the dashboard URL, `supabase.com/dashboard/project/<project-ref>`) | Maintainer | `npx supabase link` (see [Applying migrations to production](./database.md#applying-migrations-to-production)) |
| The production database password (set when the project was created; reset under **Project Settings → Database** if lost) | Maintainer | `npx supabase link` only |
| The production API URL and secret key (**Project Settings → API** and **API Keys**) | Maintainer | Running the seed scripts against production |
| Vercel project access | Maintainer | Environment variables, checking deployments |
| GitHub write access to the repository | Maintainer | The yearly year-bump pull request |
| The Gmail account that sends login codes, and its app password | Maintainer | Login emails; the app password lives only in the Supabase dashboard (see [Login email sender](#login-email-sender-gmail-through-supabase)) |
| A Supabase dashboard invite for Tyler | Tyler | Reading `all_submissions` (see [the Tyler section](#during-the-season-view-everyones-picks)) |

Rules for the keys and `.env.local` (full table in [Environment variables](./development.md#environment-variables)):

- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` belong in Vercel (Production and Preview). `SUPABASE_SECRET_KEY` **never** goes in Vercel: it bypasses row-level security and is only for the seed scripts on your own machine.
- Put production values in `.env.local` only for the minutes it takes to run a seed script against production, then restore the local values.
- A variable already set in your shell wins over `.env.local`. Check that nothing is set in your shell before any script that writes to production (commands under [Seeding teams](./seeding.md#seeding-teams)), and read the host the script prints.

## Before each season: unpause the Supabase project

Supabase's free tier **pauses a project after about a week of inactivity**. This app is only used for a few weeks each year, so the project will almost certainly be paused when a new season starts. We chose a manual unpause over a keep-alive ping. If the project is paused, the site cannot load picks or send login codes.

Do this at least a few days before the edit window opens, so any problem shows up before participants hit it:

1. Sign in at [supabase.com/dashboard](https://supabase.com/dashboard) with the project owner's account.
2. Open the CFP Pool Tracker project. A paused project shows a **"Project paused"** banner.
3. Click **Restore project** and wait a few minutes until the status is active. Supabase only keeps paused free projects restorable for a limited time (about 90 days from the pause when this was written; that is Supabase's policy and may change), so check the banner for the deadline and don't let one sit past it. A project past its deadline cannot be restored in place: you would have to download the backup, if Supabase still offers one, and create a new project, which changes every URL and key.
4. Confirm the data survived: open **Table Editor** and check that `teams`, `profiles`, `submissions` and `seasons` have rows.
5. Confirm sign-in works: go to the deployed site, request a login code for your own participant email, and sign in.
6. If the codes don't arrive, see [Login email sender](#login-email-sender-gmail-through-supabase) and [Troubleshooting](#troubleshooting).

Free projects can pause again after a period of inactivity. Check the project's status before the window opens, and again whenever the site has been quiet for a while.

## Login email sender (Gmail through Supabase)

Participants sign in with a code sent by email ([Authentication](./authentication.md)). Production sends it through a Gmail account over SMTP. All of this is configured in the Supabase dashboard, not in the repo or in an environment variable:

- **Sender credentials:** **Authentication → SMTP Settings** (search the dashboard for "SMTP" if you don't see it). Host `smtp.gmail.com`, port `465` (SSL) or `587` (STARTTLS), the Gmail address as the username, and a Google **app password** as the password (16 characters, entered without spaces; it needs 2-Step Verification on the Google account). If Google revokes the app password, or the account's password or security settings change, codes silently stop arriving: generate a new app password and paste it into the same settings.
- **Email text:** the **Magic Link** template must show the code with `{{ .Token }}` (not a link). The local copy, which production should match, is [supabase/templates/magic_link.html](../supabase/templates/magic_link.html). If you change the template in the dashboard, update that file to match.
- **Auth settings that matter:** sign-ups are disabled (only seeded participants can get a code), codes are 8 digits (local config; confirm in the dashboard), and Supabase allows one email per address every 30 seconds (the login form's resend countdown matches it). [supabase/config.toml](../supabase/config.toml) holds the **local** values of these. Production should match them, but this repo cannot prove it: confirm in the dashboard, or with `npx supabase config diff` (run it after `npx supabase link`; treat the output as a hint).
- **Rate limits:** the number of emails Supabase will send per hour is a dashboard setting (**Authentication → Rate Limits**). The `email_sent` value in `supabase/config.toml` is local-only and does not change production. Gmail itself caps a normal account at roughly 500 emails a day (approximate, and subject to Google's policy), which a pool this size should not approach; but a whole group requesting codes the moment the window opens can hit Supabase's hourly limit, so raise it before the window if it is low.
- **When a participant says the code never came:** check their spam folder, then **Logs → Auth** in the dashboard for the send attempt and its error (SMTP failures and rate limits show up there). The sign-in route always answers "a code is on its way" whether or not the email is registered, so the page itself never tells you the address was wrong; check the address against the `profiles` table.

## Database changes

Schema changes are SQL migrations, applied to production by hand, not by CI. See [Applying migrations to production](./database.md#applying-migrations-to-production) for the commands and [Changing the schema](./database.md#changing-the-schema) for the rule never to edit a migration that has already been applied.

Before each season, run `npx supabase db push --dry-run` to see whether production is missing any. Anything the app depends on must be applied first: for example, the migration that creates `all_submissions` has to be applied before Tyler can see that view.

## Before each season: set up the season

Steps 1 and 3 use scripts: put the production values in `.env.local` first (see [Accounts and access you need](#accounts-and-access-you-need)) and read the host the script prints before it writes. Step 2 runs in the dashboard.

1. **Check the team list, and reseed `teams` only if it changed.** Compare [Planning/d1_fbs_college_football_teams.csv](../Planning/d1_fbs_college_football_teams.csv) with the season's actual FBS teams and conferences (new FBS members, conference changes, renamed teams, changed logos). If nothing changed, production already has the right teams and you can skip the seed. If something changed, edit the CSV, and if a conference was added or realigned, update the power-conference rules at the top of [scripts/seed-teams/teams.ts](../scripts/seed-teams/teams.ts) (`NON_POWER_CONFERENCES` and `POWER_OVERRIDES`; the power conferences themselves are in [lib/conferences.ts](../lib/conferences.ts)) and run `npm test`; make that change a pull request. Then run `npm run seed:teams` against production ([Seeding teams](./seeding.md#seeding-teams)). It upserts by team ID, so re-running is safe, and it never deletes teams.
2. **Add the season's `seasons` row.** Add a tuple to [supabase/seed.sql](../supabase/seed.sql) with the new window, add the matching row to [supabase/seed.test.ts](../supabase/seed.test.ts), run `npm test`, paste the whole file into the dashboard's **SQL Editor**, and run the verification query. Details: [Seasons (edit window)](./database.md#seasons-edit-window). Do this before step 3: the participants script refuses to run for a year without a `seasons` row.
3. **Seed the participants.** Put the season's CSV at `private/participants.csv`, run the dry run, fix everything it lists, then run with `--apply --production`, and check the counts, that it exited 0, and that there are no `differs` rows. Follow the **Production** sequence in [Seeding participants](./seeding.md#seeding-participants) (it also covers creating the `private/` folder and the file format). Do it for everyone before announcing the site, so nobody logs in to an empty My Picks page.
4. **Bump the year in code**, in one small pull request, only after steps 2 and 3:
   - set `CURRENT_SEASON_YEAR` in [lib/seasons/current-season.ts](../lib/seasons/current-season.ts) to the new year (My Picks reads this, so until it is bumped the page keeps showing last season's picks);
   - update the hard-coded edit-window dates and year in the Home page text ([app/page.tsx](../app/page.tsx); a comment there says to do it each year) to match the new `seasons` row.

   Create a branch, open the pull request, wait for the CI check to pass ([Deployment](./deployment.md#continuous-integration)), and merge to `main`. Vercel deploys `main` automatically; check in Vercel that the deployment finished.
5. **Restore `.env.local`** to the local values, and make sure nothing production-related is set in your shell.

## The edit window

The window is data, not code: see [Seasons (edit window)](./database.md#seasons-edit-window) for the rules (half-open, server clock, ET offsets) and for changing a window (edit `supabase/seed.sql`, re-run it in the SQL Editor, no deploy). If the Home page text states the dates, updating it is a code change (step 4 above). A year with no `seasons` row means editing is closed for it.

## Verifying before you announce

1. In the dashboard's **Table Editor**, check `teams`, `seasons` (the new row) and `submissions` (one row per participant for the year).
2. On the deployed site, sign in with a real participant's email (yours), and confirm My Picks shows the new year's picks with logos. Outside the window, the Edit button should be disabled with a message saying when editing opens.
3. Check that `all_submissions` shows every participant.
4. Test a login email to a non-Gmail address if you can, and look in spam.

## During the season: view everyone's picks

**This section is for Tyler** (and the maintainer, who can use the same steps). It needs only the Supabase dashboard. Dashboard labels here were written from memory and may have moved; search the dashboard if one is missing.

There is no admin page. Instead, the database has a view called `all_submissions` with one row per participant per year: name and email, initial picks (`initial_1` to `initial_15`), current picks (`current_1` to `current_15`), the champion, and when they submitted and last updated (36 columns). Picks are team names in order: slots 1 to 12 are the playoff and 13 to 15 are First Three Out. Rows are sorted by year (newest first), then name. A pick whose team is missing from `teams` shows as `Unknown team <id>`. The champion and `updated_at` are empty (`null`) until the participant saves their first revision.

To look at it:

1. Sign in at [supabase.com/dashboard](https://supabase.com/dashboard) and open the CFP Pool Tracker project.
2. Open **Table Editor** and pick `all_submissions` from the table list (views are listed with the tables). To see one year, add a filter on `year`.
3. To get a spreadsheet, use the table editor's **Export** option to download CSV; it exports the rows being viewed, so apply any filter first.

Or, in the **SQL Editor**, paste and run (change the year as needed; the query is not saved in the dashboard):

```sql
select * from public.all_submissions where year = 2026 order by name;
```

The view is wide, so scroll sideways; filter to one year; and in the SQL editor, list just the columns you want (for example `name, current_1, current_2, champion`). Exported CSVs contain participants' emails, so don't share them or put them anywhere public.

The view is read-only. To fix a participant's picks, edit the `submissions` table (in the **Table Editor**, or with SQL as in [Seeding participants](./seeding.md#seeding-participants)).

**Security.** The view contains participants' emails, so the API cannot read it; it is only visible in the dashboard (and to scripts using the secret key). How that is enforced, and what to keep if you recreate the view, is in [Database](./database.md#the-all_submissions-view).

**Giving Tyler access.** The intended setup is to invite Tyler to the Supabase organization with the least access that still lets him read the view, so he can open the project's Table Editor or SQL Editor himself.

> **Tyler's access hasn't been tested yet.**
> - The exact role and dashboard steps for his invite, and labels such as **Export**, have not been confirmed against his real account.
> - The view uses `security_invoker`, so it runs with the viewer's database role, and that role must bypass row-level security to see everyone's rows. An empty table most likely means his role doesn't. Whether the dashboard's **Read-only** member role bypasses it is unconfirmed.
> - That same role might also be able to read other tables, such as the auth users table, so his access could be wider than just this view. Decide whether that is acceptable before inviting him.
>
> Remove this note once Tyler's access is confirmed.

## Troubleshooting

| Symptom | Possible cause | What to do |
|---------|----------------|------------|
| The site can't load picks, or login codes never arrive, and the dashboard shows the project is paused | Supabase paused the project for inactivity | [Unpause it](#before-each-season-unpause-the-supabase-project) |
| A participant says "My Picks" shows no picks | They aren't seeded for the current year, or `CURRENT_SEASON_YEAR` is a year that wasn't seeded | Check `submissions` for their `user_id` and year; [seed](./seeding.md#seeding-participants) the late participant; check `CURRENT_SEASON_YEAR` |
| A participant never gets a code | Address not in `profiles`; spam; SMTP credentials revoked; rate limit | Check the address, their spam folder, **Logs → Auth**, and [Login email sender](#login-email-sender-gmail-through-supabase) |
| The Edit button is disabled | Outside the window, or the year has no `seasons` row | Read the message under the button, and check the `seasons` row with the verification query in [Seasons (edit window)](./database.md#seasons-edit-window) |
| Tyler can open `all_submissions` but it is empty | His dashboard role may not bypass row-level security (Tyler's access hasn't been tested yet, see [above](#during-the-season-view-everyones-picks)) | Check his role in the organization settings, or use the maintainer's account to read the view |
| A seed script wrote to the wrong database | A variable set in the shell overrode `.env.local` | Check the shell, then see [Seeding teams](./seeding.md#seeding-teams) for the target check; fix the data in the SQL Editor |

## Reference

- The CI check (`.github/workflows/ci.yml`, see [Deployment](./deployment.md#continuous-integration)) must pass before a pull request is merged.
- Design background and the task list: [Planning/design-document.md](../Planning/design-document.md).
