-- Repair: if push_subscriptions was created earlier without `subscription`, CREATE TABLE IF NOT EXISTS
-- would not add it. PostgREST then errors: could not find 'subscription' in schema cache.

alter table public.push_subscriptions
  add column if not exists subscription jsonb;

-- Drop invalid rows (cannot send push without keys); then enforce NOT NULL.
delete from public.push_subscriptions where subscription is null;

alter table public.push_subscriptions
  alter column subscription set not null;

-- Refresh PostgREST schema cache (run in SQL Editor if errors persist after migrate).
-- notify pgrst, 'reload schema';
