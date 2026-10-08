-- Core schema, as specified in Planning/design-document.md (Data section).
-- Tables are created in dependency order.

create table public.teams (
  id            integer primary key,       -- ESPN's "Team ID" from the CSV
  name          text unique not null,
  conference    text not null,             -- e.g. 'ACC', 'Mountain West', 'FBS Independent'
  is_power_conf boolean not null,
  image_url     text                       -- ESPN CDN logo URL, from the CSV
);

create table public.profiles (
  -- The foreign key keeps profiles in step with Supabase Auth: deleting a
  -- participant's auth user removes their profile too.
  id    uuid primary key references auth.users (id) on delete cascade,
  name  text not null,
  email text unique not null
);

create table public.seasons (
  year             int primary key,
  edit_opens_at    timestamptz not null,
  edit_closes_at   timestamptz not null
);

create table public.submissions (
  id                  serial primary key,
  user_id             uuid references public.profiles (id) not null,
  year                int not null,
  initial_playoff     int[] not null,   -- 12 team ids, ordered
  initial_tiebreakers int[] not null,   -- 3 team ids, ordered
  current_playoff     int[] not null,
  current_tiebreakers int[] not null,
  champion_id         int references public.teams (id),  -- null until first revision; must be in current_playoff (checked client-side, not by the DB)
  submitted_at        timestamptz not null default now(),
  updated_at          timestamptz,
  unique (user_id, year)
);

-- Row level security, as defense in depth. The app server talks to Supabase
-- with the publishable key plus the signed-in user's session, so these
-- policies are what it runs under: a user can read reference data and only
-- their own profile and submission, and can update only their own
-- submission. Nothing is granted to anon. Rows are created by admin scripts
-- using the secret key, which bypasses RLS, so there are no insert or delete
-- policies.

alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.submissions enable row level security;

create policy "Authenticated users can read teams"
  on public.teams for select
  to authenticated
  using (true);

create policy "Authenticated users can read seasons"
  on public.seasons for select
  to authenticated
  using (true);

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "Users can read their own submissions"
  on public.submissions for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can update their own submissions"
  on public.submissions for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- RLS policies can't restrict which columns an update touches, so column
-- privileges limit signed-in users to the editable picks. This keeps
-- initial_*, year, user_id and submitted_at unchangeable even if the
-- publishable key leaks. Admin scripts use the secret key and are unaffected.
revoke update on public.submissions from authenticated, anon;
grant update (current_playoff, current_tiebreakers, champion_id, updated_at)
  on public.submissions to authenticated;
