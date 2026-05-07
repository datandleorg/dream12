-- Bump platform "Daily Contest 50Rs" from 10 → 15 spots with prize math for 2% platform fee.
-- Matches app: gross = 50×15 = 750, prize_pool = 750 × 0.98 = 735, buildPrizeSlabs(735, 3).
--
-- Run in Supabase SQL Editor after reviewing the PREVIEW.
-- Restrict the UPDATE WHERE clause if you only want certain matches (e.g. today only).
--
-- If cron created BOTH a 10-slot and 15-slot contest per match, deploy the fix in
-- `daily-auto-contest.ts` (idempotency no longer filters by max_participants), then run
-- `delete-duplicate-daily-contest-10-slots.sql` to remove a duplicate row by id you choose.

-- ---------------------------------------------------------------------------
-- 1) PREVIEW — rows that would be updated (all upcoming matches, still 10 spots)
-- ---------------------------------------------------------------------------
select
  c.id as contest_id,
  c.match_id,
  m.start_time,
  m.status,
  c.max_participants,
  c.gross_collected,
  c.prize_pool
from public.contests c
join public.matches m on m.id = c.match_id
where c.created_by is null
  and c.name = 'Daily Contest 50Rs'
  and c.entry_fee = 50
  and c.max_participants = 10
  and m.status = 'upcoming'
  and m.start_time > now();

-- ---------------------------------------------------------------------------
-- 2) UPDATE — all upcoming daily contests still at 10 spots
-- ---------------------------------------------------------------------------
update public.contests c
set
  max_participants = 15,
  gross_collected = 750,
  prize_pool = 735,
  prize_breakup = '[
    {"rank_from":1,"rank_to":1,"amount":425},
    {"rank_from":2,"rank_to":2,"amount":191},
    {"rank_from":3,"rank_to":3,"amount":119}
  ]'::jsonb
from public.matches m
where m.id = c.match_id
  and c.created_by is null
  and c.name = 'Daily Contest 50Rs'
  and c.entry_fee = 50
  and c.max_participants = 10
  and m.status = 'upcoming'
  and m.start_time > now();

-- ---------------------------------------------------------------------------
-- 3) OPTIONAL — same UPDATE but only matches starting on “today” in UTC
--     Uncomment and use instead of (2) if you want a single calendar day only.
-- ---------------------------------------------------------------------------
-- update public.contests c
-- set
--   max_participants = 15,
--   gross_collected = 750,
--   prize_pool = 735,
--   prize_breakup = '[
--     {"rank_from":1,"rank_to":1,"amount":425},
--     {"rank_from":2,"rank_to":2,"amount":191},
--     {"rank_from":3,"rank_to":3,"amount":119}
--   ]'::jsonb
-- from public.matches m
-- where m.id = c.match_id
--   and c.created_by is null
--   and c.name = 'Daily Contest 50Rs'
--   and c.entry_fee = 50
--   and c.max_participants = 10
--   and m.status = 'upcoming'
--   and m.start_time >= date_trunc('day', timezone('utc', now()))
--   and m.start_time < date_trunc('day', timezone('utc', now())) + interval '1 day';
