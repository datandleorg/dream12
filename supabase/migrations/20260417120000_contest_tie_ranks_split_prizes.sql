-- Competition rank on total_points (ties share rank); pool ordinal prizes for the tie span and split evenly (paise remainder to earliest created_at, id).

create or replace function public.prize_total_for_ordinals(p_breakup jsonb, p_start_rank int, p_count int)
returns numeric
language sql
immutable
parallel safe
set search_path = public
as $$
  select coalesce(
    (
      select sum(public.prize_amount_for_rank(p_breakup, p_start_rank + s.i - 1))::numeric(12, 2)
      from generate_series(1, greatest(0, p_count)) as s(i)
    ),
    0::numeric(12, 2)
  );
$$;

comment on function public.prize_total_for_ordinals(jsonb, int, int) is
  'Sum of prize_amount_for_rank for ordinals p_start_rank .. p_start_rank + p_count - 1 (tie pooling).';

revoke all on function public.prize_total_for_ordinals(jsonb, int, int) from public;
grant execute on function public.prize_total_for_ordinals(jsonb, int, int) to service_role;

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
  v_rnk record;
  v_mem record;
  v_t int;
  v_pool numeric(12, 2);
  v_pool_cents bigint;
  v_each bigint;
  v_rem int;
  v_idx int;
  v_comp_rank int;
  v_tie_note text;
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
    for rec in
      select sub.user_id, sub.comp_rank
      from (
        select
          ut.user_id,
          ut.id as team_id,
          ut.created_at,
          rank() over (order by ut.total_points desc)::int as comp_rank
        from public.user_teams ut
        where ut.contest_id = p_contest_id
          and ut.entry_fee_paid_at is not null
      ) sub
      order by sub.comp_rank asc, sub.created_at asc, sub.team_id asc
    loop
      perform public.create_notification(
        rec.user_id,
        'match_result',
        'Contest closed',
        format('Final standings are in. You finished rank %s.', rec.comp_rank),
        jsonb_build_object(
          'contest_id', p_contest_id,
          'match_id', v_match_id,
          'rank', rec.comp_rank,
          'amount_inr', 0,
          'href', format('/contests/%s', p_contest_id)
        )
      );
    end loop;
    update public.contests set prizes_settled_at = timezone('utc', now()) where id = p_contest_id;
    return jsonb_build_object('ok', true, 'payouts', 0, 'note', 'no_prize_breakup', 'participants', v_participant_count);
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

  for v_rnk in
    select distinct d.comp_rank
    from (
      select rank() over (order by ut.total_points desc)::int as comp_rank
      from public.user_teams ut
      where ut.contest_id = p_contest_id
        and ut.entry_fee_paid_at is not null
    ) d
    order by d.comp_rank
  loop
    v_comp_rank := v_rnk.comp_rank;

    select count(*)::int
    into v_t
    from (
      select rank() over (order by ut.total_points desc)::int as cr
      from public.user_teams ut
      where ut.contest_id = p_contest_id
        and ut.entry_fee_paid_at is not null
    ) z
    where z.cr = v_comp_rank;

    v_pool := public.prize_total_for_ordinals(v_recomputed, v_comp_rank, v_t);
    v_pool_cents := round(v_pool * 100)::bigint;
    v_each := v_pool_cents / v_t;
    v_rem := (v_pool_cents % v_t)::int;
    v_idx := 0;

    v_tie_note := case when v_t > 1 then ' (shared tie)' else '' end;

    for v_mem in
      select sub.team_id, sub.user_id
      from (
        select
          ut.id as team_id,
          ut.user_id,
          rank() over (order by ut.total_points desc)::int as cr,
          ut.created_at,
          ut.id as utid
        from public.user_teams ut
        where ut.contest_id = p_contest_id
          and ut.entry_fee_paid_at is not null
      ) sub
      where sub.cr = v_comp_rank
      order by sub.created_at asc, sub.utid asc
    loop
      v_amt := (v_each + case when v_idx < v_rem then 1 else 0 end)::numeric / 100;
      v_idx := v_idx + 1;

      if v_amt > 0 then
        insert into public.contest_payouts (contest_id, user_id, user_team_id, rank, amount_inr)
        values (p_contest_id, v_mem.user_id, v_mem.team_id, v_comp_rank, v_amt);

        update public.profiles
        set wallet_balance = wallet_balance + v_amt
        where id = v_mem.user_id;

        perform public.create_notification(
          v_mem.user_id,
          'match_result',
          'Contest winnings',
          format('You won ₹%s (rank %s%s).', v_amt::text, v_comp_rank::text, v_tie_note),
          jsonb_build_object(
            'contest_id', p_contest_id,
            'match_id', v_match_id,
            'rank', v_comp_rank,
            'amount_inr', v_amt,
            'href', format('/contests/%s', p_contest_id)
          )
        );
        v_paid := v_paid + 1;
      else
        perform public.create_notification(
          v_mem.user_id,
          'match_result',
          'Contest finished',
          format('Your contest ended. You placed rank %s.', v_comp_rank),
          jsonb_build_object(
            'contest_id', p_contest_id,
            'match_id', v_match_id,
            'rank', v_comp_rank,
            'amount_inr', 0,
            'href', format('/contests/%s', p_contest_id)
          )
        );
      end if;
    end loop;
  end loop;

  update public.contests
  set prizes_settled_at = timezone('utc', now())
  where id = p_contest_id;

  return jsonb_build_object(
    'ok', true,
    'payouts', v_paid,
    'participants', v_participant_count,
    'adjusted_net_pool', v_adjusted_net_pool,
    'effective_winners', v_effective_winners
  );
end;
$$;

revoke all on function public.settle_contest_prizes(uuid) from public;
grant execute on function public.settle_contest_prizes(uuid) to service_role;
