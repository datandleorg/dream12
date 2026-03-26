-- Populate Dream11-style display fields on mock matches/players (runs after 20260329000000).

begin;

update public.matches
set
  tournament_name = 'Mock IPL',
  team_a = 'CSK',
  team_b = 'RCB',
  team_a_logo_url = null,
  team_b_logo_url = null
where id = 900001;

update public.matches
set
  tournament_name = 'Weekend Cup',
  team_a = 'MI',
  team_b = 'KKR',
  team_a_logo_url = null,
  team_b_logo_url = null
where id = 900002;

update public.players
set
  season_points = least(500, greatest(20, (sportmonks_id % 397) + (match_id % 17) * 3)),
  selection_pct = round((10 + (sportmonks_id % 6500)::numeric / 100)::numeric, 2),
  played_last_match = (sportmonks_id % 4 = 0),
  photo_url = format(
    'https://ui-avatars.com/api/?name=%s&size=128&background=1e3a5f&color=fff',
    replace(replace(name, ' ', '+'), '&', '')
  )
where match_id in (900001, 900002);

commit;
