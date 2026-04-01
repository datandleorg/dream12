-- Unfilled spots: void + refund if <2 teams; else scale prize pool to actual entries and rebuild slabs (Dream11-style weights).

create or replace function public.build_prize_slabs_numeric(p_net_pool numeric, p_winner_count int)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  i int;
  wsum numeric := 0;
  raw_i numeric;
  amounts numeric[];
  others_sum numeric := 0;
  first_amt numeric;
  result jsonb := '[]'::jsonb;
begin
  if p_net_pool is null or p_net_pool <= 0 then
    return '[]'::jsonb;
  end if;
  if p_winner_count is null or p_winner_count < 1 then
    return '[]'::jsonb;
  end if;

  if p_winner_count = 1 then
    return jsonb_build_array(
      jsonb_build_object(
        'rank_from', 1,
        'rank_to', 1,
        'amount', round(p_net_pool, 2)
      )
    );
  end if;

  for i in 1..p_winner_count loop
    wsum := wsum + (1.0::numeric / power(i::numeric, 1.15));
  end loop;

  amounts := array_fill(0::numeric, array[p_winner_count]);

  for i in 2..p_winner_count loop
    raw_i := (p_net_pool * (1.0::numeric / power(i::numeric, 1.15))) / wsum;
    amounts[i] := floor(raw_i);
  end loop;

  for i in 2..p_winner_count loop
    others_sum := others_sum + amounts[i];
  end loop;

  first_amt := round(p_net_pool - others_sum, 2);
  amounts[1] := first_amt;

  for i in 1..p_winner_count loop
    result := result || jsonb_build_array(
      jsonb_build_object(
        'rank_from', i,
        'rank_to', i,
        'amount', round(amounts[i], 2)
      )
    );
  end loop;

  return result;
end;
$$;

revoke all on function public.build_prize_slabs_numeric(numeric, int) from public;

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

  -- Fewer than 2 teams: void contest, refund entry fees, no prize payouts
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

  v_actual_gross := round(v_entry_fee * v_participant_count, 2);
  if v_gross_collected > 0 then
    v_adjusted_net_pool := round(v_prize_pool * (v_actual_gross / v_gross_collected), 2);
  else
    v_adjusted_net_pool := 0;
  end if;

  v_effective_winners := least(v_winner_count, v_participant_count);
  if v_effective_winners < 1 then
    v_effective_winners := 1;
  end if;

  v_recomputed := public.build_prize_slabs_numeric(v_adjusted_net_pool, v_effective_winners);

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
