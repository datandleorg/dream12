-- Clear contest gameplay only: entries, lineups, payouts, and in-app notifications.
-- Keeps: public.matches (fixtures, live_snapshot, scoreboard columns), public.players,
--        public.profiles, auth.users, wallet (transactions, razorpay_orders, pay_*),
--        public.sm_* reference tables, public.admin_audit_log.
--
-- There is no leaderboard table; public.season_leaderboard() aggregates user_teams
-- across contests for finalized matches. After this run, that RPC has no past entries
-- to rank until users join new contests.
--
-- Run in Supabase Dashboard → SQL Editor (or: psql … -f this file).
--
-- ---------------------------------------------------------------------------
-- Scope A (default below): contests + points + payouts + notifications only.
-- ---------------------------------------------------------------------------

begin;

truncate table
  public.team_roster,
  public.contest_payouts,
  public.notifications,
  public.user_teams,
  public.contests
restart identity cascade;

commit;

-- ---------------------------------------------------------------------------
-- Scope B (optional): full fixture + squad reset — uncomment and run instead of Scope A.
-- Also removes public.players and public.matches (re-sync or seed fixtures afterward).
-- ---------------------------------------------------------------------------
--
-- begin;
--
-- truncate table
--   public.team_roster,
--   public.contest_payouts,
--   public.notifications,
--   public.user_teams,
--   public.contests,
--   public.players,
--   public.matches
-- restart identity cascade;
--
-- commit;

-- Optional: verify Scope A (contest graph empty; matches/players unchanged)
-- select
--   (select count(*) from public.contests) as contests,
--   (select count(*) from public.user_teams) as user_teams,
--   (select count(*) from public.team_roster) as team_roster,
--   (select count(*) from public.contest_payouts) as contest_payouts,
--   (select count(*) from public.matches) as matches,
--   (select count(*) from public.players) as players;
