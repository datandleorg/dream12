-- Fantasy Cricket — core schema, RLS, profile trigger, admin transaction RPCs

-- Extensions
create extension if not exists "pgcrypto";

-- Enums
create type public.match_status as enum ('upcoming', 'live', 'completed');
create type public.player_role as enum ('BAT', 'BOWL', 'AR', 'WK');
create type public.transaction_status as enum ('pending', 'approved', 'rejected');

-- Profiles (1:1 with auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  wallet_balance numeric(12, 2) not null default 0,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.matches (
  id bigint primary key,
  name text not null,
  start_time timestamptz not null,
  status public.match_status not null default 'upcoming'
);

create index matches_start_time_idx on public.matches (start_time);
create index matches_status_idx on public.matches (status);

-- Squad per match; internal UUID for FKs from roster/C/VC
create table public.players (
  id uuid primary key default gen_random_uuid(),
  sportmonks_id bigint,
  match_id bigint not null references public.matches (id) on delete cascade,
  name text not null,
  team text not null,
  role public.player_role not null,
  credit_value numeric(4, 1) not null
);

create unique index players_match_sportmonks_uidx
  on public.players (match_id, sportmonks_id)
  where sportmonks_id is not null;

create index players_match_id_idx on public.players (match_id);

create table public.contests (
  id uuid primary key default gen_random_uuid(),
  match_id bigint not null references public.matches (id) on delete cascade,
  name text,
  entry_fee numeric(12, 2) not null default 0,
  prize_pool numeric(12, 2) not null default 0,
  max_participants int not null default 100
);

create index contests_match_id_idx on public.contests (match_id);

create table public.user_teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  contest_id uuid not null references public.contests (id) on delete cascade,
  match_id bigint not null references public.matches (id) on delete cascade,
  captain_id uuid references public.players (id) on delete set null,
  vice_captain_id uuid references public.players (id) on delete set null,
  total_points numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, contest_id)
);

create index user_teams_contest_idx on public.user_teams (contest_id);
create index user_teams_user_idx on public.user_teams (user_id);

create table public.team_roster (
  team_id uuid not null references public.user_teams (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  primary key (team_id, player_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12, 2) not null,
  utr_number text not null,
  status public.transaction_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transactions_user_idx on public.transactions (user_id);
create index transactions_status_idx on public.transactions (status);

-- Realtime
alter publication supabase_realtime add table public.user_teams;

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger user_teams_updated_at before update on public.user_teams
  for each row execute function public.set_updated_at();
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- New auth user → profile (username from raw_user_meta_data)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uname text;
begin
  uname := coalesce(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1),
    'user_' || substr(new.id::text, 1, 8)
  );
  insert into public.profiles (id, username)
  values (new.id, uname)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin: approve transaction (atomic wallet credit)
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
begin
  select is_admin into v_admin from public.profiles where id = auth.uid();
  if v_admin is not true then
    raise exception 'not authorized';
  end if;

  select status into v_status from public.transactions where id = p_transaction_id for update;
  if not found then
    raise exception 'transaction not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'transaction not pending';
  end if;

  update public.transactions set status = 'rejected' where id = p_transaction_id;
end;
$$;

grant execute on function public.admin_approve_transaction(uuid) to authenticated;
grant execute on function public.admin_reject_transaction(uuid) to authenticated;

-- RLS
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.players enable row level security;
alter table public.contests enable row level security;
alter table public.user_teams enable row level security;
alter table public.team_roster enable row level security;
alter table public.transactions enable row level security;

-- Profiles: read own; update username only (not wallet / is_admin)
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own_username" on public.profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    and wallet_balance = (select p.wallet_balance from public.profiles p where p.id = auth.uid())
    and is_admin = (select p.is_admin from public.profiles p where p.id = auth.uid())
  );

-- Matches & players & contests: readable by authenticated users
create policy "matches_read_auth" on public.matches
  for select to authenticated using (true);

create policy "players_read_auth" on public.players
  for select to authenticated using (true);

create policy "contests_read_auth" on public.contests
  for select to authenticated using (true);

-- User teams: authenticated users can read all teams (leaderboard / contest view)
create policy "user_teams_select_auth" on public.user_teams
  for select to authenticated using (true);

create policy "user_teams_insert_own" on public.user_teams
  for insert to authenticated with check (user_id = auth.uid());

create policy "user_teams_update_own" on public.user_teams
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "user_teams_delete_own" on public.user_teams
  for delete to authenticated using (user_id = auth.uid());

-- Team roster
create policy "roster_select" on public.team_roster
  for select to authenticated using (
    exists (select 1 from public.user_teams ut where ut.id = team_id)
  );

create policy "roster_insert_own_team" on public.team_roster
  for insert to authenticated with check (
    exists (select 1 from public.user_teams ut where ut.id = team_id and ut.user_id = auth.uid())
  );

create policy "roster_delete_own_team" on public.team_roster
  for delete to authenticated using (
    exists (select 1 from public.user_teams ut where ut.id = team_id and ut.user_id = auth.uid())
  );

-- Transactions: user sees own; insert own pending
create policy "transactions_select_own" on public.transactions
  for select to authenticated using (user_id = auth.uid() or exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  ));

create policy "transactions_insert_own" on public.transactions
  for insert to authenticated with check (user_id = auth.uid() and status = 'pending');

-- No client updates on transactions (admin uses RPC)

-- Service role bypasses RLS for cron / server

comment on table public.profiles is 'Wallet and display; use RPC for admin approvals';
comment on function public.admin_approve_transaction is 'Admin only; credits wallet and marks approved';
