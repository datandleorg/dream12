-- Dream11-style display fields + atomic save with entry-fee debit (SECURITY DEFINER)

alter table public.matches
  add column if not exists tournament_name text,
  add column if not exists team_a text,
  add column if not exists team_b text,
  add column if not exists team_a_logo_url text,
  add column if not exists team_b_logo_url text;

alter table public.players
  add column if not exists season_points int not null default 0,
  add column if not exists selection_pct numeric(5, 2),
  add column if not exists played_last_match boolean not null default false,
  add column if not exists photo_url text;

-- Single transaction: validate, debit on first join, upsert team + roster
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
  v_fee numeric(12, 2);
  v_balance numeric(12, 2);
  v_match_start timestamptz;
  v_contest_match bigint;
  v_distinct int;
  v_missing int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select start_time into v_match_start from public.matches where id = p_match_id;
  if not found then
    raise exception 'match not found';
  end if;
  if timezone('utc', now()) >= v_match_start - interval '1 minute' then
    raise exception 'team lock deadline has passed';
  end if;

  select match_id, coalesce(entry_fee, 0) into v_contest_match, v_fee
  from public.contests where id = p_contest_id;
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

  if p_captain_id is null or p_vice_captain_id is null then
    raise exception 'captain and vice-captain required';
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

  select id into v_team_id
  from public.user_teams
  where user_id = v_uid and contest_id = p_contest_id;

  if v_team_id is null then
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

    insert into public.user_teams (user_id, contest_id, match_id, captain_id, vice_captain_id)
    values (v_uid, p_contest_id, p_match_id, p_captain_id, p_vice_captain_id)
    returning id into v_team_id;
  else
    update public.user_teams
    set
      match_id = p_match_id,
      captain_id = p_captain_id,
      vice_captain_id = p_vice_captain_id,
      updated_at = now()
    where id = v_team_id;
  end if;

  delete from public.team_roster where team_id = v_team_id;
  insert into public.team_roster (team_id, player_id)
  select v_team_id, unnest(p_player_ids);

  return v_team_id;
end;
$$;

grant execute on function public.save_fantasy_team(bigint, uuid, uuid[], uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
