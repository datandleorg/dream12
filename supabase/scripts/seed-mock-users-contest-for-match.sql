-- Mock users + one contest + 24 fantasy teams for a given public.matches.id (fixture id).
--
-- Preconditions
--   - Row exists in public.matches for v_match
--   - At least 22 rows in public.players for v_match (or leave v_auto_seed_players := true to insert
--     22 mock players when count is 0 — same as seed-minimal-players-for-match.sql)
--   - If 1..21 players exist, add more or run seed-minimal-players-for-match.sql with v_replace_existing
--
-- Edit v_match (and optionally v_num_users, v_entry_fee) below, then run in SQL Editor
-- (postgres / service role). Needs INSERT on auth.users + auth.identities.
--
-- If auth.instances is empty, the block reuses instance_id from an existing auth.users row,
-- else falls back to the all-zero UUID (works on many Supabase builds).
--
-- Cleanup before re-run (replace <match_id> and use the contest id printed in NOTICE):
--   DELETE FROM public.team_roster WHERE team_id IN (
--     SELECT id FROM public.user_teams WHERE contest_id = '<contest_uuid>'::uuid
--   );
--   DELETE FROM public.contest_payouts WHERE contest_id = '<contest_uuid>'::uuid;
--   DELETE FROM public.user_teams WHERE contest_id = '<contest_uuid>'::uuid;
--   DELETE FROM public.contests WHERE id = '<contest_uuid>'::uuid;
--   DELETE FROM auth.users WHERE email LIKE format('mock_%s_u%%@dream12.test', '<match_id>') ESCAPE '\';
--
-- After seed — verify scoring for a completed match
--   1. Ensure public.matches.fixture_scoreboard_raw is populated (sync or paste JSON).
--   2. Run app finalize: cron /api/cron/finalize-scores or call update path for that match.
--   3. Or use scripts/apply-mock-contest-points.ts if you have a matching stats JSON fixture.
--   4. Optional: UPDATE public.matches SET status = 'completed' WHERE id = v_match;
--   5. See supabase/scripts/verify-completed-match-scoring.sql for comparison queries.
--
-- Login (all mock users share the same password):
--   Password: Dream12Mock!Seed

do $seed$
declare
  v_match bigint := 69518; -- <<< CHANGE to your public.matches.id (fixture id)
  v_num_users int := 24;
  v_entry_fee numeric(12, 2) := 49;
  v_auto_seed_players boolean := true; -- when true and 0 players, insert 22 mock squad rows
  v_instance uuid;
  v_contest uuid;
  n_players int;
  i int;
  j int;
  k int;
  v_uid uuid;
  v_team uuid;
  v_players uuid[];
  v_offset int;
  v_cap uuid;
  v_vc uuid;
  v_pid uuid;
  v_email text;
  v_uname text;
  v_team_a text;
  v_team_b text;
  v_pl_team text;
  v_pl_role public.player_role;
begin
  select id into v_instance from auth.instances limit 1;
  if v_instance is null then
    select u.instance_id into v_instance from auth.users u limit 1;
  end if;
  if v_instance is null then
    v_instance := '00000000-0000-0000-0000-000000000000'::uuid;
  end if;

  v_contest := (
    'a1b2c3d4-e5f6-4789-a012-' || right('000000000000' || to_hex(v_match), 12)
  )::uuid;

  if not exists (select 1 from public.matches where id = v_match) then
    raise exception 'match % not found in public.matches', v_match;
  end if;

  select count(*)::int into n_players from public.players where match_id = v_match;

  if n_players = 0 and v_auto_seed_players then
    select team_a, team_b into v_team_a, v_team_b from public.matches where id = v_match;
    for k in 1..22 loop
      v_pl_team :=
        case
          when k <= 11 then coalesce(nullif(trim(v_team_a), ''), 'Team A')
          else coalesce(nullif(trim(v_team_b), ''), 'Team B')
        end;
      v_pl_role :=
        case (k - 1) % 4
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
        v_match * 1000 + k,
        format('Mock %s #%s', v_match, k),
        v_pl_team,
        v_pl_role,
        9.0,
        true
      );
    end loop;
    raise notice 'auto-seeded 22 mock players for match % (sportmonks_id %..%)',
      v_match, v_match * 1000 + 1, v_match * 1000 + 22;
    n_players := 22;
  elsif n_players < 22 then
    raise exception
      'need at least 22 players for match % (found %). Set v_auto_seed_players := true for 0 players, or run seed-minimal-players-for-match.sql',
      v_match,
      n_players;
  end if;

  if exists (select 1 from public.contests where id = v_contest) then
    raise exception 'contest % already exists — run cleanup in script header first', v_contest;
  end if;

  select array_agg(id order by name, id) into v_players from public.players where match_id = v_match;

  insert into public.contests (
    id,
    match_id,
    name,
    entry_fee,
    prize_pool,
    max_participants,
    created_by,
    winner_count,
    prize_breakup,
    is_flexible,
    gross_collected
  ) values (
    v_contest,
    v_match,
    format('Mock mega league %s', v_match),
    v_entry_fee,
    5000,
    100,
    null,
    10,
    '[
      {"rank_from":1,"rank_to":1,"amount":2000},
      {"rank_from":2,"rank_to":2,"amount":1000},
      {"rank_from":3,"rank_to":3,"amount":500},
      {"rank_from":4,"rank_to":10,"amount":350}
    ]'::jsonb,
    true,
    v_entry_fee * v_num_users
  );

  for i in 1..v_num_users loop
    v_uid := gen_random_uuid();
    v_email := format('mock_%s_u%s@dream12.test', v_match::text, lpad(i::text, 3, '0'));
    v_uname := format('mock_%s_u%s', v_match::text, lpad(i::text, 3, '0'));

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      v_instance,
      v_uid,
      'authenticated',
      'authenticated',
      v_email,
      crypt('Dream12Mock!Seed', gen_salt('bf')),
      timezone('utc', now()),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('username', v_uname),
      timezone('utc', now()),
      timezone('utc', now())
    );

    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_email),
      'email',
      v_email,
      timezone('utc', now()),
      timezone('utc', now()),
      timezone('utc', now())
    );

    -- Ensure profile row exists (trigger can fail silently on some hosts; missing profile breaks login).
    insert into public.profiles (id, username, wallet_balance)
    values (v_uid, v_uname, 10000.00)
    on conflict (id) do update set
      username = excluded.username,
      wallet_balance = excluded.wallet_balance;

    v_team := gen_random_uuid();
    v_offset := 1 + ((i - 1) * 5) % (cardinality(v_players) - 10);
    v_cap := v_players[v_offset];
    v_vc := v_players[v_offset + 1];

    insert into public.user_teams (
      id,
      user_id,
      contest_id,
      match_id,
      captain_id,
      vice_captain_id,
      total_points
    ) values (
      v_team,
      v_uid,
      v_contest,
      v_match,
      v_cap,
      v_vc,
      0
    );

    for j in 0..10 loop
      v_pid := v_players[v_offset + j];
      insert into public.team_roster (team_id, player_id) values (v_team, v_pid);
    end loop;
  end loop;

  raise notice 'seed done: match_id=%, contest_id=%, users=%, password=Dream12Mock!Seed', v_match, v_contest, v_num_users;
end
$seed$;
