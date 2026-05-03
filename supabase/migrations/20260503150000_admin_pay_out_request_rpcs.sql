-- Self-contained RPCs for environments where init migrations were not fully applied.
-- Fixes PostgREST: "Could not find the function public.admin_approve_pay_out_request(...)"

create or replace function public.is_valid_upi_transaction_ref(p_ref text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_ref is not null
    and char_length(trim(p_ref)) between 8 and 80
    and trim(p_ref) ~ '^[0-9A-Za-z-]+$';
$$;

comment on function public.is_valid_upi_transaction_ref(text) is
  'UPI/bank transaction reference: 8–80 chars after trim; letters, digits, hyphen only.';

create or replace function public.admin_approve_pay_out_request(
  p_id uuid,
  p_payout_utr_ref text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
  v_user_id uuid;
  v_amount numeric(12, 2);
  v_status public.pay_request_status;
  v_balance numeric(12, 2);
  v_utr text;
begin
  select is_admin into v_admin from public.profiles where id = auth.uid();
  if v_admin is not true then
    raise exception 'not authorized';
  end if;

  v_utr := trim(p_payout_utr_ref);
  if not public.is_valid_upi_transaction_ref(v_utr) then
    raise exception
      'cannot approve: enter the payout UTR / transaction reference from your bank app (8–80 characters, letters, digits, hyphens only)';
  end if;

  select user_id, amount_inr, status into v_user_id, v_amount, v_status
  from public.pay_out_requests where id = p_id for update;

  if not found then
    raise exception 'pay-out request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'pay-out request not pending';
  end if;

  select wallet_balance into v_balance from public.profiles where id = v_user_id for update;
  if v_balance < v_amount then
    raise exception 'insufficient wallet balance';
  end if;

  update public.profiles
  set wallet_balance = wallet_balance - v_amount
  where id = v_user_id;

  update public.pay_out_requests
  set
    status = 'approved',
    payout_utr_ref = v_utr,
    resolved_at = timezone('utc', now()),
    resolved_by = auth.uid()
  where id = p_id;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'pay_out_request.approved',
    'pay_out_request',
    p_id::text,
    jsonb_build_object('user_id', v_user_id, 'amount_inr', v_amount, 'payout_utr_ref', v_utr)
  );

  insert into public.notifications (user_id, type, title, body, payload)
  values (
    v_user_id,
    'pay_out_approved',
    'Payout approved',
    format(
      '₹%s was debited from your wallet. Complete the UPI transfer to your registered VPA.',
      trim(to_char(v_amount, 'FM999999999990.00'))
    ),
    jsonb_build_object('request_id', p_id, 'amount_inr', v_amount, 'href', '/wallet')
  );
end;
$$;

create or replace function public.admin_reject_pay_out_request(
  p_id uuid,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
  v_user_id uuid;
  v_status public.pay_request_status;
  v_amount numeric(12, 2);
begin
  select is_admin into v_admin from public.profiles where id = auth.uid();
  if v_admin is not true then
    raise exception 'not authorized';
  end if;

  select user_id, status, amount_inr into v_user_id, v_status, v_amount
  from public.pay_out_requests where id = p_id for update;

  if not found then
    raise exception 'pay-out request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'pay-out request not pending';
  end if;

  update public.pay_out_requests
  set
    status = 'rejected',
    resolved_at = timezone('utc', now()),
    resolved_by = auth.uid(),
    admin_note = coalesce(nullif(trim(p_admin_note), ''), admin_note)
  where id = p_id;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'pay_out_request.rejected',
    'pay_out_request',
    p_id::text,
    jsonb_build_object('user_id', v_user_id, 'amount_inr', v_amount, 'admin_note', p_admin_note)
  );

  insert into public.notifications (user_id, type, title, body, payload)
  values (
    v_user_id,
    'pay_out_rejected',
    'Payout request declined',
    coalesce(
      nullif(trim(p_admin_note), ''),
      format('Your payout request for ₹%s was not approved.', trim(to_char(v_amount, 'FM999999999990.00')))
    ),
    jsonb_build_object('request_id', p_id, 'href', '/wallet')
  );
end;
$$;

grant execute on function public.admin_approve_pay_out_request(uuid, text) to authenticated;
grant execute on function public.admin_reject_pay_out_request(uuid, text) to authenticated;

notify pgrst, 'reload schema';
