-- SportMonks fixture.status string for UI (e.g. "1st Innings", "NS", "Tea Break").

alter table public.matches
  add column if not exists sm_fixture_status text;

comment on column public.matches.sm_fixture_status is 'SportMonks fixture status label for display; see docs statuses-and-definitions.';
