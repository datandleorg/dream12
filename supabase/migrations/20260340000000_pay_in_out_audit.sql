-- Pay-in / pay-out requests, admin audit log, notifications, profile read for admins

create type public.pay_request_status as enum ('pending', 'approved', 'rejected');

-- RLS-safe admin check (avoids recursive policy on profiles)
create or replace function public.is_requester_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_requester_admin() from public;
grant execute on function public.is_requester_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_audit_log
-- ---------------------------------------------------------------------------
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_actor_idx on public.admin_audit_log (actor_id);

alter table public.admin_audit_log enable row level security;

create policy "admin_audit_log_select_admin"
  on public.admin_audit_log for select to authenticated
  using (public.is_requester_admin());

comment on table public.admin_audit_log is 'Privileged actions; insert from SECURITY DEFINER RPCs only';

-- ---------------------------------------------------------------------------
-- pay_in_requests
-- ---------------------------------------------------------------------------
create table public.pay_in_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount_inr numeric(12, 2) not null,
  utr_ref text not null,
  status public.pay_request_status not null default 'pending',
  user_note text,
  admin_note text,
  company_vpa_snapshot text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  constraint pay_in_requests_amount_positive check (amount_inr > 0)
);

create index pay_in_requests_user_idx on public.pay_in_requests (user_id);
create index pay_in_requests_status_idx on public.pay_in_requests (status);
create index pay_in_requests_created_idx on public.pay_in_requests (created_at desc);

alter table public.pay_in_requests enable row level security;

create policy "pay_in_requests_select_own_or_admin"
  on public.pay_in_requests for select to authenticated
  using (user_id = auth.uid() or public.is_requester_admin());

create policy "pay_in_requests_insert_own_pending"
  on public.pay_in_requests for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
  );

-- ---------------------------------------------------------------------------
-- pay_out_requests
-- ---------------------------------------------------------------------------
create table public.pay_out_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount_inr numeric(12, 2) not null,
  payee_upi text not null,
  status public.pay_request_status not null default 'pending',
  user_note text,
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  constraint pay_out_requests_amount_positive check (amount_inr > 0)
);

create index pay_out_requests_user_idx on public.pay_out_requests (user_id);
create index pay_out_requests_status_idx on public.pay_out_requests (status);
create index pay_out_requests_created_idx on public.pay_out_requests (created_at desc);

alter table public.pay_out_requests enable row level security;

create policy "pay_out_requests_select_own_or_admin"
  on public.pay_out_requests for select to authenticated
  using (user_id = auth.uid() or public.is_requester_admin());

create policy "pay_out_requests_insert_own_pending"
  on public.pay_out_requests for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
  );

-- ---------------------------------------------------------------------------
-- Admins can read all profiles (for admin console without service role reads)
-- ---------------------------------------------------------------------------
create policy "profiles_select_admin"
  on public.profiles for select to authenticated
  using (public.is_requester_admin());

