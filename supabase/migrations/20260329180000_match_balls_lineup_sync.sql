-- Ball snapshot and lineup throttle for live tick (see docs/sportmonks-data-collection-and-scoring.md)

alter table public.matches
  add column if not exists fixture_balls_raw jsonb,
  add column if not exists fixture_balls_raw_at timestamptz,
  add column if not exists last_lineup_sync_at timestamptz;

comment on column public.matches.fixture_balls_raw is
  'Last SportMonks balls[] snapshot; kept separate from fixture_scoreboard_raw for size.';
comment on column public.matches.fixture_balls_raw_at is 'When fixture_balls_raw was last written.';
comment on column public.matches.last_lineup_sync_at is
  'Throttle anchor for applying lineup from live fixture payload without extra API calls.';
