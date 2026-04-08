-- Lock joins / team edits by matches.status (upcoming only), not scheduled start_time.
-- Allows rain delays and other SM "Delayed" states while status stays upcoming.

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
  v_match_status public.match_status;
  v_sum numeric(12, 4);
  v_new_id uuid;
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

grant execute on function public.create_user_contest(
  bigint, text, numeric, int, numeric, int, jsonb, numeric, boolean
) to authenticated;

create or replace function public.delete_user_contest(p_contest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match_id bigint;
  v_match_status public.match_status;
  v_created_by uuid;
  v_settled timestamptz;
  v_entry_fee numeric(12, 2);
  v_refund_count int := 0;
  rec record;
  v_contest_name text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select
    c.match_id,
    c.created_by,
    c.prizes_settled_at,
    coalesce(c.entry_fee, 0),
    coalesce(nullif(trim(c.name), ''), 'Contest')
  into
    v_match_id,
    v_created_by,
    v_settled,
    v_entry_fee,
    v_contest_name
  from public.contests c
  where c.id = p_contest_id
  for update;

  if not found then
    raise exception 'contest not found';
  end if;

  if v_created_by is null then
    raise exception 'only user-created contests can be deleted by creator';
  end if;

  if v_created_by is distinct from v_uid then
    raise exception 'only the contest creator can delete this contest';
  end if;

  if v_settled is not null then
    raise exception 'contest already settled';
  end if;

  select m.status into v_match_status
  from public.matches m
  where m.id = v_match_id;
  if not found then
    raise exception 'match not found';
  end if;

  if v_match_status in ('completed', 'in_review') then
    raise exception 'match has finished';
  end if;
  if v_match_status = 'live' then
    raise exception 'team lock deadline has passed';
  end if;

  for rec in
    select ut.user_id
    from public.user_teams ut
    where ut.contest_id = p_contest_id
      and ut.entry_fee_paid_at is not null
  loop
    if v_entry_fee > 0 then
      update public.profiles
      set wallet_balance = wallet_balance + v_entry_fee
      where id = rec.user_id;
      v_refund_count := v_refund_count + 1;
    end if;
    perform public.create_notification(
      rec.user_id,
      'match_result',
      'Contest cancelled by host',
      case
        when v_entry_fee > 0 then
          format(
            'The host removed "%s" before lock. Your entry fee has been refunded.',
            v_contest_name
          )
        else
          format('The host removed "%s" before lock.', v_contest_name)
      end,
      jsonb_build_object(
        'contest_id', p_contest_id,
        'match_id', v_match_id,
        'amount_inr', v_entry_fee,
        'void', true,
        'reason', 'creator_deleted',
        'href', format('/matches/%s', v_match_id)
      )
    );
  end loop;

  delete from public.contests where id = p_contest_id;

  return jsonb_build_object(
    'ok', true,
    'refunds', v_refund_count,
    'match_id', v_match_id
  );
end;
$$;

grant execute on function public.delete_user_contest(uuid) to authenticated;

create or replace function public.recompute_contest_prizes_after_join_lock(p_contest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id bigint;
  v_settled timestamptz;
  v_match_status public.match_status;
  v_entry_fee numeric(12, 2);
  v_gross_collected numeric(12, 2);
  v_prize_pool numeric(12, 2);
  v_winner_count int;
  v_breakup jsonb;
  v_participant_count int;
  v_actual_gross numeric(12, 2);
  v_adj jsonb;
  v_adjusted_net_pool numeric(12, 2);
  v_effective_winners int;
  v_recomputed jsonb;
begin
  select
    c.match_id,
    c.prizes_settled_at,
    coalesce(c.entry_fee, 0),
    coalesce(c.gross_collected, 0),
    coalesce(c.prize_pool, 0),
    c.winner_count,
    c.prize_breakup
  into
    v_match_id,
    v_settled,
    v_entry_fee,
    v_gross_collected,
    v_prize_pool,
    v_winner_count,
    v_breakup
  from public.contests c
  where c.id = p_contest_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'contest_not_found');
  end if;

  if v_settled is not null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'already_settled');
  end if;

  select m.status into v_match_status
  from public.matches m
  where m.id = v_match_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'match_not_found');
  end if;

  if v_match_status = 'upcoming' then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'join_lock_not_yet');
  end if;

  select count(*)::int
  into v_participant_count
  from public.user_teams ut
  where ut.contest_id = p_contest_id
    and ut.entry_fee_paid_at is not null;

  if v_participant_count < 2 then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'insufficient_participants');
  end if;

  if v_breakup is null or jsonb_typeof(v_breakup) <> 'array' then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_prize_breakup');
  end if;

  v_actual_gross := round(v_entry_fee * v_participant_count, 2);
  if abs(coalesce(v_gross_collected, 0) - v_actual_gross) <= 0.02 then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'already_recomputed');
  end if;

  v_adj := public.contest_prize_adjustment_for_entries(
    v_entry_fee,
    v_participant_count,
    v_gross_collected,
    v_prize_pool,
    v_winner_count
  );
  v_adjusted_net_pool := (v_adj->>'adjusted_net_pool')::numeric(12, 2);
  v_effective_winners := (v_adj->>'effective_winners')::int;
  v_recomputed := v_adj->'prize_breakup';

  update public.contests
  set
    gross_collected = (v_adj->>'actual_gross')::numeric(12, 2),
    prize_pool = v_adjusted_net_pool,
    prize_breakup = v_recomputed
  where id = p_contest_id;

  return jsonb_build_object(
    'ok', true,
    'updated', true,
    'participants', v_participant_count,
    'adjusted_net_pool', v_adjusted_net_pool,
    'effective_winners', v_effective_winners
  );
end;
$$;

revoke all on function public.recompute_contest_prizes_after_join_lock(uuid) from public;
grant execute on function public.recompute_contest_prizes_after_join_lock(uuid) to service_role;

create or replace function public.contest_ids_eligible_for_join_lock_prize_recompute(p_limit int default 50)
returns table (contest_id uuid)
language sql
security definer
set search_path = public
as $$
  select c.id
  from public.contests c
  inner join public.matches m on m.id = c.match_id
  where c.prizes_settled_at is null
    and m.status <> 'upcoming'::public.match_status
    and c.prize_breakup is not null
    and jsonb_typeof(c.prize_breakup) = 'array'
  order by m.start_time asc
  limit greatest(coalesce(p_limit, 50), 1);
$$;

revoke all on function public.contest_ids_eligible_for_join_lock_prize_recompute(int) from public;
grant execute on function public.contest_ids_eligible_for_join_lock_prize_recompute(int) to service_role;
