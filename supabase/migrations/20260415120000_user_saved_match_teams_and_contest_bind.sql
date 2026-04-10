-- Dream11-style: match-level saved teams (templates) + bind to contest entries via user_teams.source_saved_match_team_id.
-- Lock: same as save_fantasy_team (matches.status — block live / completed / in_review).
-- Idempotent: safe to re-run if tables/policies already exist from a partial apply.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.user_saved_match_teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  match_id bigint not null references public.matches (id) on delete cascade,
  slot int not null,
  captain_id uuid not null references public.players (id) on delete cascade,
  vice_captain_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_saved_match_teams_slot_range check (slot >= 1 and slot <= 10),
  constraint user_saved_match_teams_user_match_slot unique (user_id, match_id, slot),
  constraint user_saved_match_teams_cap_vc_distinct check (captain_id <> vice_captain_id)
);

create index if not exists user_saved_match_teams_user_match_idx
  on public.user_saved_match_teams (user_id, match_id);

comment on table public.user_saved_match_teams is
  'Match-scoped fantasy XI templates (T1..T10). Mutations via RPC only.';

create table if not exists public.user_saved_match_team_roster (
  saved_team_id uuid not null references public.user_saved_match_teams (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  primary key (saved_team_id, player_id)
);

create index if not exists user_saved_match_team_roster_saved_idx
  on public.user_saved_match_team_roster (saved_team_id);

alter table public.user_saved_match_teams enable row level security;
alter table public.user_saved_match_team_roster enable row level security;

drop policy if exists "user_saved_match_teams_select_own" on public.user_saved_match_teams;
create policy "user_saved_match_teams_select_own"
  on public.user_saved_match_teams
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_saved_match_team_roster_select_own" on public.user_saved_match_team_roster;
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

alter table public.user_teams
  add column if not exists source_saved_match_team_id uuid
  references public.user_saved_match_teams (id) on delete set null;

comment on column public.user_teams.source_saved_match_team_id is
  'Saved template applied to this contest entry; full contest saves mirror XI back when set.';

create index if not exists user_teams_source_saved_match_team_idx
  on public.user_teams (source_saved_match_team_id)
  where source_saved_match_team_id is not null;

-- ---------------------------------------------------------------------------
-- Shared lock (internal)
-- ---------------------------------------------------------------------------

create or replace function public.assert_match_squad_editable(p_match_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_status public.match_status;
begin
  select status into v_match_status from public.matches where id = p_match_id;
  if not found then
    raise exception 'match not found';
  end if;
  if v_match_status in ('completed', 'in_review') then
    raise exception 'match has finished';
  end if;
  if v_match_status = 'live' then
    raise exception 'team lock deadline has passed';
  end if;
end;
$$;

revoke all on function public.assert_match_squad_editable(bigint) from public;
revoke all on function public.assert_match_squad_editable(bigint) from authenticated;
revoke all on function public.assert_match_squad_editable(bigint) from anon;

-- ---------------------------------------------------------------------------
-- Internal: write template rows only (no contest sync)
-- ---------------------------------------------------------------------------

create or replace function public.apply_saved_team_lineup_rows(
  p_uid uuid,
  p_saved_team_id uuid,
  p_match_id bigint,
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
  v_n int;
begin
  update public.user_saved_match_teams
  set
    captain_id = p_captain_id,
    vice_captain_id = p_vice_captain_id,
    updated_at = timezone('utc', now())
  where id = p_saved_team_id and user_id = p_uid and match_id = p_match_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'saved team not found';
  end if;

  delete from public.user_saved_match_team_roster where saved_team_id = p_saved_team_id;
  insert into public.user_saved_match_team_roster (saved_team_id, player_id)
  select p_saved_team_id, unnest(p_player_ids);
end;
$$;

revoke all on function public.apply_saved_team_lineup_rows(uuid, uuid, bigint, uuid[], uuid, uuid) from public;
revoke all on function public.apply_saved_team_lineup_rows(uuid, uuid, bigint, uuid[], uuid, uuid) from authenticated;
revoke all on function public.apply_saved_team_lineup_rows(uuid, uuid, bigint, uuid[], uuid, uuid) from anon;

-- ---------------------------------------------------------------------------
-- Sync template -> all bound contest entries
-- ---------------------------------------------------------------------------

create or replace function public.sync_bound_contests_from_saved_team(p_saved_team_id uuid)
returns void
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
  ut_row record;
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

  perform public.assert_match_squad_editable(v_match_id);

  select array_agg(r.player_id order by r.player_id)
  into v_pids
  from public.user_saved_match_team_roster r
  where r.saved_team_id = p_saved_team_id;

  if v_pids is null or cardinality(v_pids) is distinct from 11 then
    raise exception 'saved team roster incomplete';
  end if;

  for ut_row in
    select ut.id
    from public.user_teams ut
    where ut.user_id = v_uid
      and ut.source_saved_match_team_id = p_saved_team_id
      and ut.match_id = v_match_id
  loop
    delete from public.team_roster where team_id = ut_row.id;
    insert into public.team_roster (team_id, player_id)
    select ut_row.id, unnest(v_pids);

    update public.user_teams
    set
      captain_id = v_cap,
      vice_captain_id = v_vc,
      updated_at = now()
    where id = ut_row.id;
  end loop;
end;
$$;

revoke all on function public.sync_bound_contests_from_saved_team(uuid) from public;
grant execute on function public.sync_bound_contests_from_saved_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- create_user_saved_match_team
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

  perform public.assert_match_squad_editable(p_match_id);

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

  perform public.assert_match_squad_editable(v_match_id);

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

  perform public.apply_saved_team_lineup_rows(
    v_uid,
    p_saved_team_id,
    v_match_id,
    p_player_ids,
    p_captain_id,
    p_vice_captain_id
  );

  perform public.sync_bound_contests_from_saved_team(p_saved_team_id);
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
  v_match_id bigint;
  v_n int;
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

  perform public.assert_match_squad_editable(v_match_id);

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
-- save_fantasy_team: optional mirror to template; keep source_saved_match_team_id
-- ---------------------------------------------------------------------------

drop function if exists public.save_fantasy_team(bigint, uuid, uuid[], uuid, uuid);

create or replace function public.save_fantasy_team(
  p_match_id bigint,
  p_contest_id uuid,
  p_player_ids uuid[],
  p_captain_id uuid,
  p_vice_captain_id uuid,
  p_mirror_saved_team_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team_id uuid;
  v_entry_paid timestamptz;
  v_fee numeric(12, 2);
  v_balance numeric(12, 2);
  v_match_status public.match_status;
  v_contest_match bigint;
  v_max_participants int;
  v_created_by uuid;
  v_paid_ct int;
  v_distinct int;
  v_missing int;
  v_roster_only boolean;
  v_mirror uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select status into v_match_status from public.matches where id = p_match_id;
  if not found then
    raise exception 'match not found';
  end if;
  if v_match_status in ('completed', 'in_review') then
    raise exception 'match has finished';
  end if;
  if v_match_status = 'live' then
    raise exception 'team lock deadline has passed';
  end if;

  select
    c.match_id,
    coalesce(c.entry_fee, 0),
    c.max_participants,
    c.created_by
  into v_contest_match, v_fee, v_max_participants, v_created_by
  from public.contests c
  where c.id = p_contest_id;

  if not found then
    raise exception 'contest not found';
  end if;
  if v_contest_match is distinct from p_match_id then
    raise exception 'contest does not belong to this match';
  end if;

  if p_player_ids is null or cardinality(p_player_ids) is distinct from 11 then
    raise exception 'pick exactly 11 players';
  end if;

  select count(*) into v_distinct from (select distinct unnest(p_player_ids)) as u;
  if v_distinct is distinct from 11 then
    raise exception 'duplicate players in squad';
  end if;

  if p_captain_id is null and p_vice_captain_id is null then
    v_roster_only := true;
  elsif p_captain_id is not null and p_vice_captain_id is not null then
    v_roster_only := false;
    if p_captain_id = p_vice_captain_id then
      raise exception 'captain and vice-captain must be different';
    end if;
    if not (p_captain_id = any (p_player_ids) and p_vice_captain_id = any (p_player_ids)) then
      raise exception 'captain and vice-captain must be in your xi';
    end if;
  else
    raise exception 'captain and vice-captain must both be set or both omitted for roster-only save';
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

  select ut.id, ut.entry_fee_paid_at
  into v_team_id, v_entry_paid
  from public.user_teams ut
  where ut.user_id = v_uid and ut.contest_id = p_contest_id;

  if v_team_id is null then
    if v_roster_only then
      insert into public.user_teams (
        user_id, contest_id, match_id, captain_id, vice_captain_id, entry_fee_paid_at
      )
      values (v_uid, p_contest_id, p_match_id, p_captain_id, p_vice_captain_id, null)
      returning id into v_team_id;
    else
      select count(*)::int into v_paid_ct
      from public.user_teams ut
      where ut.contest_id = p_contest_id
        and ut.entry_fee_paid_at is not null;

      if v_paid_ct >= v_max_participants then
        raise exception 'contest is full';
      end if;

      if v_fee > 0 then
        select wallet_balance into v_balance
        from public.profiles
        where id = v_uid
        for update;
        if not found then
          raise exception 'profile not found';
        end if;
        if v_balance < v_fee then
          raise exception 'insufficient wallet balance for this contest';
        end if;
        update public.profiles
        set wallet_balance = wallet_balance - v_fee
        where id = v_uid;
      end if;

      insert into public.user_teams (
        user_id, contest_id, match_id, captain_id, vice_captain_id, entry_fee_paid_at
      )
      values (
        v_uid,
        p_contest_id,
        p_match_id,
        p_captain_id,
        p_vice_captain_id,
        timezone('utc', now())
      )
      returning id into v_team_id;

      if v_created_by = v_uid then
        update public.contests
        set creator_joined_at = coalesce(creator_joined_at, timezone('utc', now()))
        where id = p_contest_id;
      end if;
    end if;
  else
    if v_roster_only then
      update public.user_teams
      set
        match_id = p_match_id,
        updated_at = now()
      where id = v_team_id;
    else
      if v_entry_paid is null then
        select count(*)::int into v_paid_ct
        from public.user_teams ut
        where ut.contest_id = p_contest_id
          and ut.entry_fee_paid_at is not null;

        if v_paid_ct >= v_max_participants then
          raise exception 'contest is full';
        end if;

        if v_fee > 0 then
          select wallet_balance into v_balance
          from public.profiles
          where id = v_uid
          for update;
          if not found then
            raise exception 'profile not found';
          end if;
          if v_balance < v_fee then
            raise exception 'insufficient wallet balance for this contest';
          end if;
          update public.profiles
          set wallet_balance = wallet_balance - v_fee
          where id = v_uid;
        end if;

        update public.user_teams
        set
          match_id = p_match_id,
          captain_id = p_captain_id,
          vice_captain_id = p_vice_captain_id,
          entry_fee_paid_at = timezone('utc', now()),
          updated_at = now()
        where id = v_team_id;

        if v_created_by = v_uid then
          update public.contests
          set creator_joined_at = coalesce(creator_joined_at, timezone('utc', now()))
          where id = p_contest_id;
        end if;
      else
        update public.user_teams
        set
          match_id = p_match_id,
          captain_id = p_captain_id,
          vice_captain_id = p_vice_captain_id,
          updated_at = now()
        where id = v_team_id;
      end if;
    end if;
  end if;

  delete from public.team_roster where team_id = v_team_id;
  insert into public.team_roster (team_id, player_id)
  select v_team_id, unnest(p_player_ids);

  if not v_roster_only then
    v_mirror := p_mirror_saved_team_id;
    if v_mirror is null then
      select ut.source_saved_match_team_id into v_mirror
      from public.user_teams ut
      where ut.id = v_team_id;
    end if;

    if v_mirror is not null then
      perform public.apply_saved_team_lineup_rows(
        v_uid,
        v_mirror,
        p_match_id,
        p_player_ids,
        p_captain_id,
        p_vice_captain_id
      );
    end if;
  end if;

  return v_team_id;
end;
$$;

grant execute on function public.save_fantasy_team(bigint, uuid, uuid[], uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- apply_saved_team_to_contest
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
  v_team_id uuid;
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
    v_team_id := public.save_fantasy_team(
      v_match_id,
      p_contest_id,
      v_pids,
      null,
      null,
      null
    );
  else
    v_team_id := public.save_fantasy_team(
      v_match_id,
      p_contest_id,
      v_pids,
      v_cap,
      v_vc,
      p_saved_team_id
    );
  end if;

  update public.user_teams
  set source_saved_match_team_id = p_saved_team_id
  where id = v_team_id
    and user_id = v_uid;

  return v_team_id;
end;
$$;

revoke all on function public.apply_saved_team_to_contest(uuid, uuid, boolean) from public;
grant execute on function public.apply_saved_team_to_contest(uuid, uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
