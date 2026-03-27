-- Cached SportMonks scoreboard snippet for UI (short score + tab payloads).

alter table public.matches
  add column if not exists live_snapshot jsonb,
  add column if not exists live_snapshot_at timestamptz;

comment on column public.matches.live_snapshot is 'Normalized live score / scoreboard JSON for fast reads.';
comment on column public.matches.live_snapshot_at is 'When live_snapshot was last written.';
