-- SportMonks Cricket reference data (leagues, seasons, teams, season squads) + match linking.
-- Used for IPL-focused sync: fixtures by season, squad-based pick pool before lineup.

create table public.sm_leagues (
  id bigint primary key,
  name text not null,
  code text,
  image_path text,
  league_type text,
  updated_at timestamptz
);

create table public.sm_seasons (
  id bigint primary key,
  league_id bigint not null references public.sm_leagues (id) on delete cascade,
  name text not null,
  code text,
  starting_at timestamptz,
  ending_at timestamptz,
  is_current boolean not null default false,
  updated_at timestamptz
);

create index sm_seasons_league_id_idx on public.sm_seasons (league_id);
create index sm_seasons_league_current_idx on public.sm_seasons (league_id, is_current);

create table public.sm_teams (
  id bigint primary key,
  name text not null,
  short_code text,
  image_path text,
  updated_at timestamptz
);

create table public.sm_season_team (
  season_id bigint not null references public.sm_seasons (id) on delete cascade,
  team_id bigint not null references public.sm_teams (id) on delete cascade,
  primary key (season_id, team_id)
);

create index sm_season_team_team_idx on public.sm_season_team (team_id);

create table public.sm_season_squad (
  season_id bigint not null references public.sm_seasons (id) on delete cascade,
  team_id bigint not null references public.sm_teams (id) on delete cascade,
  player_sportmonks_id bigint not null,
  player_name text not null,
  position_label text,
  photo_url text,
  updated_at timestamptz not null default now(),
  primary key (season_id, team_id, player_sportmonks_id)
);

create index sm_season_squad_season_team_idx on public.sm_season_squad (season_id, team_id);

alter table public.matches
  add column if not exists league_id bigint references public.sm_leagues (id) on delete set null,
  add column if not exists season_id bigint references public.sm_seasons (id) on delete set null,
  add column if not exists localteam_id bigint,
  add column if not exists visitorteam_id bigint;

create index if not exists matches_season_id_idx on public.matches (season_id);
create index if not exists matches_league_id_idx on public.matches (league_id);

comment on column public.matches.league_id is 'SportMonks league id (e.g. IPL).';
comment on column public.matches.season_id is 'SportMonks season id for this fixture.';
comment on column public.matches.localteam_id is 'SportMonks team id (home/first).';
comment on column public.matches.visitorteam_id is 'SportMonks team id (away/second).';

alter table public.sm_leagues enable row level security;
alter table public.sm_seasons enable row level security;
alter table public.sm_teams enable row level security;
alter table public.sm_season_team enable row level security;
alter table public.sm_season_squad enable row level security;

create policy "sm_leagues_read_auth" on public.sm_leagues
  for select to authenticated using (true);
create policy "sm_seasons_read_auth" on public.sm_seasons
  for select to authenticated using (true);
create policy "sm_teams_read_auth" on public.sm_teams
  for select to authenticated using (true);
create policy "sm_season_team_read_auth" on public.sm_season_team
  for select to authenticated using (true);
create policy "sm_season_squad_read_auth" on public.sm_season_squad
  for select to authenticated using (true);
