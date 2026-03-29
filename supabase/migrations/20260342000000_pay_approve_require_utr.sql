-- Admin cannot approve pay-in / pay-out without a plausible UPI/bank transaction reference.

create or replace function public.is_valid_upi_transaction_ref(p_ref text)
returns boolean
language sql
immutable
as $$
  select p_ref is not null
    and char_length(trim(p_ref)) between 8 and 80
    and trim(p_ref) ~ '^[0-9A-Za-z-]+$';
$$;

comment on function public.is_valid_upi_transaction_ref(text) is
  'UPI/bank transaction reference: 8–80 chars after trim; letters, digits, hyphen only.';

alter table public.pay_out_requests
  add column if not exists payout_utr_ref text;

comment on column public.pay_out_requests.payout_utr_ref is
  'UTR / reference entered by admin when approving after sending funds to payee UPI.';

-- ---------------------------------------------------------------------------
-- Pay-in approve: user-submitted utr_ref must pass validation
-- ---------------------------------------------------------------------------
create or replace function public.admin_approve_pay_in_request(p_id uuid)
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
  v_utr text;
begin
  select is_admin into v_admin from public.profiles where id = auth.uid();
  if v_admin is not true then
    raise exception 'not authorized';
  end if;

  select user_id, amount_inr, status, utr_ref
  into v_user_id, v_amount, v_status, v_utr
  from public.pay_in_requests where id = p_id for update;

  if not found then
    raise exception 'pay-in request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'pay-in request not pending';
  end if;

  if not public.is_valid_upi_transaction_ref(v_utr) then
    raise exception
      'cannot approve: UTR / transaction reference must be 8–80 characters (letters, digits, hyphens only)';
  end if;

  update public.profiles
  set wallet_balance = wallet_balance + v_amount
  where id = v_user_id;

  update public.pay_in_requests
  set
    status = 'approved',
    resolved_at = timezone('utc', now()),
    resolved_by = auth.uid()
  where id = p_id;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'pay_in_request.approved',
    'pay_in_request',
    p_id::text,
    jsonb_build_object('user_id', v_user_id, 'amount_inr', v_amount, 'utr_ref', trim(v_utr))
  );

  insert into public.notifications (user_id, type, title, body, payload)
  values (
    v_user_id,
    'pay_in_approved',
    'Wallet credited',
    format('₹%s was added to your wallet.', trim(to_char(v_amount, 'FM999999999990.00'))),
    jsonb_build_object('request_id', p_id, 'amount_inr', v_amount, 'href', '/wallet')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Pay-out approve: admin must supply payout UTR after sending money
-- ---------------------------------------------------------------------------
drop function if exists public.admin_approve_pay_out_request(uuid);

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

grant execute on function public.admin_approve_pay_out_request(uuid, text) to authenticated;
