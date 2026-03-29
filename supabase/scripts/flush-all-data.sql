-- Flush ALL data: auth users, profiles (wallets), fantasy rows, payouts, notifications,
-- manual/Razorpay transactions, SportMonks reference tables.
--
-- Irreversible. Run in Supabase Dashboard → SQL Editor, or:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/scripts/flush-all-data.sql
--
-- Requires a database role that can DELETE from auth.users (e.g. postgres / service connection).
--
-- Intentionally NOT under supabase/migrations/: adding this as a numbered migration would run once
-- on `supabase db push` and destroy production data.

begin;

-- Pay-in / pay-out / audit (defined in init migration); optional if tables missing.
do $$
begin
  if to_regclass('public.pay_in_requests') is not null then
    execute 'truncate table public.pay_in_requests restart identity cascade';
  end if;
  if to_regclass('public.pay_out_requests') is not null then
    execute 'truncate table public.pay_out_requests restart identity cascade';
  end if;
  if to_regclass('public.admin_audit_log') is not null then
    execute 'truncate table public.admin_audit_log restart identity cascade';
  end if;
end $$;

-- Cascades to auth.identities, auth.sessions, etc. (Supabase auth schema), and via
-- public.profiles ON DELETE CASCADE to user_teams, transactions, notifications, razorpay_orders, …
delete from auth.users;

-- Clear everything that may still reference matches / SportMonks (contests survive user delete
-- with created_by set null). Postgres resolves FK order within one TRUNCATE.
truncate table
  public.team_roster,
  public.contest_payouts,
  public.notifications,
  public.user_teams,
  public.transactions,
  public.contests,
  public.players,
  public.matches,
  public.profiles
restart identity cascade;

-- Razorpay audit table (init migration); optional if missing.
do $$
begin
  if to_regclass('public.razorpay_orders') is not null then
    execute 'truncate table public.razorpay_orders restart identity cascade';
  end if;
end $$;

-- SportMonks reference data (init migration).
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
