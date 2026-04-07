-- Creator-only: delete a user-created contest before team lock, refund paid entry fees, cascade teams.

create or replace function public.delete_user_contest(p_contest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match_id bigint;
  v_start timestamptz;
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

  select m.start_time into v_start
  from public.matches m
  where m.id = v_match_id;
  if not found then
    raise exception 'match not found';
  end if;

  if timezone('utc', now()) >= v_start - interval '1 minute' then
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
