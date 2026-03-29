-- Flush ALL application data: fantasy rows, SportMonks reference tables, wallets, transactions,
-- notifications, pay requests, audit log, and every row in auth.users (and auth.identities / sessions).
--
-- Irreversible. Run in Supabase Dashboard → SQL Editor, or:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/scripts/flush-all-data.sql
--
-- Requires a role that can DELETE from auth.users (e.g. postgres / service connection).
--
-- Intentionally NOT under supabase/migrations/: do not auto-run this on deploy.

begin;

-- 1) Public app data (FK-safe order; CASCADE clears dependent rows if any remain)
truncate table
  public.team_roster,
  public.contest_payouts,
  public.user_teams,
  public.notifications,
  public.transactions,
  public.razorpay_orders,
  public.pay_in_requests,
  public.pay_out_requests,
  public.admin_audit_log,
  public.contests,
  public.players,
  public.matches
restart identity cascade;

-- 2) SportMonks reference (venues/stages depend on leagues/seasons)
truncate table
  public.sm_season_squad,
  public.sm_season_team,
  public.sm_stages,
  public.sm_venues,
  public.sm_seasons,
  public.sm_teams,
  public.sm_leagues
restart identity cascade;

-- 3) Auth + profiles (profiles.id → auth.users; cascade from user delete)
delete from auth.users;

-- 4) Safety: empty profiles if any orphan rows ever existed (normally empty after step 3)
truncate table public.profiles restart identity cascade;

commit;
