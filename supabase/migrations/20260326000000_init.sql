-- Dream12 — full schema (single migration). No seed data.
-- After your first Auth user exists, run supabase/scripts/bootstrap-admin.sql to set is_admin.
-- Wipe app data: supabase/scripts/flush-all-data.sql

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums & types
-- ---------------------------------------------------------------------------
create type public.match_status as enum ('upcoming', 'live', 'completed');
create type public.player_role as enum ('BAT', 'BOWL', 'AR', 'WK');
create type public.transaction_status as enum ('pending', 'approved', 'rejected');
create type public.pay_request_status as enum ('pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- SportMonks reference
-- ---------------------------------------------------------------------------
create table public.sm_leagues (
  id bigint primary key,
  name text not null,
  code text,
  image_path text,
  league_type text,
  updated_at timestamptz
);

create table public.sm_seasons (
  id bigint primary key,
  league_id bigint not null references public.sm_leagues (id) on delete cascade,
  name text not null,
  code text,
  starting_at timestamptz,
  ending_at timestamptz,
  is_current boolean not null default false,
  updated_at timestamptz
);

create index sm_seasons_league_id_idx on public.sm_seasons (league_id);
create index sm_seasons_league_current_idx on public.sm_seasons (league_id, is_current);

create table public.sm_teams (
  id bigint primary key,
  name text not null,
  short_code text,
  image_path text,
  updated_at timestamptz
);

create table public.sm_season_team (
  season_id bigint not null references public.sm_seasons (id) on delete cascade,
  team_id bigint not null references public.sm_teams (id) on delete cascade,
  primary key (season_id, team_id)
);

create index sm_season_team_team_idx on public.sm_season_team (team_id);

create table public.sm_season_squad (
  season_id bigint not null references public.sm_seasons (id) on delete cascade,
  team_id bigint not null references public.sm_teams (id) on delete cascade,
  player_sportmonks_id bigint not null,
  player_name text not null,
  position_label text,
  photo_url text,
  updated_at timestamptz not null default now(),
  primary key (season_id, team_id, player_sportmonks_id)
);

create index sm_season_squad_season_team_idx on public.sm_season_squad (season_id, team_id);

create table public.sm_venues (
  id bigint primary key,
  country_id bigint,
  name text not null,
  city text,
  image_path text,
  capacity int,
  floodlight boolean,
  updated_at timestamptz
);

create table public.sm_stages (
  id bigint primary key,
  league_id bigint not null references public.sm_leagues (id) on delete cascade,
  season_id bigint not null references public.sm_seasons (id) on delete cascade,
  name text not null,
  code text,
  stage_type text,
  updated_at timestamptz
);

create index sm_stages_season_id_idx on public.sm_stages (season_id);
create index sm_stages_league_id_idx on public.sm_stages (league_id);

-- ---------------------------------------------------------------------------
-- Core app tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  wallet_balance numeric(12, 2) not null default 1000,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.matches (
  id bigint primary key,
  name text not null,
  start_time timestamptz not null,
  status public.match_status not null default 'upcoming',
  tournament_name text,
  team_a text,
  team_b text,
  team_a_logo_url text,
  team_b_logo_url text,
  league_id bigint references public.sm_leagues (id) on delete set null,
  season_id bigint references public.sm_seasons (id) on delete set null,
  localteam_id bigint,
  visitorteam_id bigint,
  venue_id bigint references public.sm_venues (id) on delete set null,
  stage_id bigint references public.sm_stages (id) on delete set null,
  match_format text,
  live_snapshot jsonb,
  live_snapshot_at timestamptz,
  sm_fixture_status text,
  scoring_finalized_at timestamptz,
  lineup_notified_at timestamptz
);

create index matches_start_time_idx on public.matches (start_time);
create index matches_status_idx on public.matches (status);
create index matches_season_id_idx on public.matches (season_id);
create index matches_league_id_idx on public.matches (league_id);
create index matches_venue_id_idx on public.matches (venue_id);
create index matches_stage_id_idx on public.matches (stage_id);

comment on column public.matches.league_id is 'SportMonks league id (e.g. IPL).';
comment on column public.matches.season_id is 'SportMonks season id for this fixture.';
comment on column public.matches.localteam_id is 'SportMonks team id (home/first).';
comment on column public.matches.visitorteam_id is 'SportMonks team id (away/second).';
comment on column public.matches.venue_id is 'SportMonks venue id.';
comment on column public.matches.stage_id is 'SportMonks stage id.';
comment on column public.matches.match_format is 'SportMonks fixture type e.g. T20, ODI.';
comment on column public.matches.live_snapshot is 'Normalized live score / scoreboard JSON for fast reads.';
comment on column public.matches.live_snapshot_at is 'When live_snapshot was last written.';
comment on column public.matches.sm_fixture_status is 'SportMonks fixture status label for display.';
comment on column public.matches.scoring_finalized_at is 'Set after final fantasy points recompute for completed matches (cron).';
comment on column public.matches.lineup_notified_at is 'Set when users were notified that playing XI is available (once per match).';

create table public.players (
  id uuid primary key default gen_random_uuid(),
  sportmonks_id bigint,
  match_id bigint not null references public.matches (id) on delete cascade,
  name text not null,
  team text not null,
  role public.player_role not null,
  credit_value numeric(4, 1) not null,
  season_points int not null default 0,
  selection_pct numeric(5, 2),
  played_last_match boolean not null default false,
  photo_url text,
  in_playing_xi boolean,
  constraint players_match_sportmonks_key unique (match_id, sportmonks_id)
);

create index players_match_id_idx on public.players (match_id);
create index players_match_playing_xi_idx on public.players (match_id) where in_playing_xi is not null;

comment on column public.players.in_playing_xi is
  'Set when fixture lineup sync runs: true if in XI, false if in match pool but not in XI, null before lineup or mock data.';

create table public.contests (
  id uuid primary key default gen_random_uuid(),
  match_id bigint not null references public.matches (id) on delete cascade,
  name text,
  entry_fee numeric(12, 2) not null default 0,
  prize_pool numeric(12, 2) not null default 0,
  max_participants int not null default 100,
  created_by uuid references public.profiles (id) on delete set null,
  creator_joined_at timestamptz,
  winner_count int not null default 1,
  prize_breakup jsonb,
  is_flexible boolean not null default true,
  gross_collected numeric(12, 2),
  prizes_settled_at timestamptz
);

create index contests_match_id_idx on public.contests (match_id);

comment on column public.contests.created_by is 'Null = platform/seed contest; set for user-created contests';
comment on column public.contests.creator_joined_at is 'Set when creator first saves team; until then contest is hidden from non-creators';
comment on column public.contests.prizes_settled_at is 'Set once contest winnings are credited (idempotent).';

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
  utr_number text,
  status public.transaction_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  razorpay_order_id text,
  razorpay_payment_id text,
  source text not null default 'manual_utr',
  constraint transactions_source_check check (
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
  ),
  constraint transactions_razorpay_payment_id_key unique (razorpay_payment_id)
);

