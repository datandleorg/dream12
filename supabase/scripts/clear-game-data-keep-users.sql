-- Clear all app data except user accounts (public.profiles + auth.users unchanged).
-- Run in Supabase Dashboard → SQL Editor (or: psql … -f this file).
--
-- Removes: matches, squads, contests, wallet transactions, Razorpay order rows,
--          SportMonks reference data (leagues, seasons, teams, squads, venues, stages).
-- Keeps: every row in public.profiles (including wallet_balance); auth.users untouched.

begin;

-- One statement so Postgres can resolve FKs between these tables (sequential TRUNCATE often fails).
truncate table
  public.team_roster,
  public.contest_payouts,
  public.notifications,
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

-- SportMonks reference data (migrations 20260333000000, 20260334000000; skip if not applied).
-- Order: children before parents (sm_stages refs sm_seasons/sm_leagues; sm_venues is independent).
do $$
begin
  if to_regclass('public.sm_leagues') is not null then
    if to_regclass('public.sm_stages') is not null and to_regclass('public.sm_venues') is not null then
      execute $t$
        truncate table
          public.sm_season_squad,
          public.sm_season_team,
          public.sm_stages,
          public.sm_venues,
          public.sm_seasons,
          public.sm_teams,
          public.sm_leagues
        restart identity cascade
      $t$;
    elsif to_regclass('public.sm_stages') is not null then
      execute $t$
        truncate table
          public.sm_season_squad,
          public.sm_season_team,
          public.sm_stages,
          public.sm_seasons,
          public.sm_teams,
          public.sm_leagues
        restart identity cascade
      $t$;
    elsif to_regclass('public.sm_venues') is not null then
      execute $t$
        truncate table
          public.sm_season_squad,
          public.sm_season_team,
          public.sm_venues,
          public.sm_seasons,
          public.sm_teams,
          public.sm_leagues
        restart identity cascade
      $t$;
    else
      execute $t$
        truncate table
          public.sm_season_squad,
          public.sm_season_team,
          public.sm_seasons,
          public.sm_teams,
          public.sm_leagues
        restart identity cascade
      $t$;
    end if;
  end if;
end $$;

commit;
