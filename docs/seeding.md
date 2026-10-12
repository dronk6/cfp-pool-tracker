# Seeding

The admin seed scripts load reference and participant data. Both run on the maintainer's machine and write with `SUPABASE_SECRET_KEY` (see [Environment variables](./development.md#environment-variables)). The yearly order of operations is in the [Admin runbook](./admin-runbook.md#before-each-season-set-up-the-season).

- [Seeding teams](#seeding-teams)
- [Seeding participants](#seeding-participants)

## Seeding teams

The `teams` table is loaded from [Planning/d1_fbs_college_football_teams.csv](../Planning/d1_fbs_college_football_teams.csv) by a script that writes with `SUPABASE_SECRET_KEY`:

```bash
npm run seed:teams                          # seed from the default CSV
npm run seed:teams -- path/to/teams.csv     # seed from another CSV
```

It prints the target URL and the number of power and non-power teams, then writes straight away (there is no confirmation prompt), and exits non-zero on any error. It reads `SUPABASE_URL` and `SUPABASE_SECRET_KEY` from `.env.local`, but a variable already set in your shell wins over `.env.local`, so check which database you are about to hit **before** running it:

- **Local:** with the local values in `.env.local`, run it after `npx supabase start` on a new stack and after every `npx supabase db reset`, since a reset empties `teams`.
- **Production:** put the production URL and secret key in `.env.local` temporarily (see [Environment variables](./development.md#environment-variables)), check the target as below, run it, then switch back to the local values.

Before running, check `SUPABASE_URL` in `.env.local`, and make sure it isn't also set in your shell. Each of these should print nothing:

```bash
echo $SUPABASE_URL $SUPABASE_SECRET_KEY                # bash / Git Bash; unset them with: unset SUPABASE_URL SUPABASE_SECRET_KEY
```

```powershell
$env:SUPABASE_URL; $env:SUPABASE_SECRET_KEY            # PowerShell; remove them with: Remove-Item Env:SUPABASE_URL, Env:SUPABASE_SECRET_KEY
```

It upserts by team ID, so it is safe to re-run: existing teams are updated in place. It never deletes teams that are missing from the CSV; remove those by hand if needed. Known limitation: if ESPN changes a team's ID but the name stays the same, the upsert fails on the unique `name` constraint; delete the old row first.

The CSV must have the header `Team ID,Team Name,Conference,Image` and no quoted fields; the script rejects malformed rows, duplicates and unknown conferences rather than guessing. Which conferences count as power conferences (and the Notre Dame and UConn overrides) is set in one commented block at the top of [scripts/seed-teams/teams.ts](../scripts/seed-teams/teams.ts). Update it there when a conference is added or realigns.

## Seeding participants

Each participant needs an auth user (so they can sign in), a `profiles` row and an initial `submissions` row. One script creates all three from a CSV, using `SUPABASE_SECRET_KEY`.

**The data file.** One row per participant, with exactly this header:

```
Name,Email,Pick 1,...,Pick 12,First Out 1,First Out 2,First Out 3
```

The file holds real emails, so it lives in the git-ignored `private/` folder (default `private/participants.csv`); the script refuses to read a file git doesn't ignore. Create the folder and start from the template, which uses fake `@example.test` addresses:

```bash
mkdir -p private
cp scripts/seed-participants/participants.example.csv private/participants.csv
```

Team names must match the `teams` table spelling (`Ohio State`, not `Ohio St.`), ignoring case and surrounding spaces. A name with a comma goes in quotes (`"Smith, Bob"`). Save it as **CSV UTF-8** (in Excel: Save As, "CSV UTF-8"); the script rejects a file with garbled characters. Emails are trimmed and lowercased. Empty rows (Excel often pads a file with `,,,,`) are ignored.

**Running it.** `--year` is required, and the `seasons` row for that year must already exist. It is a dry run unless you add `--apply`:

```bash
npm run seed:participants -- --year 2026                # dry run: validates everything, writes nothing
npm run seed:participants -- --year 2026 --apply        # write to the database in .env.local
npm run seed:participants -- --year 2026 other.csv      # a different (git-ignored) file
```

Always do the dry run first. It prints the target host (never a key) and, per participant, what would happen, using the spreadsheet row number (the header is row 1) and the name rather than the email. The whole file is checked before any write, so one misspelled team (the error lists close suggestions), a team picked twice, a bad email or a duplicate email means nothing is written. A participant with no Group of Six team in their top 12 is only a warning. `--apply` against anything other than `127.0.0.1` or `localhost` also needs `--production`.

**Re-running is safe.** Existing auth users are matched by email and reused, profiles are upserted (a changed name is updated), and a submission is only ever inserted when none exists for that user and year, never modified. So a participant's later edits to `current_*`, the champion or `updated_at` survive a re-run, and a run that stopped partway can simply be run again. Each participant's status is `created`, `existing` or `differs` (see below). After `--apply` it also prints the database's actual counts of auth users, profiles and submissions for the year.

**Late participants.** To add someone mid-season, run the script on a file containing only the new rows (same header).

**Production.** The sequence for seeding the real database:

1. Put the production `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env.local` temporarily (see [Environment variables](./development.md#environment-variables)), and make sure neither is also set in your shell (see [Seeding teams](#seeding-teams)).
2. Dry run: `npm run seed:participants -- --year 2026`. Fix every error it lists, and read the warnings.
3. Check the printed host is the production project, not `127.0.0.1`.
4. Run `npm run seed:participants -- --year 2026 --apply --production`.
5. Check the counts it prints: `submissions` for the year should equal the number of participants, and `auth.users` and `profiles` should be at least that many (they also count anyone not in the file, such as you). Confirm it exited 0 (`echo $?`) with no `differs` rows.
6. Switch `.env.local` back to the local values.

**If the file changed after seeding.** When an existing submission's initial picks differ from the file (status `differs`), the script warns for that row, leaves it alone and exits non-zero. Fix the initial picks by hand in the Supabase SQL editor, setting `initial_*` and, if the participant hasn't edited, `current_*` too:

```sql
update submissions
set initial_playoff = array[...12 team ids...], initial_tiebreakers = array[...3 ids...],
    current_playoff = array[...12 team ids...], current_tiebreakers = array[...3 ids...]
where year = 2026 and user_id = (select id from profiles where email = 'person@example.com');
```

**Removing a participant.** Delete their submission first (`submissions.user_id` has no cascade), then their auth user in the dashboard (**Authentication → Users**); the profile goes with the user.
