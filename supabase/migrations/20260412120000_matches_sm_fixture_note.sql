-- SportMonks fixture `note` (e.g. rain delay message) for UI next to sm_fixture_status.

alter table public.matches
  add column if not exists sm_fixture_note text;

comment on column public.matches.sm_fixture_note is
  'SportMonks fixture.note — human-readable status detail (e.g. weather), for display with sm_fixture_status.';
