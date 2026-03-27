-- Official playing XI flag per player row (SportMonks lineup sync).
-- null = unknown / no lineup published yet; true = in announced lineup; false = known excluded from XI.

alter table public.players
  add column if not exists in_playing_xi boolean null;

comment on column public.players.in_playing_xi is
  'Set when fixture lineup sync runs: true if in XI, false if in match pool but not in XI, null before lineup or mock data.';

create index if not exists players_match_playing_xi_idx
  on public.players (match_id)
  where in_playing_xi is not null;
