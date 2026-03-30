-- Block contests / team edits when match is in_review (scores being finalized).

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
  v_match_status public.match_status;
  v_contest_match bigint;
  v_distinct int;
  v_missing int;
  v_was_new_team boolean := false;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select start_time, status into v_match_start, v_match_status
  from public.matches
  where id = p_match_id;
  if not found then
    raise exception 'match not found';
  end if;

  if v_match_status in ('completed', 'in_review') then
    raise exception 'match has finished';
  end if;

  if v_match_status is distinct from 'live' then
    if timezone('utc', now()) >= v_match_start - interval '1 minute' then
      raise exception 'team lock deadline has passed';
    end if;
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
    v_was_new_team := true;
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

  if v_was_new_team then
    update public.contests
    set creator_joined_at = coalesce(creator_joined_at, timezone('utc', now()))
    where id = p_contest_id
      and created_by = v_uid;
  end if;

  return v_team_id;
end;
$$;

create or replace function public.create_user_contest(
  p_match_id bigint,
  p_name text,
  p_entry_fee numeric,
  p_max_participants int,
  p_prize_pool numeric,
  p_winner_count int,
  p_prize_breakup jsonb,
  p_gross_collected numeric,
  p_is_flexible boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match_start timestamptz;
  v_match_status public.match_status;
  v_sum numeric(12, 4);
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select start_time, status into v_match_start, v_match_status
  from public.matches
  where id = p_match_id;
  if not found then
    raise exception 'match not found';
  end if;

  if v_match_status in ('completed', 'in_review') then
    raise exception 'match has finished';
  end if;

  if v_match_status is distinct from 'live' then
    if timezone('utc', now()) >= v_match_start - interval '1 minute' then
      raise exception 'team lock deadline has passed';
    end if;
  end if;

  if p_entry_fee is null or p_entry_fee < 0 then
    raise exception 'invalid entry fee';
  end if;
  if p_max_participants is null or p_max_participants < 2 or p_max_participants > 10000 then
    raise exception 'spots must be between 2 and 10000';
  end if;
  if p_prize_pool is null or p_prize_pool < 0 then
    raise exception 'invalid prize pool';
  end if;
  if p_winner_count not in (1, 2, 3, 4, 5, 7, 10) then
    raise exception 'invalid winner count';
  end if;

  if p_prize_breakup is null or jsonb_typeof(p_prize_breakup) <> 'array' or jsonb_array_length(p_prize_breakup) < 1 then
    raise exception 'prize breakup must be a non-empty array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_prize_breakup) x
    where jsonb_typeof(x) <> 'object'
      or not (x ? 'rank_from' and x ? 'rank_to' and x ? 'amount')
      or (nullif(x->>'rank_from', ''))::int is null
      or (nullif(x->>'rank_to', ''))::int is null
      or (nullif(x->>'amount', ''))::numeric is null
      or (x->>'rank_from')::int > (x->>'rank_to')::int
  ) then
    raise exception 'each prize slab needs valid rank_from, rank_to, amount';
  end if;

  select coalesce(sum((x->>'amount')::numeric), 0) into v_sum
  from jsonb_array_elements(p_prize_breakup) x;

  if abs(v_sum - p_prize_pool) > 0.02 then
    raise exception 'prize slabs must sum to prize pool';
  end if;

  insert into public.contests (
    match_id,
    name,
    entry_fee,
    prize_pool,
    max_participants,
    created_by,
    creator_joined_at,
    winner_count,
    prize_breakup,
    is_flexible,
    gross_collected
  )
  values (
    p_match_id,
    nullif(trim(p_name), ''),
    round(p_entry_fee, 2),
    round(p_prize_pool, 2),
    p_max_participants,
    v_uid,
    null,
    p_winner_count,
    p_prize_breakup,
    coalesce(p_is_flexible, true),
    case when p_gross_collected is null then null else round(p_gross_collected, 2) end
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;
