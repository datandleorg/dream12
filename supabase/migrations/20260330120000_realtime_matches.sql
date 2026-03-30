-- Stream match row updates (live_snapshot, status, etc.) to authenticated clients via Realtime.
alter publication supabase_realtime add table public.matches;
