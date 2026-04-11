-- One-shot toss fan-out (in-app / email / push), same idempotency idea as lineup_notified_at.

alter table public.matches add column if not exists toss_notified_at timestamptz;

comment on column public.matches.toss_notified_at is
  'Set when users with a paid team for this match were notified of the toss (once per match).';
