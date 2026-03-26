-- PostgREST upsert onConflict(match_id,sportmonks_id) needs a non-partial UNIQUE constraint.
drop index if exists public.players_match_sportmonks_uidx;

alter table public.players
  drop constraint if exists players_match_sportmonks_key;

alter table public.players
  add constraint players_match_sportmonks_key unique (match_id, sportmonks_id);
