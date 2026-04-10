-- Defer wallet debit until full team save (captain + VC) on preview confirm.
-- Draft rows: entry_fee_paid_at is null (squad Continue only). Paid joins count for settlement/UI.

alter table public.user_teams
  add column if not exists entry_fee_paid_at timestamptz;

comment on column public.user_teams.entry_fee_paid_at is
  'When the user completed join (wallet debited if fee > 0). Null = XI draft only; not counted as a participant.';

update public.user_teams
set entry_fee_paid_at = coalesce(entry_fee_paid_at, created_at)
where entry_fee_paid_at is null;

-- ---------------------------------------------------------------------------
-- Join notification: only when transitioning from draft to paid (not on draft insert)
-- ---------------------------------------------------------------------------

drop trigger if exists user_teams_notify_joined on public.user_teams;

create or replace function public.tr_notify_contest_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if new.entry_fee_paid_at is null then
    return new;
  end if;
  if old.entry_fee_paid_at is not null then
    return new;
  end if;

  select coalesce(nullif(trim(c.name), ''), 'Contest') into v_name
  from public.contests c where c.id = new.contest_id;

  insert into public.notifications (user_id, type, title, body, payload)
  values (
    new.user_id,
    'contest_joined',
    'Joined contest',
    format('You joined %s.', v_name),
    jsonb_build_object(
      'contest_id', new.contest_id,
      'match_id', new.match_id,
      'href', format('/matches/%s/contests/%s/squad', new.match_id, new.contest_id)
    )
  );
  return new;
end;
$$;

create trigger user_teams_notify_joined
  after update of entry_fee_paid_at on public.user_teams
  for each row
  execute function public.tr_notify_contest_joined();

-- ---------------------------------------------------------------------------
-- save_fantasy_team: debit only when completing join (full C/VC save)
-- ---------------------------------------------------------------------------

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
  v_match_start timestamptz;
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

  select start_time into v_match_start from public.matches where id = p_match_id;
  if not found then
    raise exception 'match not found';
  end if;
  if timezone('utc', now()) >= v_match_start - interval '1 minute' then
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

-- ---------------------------------------------------------------------------
-- Settlement + join-lock recompute: count only paid entries
-- ---------------------------------------------------------------------------

create or replace function public.settle_contest_prizes(p_contest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id bigint;
  v_breakup jsonb;
  v_settled timestamptz;
  v_rank int := 0;
  rec record;
  v_amt numeric(12, 2);
  v_paid int := 0;
  v_entry_fee numeric(12, 2);
  v_gross_collected numeric(12, 2);
  v_prize_pool numeric(12, 2);
  v_winner_count int;
  v_participant_count int;
  v_actual_gross numeric(12, 2);
  v_adjusted_net_pool numeric(12, 2);
  v_effective_winners int;
  v_recomputed jsonb;
  v_refund_count int := 0;
  v_adj jsonb;
begin
  select
    c.match_id,
    c.prize_breakup,
    c.prizes_settled_at,
    coalesce(c.entry_fee, 0),
    coalesce(c.gross_collected, 0),
    coalesce(c.prize_pool, 0),
    c.winner_count
  into
    v_match_id,
    v_breakup,
    v_settled,
    v_entry_fee,
    v_gross_collected,
    v_prize_pool,
    v_winner_count
  from public.contests c
  where c.id = p_contest_id
  for update;

  if not found then
    raise exception 'contest not found';
  end if;

  if v_settled is not null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'already_settled');
  end if;

  if not exists (
    select 1 from public.matches m
    where m.id = v_match_id
      and m.status = 'completed'
      and m.scoring_finalized_at is not null
  ) then
    return jsonb_build_object('ok', false, 'skipped', true, 'reason', 'match_not_ready');
  end if;

  select count(*)::int
  into v_participant_count
  from public.user_teams ut
  where ut.contest_id = p_contest_id
    and ut.entry_fee_paid_at is not null;

  if v_participant_count < 2 then
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
        'Contest cancelled',
        case
          when v_entry_fee > 0 then 'Not enough players joined. Your entry fee has been refunded.'
          else 'Not enough players joined. This contest did not run.'
        end,
        jsonb_build_object(
          'contest_id', p_contest_id,
          'match_id', v_match_id,
          'amount_inr', v_entry_fee,
          'void', true,
          'href', format('/contests/%s', p_contest_id)
        )
      );
    end loop;

    update public.contests
    set prizes_settled_at = timezone('utc', now())
    where id = p_contest_id;

    return jsonb_build_object(
      'ok', true,
      'void', true,
      'reason', 'insufficient_participants',
      'refunds', v_refund_count,
      'participants', v_participant_count
    );
  end if;

  if v_breakup is null or jsonb_typeof(v_breakup) <> 'array' then
    v_rank := 0;
    for rec in
      select ut.user_id, ut.id as team_id
      from public.user_teams ut
      where ut.contest_id = p_contest_id
        and ut.entry_fee_paid_at is not null
      order by ut.total_points desc, ut.created_at asc, ut.id asc
    loop
      v_rank := v_rank + 1;
      perform public.create_notification(
        rec.user_id,
        'match_result',
        'Contest closed',
        format('Final standings are in. You finished rank %s.', v_rank),
        jsonb_build_object(
          'contest_id', p_contest_id,
          'match_id', v_match_id,
          'rank', v_rank,
          'amount_inr', 0,
          'href', format('/contests/%s', p_contest_id)
        )
      );
    end loop;
    update public.contests set prizes_settled_at = timezone('utc', now()) where id = p_contest_id;
    return jsonb_build_object('ok', true, 'payouts', 0, 'note', 'no_prize_breakup', 'participants', v_rank);
  end if;

  v_adj := public.contest_prize_adjustment_for_entries(
    v_entry_fee,
    v_participant_count,
    v_gross_collected,
    v_prize_pool,
    v_winner_count
  );
  v_actual_gross := (v_adj->>'actual_gross')::numeric(12, 2);
  v_adjusted_net_pool := (v_adj->>'adjusted_net_pool')::numeric(12, 2);
  v_effective_winners := (v_adj->>'effective_winners')::int;
  v_recomputed := v_adj->'prize_breakup';

  update public.contests
  set
    gross_collected = v_actual_gross,
    prize_pool = v_adjusted_net_pool,
    prize_breakup = v_recomputed
  where id = p_contest_id;

  v_rank := 0;
  for rec in
    select ut.id as team_id, ut.user_id, ut.total_points, ut.created_at
    from public.user_teams ut
    where ut.contest_id = p_contest_id
      and ut.entry_fee_paid_at is not null
    order by ut.total_points desc, ut.created_at asc, ut.id asc
  loop
    v_rank := v_rank + 1;
    v_amt := public.prize_amount_for_rank(v_recomputed, v_rank);
    if v_amt > 0 then
      insert into public.contest_payouts (contest_id, user_id, user_team_id, rank, amount_inr)
      values (p_contest_id, rec.user_id, rec.team_id, v_rank, v_amt);

      update public.profiles
      set wallet_balance = wallet_balance + v_amt
      where id = rec.user_id;

      perform public.create_notification(
        rec.user_id,
        'match_result',
        'Contest winnings',
        format('You won ₹%s (rank %s).', v_amt::text, v_rank),
        jsonb_build_object(
          'contest_id', p_contest_id,
          'match_id', v_match_id,
          'rank', v_rank,
          'amount_inr', v_amt,
          'href', format('/contests/%s', p_contest_id)
        )
      );
      v_paid := v_paid + 1;
    else
      perform public.create_notification(
        rec.user_id,
        'match_result',
        'Contest finished',
        format('Your contest ended. You placed rank %s.', v_rank),
        jsonb_build_object(
          'contest_id', p_contest_id,
          'match_id', v_match_id,
          'rank', v_rank,
          'amount_inr', 0,
          'href', format('/contests/%s', p_contest_id)
        )
      );
    end if;
  end loop;

  update public.contests
  set prizes_settled_at = timezone('utc', now())
  where id = p_contest_id;

  return jsonb_build_object(
    'ok', true,
    'payouts', v_paid,
    'participants', v_rank,
    'adjusted_net_pool', v_adjusted_net_pool,
    'effective_winners', v_effective_winners
  );
