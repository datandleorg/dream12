-- Persist whitelisted SportMonks scoreboard JSON for unified fantasy scoring (live tick + finalize + breakdown).
alter table public.matches
  add column if not exists fixture_scoreboard_raw jsonb,
  add column if not exists fixture_scoreboard_raw_at timestamptz;

comment on column public.matches.fixture_scoreboard_raw is
  'Whitelisted fixture scoreboard fragment (batting/bowling/runs/scoreboards/teams) for scoring.';
comment on column public.matches.fixture_scoreboard_raw_at is
  'When fixture_scoreboard_raw was last written.';
