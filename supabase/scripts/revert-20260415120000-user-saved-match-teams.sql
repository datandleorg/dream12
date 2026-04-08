-- -----------------------------------------------------------------------------
-- MANUAL REVERT for migration 20260415120000_user_saved_match_teams_and_contest_bind.sql
-- -----------------------------------------------------------------------------
-- Do NOT add this file as a timestamped migration under supabase/migrations/ unless
-- you intentionally want every new environment to apply 20260415120000 then immediately
-- undo it. Run this script by hand against the DB when you need to roll back.
--
-- Effects:
--   - Drops apply_saved_team_to_contest, template RPCs, helpers from 20260415120000
--   - Restores public.save_fantasy_team to the 5-argument version from
--     20260414120000_status_based_contest_lock.sql (no mirror / no source column logic)
--   - Drops user_teams.source_saved_match_team_id (and FK)
--   - Drops user_saved_match_team_roster + user_saved_match_teams (ALL template data lost)
--
-- Backup production data before running.
-- -----------------------------------------------------------------------------

-- Dependents of save_fantasy_team(6-arg) first
drop function if exists public.apply_saved_team_to_contest(uuid, uuid, boolean);

drop function if exists public.save_fantasy_team(bigint, uuid, uuid[], uuid, uuid, uuid);

-- Restore 5-arg save_fantasy_team (must match 20260414120000_status_based_contest_lock.sql)
create or replace function public.save_fantasy_team(
  p_match_id bigint,
  p_contest_id uuid,
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

  return v_team_id;
end;
$$;

grant execute on function public.save_fantasy_team(bigint, uuid, uuid[], uuid, uuid) to authenticated;

-- Template / sync RPCs from 20260415120000
drop function if exists public.sync_bound_contests_from_saved_team(uuid);
drop function if exists public.update_user_saved_match_team(uuid, uuid[], uuid, uuid);
drop function if exists public.create_user_saved_match_team(bigint, uuid[], uuid, uuid);
drop function if exists public.delete_user_saved_match_team(uuid);
drop function if exists public.apply_saved_team_lineup_rows(uuid, uuid, bigint, uuid[], uuid, uuid);
drop function if exists public.assert_match_squad_editable(bigint);

-- Remove FK column from contest entries (must run before dropping referenced table)
drop index if exists public.user_teams_source_saved_match_team_idx;
alter table public.user_teams drop column if exists source_saved_match_team_id;

-- Tables (RLS policies are dropped with the tables)
drop table if exists public.user_saved_match_team_roster cascade;
drop table if exists public.user_saved_match_teams cascade;

notify pgrst, 'reload schema';