end;
$$;

revoke all on function public.settle_contest_prizes(uuid) from public;
grant execute on function public.settle_contest_prizes(uuid) to service_role;

create or replace function public.recompute_contest_prizes_after_join_lock(p_contest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id bigint;
  v_settled timestamptz;
  v_start timestamptz;
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

  select m.start_time into v_start
  from public.matches m
  where m.id = v_match_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'match_not_found');
  end if;

  if timezone('utc', now()) < v_start - interval '1 minute' then
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

-- ---------------------------------------------------------------------------
-- Season leaderboard: only paid contest entries
-- ---------------------------------------------------------------------------

create or replace function public.season_leaderboard(p_season_id bigint)
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  contests_played bigint,
  contests_in_window bigint,
  total_points numeric,
  simple_avg numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with window_matches as (
    select m.id
    from public.matches m
    where m.season_id = p_season_id
      and m.status = 'completed'
      and m.scoring_finalized_at is not null
  ),
  window_contests as (
    select c.id as contest_id
    from public.contests c
    where c.match_id in (select wm.id from window_matches wm)
  ),
  cic as (
    select count(*)::bigint as n from window_contests
  ),
  user_stats as (
    select
      ut.user_id,
      count(*)::bigint as contests_played,
      sum(ut.total_points) as total_points
    from public.user_teams ut
    where ut.contest_id in (select wc.contest_id from window_contests wc)
      and ut.entry_fee_paid_at is not null
    group by ut.user_id
  ),
  with_avg as (
    select
      us.user_id,
      us.contests_played,
      us.total_points,
      (us.total_points / nullif(us.contests_played, 0))::numeric as simple_avg
    from user_stats us
    where us.contests_played >= 1
  )
  select
    wa.user_id,
    coalesce(pu.username, ''::text) as username,
    pu.avatar_url,
    wa.contests_played,
    c.n as contests_in_window,
    wa.total_points,
    wa.simple_avg
  from with_avg wa
  cross join cic c
  left join public.profile_usernames pu on pu.id = wa.user_id
  order by wa.total_points desc, wa.contests_played desc, wa.user_id asc;
$$;

comment on function public.season_leaderboard(bigint) is
  'Aggregates user_teams points across paid entries in contests for completed finalized matches in a season; total points and simple average only.';

grant execute on function public.season_leaderboard(bigint) to authenticated;

notify pgrst, 'reload schema';
