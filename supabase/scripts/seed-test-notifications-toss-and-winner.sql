-- -----------------------------------------------------------------------------
-- Test in-app notifications: match toss + contest winner (match settled)
-- -----------------------------------------------------------------------------
-- Shapes match production:
--   - Toss:     src/lib/notifications/toss-notify.ts  (type toss_result)
--   - Winner:   settle_contest_prizes (type match_result, title "Contest winnings")
--
-- Run in Supabase SQL Editor as a privileged role (postgres / service_role).
-- RLS has no INSERT policy for authenticated users; triggers use SECURITY DEFINER
-- or the service role. Direct INSERT here bypasses RLS when run as superuser.
--
-- Option A — fixed IDs: replace the placeholders, then run the INSERT block.
-- Option B — auto-pick first profile + first contest + its match (run the DO block).
-- -----------------------------------------------------------------------------

-- Option A: replace these, then uncomment and run.
/*
insert into public.notifications (user_id, type, title, body, payload)
values
  (
    '00000000-0000-0000-0000-000000000001'::uuid,  -- your profiles.id
    'toss_result',
    'Toss',
    'India vs Australia: India won the toss and chose to bat first.',
    jsonb_build_object(
      'match_id', 123456789::bigint,
      'href', '/matches/123456789'
    )
  ),
  (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'match_result',
    'Contest winnings',
    'You won ₹500.00 (rank 1).',
    jsonb_build_object(
      'contest_id', '00000000-0000-0000-0000-000000000002'::uuid,
      'match_id', 123456789::bigint,
      'rank', 1,
      'amount_inr', 500,
      'href', '/contests/00000000-0000-0000-0000-000000000002'
    )
  );
*/

-- Option B: use first profile row and first contest (adjust LIMIT filters if needed).
do $$
declare
  v_user_id uuid;
  v_contest_id uuid;
  v_match_id bigint;
begin
  select p.id
  into v_user_id
  from public.profiles p
  order by p.created_at asc nulls last
  limit 1;

  select c.id, c.match_id
  into v_contest_id, v_match_id
  from public.contests c
  order by c.id
  limit 1;

  if v_user_id is null then
    raise exception 'No profile found — create a user first.';
  end if;

  if v_contest_id is null or v_match_id is null then
    raise exception 'No contest/match found — create a contest first.';
  end if;

  insert into public.notifications (user_id, type, title, body, payload)
  values
    (
      v_user_id,
      'toss_result',
      'Toss',
      format(
        'Test Match %s: Home won the toss and chose to field first.',
        v_match_id
      ),
      jsonb_build_object(
        'match_id', v_match_id,
        'href', format('/matches/%s', v_match_id)
      )
    ),
    (
      v_user_id,
      'match_result',
      'Contest winnings',
      'You won ₹500.00 (rank 1).',
      jsonb_build_object(
        'contest_id', v_contest_id,
        'match_id', v_match_id,
        'rank', 1,
        'amount_inr', 500,
        'href', format('/contests/%s', v_contest_id)
      )
    );
end $$;

-- Optional: same rows via create_notification (requires EXECUTE on that function;
-- granted to service_role). Uncomment if your role can call it.
/*
select public.create_notification(
  '00000000-0000-0000-0000-000000000001'::uuid,
  'toss_result',
  'Toss',
  'India vs Australia: India won the toss and chose to bat first.',
  jsonb_build_object('match_id', 123456789, 'href', '/matches/123456789')
);
select public.create_notification(
  '00000000-0000-0000-0000-000000000001'::uuid,
  'match_result',
  'Contest winnings',
  'You won ₹500.00 (rank 1).',
  jsonb_build_object(
    'contest_id', '00000000-0000-0000-0000-000000000002'::uuid,
    'match_id', 123456789,
    'rank', 1,
    'amount_inr', 500,
    'href', '/contests/00000000-0000-0000-0000-000000000002'
  )
);
*/
