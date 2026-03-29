-- Mock contest + 24 users + fantasy teams for match id 69518 (Dream12).
--
-- Preconditions:
--   - public.matches has id = 69518
--   - public.players has at least 22 rows with match_id = 69518 and non-null sportmonks_id (for apply-mock-contest-points script)
--
-- Run as postgres / service role (needs INSERT on auth.users, auth.identities).
--
-- If `auth.instances` has no rows (some DB restores / external Postgres), this script
-- reuses `instance_id` from any existing `auth.users`, else falls back to the Supabase
-- default instance UUID. If `INSERT INTO auth.users` still fails on FK, create one user
-- via the Dashboard first, or insert a row into `auth.instances` per your Supabase version.
--
-- Cleanup before re-run:
--   DELETE FROM public.team_roster WHERE team_id IN (
--     SELECT id FROM public.user_teams WHERE contest_id = 'a1b2c3d4-e5f6-4789-a012-680695180001'::uuid
--   );
--   DELETE FROM public.contest_payouts WHERE contest_id = 'a1b2c3d4-e5f6-4789-a012-680695180001'::uuid;
--   DELETE FROM public.user_teams WHERE contest_id = 'a1b2c3d4-e5f6-4789-a012-680695180001'::uuid;
--   DELETE FROM public.contests WHERE id = 'a1b2c3d4-e5f6-4789-a012-680695180001'::uuid;
--   DELETE FROM auth.users WHERE email LIKE 'mock69518\_u%@dream12.test' ESCAPE '\';
--
-- After seed:
--   1. pnpm mock:apply-points   (sets user_teams.total_points from fixtures/mock-live-stats-69518.json)
--   2. UPDATE public.matches SET status = 'completed', scoring_finalized_at = timezone('utc', now()) WHERE id = 69518;
--   3. SELECT public.settle_contest_prizes('a1b2c3d4-e5f6-4789-a012-680695180001'::uuid);
--      (service_role / postgres only)

DO $seed$
DECLARE
  v_match bigint := 69518;
  v_contest uuid := 'a1b2c3d4-e5f6-4789-a012-680695180001'::uuid;
  v_instance uuid;
  n_players int;
  i int;
  j int;
  v_uid uuid;
  v_team uuid;
  v_players uuid[];
  v_offset int;
  v_cap uuid;
  v_vc uuid;
  v_pid uuid;
BEGIN
  SELECT id INTO v_instance FROM auth.instances LIMIT 1;
  IF v_instance IS NULL THEN
    SELECT u.instance_id INTO v_instance FROM auth.users u LIMIT 1;
  END IF;
  IF v_instance IS NULL THEN
    v_instance := '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.matches WHERE id = v_match) THEN
    RAISE EXCEPTION 'match % not found in public.matches', v_match;
  END IF;

  SELECT count(*)::int INTO n_players FROM public.players WHERE match_id = v_match;
  IF n_players < 22 THEN
    RAISE EXCEPTION 'need at least 22 players for match % (found %)', v_match, n_players;
  END IF;

  IF EXISTS (SELECT 1 FROM public.contests WHERE id = v_contest) THEN
    RAISE EXCEPTION 'contest % already exists — run cleanup block in script header first', v_contest;
  END IF;

  SELECT array_agg(id ORDER BY name, id) INTO v_players FROM public.players WHERE match_id = v_match;

  INSERT INTO public.contests (
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
  ) VALUES (
    v_contest,
    v_match,
    'Mock mega league 69518',
    49,
    5000,
    100,
    NULL,
    10,
    '[
      {"rank_from":1,"rank_to":1,"amount":2000},
      {"rank_from":2,"rank_to":2,"amount":1000},
      {"rank_from":3,"rank_to":3,"amount":500},
      {"rank_from":4,"rank_to":10,"amount":350}
    ]'::jsonb,
    true,
    49 * 24
  );

  FOR i IN 1..24 LOOP
    v_uid := gen_random_uuid();

    INSERT INTO auth.users (
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
    ) VALUES (
      v_instance,
      v_uid,
      'authenticated',
      'authenticated',
      format('mock69518_u%s@dream12.test', lpad(i::text, 3, '0')),
      crypt('Mock69518!Seed', gen_salt('bf')),
      timezone('utc', now()),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('username', format('mock69518_u%s', lpad(i::text, 3, '0'))),
      timezone('utc', now()),
      timezone('utc', now())
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_uid,
      jsonb_build_object(
        'sub', v_uid::text,
        'email', format('mock69518_u%s@dream12.test', lpad(i::text, 3, '0'))
      ),
      'email',
      format('mock69518_u%s@dream12.test', lpad(i::text, 3, '0')),
      timezone('utc', now()),
      timezone('utc', now()),
      timezone('utc', now())
    );

    UPDATE public.profiles
    SET wallet_balance = 10000
    WHERE id = v_uid;

    v_team := gen_random_uuid();
    v_offset := 1 + ((i - 1) * 5) % (cardinality(v_players) - 10);
    v_cap := v_players[v_offset];
    v_vc := v_players[v_offset + 1];

    INSERT INTO public.user_teams (
      id,
      user_id,
      contest_id,
      match_id,
      captain_id,
      vice_captain_id,
      total_points
    ) VALUES (
      v_team,
      v_uid,
      v_contest,
      v_match,
      v_cap,
      v_vc,
      0
    );

    FOR j IN 0..10 LOOP
      v_pid := v_players[v_offset + j];
      INSERT INTO public.team_roster (team_id, player_id) VALUES (v_team, v_pid);
    END LOOP;
  END LOOP;
END
$seed$;
