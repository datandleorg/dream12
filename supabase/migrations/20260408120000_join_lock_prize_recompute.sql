-- Shared scaling math for actual entry count vs planned gross; used at settlement and after join lock (display).

create or replace function public.contest_prize_adjustment_for_entries(
  p_entry_fee numeric,
  p_participant_count int,
  p_gross_collected numeric,
  p_prize_pool numeric,
  p_winner_count int
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_actual_gross numeric(12, 2);
  v_adjusted_net_pool numeric(12, 2);
  v_effective_winners int;
  v_recomputed jsonb;
begin
  v_actual_gross := round(coalesce(p_entry_fee, 0) * greatest(coalesce(p_participant_count, 0), 0), 2);
  if coalesce(p_gross_collected, 0) > 0 then
    v_adjusted_net_pool := round(coalesce(p_prize_pool, 0) * (v_actual_gross / p_gross_collected), 2);
  else
    v_adjusted_net_pool := 0;
  end if;

  v_effective_winners := least(coalesce(p_winner_count, 1), greatest(coalesce(p_participant_count, 0), 0));
  if v_effective_winners < 1 then
    v_effective_winners := 1;
  end if;

  v_recomputed := public.build_prize_slabs_numeric(v_adjusted_net_pool, v_effective_winners);

  return jsonb_build_object(
    'actual_gross', v_actual_gross,
    'adjusted_net_pool', v_adjusted_net_pool,
    'effective_winners', v_effective_winners,
    'prize_breakup', v_recomputed
  );
end;
$$;

revoke all on function public.contest_prize_adjustment_for_entries(numeric, int, numeric, numeric, int) from public;

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
  where ut.contest_id = p_contest_id;

  if v_participant_count < 2 then
    for rec in
      select ut.user_id
      from public.user_teams ut
      where ut.contest_id = p_contest_id
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

-- After team join lock (1 min before start): persist scaled pool + slabs for UI only (no payouts).

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
  where ut.contest_id = p_contest_id;

  -- Let settlement handle void messaging; avoid flashing zero pool in UI.
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
    and timezone('utc', now()) >= m.start_time - interval '1 minute'
    and c.prize_breakup is not null
    and jsonb_typeof(c.prize_breakup) = 'array'
  order by m.start_time asc
  limit greatest(coalesce(p_limit, 50), 1);
$$;

revoke all on function public.contest_ids_eligible_for_join_lock_prize_recompute(int) from public;
grant execute on function public.contest_ids_eligible_for_join_lock_prize_recompute(int) to service_role;
