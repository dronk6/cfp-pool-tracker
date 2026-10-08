-- Production-safe seed data: one public.seasons row per year (the edit window).
--
-- This file is loaded locally by `supabase db reset` (and the first
-- `supabase start`), and is also pasted into the production dashboard's SQL
-- editor to add a season (see the README's "Seasons (edit window)" section).
-- Never put dev-only fixtures here (test users, fake picks, etc.): they would
-- end up in production.
--
-- Instants are written in US Eastern time with an explicit UTC offset:
-- -04:00 (EDT) from 2:00 a.m. on the second Sunday of March until 2:00 a.m.
-- on the first Sunday of November; -05:00 (EST) otherwise. A midnight on the
-- first Sunday of November is still -04:00.
-- Re-running the file is safe; an existing year's window is overwritten.

insert into public.seasons (year, edit_opens_at, edit_closes_at)
values
  -- 2026: opens midnight ET going into Oct 11 (2026-10-11T04:00:00Z),
  --       closes 12pm ET on Oct 17 (2026-10-17T16:00:00Z).
  (2026, '2026-10-11T00:00:00-04:00', '2026-10-17T12:00:00-04:00')
on conflict (year) do update
  set edit_opens_at  = excluded.edit_opens_at,
      edit_closes_at = excluded.edit_closes_at;
