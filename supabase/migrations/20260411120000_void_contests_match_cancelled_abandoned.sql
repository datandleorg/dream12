-- Void unsettled contests and refund entry fees when SportMonks fixture status
-- indicates cancelled or abandoned (matches.sm_fixture_status). Runs via settle_contests cron.

create or replace function public.match_sm_status_is_cancelled_or_abandoned(p_status text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select coalesce(btrim(lower(p_status)), '') <> ''
    and (
      position('aban' in btrim(lower(p_status))) > 0
      or position('abandon' in btrim(lower(p_status))) > 0
      or position('cancl' in btrim(lower(p_status))) > 0
      or position('cancel' in btrim(lower(p_status))) > 0
    );
$$;

comment on function public.match_sm_status_is_cancelled_or_abandoned(text) is
  'True when sm_fixture_status text looks like SportMonks abandoned/cancelled (aligned with match-status-from-sm isCompletedStatus cancel/abandon substrings).';

revoke all on function public.match_sm_status_is_cancelled_or_abandoned(text) from public;
grant execute on function public.match_sm_status_is_cancelled_or_abandoned(text) to service_role;

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
  v_sm_status text;
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

  select m.sm_fixture_status
  into v_sm_status
  from public.matches m
  where m.id = v_match_id;

  if public.match_sm_status_is_cancelled_or_abandoned(v_sm_status) then
    v_refund_count := 0;
    select count(*)::int
    into v_participant_count
    from public.user_teams ut
    where ut.contest_id = p_contest_id
      and ut.entry_fee_paid_at is not null;

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
        'Contest void — match cancelled',
        case
          when v_entry_fee > 0 then 'The match was cancelled or abandoned. Your entry fee has been refunded.'
          else 'The match was cancelled or abandoned. This contest did not run.'
        end,
        jsonb_build_object(
          'contest_id', p_contest_id,
          'match_id', v_match_id,
          'amount_inr', v_entry_fee,
          'void', true,
          'reason', 'match_cancelled_or_abandoned',
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
      'reason', 'match_cancelled_or_abandoned',
      'refunds', v_refund_count,
      'participants', v_participant_count
    );
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
