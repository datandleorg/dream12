-- SportMonks venues & stages; link matches for fixture-derived UI.

create table public.sm_venues (
  id bigint primary key,
  country_id bigint,
  name text not null,
  city text,
  image_path text,
  capacity int,
  floodlight boolean,
  updated_at timestamptz
);

create table public.sm_stages (
  id bigint primary key,
  league_id bigint not null references public.sm_leagues (id) on delete cascade,
  season_id bigint not null references public.sm_seasons (id) on delete cascade,
  name text not null,
  code text,
  stage_type text,
  updated_at timestamptz
);

create index sm_stages_season_id_idx on public.sm_stages (season_id);
create index sm_stages_league_id_idx on public.sm_stages (league_id);

alter table public.matches
  add column if not exists venue_id bigint references public.sm_venues (id) on delete set null,
  add column if not exists stage_id bigint references public.sm_stages (id) on delete set null,
  add column if not exists match_format text;

create index if not exists matches_venue_id_idx on public.matches (venue_id);
create index if not exists matches_stage_id_idx on public.matches (stage_id);

comment on column public.matches.venue_id is 'SportMonks venue id.';
comment on column public.matches.stage_id is 'SportMonks stage id.';
comment on column public.matches.match_format is 'SportMonks fixture type e.g. T20, ODI.';

alter table public.sm_venues enable row level security;
alter table public.sm_stages enable row level security;

create policy "sm_venues_read_auth" on public.sm_venues
  for select to authenticated using (true);

create policy "sm_stages_read_auth" on public.sm_stages
  for select to authenticated using (true);
