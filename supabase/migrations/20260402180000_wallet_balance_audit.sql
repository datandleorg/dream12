-- Append-only audit of profile wallet_balance changes (Postgres-side mutations).

create table public.wallet_balance_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  previous_balance numeric(12, 2) not null,
  new_balance numeric(12, 2) not null,
  changed_at timestamptz not null default now()
);

create index wallet_balance_audit_user_changed_idx
  on public.wallet_balance_audit (user_id, changed_at desc);

comment on table public.wallet_balance_audit is
  'Row inserted when profiles.wallet_balance changes; populated by trigger.';

create or replace function public.log_wallet_balance_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.wallet_balance is distinct from new.wallet_balance then
    insert into public.wallet_balance_audit (user_id, previous_balance, new_balance)
    values (new.id, old.wallet_balance, new.wallet_balance);
  end if;
  return new;
end;
$$;

create trigger profiles_wallet_balance_audit
  after update of wallet_balance on public.profiles
  for each row
  execute function public.log_wallet_balance_change();

alter table public.wallet_balance_audit enable row level security;

create policy wallet_balance_audit_select_admin
  on public.wallet_balance_audit
  for select
  to authenticated
  using (
    (select p.is_admin from public.profiles p where p.id = (select auth.uid())) is true
  );
