-- Idempotent catch-up if migrations 20260335000000 / 20260336000000 were not applied.
-- Run in Supabase Dashboard → SQL Editor, or: psql "$DATABASE_URL" -f scripts/sql/apply-missing-match-columns.sql

alter table public.matches
  add column if not exists live_snapshot jsonb,
  add column if not exists live_snapshot_at timestamptz;

comment on column public.matches.live_snapshot is 'Normalized live score / scoreboard JSON for fast reads.';
comment on column public.matches.live_snapshot_at is 'When live_snapshot was last written.';

alter table public.matches
  add column if not exists sm_fixture_status text;

comment on column public.matches.sm_fixture_status is 'SportMonks fixture status label for display.';
