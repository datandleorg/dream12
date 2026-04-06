-- Per-user, per-match saved fantasy templates (T1..T10). Mutations via RPC only; RLS allows read own.

create table public.user_saved_match_teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  match_id bigint not null references public.matches (id) on delete cascade,
  slot int not null,
  captain_id uuid not null references public.players (id) on delete cascade,
  vice_captain_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_saved_match_teams_slot_range check (slot >= 1 and slot <= 10),
  constraint user_saved_match_teams_user_match_slot unique (user_id, match_id, slot)
);

create index user_saved_match_teams_user_match_idx
  on public.user_saved_match_teams (user_id, match_id);

comment on table public.user_saved_match_teams is
  'Match-scoped fantasy XI templates; UI label T{slot}. Max 10 per user per match.';

create table public.user_saved_match_team_roster (
  saved_team_id uuid not null references public.user_saved_match_teams (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  primary key (saved_team_id, player_id)
);

create index user_saved_match_team_roster_saved_idx
  on public.user_saved_match_team_roster (saved_team_id);

alter table public.user_saved_match_teams enable row level security;
alter table public.user_saved_match_team_roster enable row level security;

create policy "user_saved_match_teams_select_own"
  on public.user_saved_match_teams
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "user_saved_match_team_roster_select_own"
  on public.user_saved_match_team_roster
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_saved_match_teams s
      where s.id = saved_team_id and s.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- create_user_saved_match_team: next free slot 1..10
-- ---------------------------------------------------------------------------

create or replace function public.create_user_saved_match_team(
  p_match_id bigint,
  p_player_ids uuid[],
  p_captain_id uuid,
  p_vice_captain_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_slot int;
  v_distinct int;
  v_missing int;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.requester_is_active() then
    raise exception 'account inactive';
  end if;

  if not exists (select 1 from public.matches m where m.id = p_match_id) then
    raise exception 'match not found';
  end if;

  if p_player_ids is null or cardinality(p_player_ids) is distinct from 11 then
    raise exception 'pick exactly 11 players';
  end if;

  select count(*) into v_distinct from (select distinct unnest(p_player_ids)) as u;
  if v_distinct is distinct from 11 then
    raise exception 'duplicate players in squad';
  end if;

  if p_captain_id = p_vice_captain_id then
    raise exception 'captain and vice-captain must be different';
  end if;
  if not (p_captain_id = any (p_player_ids) and p_vice_captain_id = any (p_player_ids)) then
    raise exception 'captain and vice-captain must be in your xi';
  end if;

  select count(*) into v_missing
  from unnest(p_player_ids) as pid(x)
  where not exists (
    select 1 from public.players pl
    where pl.id = pid.x and pl.match_id = p_match_id
  );
  if v_missing > 0 then
    raise exception 'invalid player for this match';
  end if;

  select s into v_slot
  from generate_series(1, 10) as s
  where not exists (
    select 1 from public.user_saved_match_teams t
    where t.user_id = v_uid and t.match_id = p_match_id and t.slot = s
  )
  order by s
  limit 1;

  if v_slot is null then
    raise exception 'max saved teams reached for this match';
  end if;

  insert into public.user_saved_match_teams (
    user_id, match_id, slot, captain_id, vice_captain_id
  )
  values (v_uid, p_match_id, v_slot, p_captain_id, p_vice_captain_id)
  returning id into v_id;

  insert into public.user_saved_match_team_roster (saved_team_id, player_id)
  select v_id, unnest(p_player_ids);

  return v_id;
end;
$$;

revoke all on function public.create_user_saved_match_team(bigint, uuid[], uuid, uuid) from public;
grant execute on function public.create_user_saved_match_team(bigint, uuid[], uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- update_user_saved_match_team
-- ---------------------------------------------------------------------------

create or replace function public.update_user_saved_match_team(
  p_saved_team_id uuid,
  p_player_ids uuid[],
  p_captain_id uuid,
  p_vice_captain_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match_id bigint;
  v_distinct int;
  v_missing int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.requester_is_active() then
    raise exception 'account inactive';
  end if;

  select t.match_id into v_match_id
  from public.user_saved_match_teams t
  where t.id = p_saved_team_id and t.user_id = v_uid;

  if v_match_id is null then
    raise exception 'saved team not found';
  end if;

  if p_player_ids is null or cardinality(p_player_ids) is distinct from 11 then
    raise exception 'pick exactly 11 players';
  end if;

  select count(*) into v_distinct from (select distinct unnest(p_player_ids)) as u;
  if v_distinct is distinct from 11 then
    raise exception 'duplicate players in squad';
  end if;

  if p_captain_id = p_vice_captain_id then
    raise exception 'captain and vice-captain must be different';
  end if;
  if not (p_captain_id = any (p_player_ids) and p_vice_captain_id = any (p_player_ids)) then
    raise exception 'captain and vice-captain must be in your xi';
  end if;

  select count(*) into v_missing
  from unnest(p_player_ids) as pid(x)
  where not exists (
    select 1 from public.players pl
    where pl.id = pid.x and pl.match_id = v_match_id
  );
  if v_missing > 0 then
    raise exception 'invalid player for this match';
  end if;

  update public.user_saved_match_teams
  set
    captain_id = p_captain_id,
    vice_captain_id = p_vice_captain_id,
    updated_at = timezone('utc', now())
  where id = p_saved_team_id;

  delete from public.user_saved_match_team_roster where saved_team_id = p_saved_team_id;
  insert into public.user_saved_match_team_roster (saved_team_id, player_id)
  select p_saved_team_id, unnest(p_player_ids);
end;
$$;

revoke all on function public.update_user_saved_match_team(uuid, uuid[], uuid, uuid) from public;
grant execute on function public.update_user_saved_match_team(uuid, uuid[], uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_user_saved_match_team
-- ---------------------------------------------------------------------------

create or replace function public.delete_user_saved_match_team(p_saved_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.requester_is_active() then
    raise exception 'account inactive';
  end if;

  delete from public.user_saved_match_teams t
  where t.id = p_saved_team_id and t.user_id = v_uid;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'saved team not found';
  end if;
end;
$$;

revoke all on function public.delete_user_saved_match_team(uuid) from public;
grant execute on function public.delete_user_saved_match_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- apply_saved_team_to_contest → save_fantasy_team
-- ---------------------------------------------------------------------------

create or replace function public.apply_saved_team_to_contest(
  p_saved_team_id uuid,
  p_contest_id uuid,
  p_roster_only boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match_id bigint;
  v_cap uuid;
  v_vc uuid;
  v_pids uuid[];
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.requester_is_active() then
    raise exception 'account inactive';
  end if;

  select t.match_id, t.captain_id, t.vice_captain_id
  into v_match_id, v_cap, v_vc
  from public.user_saved_match_teams t
  where t.id = p_saved_team_id and t.user_id = v_uid;

  if v_match_id is null then
    raise exception 'saved team not found';
  end if;

  select array_agg(r.player_id order by r.player_id)
  into v_pids
  from public.user_saved_match_team_roster r
  where r.saved_team_id = p_saved_team_id;

  if v_pids is null or cardinality(v_pids) is distinct from 11 then
    raise exception 'saved team roster incomplete';
  end if;

  if exists (
    select 1
    from unnest(v_pids) as pid(x)
    where not exists (
      select 1 from public.players pl
      where pl.id = pid.x and pl.match_id = v_match_id
    )
  ) then
    raise exception 'saved team has invalid players for this match';
  end if;

  if p_roster_only then
    return public.save_fantasy_team(
      v_match_id,
      p_contest_id,
      v_pids,
      null,
      null
    );
  end if;

  return public.save_fantasy_team(
    v_match_id,
    p_contest_id,
    v_pids,
    v_cap,
    v_vc
  );
end;
$$;

revoke all on function public.apply_saved_team_to_contest(uuid, uuid, boolean) from public;
grant execute on function public.apply_saved_team_to_contest(uuid, uuid, boolean) to authenticated;
