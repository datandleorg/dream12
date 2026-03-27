-- Clear all app data except user accounts (public.profiles + auth.users unchanged).
-- Run in Supabase Dashboard → SQL Editor (or: psql … -f this file).
--
-- Removes: matches, squads, contests, wallet transactions, Razorpay order rows.
-- Keeps: every row in public.profiles (including wallet_balance); auth.users untouched.

begin;

-- One statement so Postgres can resolve FKs between these tables (sequential TRUNCATE often fails).
truncate table
  public.team_roster,
  public.user_teams,
  public.contests,
  public.players,
  public.matches,
  public.transactions
restart identity cascade;

-- Razorpay audit table (only if migration 20260326120000 ran); references profiles only.
do $$
begin
  if to_regclass('public.razorpay_orders') is not null then
    execute 'truncate table public.razorpay_orders restart identity cascade';
  end if;
end $$;

-- SportMonks reference data (migration 20260333000000; skip if not applied).
do $$
begin
  if to_regclass('public.sm_leagues') is not null then
    execute 'truncate table public.sm_season_squad, public.sm_season_team, public.sm_seasons, public.sm_teams, public.sm_leagues restart identity cascade';
  end if;
end $$;

commit;