create index transactions_user_idx on public.transactions (user_id);
create index transactions_status_idx on public.transactions (status);

comment on column public.transactions.source is 'manual_utr: UTR pending admin; razorpay: instant top-up';

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

create table public.contest_payouts (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  user_team_id uuid not null references public.user_teams (id) on delete cascade,
  rank int not null,
  amount_inr numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  unique (contest_id, user_team_id)
);

create index contest_payouts_contest_idx on public.contest_payouts (contest_id);
create index contest_payouts_user_idx on public.contest_payouts (user_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

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

comment on table public.admin_audit_log is 'Privileged actions; insert from SECURITY DEFINER RPCs only';

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

create table public.pay_out_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount_inr numeric(12, 2) not null,
  payee_upi text not null,
  status public.pay_request_status not null default 'pending',
  user_note text,
  admin_note text,
  payout_utr_ref text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  constraint pay_out_requests_amount_positive check (amount_inr > 0)
);

create index pay_out_requests_user_idx on public.pay_out_requests (user_id);
create index pay_out_requests_status_idx on public.pay_out_requests (status);
create index pay_out_requests_created_idx on public.pay_out_requests (created_at desc);

comment on column public.pay_out_requests.payout_utr_ref is
  'UTR / reference entered by admin when approving after sending funds to payee UPI.';

