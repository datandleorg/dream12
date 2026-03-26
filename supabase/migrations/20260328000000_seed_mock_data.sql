-- Mock / QA data for local & staging. Safe numeric IDs: matches 900001–900099, player sportmonks_id 9100000+.
-- Re-run: deletes these matches (CASCADE removes contests, players, and any user_teams tied to those contests).

begin;

delete from public.matches where id in (900001, 900002);

insert into public.matches (id, name, start_time, status) values
  (
    900001,
    'CSK vs RCB (Mock IPL)',
    (timezone('utc', now()) + interval '7 days'),
    'upcoming'
  ),
  (
    900002,
    'MI vs KKR (Mock)',
    (timezone('utc', now()) + interval '14 days'),
    'upcoming'
  );

-- Fixed contest UUIDs; after Dream11 migrations use: /matches/900001/contests/<id>/squad
insert into public.contests (id, match_id, name, entry_fee, prize_pool, max_participants) values
  (
    '11111111-1111-4111-8111-111111111101',
    900001,
    'Grand League — Mock',
    49,
    50000,
    500
  ),
  (
    '11111111-1111-4111-8111-111111111102',
    900001,
    'H2H Practice (Free)',
    0,
    1000,
    2
  ),
  (
    '22222222-2222-4222-8222-222222222201',
    900002,
    'Weekend Cup — Mock',
    99,
    25000,
    200
  );

-- Match 900001: two franchises, enough depth to build valid XIs (≤100 credits, ≤7 per team, role limits)
insert into public.players (sportmonks_id, match_id, name, team, role, credit_value) values
  (9100101, 900001, 'M S Dhoni', 'CSK', 'WK', 9.0),
  (9100102, 900001, 'D Conway', 'CSK', 'WK', 8.5),
  (9100103, 900001, 'R Gaikwad', 'CSK', 'BAT', 9.5),
  (9100104, 900001, 'A Rayudu', 'CSK', 'BAT', 8.0),
  (9100105, 900001, 'S Dube', 'CSK', 'AR', 8.5),
  (9100106, 900001, 'R Jadeja', 'CSK', 'AR', 9.0),
  (9100107, 900001, 'M Ali', 'CSK', 'AR', 8.0),
  (9100108, 900001, 'D Chahar', 'CSK', 'BOWL', 8.5),
  (9100109, 900001, 'M Pathirana', 'CSK', 'BOWL', 8.5),
  (9100110, 900001, 'T Deshpande', 'CSK', 'BOWL', 8.0),
  (9100111, 900001, 'M Theekshana', 'CSK', 'BOWL', 7.5),
  (9100112, 900001, 'S Curran', 'CSK', 'BAT', 8.5),
  (9100113, 900001, 'D Karthik', 'RCB', 'WK', 8.0),
  (9100114, 900001, 'F du Plessis', 'RCB', 'BAT', 9.0),
  (9100115, 900001, 'V Kohli', 'RCB', 'BAT', 10.0),
  (9100116, 900001, 'G Maxwell', 'RCB', 'AR', 9.5),
  (9100117, 900001, 'W Hasaranga', 'RCB', 'AR', 8.5),
  (9100118, 900001, 'S Ahmed', 'RCB', 'BAT', 8.0),
  (9100119, 900001, 'H Patel', 'RCB', 'BOWL', 8.5),
  (9100120, 900001, 'M Siraj', 'RCB', 'BOWL', 9.0),
  (9100121, 900001, 'J Hazlewood', 'RCB', 'BOWL', 8.5),
  (9100122, 900001, 'K Sharma', 'RCB', 'BOWL', 7.5),
  (9100123, 900001, 'R Patidar', 'RCB', 'BAT', 8.0),
  (9100124, 900001, 'M Lomror', 'RCB', 'AR', 7.5);

-- Match 900002: smaller pool
insert into public.players (sportmonks_id, match_id, name, team, role, credit_value) values
  (9100201, 900002, 'I Kishan', 'MI', 'WK', 8.5),
  (9100202, 900002, 'R Sharma', 'MI', 'BAT', 9.0),
  (9100203, 900002, 'S Yadav', 'MI', 'BAT', 9.5),
  (9100204, 900002, 'T Varma', 'MI', 'BAT', 8.0),
  (9100205, 900002, 'H Pandya', 'MI', 'AR', 9.0),
  (9100206, 900002, 'K Pollard', 'MI', 'AR', 8.0),
  (9100207, 900002, 'J Bumrah', 'MI', 'BOWL', 9.5),
  (9100208, 900002, 'P Chawla', 'MI', 'BOWL', 7.5),
  (9100209, 900002, 'S Mavi', 'MI', 'BOWL', 8.0),
  (9100210, 900002, 'R Meredith', 'MI', 'BOWL', 8.5),
  (9100211, 900002, 'S Narine', 'KKR', 'AR', 9.0),
  (9100212, 900002, 'A Russell', 'KKR', 'AR', 9.5),
  (9100213, 900002, 'S Iyer', 'KKR', 'BAT', 9.0),
  (9100214, 900002, 'V Iyer', 'KKR', 'BAT', 8.0),
  (9100215, 900002, 'R Singh', 'KKR', 'WK', 8.5),
  (9100216, 900002, 'N Rana', 'KKR', 'BAT', 8.5),
  (9100217, 900002, 'S Thakur', 'KKR', 'BOWL', 8.5),
  (9100218, 900002, 'V Chakravarthy', 'KKR', 'BOWL', 8.0),
  (9100219, 900002, 'L Ferguson', 'KKR', 'BOWL', 8.5),
  (9100220, 900002, 'U Yadav', 'KKR', 'BOWL', 8.0);

commit;

-- Quick test URLs (after sign-in):
--   Home → "CSK vs RCB (Mock IPL)" → Join contest → build team
--   Contest IDs:
--     11111111-1111-4111-8111-111111111101  Grand League
--     11111111-1111-4111-8111-111111111102  H2H Free
--   /matches/900001/contests/11111111-1111-4111-8111-111111111101/squad
-- Does NOT create auth users, profiles, or teams — sign up normally, then use flows above.
