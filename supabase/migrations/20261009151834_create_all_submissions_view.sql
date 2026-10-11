-- A readable, one-row-per-participant view of every submission, for Tyler to
-- open in the Supabase dashboard table editor and export as CSV. It replaces
-- an in-app admin page this season.
--
-- Layout: initial_1..initial_15 and current_1..current_15 hold team names in
-- pick order, where slots 1-12 are the playoff and 13-15 are First Three Out.
-- unnest ... with ordinality plus array_agg(... order by slot) keeps the
-- order, which a plain join of int[] columns to teams would not. A team id
-- missing from teams shows as "Unknown team <id>" rather than silently
-- shrinking the list and shifting later slots.
--
-- Access: the view contains participants' emails, so it must not be readable
-- through the API. security_invoker makes it run with the caller's rights, so
-- a role that is ever re-granted access sees only the rows its own row level
-- security allows, instead of everyone's (a default view runs as its owner
-- and bypasses RLS). Supabase's default privileges grant every new object in
-- public to anon and authenticated, hence the explicit revoke below.
-- service_role and postgres keep access; Tyler reads it in the dashboard.
--
-- If this view is ever dropped and recreated, or changed with create or
-- replace, restate both "with (security_invoker = true)" and the revoke.

create view public.all_submissions
with (security_invoker = true) as
select
  s.year,
  p.name,
  p.email,
  ip.names[1] as initial_1,
  ip.names[2] as initial_2,
  ip.names[3] as initial_3,
  ip.names[4] as initial_4,
  ip.names[5] as initial_5,
  ip.names[6] as initial_6,
  ip.names[7] as initial_7,
  ip.names[8] as initial_8,
  ip.names[9] as initial_9,
  ip.names[10] as initial_10,
  ip.names[11] as initial_11,
  ip.names[12] as initial_12,
  ip.names[13] as initial_13,
  ip.names[14] as initial_14,
  ip.names[15] as initial_15,
  cp.names[1] as current_1,
  cp.names[2] as current_2,
  cp.names[3] as current_3,
  cp.names[4] as current_4,
  cp.names[5] as current_5,
  cp.names[6] as current_6,
  cp.names[7] as current_7,
  cp.names[8] as current_8,
  cp.names[9] as current_9,
  cp.names[10] as current_10,
  cp.names[11] as current_11,
  cp.names[12] as current_12,
  cp.names[13] as current_13,
  cp.names[14] as current_14,
  cp.names[15] as current_15,
  champion.name as champion,
  s.submitted_at,
  s.updated_at
from public.submissions s
join public.profiles p on p.id = s.user_id
left join public.teams champion on champion.id = s.champion_id
cross join lateral (
  select array_agg(coalesce(t.name, 'Unknown team ' || pick.team_id) order by pick.slot) as names
  from unnest(s.initial_playoff || s.initial_tiebreakers) with ordinality as pick(team_id, slot)
  left join public.teams t on t.id = pick.team_id
) ip
cross join lateral (
  select array_agg(coalesce(t.name, 'Unknown team ' || pick.team_id) order by pick.slot) as names
  from unnest(s.current_playoff || s.current_tiebreakers) with ordinality as pick(team_id, slot)
  left join public.teams t on t.id = pick.team_id
) cp
order by s.year desc, p.name;

revoke all on public.all_submissions from public, anon, authenticated;