-- ---------------------------------------------------------------------------
-- notify_all_admins (SECURITY DEFINER; called from triggers / RPCs only)
-- ---------------------------------------------------------------------------
create or replace function public.notify_all_admins(
  p_type text,
  p_title text,
  p_body text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if p_type is null or length(trim(p_type)) = 0 then
    return;
  end if;
  for r in select id from public.profiles where is_admin = true
  loop
    insert into public.notifications (user_id, type, title, body, payload)
    values (
      r.id,
      trim(p_type),
      coalesce(nullif(trim(p_title), ''), 'Update'),
      coalesce(nullif(trim(p_body), ''), ''),
      coalesce(p_payload, '{}'::jsonb)
    );
  end loop;
end;
$$;

revoke all on function public.notify_all_admins(text, text, text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Triggers: new pay-in / pay-out → user + admin notifications
-- ---------------------------------------------------------------------------
create or replace function public.tr_pay_in_request_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  select username into v_username from public.profiles where id = new.user_id;
  insert into public.notifications (user_id, type, title, body, payload)
  values (
    new.user_id,
    'pay_in_submitted',
    'Pay-in request received',
    format(
      'We received your request for ₹%s. Reference: %s.',
      trim(to_char(new.amount_inr, 'FM999999999990.00')),
      left(coalesce(new.utr_ref, ''), 80)
    ),
    jsonb_build_object('request_id', new.id, 'href', '/wallet')
  );
  perform public.notify_all_admins(
    'admin_pay_in_pending',
    'New pay-in request',
    format(
      'User %s requested ₹%s (ref %s).',
      coalesce(v_username, 'user'),
      trim(to_char(new.amount_inr, 'FM999999999990.00')),
      left(coalesce(new.utr_ref, ''), 60)
    ),
    jsonb_build_object(
      'request_id', new.id,
      'user_id', new.user_id,
      'amount_inr', new.amount_inr,
      'href', '/admin/pay-in-requests'
    )
  );
  return new;
end;
$$;

create trigger pay_in_requests_notify_created
  after insert on public.pay_in_requests
  for each row
  execute function public.tr_pay_in_request_created();

create or replace function public.tr_pay_out_request_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  select username into v_username from public.profiles where id = new.user_id;
  insert into public.notifications (user_id, type, title, body, payload)
  values (
    new.user_id,
    'pay_out_submitted',
    'Payout request received',
    format(
      'We received your withdrawal request for ₹%s to %s.',
      trim(to_char(new.amount_inr, 'FM999999999990.00')),
      left(coalesce(new.payee_upi, ''), 40)
    ),
    jsonb_build_object('request_id', new.id, 'href', '/wallet')
  );
  perform public.notify_all_admins(
    'admin_pay_out_pending',
    'New pay-out request',
    format(
      'User %s requested ₹%s payout to %s.',
      coalesce(v_username, 'user'),
      trim(to_char(new.amount_inr, 'FM999999999990.00')),
      left(coalesce(new.payee_upi, ''), 40)
    ),
    jsonb_build_object(
      'request_id', new.id,
      'user_id', new.user_id,
      'amount_inr', new.amount_inr,
      'payee_upi', new.payee_upi,
      'href', '/admin/pay-out-requests'
    )
  );
  return new;
end;
$$;

create trigger pay_out_requests_notify_created
  after insert on public.pay_out_requests
  for each row
  execute function public.tr_pay_out_request_created();

-- ---------------------------------------------------------------------------
-- RPCs: pay-in approve / reject
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
begin
  select is_admin into v_admin from public.profiles where id = auth.uid();
  if v_admin is not true then
    raise exception 'not authorized';
  end if;

  select user_id, amount_inr, status into v_user_id, v_amount, v_status
  from public.pay_in_requests where id = p_id for update;

  if not found then
    raise exception 'pay-in request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'pay-in request not pending';
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
    jsonb_build_object('user_id', v_user_id, 'amount_inr', v_amount)
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

create or replace function public.admin_reject_pay_in_request(
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
  from public.pay_in_requests where id = p_id for update;

  if not found then
    raise exception 'pay-in request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'pay-in request not pending';
  end if;

  update public.pay_in_requests
  set
    status = 'rejected',
    resolved_at = timezone('utc', now()),
    resolved_by = auth.uid(),
    admin_note = coalesce(nullif(trim(p_admin_note), ''), admin_note)
  where id = p_id;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'pay_in_request.rejected',
    'pay_in_request',
    p_id::text,
    jsonb_build_object('user_id', v_user_id, 'amount_inr', v_amount, 'admin_note', p_admin_note)
  );

  insert into public.notifications (user_id, type, title, body, payload)
  values (
    v_user_id,
    'pay_in_rejected',
    'Pay-in request declined',
    coalesce(
      nullif(trim(p_admin_note), ''),
      format('Your pay-in request for ₹%s was not approved.', trim(to_char(v_amount, 'FM999999999990.00')))
    ),
    jsonb_build_object('request_id', p_id, 'href', '/wallet')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: pay-out approve / reject
-- ---------------------------------------------------------------------------
create or replace function public.admin_approve_pay_out_request(p_id uuid)
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
begin
  select is_admin into v_admin from public.profiles where id = auth.uid();
  if v_admin is not true then
    raise exception 'not authorized';
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
    resolved_at = timezone('utc', now()),
    resolved_by = auth.uid()
  where id = p_id;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'pay_out_request.approved',
    'pay_out_request',
    p_id::text,
    jsonb_build_object('user_id', v_user_id, 'amount_inr', v_amount)
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

grant execute on function public.admin_approve_pay_in_request(uuid) to authenticated;
grant execute on function public.admin_reject_pay_in_request(uuid, text) to authenticated;
grant execute on function public.admin_approve_pay_out_request(uuid) to authenticated;
grant execute on function public.admin_reject_pay_out_request(uuid, text) to authenticated;

-- Break-glass wallet adjustment (admin only)
create or replace function public.admin_adjust_wallet_balance(
  p_user_id uuid,
  p_delta_inr numeric,
  p_reason text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
  v_new_bal numeric(12, 2);
begin
  select is_admin into v_admin from public.profiles where id = auth.uid();
  if v_admin is not true then
    raise exception 'not authorized';
  end if;
  if p_delta_inr is null or p_delta_inr = 0 then
    raise exception 'invalid delta';
  end if;

  update public.profiles
  set wallet_balance = wallet_balance + p_delta_inr
  where id = p_user_id
  returning wallet_balance into v_new_bal;

  if not found then
    raise exception 'profile not found';
  end if;
  if v_new_bal < 0 then
    raise exception 'wallet balance would be negative';
  end if;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'wallet.adjusted',
    'profile',
    p_user_id::text,
    jsonb_build_object('delta_inr', p_delta_inr, 'new_balance', v_new_bal, 'reason', p_reason)
  );

  return v_new_bal;
end;
$$;

revoke all on function public.admin_adjust_wallet_balance(uuid, numeric, text) from public;
grant execute on function public.admin_adjust_wallet_balance(uuid, numeric, text) to authenticated;
grant execute on function public.admin_adjust_wallet_balance(uuid, numeric, text) to service_role;

-- ---------------------------------------------------------------------------
-- Legacy transactions RPCs: add audit rows
-- ---------------------------------------------------------------------------
create or replace function public.admin_approve_transaction(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_amount numeric(12,2);
  v_status public.transaction_status;
  v_admin boolean;
begin
  select is_admin into v_admin from public.profiles where id = auth.uid();
  if v_admin is not true then
    raise exception 'not authorized';
  end if;

  select user_id, amount, status into v_user_id, v_amount, v_status
  from public.transactions where id = p_transaction_id for update;

  if not found then
    raise exception 'transaction not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'transaction not pending';
  end if;

  update public.profiles
  set wallet_balance = wallet_balance + v_amount
  where id = v_user_id;

  update public.transactions
  set status = 'approved'
  where id = p_transaction_id;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'transaction.approved',
    'transaction',
    p_transaction_id::text,
    jsonb_build_object('user_id', v_user_id, 'amount', v_amount)
  );
end;
$$;

create or replace function public.admin_reject_transaction(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.transaction_status;
  v_admin boolean;
  v_user_id uuid;
  v_amount numeric(12,2);
begin
  select is_admin into v_admin from public.profiles where id = auth.uid();
  if v_admin is not true then
    raise exception 'not authorized';
  end if;

  select user_id, amount, status into v_user_id, v_amount, v_status
  from public.transactions where id = p_transaction_id for update;
  if not found then
    raise exception 'transaction not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'transaction not pending';
  end if;

  update public.transactions set status = 'rejected' where id = p_transaction_id;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'transaction.rejected',
    'transaction',
    p_transaction_id::text,
    jsonb_build_object('user_id', v_user_id, 'amount', v_amount)
  );
end;
$$;
