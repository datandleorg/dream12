-- Razorpay wallet top-ups: nullable UTR, payment ids, audit table, atomic finalize RPC.

-- 1) transactions: manual_utr vs razorpay rows
alter table public.transactions
  alter column utr_number drop not null;

alter table public.transactions
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists source text not null default 'manual_utr';

alter table public.transactions
  add constraint transactions_source_check check (
    (
      source = 'manual_utr'
      and utr_number is not null
      and razorpay_payment_id is null
    )
    or (
      source = 'razorpay'
      and razorpay_payment_id is not null
      and utr_number is null
    )
  );

comment on column public.transactions.source is 'manual_utr: UTR pending admin; razorpay: instant top-up';

-- Multiple NULL razorpay_payment_id allowed (legacy manual rows); non-null must be unique.
alter table public.transactions
  add constraint transactions_razorpay_payment_id_key unique (razorpay_payment_id);

-- 2) Order mapping (server-written; RLS enabled with no policies = deny for anon/auth JWT)
create table public.razorpay_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  razorpay_order_id text not null,
  amount_inr numeric(12, 2) not null,
  amount_paise bigint not null,
  currency text not null default 'INR',
  status text not null default 'created',
  created_at timestamptz not null default now()
);

create unique index razorpay_orders_order_id_key on public.razorpay_orders (razorpay_order_id);
create index razorpay_orders_user_idx on public.razorpay_orders (user_id);

alter table public.razorpay_orders enable row level security;

-- 3) Idempotent credit (service_role only)
create or replace function public.finalize_razorpay_topup(
  p_user_id uuid,
  p_amount_inr numeric(12, 2),
  p_order_id text,
  p_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
begin
  if p_amount_inr is null or p_amount_inr <= 0 then
    raise exception 'invalid amount';
  end if;
  if p_order_id is null or length(trim(p_order_id)) = 0
     or p_payment_id is null or length(trim(p_payment_id)) = 0 then
    raise exception 'invalid order or payment id';
  end if;

  insert into public.transactions (
    user_id,
    amount,
    utr_number,
    status,
    source,
    razorpay_order_id,
    razorpay_payment_id
  )
  values (
    p_user_id,
    p_amount_inr,
    null,
    'approved',
    'razorpay',
    p_order_id,
    p_payment_id
  )
  on conflict (razorpay_payment_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  update public.profiles
  set wallet_balance = wallet_balance + p_amount_inr
  where id = p_user_id;

  if not found then
    raise exception 'profile not found';
  end if;

  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;

revoke all on function public.finalize_razorpay_topup(uuid, numeric, text, text) from public;
grant execute on function public.finalize_razorpay_topup(uuid, numeric, text, text) to service_role;

comment on function public.finalize_razorpay_topup is 'Server-only (service role): credit wallet once per razorpay_payment_id';
