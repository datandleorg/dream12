-- Dream11-style lifecycle: in_review, toss, lineup_synced, match_finished_at, optional schedule_checked_at

alter type public.match_status add value 'in_review';

alter table public.matches
  add column if not exists lineup_synced boolean not null default false,
  add column if not exists match_finished_at timestamptz,
  add column if not exists toss_winner_team_id bigint,
  add column if not exists toss_decision text,
  add column if not exists toss_recorded_at timestamptz,
  add column if not exists toss_raw jsonb,
  add column if not exists schedule_checked_at timestamptz;

comment on column public.matches.lineup_synced is
  'True after playing XI applied from SportMonks; minutely router skips lineup-only fetches.';
comment on column public.matches.match_finished_at is
  'When provider reported match finished (entering in_review); finalize waits buffer after this.';
comment on column public.matches.toss_winner_team_id is
  'SportMonks team id of toss winner (matches localteam_id / visitorteam_id).';
comment on column public.matches.toss_decision is 'bat | bowl when known.';
comment on column public.matches.toss_recorded_at is 'First time toss data was persisted.';
comment on column public.matches.toss_raw is 'Raw SportMonks toss object for debugging.';
comment on column public.matches.schedule_checked_at is 'Last hourly today-monitor refresh for this row.';
