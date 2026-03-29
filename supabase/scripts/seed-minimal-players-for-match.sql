-- Insert 22 synthetic public.players rows for testing when SportMonks sync has not populated a squad.
-- Optional: seed-mock-users-contest-for-match.sql auto-seeds the same 22 rows when player count is 0
-- (v_auto_seed_players := true, default). Use this script alone if you want only the squad, or replace.
--
-- Edit v_match below. sportmonks_id values are deterministic: v_match * 1000 + n (n = 1..22)
-- so they stay unique per fixture and won’t clash with typical real SM ids in other matches.
--
-- Optional: set v_replace_existing := true to DELETE existing players for this match first.

do $body$
declare
  v_match bigint := 69518; -- <<< CHANGE: public.matches.id
  v_replace_existing boolean := false;
  v_team_a text;
  v_team_b text;
  i int;
  v_team text;
  v_role public.player_role;
begin
  select team_a, team_b
  into v_team_a, v_team_b
  from public.matches
  where id = v_match;

  if not found then
    raise exception 'match % not found in public.matches', v_match;
  end if;

  if v_replace_existing then
    delete from public.players where match_id = v_match;
  elsif exists (select 1 from public.players where match_id = v_match limit 1) then
    raise exception 'match % already has players — set v_replace_existing := true to replace', v_match;
  end if;

  for i in 1..22 loop
    v_team :=
      case
        when i <= 11 then coalesce(nullif(trim(v_team_a), ''), 'Team A')
        else coalesce(nullif(trim(v_team_b), ''), 'Team B')
      end;
    v_role :=
      case (i - 1) % 4
        when 0 then 'BAT'::public.player_role
        when 1 then 'BOWL'::public.player_role
        when 2 then 'AR'::public.player_role
        else 'WK'::public.player_role
      end;

    insert into public.players (
      match_id,
      sportmonks_id,
      name,
      team,
      role,
      credit_value,
      in_playing_xi
    ) values (
      v_match,
      v_match * 1000 + i,
      format('Mock %s #%s', v_match, i),
      v_team,
      v_role,
      9.0,
      true
    );
  end loop;

  raise notice 'inserted 22 mock players for match_id=% (sportmonks_id %..%)',
    v_match,
    v_match * 1000 + 1,
    v_match * 1000 + 22;
end
$body$;