-- ---------------------------------------------------------------------------
-- Helpers & RPCs (dependency order)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_uname text;
  uname text;
  n int := 0;
begin
  base_uname := lower(trim(coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    nullif(trim(split_part(new.email, '@', 1)), ''),
    'user'
  )));

  if base_uname = '' then
    base_uname := 'user';
  end if;

  uname := base_uname;
  while exists (select 1 from public.profiles where lower(username) = uname) loop
    n := n + 1;
    uname := base_uname || '_' || n::text;
  end loop;

  insert into public.profiles (id, username)
  values (new.id, uname)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger user_teams_updated_at before update on public.user_teams
  for each row execute function public.set_updated_at();
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

create or replace function public.username_is_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1
    from public.profiles
    where lower(username) = lower(trim(p_username))
      and length(trim(p_username)) > 0
  );
$$;

grant execute on function public.username_is_available(text) to anon, authenticated;

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

create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_user_id is null or p_type is null or length(trim(p_type)) = 0 then
    raise exception 'invalid notification';
  end if;
  insert into public.notifications (user_id, type, title, body, payload)
  values (
    p_user_id,
    trim(p_type),
    coalesce(nullif(trim(p_title), ''), 'Update'),
    coalesce(nullif(trim(p_body), ''), ''),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_notification(uuid, text, text, text, jsonb) from public;
grant execute on function public.create_notification(uuid, text, text, text, jsonb) to service_role;

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

create or replace function public.mark_notification_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.notifications
  set read_at = coalesce(read_at, timezone('utc', now()))
  where id = p_id and user_id = auth.uid();
end;
$$;

grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.prize_amount_for_rank(p_breakup jsonb, p_rank int)
returns numeric
language sql
immutable
as $$
  select coalesce(
    (
      select round((elem->>'amount')::numeric / greatest(1, (elem->>'rank_to')::int - (elem->>'rank_from')::int + 1), 2)
      from jsonb_array_elements(p_breakup) elem
      where p_rank >= (elem->>'rank_from')::int
        and p_rank <= (elem->>'rank_to')::int
      limit 1
    ),
    0::numeric
  );
$$;

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
begin
  select c.match_id, c.prize_breakup, c.prizes_settled_at
  into v_match_id, v_breakup, v_settled
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
    return jsonb_build_object('ok', true, 'payouts', 0, 'note', 'no_prize_breakup');
  end if;

  for rec in
    select ut.id as team_id, ut.user_id, ut.total_points, ut.created_at
    from public.user_teams ut
    where ut.contest_id = p_contest_id
    order by ut.total_points desc, ut.created_at asc, ut.id asc
  loop
    v_rank := v_rank + 1;
    v_amt := public.prize_amount_for_rank(v_breakup, v_rank);
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

  return jsonb_build_object('ok', true, 'payouts', v_paid, 'participants', v_rank);
end;
$$;

revoke all on function public.settle_contest_prizes(uuid) from public;
grant execute on function public.settle_contest_prizes(uuid) to service_role;

create or replace function public.save_fantasy_team(
  p_match_id bigint,
  p_contest_id uuid,
  p_player_ids uuid[],
  p_captain_id uuid,
  p_vice_captain_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team_id uuid;
  v_fee numeric(12, 2);
  v_balance numeric(12, 2);
  v_match_start timestamptz;
  v_contest_match bigint;
  v_distinct int;
  v_missing int;
  v_was_new_team boolean := false;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select start_time into v_match_start from public.matches where id = p_match_id;
  if not found then
    raise exception 'match not found';
  end if;
  if timezone('utc', now()) >= v_match_start - interval '1 minute' then
    raise exception 'team lock deadline has passed';
  end if;

  select match_id, coalesce(entry_fee, 0) into v_contest_match, v_fee
  from public.contests where id = p_contest_id;
  if not found then
    raise exception 'contest not found';
  end if;
  if v_contest_match is distinct from p_match_id then
    raise exception 'contest does not belong to this match';
  end if;

  if p_player_ids is null or cardinality(p_player_ids) is distinct from 11 then
    raise exception 'pick exactly 11 players';
  end if;

  select count(*) into v_distinct from (select distinct unnest(p_player_ids)) as u;
  if v_distinct is distinct from 11 then
    raise exception 'duplicate players in squad';
  end if;

  if p_captain_id is null or p_vice_captain_id is null then
    raise exception 'captain and vice-captain required';
  end if;
  if p_captain_id = p_vice_captain_id then
    raise exception 'captain and vice-captain must be different';
  end if;

  if not (p_captain_id = any (p_player_ids) and p_vice_captain_id = any (p_player_ids)) then
    raise exception 'captain and vice-captain must be in your xi';
  end if;

  select count(*) into v_missing
  from unnest(p_player_ids) as pid(x)
  where not exists (
    select 1 from public.players pl
    where pl.id = pid.x and pl.match_id = p_match_id
  );
  if v_missing > 0 then
    raise exception 'invalid player for this match';
  end if;

  select id into v_team_id
  from public.user_teams
  where user_id = v_uid and contest_id = p_contest_id;

  if v_team_id is null then
    v_was_new_team := true;
    select wallet_balance into v_balance
    from public.profiles
    where id = v_uid
    for update;
    if not found then
      raise exception 'profile not found';
    end if;
    if v_balance < v_fee then
      raise exception 'insufficient wallet balance for this contest';
    end if;

    update public.profiles
    set wallet_balance = wallet_balance - v_fee
    where id = v_uid;

    insert into public.user_teams (user_id, contest_id, match_id, captain_id, vice_captain_id)
    values (v_uid, p_contest_id, p_match_id, p_captain_id, p_vice_captain_id)
    returning id into v_team_id;
  else
    update public.user_teams
    set
      match_id = p_match_id,
      captain_id = p_captain_id,
      vice_captain_id = p_vice_captain_id,
      updated_at = now()
    where id = v_team_id;
  end if;

  delete from public.team_roster where team_id = v_team_id;
  insert into public.team_roster (team_id, player_id)
  select v_team_id, unnest(p_player_ids);

  if v_was_new_team then
    update public.contests
    set creator_joined_at = coalesce(creator_joined_at, timezone('utc', now()))
    where id = p_contest_id
      and created_by = v_uid;
  end if;

  return v_team_id;
end;
$$;

grant execute on function public.save_fantasy_team(bigint, uuid, uuid[], uuid, uuid) to authenticated;

create or replace function public.create_user_contest(
  p_match_id bigint,
  p_name text,
  p_entry_fee numeric,
  p_max_participants int,
  p_prize_pool numeric,
  p_winner_count int,
  p_prize_breakup jsonb,
  p_gross_collected numeric,
  p_is_flexible boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match_start timestamptz;
  v_sum numeric(12, 4);
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select start_time into v_match_start from public.matches where id = p_match_id;
  if not found then
    raise exception 'match not found';
  end if;
  if timezone('utc', now()) >= v_match_start - interval '1 minute' then
    raise exception 'team lock deadline has passed';
  end if;

  if p_entry_fee is null or p_entry_fee < 0 then
    raise exception 'invalid entry fee';
  end if;
  if p_max_participants is null or p_max_participants < 2 or p_max_participants > 10000 then
    raise exception 'spots must be between 2 and 10000';
  end if;
  if p_prize_pool is null or p_prize_pool < 0 then
    raise exception 'invalid prize pool';
  end if;
  if p_winner_count not in (1, 2, 3, 4, 5, 7, 10) then
    raise exception 'invalid winner count';
  end if;

  if p_prize_breakup is null or jsonb_typeof(p_prize_breakup) <> 'array' or jsonb_array_length(p_prize_breakup) < 1 then
    raise exception 'prize breakup must be a non-empty array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_prize_breakup) x
    where jsonb_typeof(x) <> 'object'
      or not (x ? 'rank_from' and x ? 'rank_to' and x ? 'amount')
      or (nullif(x->>'rank_from', ''))::int is null
      or (nullif(x->>'rank_to', ''))::int is null
      or (nullif(x->>'amount', ''))::numeric is null
      or (x->>'rank_from')::int > (x->>'rank_to')::int
  ) then
    raise exception 'each prize slab needs valid rank_from, rank_to, amount';
  end if;

  select coalesce(sum((x->>'amount')::numeric), 0) into v_sum
  from jsonb_array_elements(p_prize_breakup) x;

  if abs(v_sum - p_prize_pool) > 0.02 then
    raise exception 'prize slabs must sum to prize pool';
  end if;

  insert into public.contests (
    match_id,
    name,
    entry_fee,
    prize_pool,
    max_participants,
    created_by,
    creator_joined_at,
    winner_count,
    prize_breakup,
    is_flexible,
    gross_collected
  )
  values (
    p_match_id,
    nullif(trim(p_name), ''),
    round(p_entry_fee, 2),
    round(p_prize_pool, 2),
    p_max_participants,
    v_uid,
    null,
    p_winner_count,
    p_prize_breakup,
    coalesce(p_is_flexible, true),
    case when p_gross_collected is null then null else round(p_gross_collected, 2) end
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.create_user_contest(
  bigint, text, numeric, int, numeric, int, jsonb, numeric, boolean
) to authenticated;

create or replace function public.finalize_razorpay_topup(
  p_user_id uuid,
  p_amount_inr numeric,
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

grant execute on function public.admin_approve_transaction(uuid) to authenticated;
grant execute on function public.admin_reject_transaction(uuid) to authenticated;

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

grant execute on function public.admin_approve_pay_in_request(uuid) to authenticated;
grant execute on function public.admin_reject_pay_in_request(uuid, text) to authenticated;
grant execute on function public.admin_approve_pay_out_request(uuid, text) to authenticated;
grant execute on function public.admin_reject_pay_out_request(uuid, text) to authenticated;

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

create or replace function public.tr_notify_wallet_razorpay()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'razorpay' and new.status = 'approved' and new.amount > 0 then
    insert into public.notifications (user_id, type, title, body, payload)
    values (
      new.user_id,
      'wallet_credit',
      'Wallet credited',
      format('₹%s added to your wallet.', trim(to_char(new.amount, 'FM999999999990.00'))),
      jsonb_build_object('amount_inr', new.amount, 'href', '/wallet')
    );
  end if;
  return new;
end;
$$;

create trigger transactions_notify_wallet_razorpay
  after insert on public.transactions
  for each row
  execute function public.tr_notify_wallet_razorpay();

create or replace function public.tr_notify_contest_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select coalesce(nullif(trim(c.name), ''), 'Contest') into v_name
  from public.contests c where c.id = new.contest_id;

  insert into public.notifications (user_id, type, title, body, payload)
  values (
    new.user_id,
    'contest_joined',
    'Joined contest',
    format('You joined %s.', v_name),
    jsonb_build_object(
      'contest_id', new.contest_id,
      'match_id', new.match_id,
      'href', format('/matches/%s/contests/%s/squad', new.match_id, new.contest_id)
    )
  );
  return new;
end;
$$;

create trigger user_teams_notify_joined
  after insert on public.user_teams
  for each row
  execute function public.tr_notify_contest_joined();

create or replace function public.tr_notify_contest_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.notifications (user_id, type, title, body, payload)
    values (
      new.created_by,
      'contest_created',
      'Contest created',
      coalesce(nullif(trim(new.name), ''), 'Your contest') || ' is live.',
      jsonb_build_object(
        'contest_id', new.id,
        'match_id', new.match_id,
        'href', format('/matches/%s', new.match_id)
      )
    );
  end if;
  return new;
end;
$$;

create trigger contests_notify_created
  after insert on public.contests
  for each row
  execute function public.tr_notify_contest_created();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.players enable row level security;
alter table public.contests enable row level security;
alter table public.user_teams enable row level security;
alter table public.team_roster enable row level security;
alter table public.transactions enable row level security;
alter table public.razorpay_orders enable row level security;
alter table public.contest_payouts enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.pay_in_requests enable row level security;
alter table public.pay_out_requests enable row level security;
alter table public.sm_leagues enable row level security;
alter table public.sm_seasons enable row level security;
alter table public.sm_teams enable row level security;
alter table public.sm_season_team enable row level security;
alter table public.sm_season_squad enable row level security;
alter table public.sm_venues enable row level security;
alter table public.sm_stages enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_select_admin"
  on public.profiles for select to authenticated
  using (public.is_requester_admin());

create policy "profiles_update_own_username" on public.profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    and wallet_balance = (select p.wallet_balance from public.profiles p where p.id = auth.uid())
    and is_admin = (select p.is_admin from public.profiles p where p.id = auth.uid())
  );

create policy "matches_read_auth" on public.matches
  for select to authenticated using (true);

create policy "players_read_auth" on public.players
  for select to authenticated using (true);

create policy "contests_read_auth" on public.contests
  for select to authenticated using (true);

create policy "user_teams_select_auth" on public.user_teams
  for select to authenticated using (true);

create policy "user_teams_insert_own" on public.user_teams
  for insert to authenticated with check (user_id = auth.uid());

create policy "user_teams_update_own" on public.user_teams
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "user_teams_delete_own" on public.user_teams
  for delete to authenticated using (user_id = auth.uid());

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

create policy "transactions_select_own" on public.transactions
  for select to authenticated using (user_id = auth.uid() or exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  ));

create policy "transactions_insert_own" on public.transactions
  for insert to authenticated with check (user_id = auth.uid() and status = 'pending');

create policy "contest_payouts_select_own"
  on public.contest_payouts for select
  using (user_id = auth.uid());

create policy "notifications_select_own"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "notifications_update_own_read"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "admin_audit_log_select_admin"
  on public.admin_audit_log for select to authenticated
  using (public.is_requester_admin());

create policy "pay_in_requests_select_own_or_admin"
  on public.pay_in_requests for select to authenticated
  using (user_id = auth.uid() or public.is_requester_admin());

create policy "pay_in_requests_insert_own_pending"
  on public.pay_in_requests for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
  );

create policy "pay_out_requests_select_own_or_admin"
  on public.pay_out_requests for select to authenticated
  using (user_id = auth.uid() or public.is_requester_admin());

create policy "pay_out_requests_insert_own_pending"
  on public.pay_out_requests for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
  );

create policy "sm_leagues_read_auth" on public.sm_leagues
  for select to authenticated using (true);
create policy "sm_seasons_read_auth" on public.sm_seasons
  for select to authenticated using (true);
create policy "sm_teams_read_auth" on public.sm_teams
  for select to authenticated using (true);
create policy "sm_season_team_read_auth" on public.sm_season_team
  for select to authenticated using (true);
create policy "sm_season_squad_read_auth" on public.sm_season_squad
  for select to authenticated using (true);
create policy "sm_venues_read_auth" on public.sm_venues
  for select to authenticated using (true);
create policy "sm_stages_read_auth" on public.sm_stages
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Realtime & views
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.user_teams;

do $pub$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end
$pub$;

create or replace view public.profile_usernames
with (security_invoker = false) as
  select id, username from public.profiles;

grant select on public.profile_usernames to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
comment on table public.profiles is 'Wallet and display; use RPC for admin approvals';
comment on function public.admin_approve_transaction is 'Admin only; credits wallet and marks approved';
comment on function public.finalize_razorpay_topup is 'Server-only (service role): credit wallet once per razorpay_payment_id';

notify pgrst, 'reload schema';
