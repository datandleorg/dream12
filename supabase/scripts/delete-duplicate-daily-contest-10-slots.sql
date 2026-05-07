-- Delete specific contest row(s) by UUID — you paste the id(s) you want removed (e.g. the duplicate 10-slot contest).
-- No bulk / automatic matching: only ids you list are touched.
--
-- Deleting a contest cascades to user_teams / team_roster for that contest. If preview shows teams_on > 0,
-- fix entries first or accept losing those rows.

-- ---------------------------------------------------------------------------
-- 1) PREVIEW — paste the same UUID(s) below; check teams before delete
-- ---------------------------------------------------------------------------
select
  c.id,
  c.match_id,
  c.name,
  c.max_participants,
  c.entry_fee,
  m.start_time,
  (select count(*) from public.user_teams ut where ut.contest_id = c.id) as teams_on_contest
from public.contests c
left join public.matches m on m.id = c.match_id
where c.id in (
  '18e6eae5-47f2-4ea9-95fe-cc75711e9027'::uuid -- ,
  -- 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid
);

-- ---------------------------------------------------------------------------
-- 2) DELETE — uncomment and paste the same UUID(s). Leave commented until preview looks correct.
-- ---------------------------------------------------------------------------
delete from public.contests
where id in (
  '00000000-0000-0000-0000-000000000000'::uuid
);
